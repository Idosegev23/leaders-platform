import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

/**
 * POST /api/pipeline/auto-deck  { documentId }
 *
 * "⚡ Full-auto" path from /create-proposal — the wizard becomes optional.
 * Runs the same chain as the kickoff pipeline on an existing deck document:
 *
 *   1. CONTENT  — fill `_stepData` headlessly (generateProposal) so the wizard
 *                 contract binds the fullest possible data into the slides.
 *   2. BLUEPRINT — /api/generate-blueprint (retried).
 *   3. GENERATE — fire /api/generate-full { useBlueprint, autoFinalize } via
 *                 QStash (prod) or a detached local call (dev). generate-full
 *                 chains deck-finalize → Canva at the end.
 *
 * Auth: logged-in Leaders user (or dev mode / x-internal-secret).
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

export async function POST(request: Request) {
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const isInternalTrigger = !!secret && request.headers.get('x-internal-secret') === secret
  if (!isInternalTrigger) {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null
  if (!body?.documentId) {
    return NextResponse.json({ error: 'documentId required' }, { status: 400 })
  }
  const { documentId } = body
  const tag = `[auto-deck:${documentId.slice(0, 8)}]`
  const sb = service()
  const base = appBaseUrl()

  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, data')
    .eq('id', documentId)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const data = (doc.data ?? {}) as Record<string, unknown>
  const briefText = (data._briefText as string) || ''
  if (briefText.trim().length < 20) {
    return NextResponse.json({ error: 'No brief text on document' }, { status: 400 })
  }

  // Mark the deck as auto-pipeline so generate-full chains the Canva finalize.
  await sb
    .from('documents')
    .update({
      data: { ...data, _autoPipeline: true, _pipelineSource: data._pipelineSource ?? 'auto-button' },
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  // 1. CONTENT — headless _stepData so the wizard contract binds full data
  //    into the slides (the visual-fidelity requirement). Non-fatal: the
  //    presentation agent can self-research if this fails.
  const hasStepData = Boolean(data._stepData && Object.keys(data._stepData as object).length)
  if (!hasStepData) {
    try {
      console.log(`${tag} building _stepData headlessly…`)
      const { generateProposal } = await import('@/lib/gemini/proposal-agent')
      const briefFile =
        data._geminiFileUri && data._geminiFileMime
          ? { uri: data._geminiFileUri as string, mimeType: data._geminiFileMime as string }
          : undefined
      const result = await generateProposal(
        briefText,
        (data._kickoffText as string) || undefined,
        undefined,
        undefined,
        briefFile,
      )
      const { data: fresh } = await sb.from('documents').select('data').eq('id', documentId).single()
      await sb
        .from('documents')
        .update({
          data: { ...((fresh?.data ?? {}) as Record<string, unknown>), _stepData: result.stepData },
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
      console.log(`${tag} _stepData saved`)
    } catch (e) {
      console.warn(`${tag} _stepData build failed (continuing — agent will self-research):`, e instanceof Error ? e.message : e)
    }
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
      if (res.ok) blueprintOk = true
      else console.warn(`${tag} blueprint attempt ${attempt} → ${res.status}`)
    } catch (e) {
      console.warn(`${tag} blueprint attempt ${attempt} threw:`, e instanceof Error ? e.message : e)
    }
  }
  if (!blueprintOk) {
    return NextResponse.json({ ok: false, documentId, error: 'blueprint failed after retries' }, { status: 500 })
  }

  // 3. GENERATE — QStash holds the long connection in prod; local dev fires a
  //    detached request (the local server has no execution time limit).
  try {
    if (process.env.QSTASH_TOKEN) {
      const { Client: QStashClient } = await import('@upstash/qstash')
      const q = new QStashClient({ token: process.env.QSTASH_TOKEN })
      await q.publishJSON({
        url: `${base}/api/generate-full`,
        body: { documentId, useBlueprint: true, autoFinalize: true },
        headers: { 'x-internal-secret': secret },
        timeout: '900s',
        retries: 0,
        deduplicationId: `deck-generate:${documentId}`,
      })
    } else if (isDevMode) {
      fetch(`${base}/api/generate-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, useBlueprint: true, autoFinalize: true }),
      }).catch((e) => console.error(`${tag} local generate-full failed:`, e))
    } else {
      return NextResponse.json({ ok: false, documentId, error: 'QSTASH_TOKEN missing' }, { status: 500 })
    }
  } catch (e) {
    console.error(`${tag} fire generate failed:`, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, documentId, error: 'failed to fire generate' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, documentId })
}
