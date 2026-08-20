import { NextResponse } from 'next/server'
import { finalizeDeckToCanva } from '@/lib/pipeline/deck-finalize'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/pipeline/deck-finalize  { documentId }
 *
 * Headless final hop of the auto pipeline (fired by generate-full via QStash
 * when the deck was built in auto mode): structured derive → Canva import.
 * Auth: x-internal-secret (LEADS_TRIGGER_SECRET); dev-mode bypass for local runs.
 */
export async function POST(request: Request) {
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const authorized =
    (secret && request.headers.get('x-internal-secret') === secret) || isDevMode
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null
  if (!body?.documentId) {
    return NextResponse.json({ ok: false, error: 'documentId required' }, { status: 400 })
  }

  const tag = `deck-finalize:${body.documentId.slice(0, 8)}`
  try {
    const result = await finalizeDeckToCanva(body.documentId, tag)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(`[${tag}] failed:`, e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'finalize failed' },
      { status: 500 },
    )
  }
}
