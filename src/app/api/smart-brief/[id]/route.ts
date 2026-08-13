import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { smartBriefServiceClient } from '@/lib/smart-brief/service'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = smartBriefServiceClient()
  const { data, error } = await service.from('smart_briefs').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ brief: data })
}

/** PATCH — save fields / rename / set client */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.fields && typeof body.fields === 'object') update.fields = body.fields
  if (typeof body.title === 'string') update.title = body.title
  if (typeof body.clientName === 'string') update.client_name = body.clientName.trim() || null
  if (body.aiMeta && typeof body.aiMeta === 'object') update.ai_meta = body.aiMeta

  const service = smartBriefServiceClient()
  const { error } = await service.from('smart_briefs').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = smartBriefServiceClient()
  const { error } = await service.from('smart_briefs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
