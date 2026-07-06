import { serve } from '@upstash/workflow/nextjs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleDeckData, type KickoffFields } from '@/lib/pipeline/assemble-deck-data'

export const maxDuration = 800

/**
 * Kickoff → Deck pipeline (durable Upstash Workflow).
 *
 * Triggered from /api/inner-meeting/complete when a Salesforce-originated
 * kickoff form is completed. Builds the deck behind the scenes, matching the
 * manual engine's richness:
 *
 *   1. ASSEMBLE  — kickoff (+ linked brief) → deck `documents` row, linked back
 *                  to the kickoff form.
 *   2. BLUEPRINT — plan the full deck (18–24+ slides) via /api/generate-blueprint.
 *   3. GENERATE  — build every planned slide via /api/generate-full{useBlueprint}.
 *
 * Orchestration model = FIRE + POLL (the same pattern research-hub uses):
 * each generation route is fired fire-and-forget (it runs to completion
 * server-side even after the client aborts — Vercel keeps the invocation
 * alive), then we poll the document for the result. We deliberately do NOT use
 * context.call: it proxies the route's (large) response back through QStash,
 * which 500s on the blueprint payload. Polling reads Supabase directly, so no
 * large body crosses QStash and every workflow step stays short.
 *
 * Idempotent: reuses an already-linked deck; the trigger dedups on formId.
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

/** Read a deck document's `data` blob. */
async function readDeckData(sb: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data } = await sb.from('documents').select('data').eq('id', id).maybeSingle()
  return (data?.data as Record<string, unknown> | null) ?? {}
}

/**
 * Dispatch a long generation route without holding the step open. The route
 * runs to completion server-side even after we abort the client connection
 * (verified: generate-full finishes after the caller disconnects). We poll the
 * document for its result afterwards.
 */
async function fireForget(url: string, body: unknown, secret: string): Promise<void> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 4000)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
  } catch {
    /* abort is expected — the server keeps running */
  } finally {
    clearTimeout(t)
  }
}

export const { POST } = serve<Init>(async (context) => {
  const sb = service()
  const { formId, salesforceRef } = context.requestPayload
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const base = appBaseUrl()

  // ── 1. ASSEMBLE ────────────────────────────────────────────────────────
  const { documentId } = await context.run('assemble', async () => {
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

    if (imf?.linked_deck_document_id) {
      return { documentId: imf.linked_deck_document_id as string }
    }

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
    return { documentId: doc.id as string }
  })

  // ── 2. BLUEPRINT (fire + poll) ─────────────────────────────────────────
  await context.run('fire-blueprint', async () => {
    await fireForget(`${base}/api/generate-blueprint`, { documentId }, secret)
    return { fired: true }
  })
  let blueprintReady = false
  for (let i = 0; i < 20 && !blueprintReady; i++) {
    await context.sleep(`bp-wait-${i}`, 15)
    blueprintReady = await context.run(`bp-check-${i}`, async () => {
      const d = await readDeckData(sb, documentId)
      return d._deckBlueprint != null
    })
  }
  if (!blueprintReady) throw new Error(`blueprint timed out for ${documentId}`)

  // ── 3. GENERATE (fire + poll) ──────────────────────────────────────────
  await context.run('fire-generate', async () => {
    await fireForget(`${base}/api/generate-full`, { documentId, useBlueprint: true }, secret)
    return { fired: true }
  })
  let deckReady = false
  for (let i = 0; i < 30 && !deckReady; i++) {
    await context.sleep(`gen-wait-${i}`, 30)
    deckReady = await context.run(`gen-check-${i}`, async () => {
      const d = await readDeckData(sb, documentId)
      const html = d._htmlPresentation as { htmlSlides?: unknown[] } | undefined
      return (html?.htmlSlides?.length ?? 0) > 0
    })
  }
  if (!deckReady) throw new Error(`generate-full timed out for ${documentId}`)

  // Phase 2: context.run → fire Canva import, poll, then notifySalesforceDeck.
  return { ok: true, documentId }
})
