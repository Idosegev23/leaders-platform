// src/app/api/canva/import/route.ts
import { NextResponse } from 'next/server'
import type { StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'
import { exportDeckToCanva, DeckNotReadyError } from '@/lib/canva/export-deck'
import { isDevMode } from '@/lib/auth/dev-mode'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/canva/import  { documentId, presentation? }
 *
 * Import our generated deck into Canva. Core logic lives in
 * src/lib/canva/export-deck.ts (shared with the auto pipeline's
 * deck-finalize step). Auth: logged-in Leaders user, dev-mode bypass, or a
 * server-to-server call carrying x-internal-secret.
 */
export async function POST(request: Request) {
  const internalSecret = request.headers.get('x-internal-secret')
  const isInternalTrigger =
    !!process.env.LEADS_TRIGGER_SECRET && internalSecret === process.env.LEADS_TRIGGER_SECRET
  if (!isDevMode && !isInternalTrigger) {
    const supabase = await createSsrClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let documentId: string
  let bodyPresentation: StructuredPresentation | undefined
  try {
    const body = await request.json()
    documentId = (body?.documentId || '').trim()
    bodyPresentation = (body?.presentation as StructuredPresentation | undefined) || undefined
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  try {
    const result = await exportDeckToCanva({ documentId, presentation: bodyPresentation })
    return NextResponse.json({
      ok: true,
      design_id: result.designId,
      edit_url: result.editUrl,
      view_url: result.viewUrl,
      kickoff_updated: result.kickoffUpdated,
      mode: result.mode,
      export_warnings: result.warnings.length ? result.warnings : undefined,
    })
  } catch (e) {
    if (e instanceof DeckNotReadyError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    if (e instanceof Error && e.message === 'Document not found') {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    console.error('[canva-import] failed:', e)
    return NextResponse.json(
      { error: `Canva import failed: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    )
  }
}
