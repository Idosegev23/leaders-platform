import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { publishBrandTemplate } from '@/lib/canva/brand-templates'

export const dynamic = 'force-dynamic'

/**
 * POST /api/canva/publish-template  { designId }
 * Publish a (tagged) Canva design as a brand template. If the design is a
 * draft of an existing template, that template is updated in place.
 * Auth: logged-in Leaders user or x-internal-secret.
 */
export async function POST(request: Request) {
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const isInternalTrigger = !!secret && request.headers.get('x-internal-secret') === secret
  if (!isInternalTrigger) {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { designId?: string } | null
  if (!body?.designId) return NextResponse.json({ error: 'designId required' }, { status: 400 })

  try {
    const template = await publishBrandTemplate(body.designId)
    return NextResponse.json({ ok: true, template })
  } catch (e) {
    console.error('[canva-publish-template] failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
