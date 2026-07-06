import { serve } from '@upstash/workflow/nextjs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { assembleDeckData, type KickoffFields } from '@/lib/pipeline/assemble-deck-data'

export const maxDuration = 800

/**
 * Kickoff → Deck pipeline (durable Upstash Workflow).
 *
 * Triggered from /api/inner-meeting/complete when a Salesforce-originated
 * kickoff form is completed. Runs the deck build behind the scenes:
 *
 *   1. ASSEMBLE — build a deck `documents.data` payload from the kickoff
 *      (+ the linked client brief), create the deck row, and link it back to
 *      the kickoff form (inner_meeting_forms.linked_deck_document_id).
 *   2. GENERATE — headless deck generation via POST /api/generate-full, made
 *      as a durable context.call so QStash owns the (~13 min) call and the
 *      workflow function isn't held open.
 *
 * Phase 2 will append: Canva export (context.call /api/canva/import) and a
 * `deck.ready` push to Salesforce.
 *
 * Idempotent: reuses an already-linked deck, and the trigger dedups on formId.
 */

type Init = { formId: string; salesforceRef: string }

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

export const { POST } = serve<Init>(async (context) => {
  const sb = service()
  const { formId, salesforceRef } = context.requestPayload

  // ── 1. ASSEMBLE ────────────────────────────────────────────────────────
  const { documentId, reused } = await context.run('assemble', async () => {
    const { data: form } = await sb
      .from('forms')
      .select('id, title, metadata')
      .eq('id', formId)
      .maybeSingle()
    if (!form) throw new Error(`form ${formId} not found`)

    const { data: imf } = await sb
      .from('inner_meeting_forms')
      .select('*')
      .eq('form_id', formId)
      .maybeSingle()

    // Idempotency: a deck already exists for this kickoff — reuse it.
    if (imf?.linked_deck_document_id) {
      return { documentId: imf.linked_deck_document_id as string, reused: true }
    }

    // Link the original client brief by salesforce_ref (best-effort).
    const { data: briefLink } = await sb
      .from('document_links')
      .select('metadata')
      .eq('metadata->>salesforce_ref', salesforceRef)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const brief =
      ((briefLink?.metadata as Record<string, unknown> | null)?.submission_data as
        | Record<string, unknown>
        | undefined) ?? null
    const projectName =
      ((form.metadata as Record<string, unknown> | null)?.project_name as string | undefined) ?? null

    const assembled = assembleDeckData({
      clientName: (imf?.client_name as string) || (form.title as string) || 'לקוח',
      projectName,
      salesforceRef,
      kickoff: (imf ?? {}) as KickoffFields,
      brief,
    })

    const { data: doc, error } = await sb
      .from('documents')
      .insert({ type: 'deck', title: assembled.title, data: assembled.data, status: 'draft' })
      .select('id')
      .single()
    if (error || !doc) throw new Error(`deck insert failed: ${error?.message}`)

    if (imf) {
      await sb
        .from('inner_meeting_forms')
        .update({ linked_deck_document_id: doc.id })
        .eq('form_id', formId)
    }

    return { documentId: doc.id as string, reused: false }
  })

  const secret = process.env.LEADS_TRIGGER_SECRET || ''

  // ── 2. BLUEPRINT — plan the full deck ──────────────────────────────────
  // The strategic plan (18–24+ slides) that BINDS generate-full to build the
  // complete structure. Without it, the generator free-plans and trims to a
  // lean deck. This is the primary lever for deck richness / slide count.
  const bp = await context.call('blueprint', {
    url: `${appBaseUrl()}/api/generate-blueprint`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ documentId }),
    timeout: '600s',
    retries: 0,
  })
  if (bp.status < 200 || bp.status >= 300) {
    throw new Error(`generate-blueprint failed (${bp.status}) for document ${documentId}`)
  }

  // ── 3. GENERATE (headless deck, bound to the blueprint) ────────────────
  // Durable long call: QStash makes the request and resumes the workflow with
  // the result, so the workflow function isn't held open for the ~13 min run.
  // useBlueprint:true → build every planned slide. retries:0 — a retry would
  // double-generate the same deck.
  const gen = await context.call('generate-full', {
    url: `${appBaseUrl()}/api/generate-full`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ documentId, useBlueprint: true }),
    timeout: '900s',
    retries: 0,
  })
  if (gen.status < 200 || gen.status >= 300) {
    throw new Error(`generate-full failed (${gen.status}) for document ${documentId}`)
  }

  // Phase 2: context.call → /api/canva/import, then notifySalesforceDeck.
  return { ok: true, documentId, reused }
})
