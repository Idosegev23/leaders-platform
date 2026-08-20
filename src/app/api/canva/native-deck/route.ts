import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { autofillCreativeDeckFromDocument } from '@/lib/canva/autofill-deck'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/canva/native-deck
 * { documentId }
 *
 * Runs the AI mapping bridge on an existing document: _stepData → the
 * creative-strategy brand template fields → native Canva design, persisted on
 * documents.data._canva.native. Auth: logged-in Leaders user or
 * x-internal-secret (server-to-server).
 */
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

  try {
    const native = await autofillCreativeDeckFromDocument(body.documentId)
    return NextResponse.json({ ok: true, ...native })
  } catch (e) {
    console.error('[canva-native-deck] failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
