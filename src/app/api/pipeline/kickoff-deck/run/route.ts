import { NextResponse } from 'next/server'
import { Client as QStashClient } from '@upstash/qstash'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleDeckData, type KickoffFields } from '@/lib/pipeline/assemble-deck-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

/**
 * Kickoff → Deck orchestrator (plain route, QStash-driven).
 *
 * Fired by a QStash message from /api/inner-meeting/complete when a
 * Salesforce-originated kickoff is completed. Runs the build to match the
 * manual engine:
 *
 *   1. ASSEMBLE  — kickoff (+ linked brief) → deck `documents` row, linked back
 *                  to the kickoff form (idempotent: reuses an existing link).
 *   2. BLUEPRINT — /api/generate-blueprint (18–24+ slide plan), retried since
 *                  the route is occasionally flaky.
 *   3. GENERATE  — fire /api/generate-full{useBlueprint} via a QStash publish.
 *                  QStash holds the connection for the ~10 min run so Vercel
 *                  doesn't reap it (verified: this drives generate-full to
 *                  completion). We don't wait here; the deck lands in the portal.
 *
 * This replaces the @upstash/workflow orchestration, which was fragile
 * (context.call mangled the large blueprint response; fire-and-forget got the
 * long generate reaped). One plain route + two QStash hops is predictable.
 *
 * Auth: x-internal-secret (LEADS_TRIGGER_SECRET), forwarded by QStash.
 */

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

/** Build (or reuse) the deck document for a completed kickoff. Returns its id. */
async function assembleDeck(sb: SupabaseClient, formId: string, salesforceRef: string): Promise<string> {
  const { data: form } = await sb.from('forms').select('id, title, metadata').eq('id', formId).maybeSingle()
  if (!form) throw new Error(`form ${formId} not found`)

  const { data: imf } = await sb.from('inner_meeting_forms').select('*').eq('form_id', formId).maybeSingle()
  if (imf?.linked_deck_document_id) return imf.linked_deck_document_id as string

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
    await sb.from('inner_meeting_forms').update({ linked_deck_document_id: doc.id }).eq('form_id', formId)
  }
  return doc.id as string
}

export async function POST(request: Request) {
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  if (!secret || request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { formId?: string; salesforceRef?: string }
    | null
  if (!body?.formId || !body.salesforceRef) {
    return NextResponse.json({ ok: false, error: 'formId and salesforceRef required' }, { status: 400 })
  }
  const { formId, salesforceRef } = body
  const tag = `[kickoff-deck-run:${formId.slice(0, 8)}]`
  const sb = service()
  const base = appBaseUrl()

  // 1. ASSEMBLE
  let documentId: string
  try {
    documentId = await assembleDeck(sb, formId, salesforceRef)
  } catch (e) {
    console.error(`${tag} assemble failed:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: 'assemble failed' }, { status: 500 })
  }
  console.log(`${tag} assembled deck ${documentId}`)

  // 1.5 CONTENT — headless _stepData so the wizard contract binds the fullest
  //     data into the slides. Non-fatal: the agent self-researches if it fails.
  try {
    const { data: doc } = await sb.from('documents').select('data').eq('id', documentId).single()
    const docData = (doc?.data ?? {}) as Record<string, unknown>
    const hasStepData = Boolean(docData._stepData && Object.keys(docData._stepData as object).length)
    const briefText = (docData._briefText as string) || ''
    if (!hasStepData && briefText.trim().length >= 20) {
      const { generateProposal } = await import('@/lib/gemini/proposal-agent')
      const result = await generateProposal(briefText, (docData._kickoffText as string) || undefined)
      const { data: fresh } = await sb.from('documents').select('data').eq('id', documentId).single()
      await sb
        .from('documents')
        .update({
          data: { ...((fresh?.data ?? {}) as Record<string, unknown>), _stepData: result.stepData },
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
      console.log(`${tag} _stepData built headlessly`)
    }
  } catch (e) {
    console.warn(`${tag} _stepData build failed (continuing):`, e instanceof Error ? e.message : e)
  }

  // 2. BLUEPRINT (retry — occasionally flaky)
  let blueprintOk = false
  for (let attempt = 0; attempt < 3 && !blueprintOk; attempt++) {
    try {
      const res = await fetch(`${base}/api/generate-blueprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ documentId }),
      })
      if (res.ok) {
        blueprintOk = true
        console.log(`${tag} blueprint ok (attempt ${attempt})`)
      } else {
        console.warn(`${tag} blueprint attempt ${attempt} → ${res.status}`)
      }
    } catch (e) {
      console.warn(`${tag} blueprint attempt ${attempt} threw:`, e instanceof Error ? e.message : e)
    }
  }
  if (!blueprintOk) {
    return NextResponse.json({ ok: false, documentId, error: 'blueprint failed after retries' }, { status: 500 })
  }

  // 3. FIRE generate-full via QStash (QStash holds the connection for the run).
  try {
    const q = new QStashClient({ token: process.env.QSTASH_TOKEN! })
    const pub = await q.publishJSON({
      url: `${base}/api/generate-full`,
      body: { documentId, useBlueprint: true },
      headers: { 'x-internal-secret': secret },
      timeout: '900s',
      retries: 0,
      deduplicationId: `deck-generate:${documentId}`,
    })
    console.log(`${tag} generate-full published (${(pub as { messageId?: string }).messageId ?? 'ok'})`)
  } catch (e) {
    console.error(`${tag} publish generate-full failed:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, documentId, error: 'failed to fire generate' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, documentId })
}
