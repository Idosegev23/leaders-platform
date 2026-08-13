import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { getTemplate } from '@/lib/smart-brief/templates'
import { smartBriefServiceClient } from '@/lib/smart-brief/service'

export const dynamic = 'force-dynamic'

/** GET /api/smart-brief — recent briefs (global; the team works collaboratively) */
export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = smartBriefServiceClient()
  const { data, error } = await service
    .from('smart_briefs')
    .select('id, template_slug, title, client_name, status, created_by_name, created_at, updated_at, sent_at, opened_at, share_token')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefs: data ?? [] })
}

/** POST /api/smart-brief — create a draft { templateSlug, clientName?, createdByName? } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const templateSlug = String(body.templateSlug ?? '')
  const template = getTemplate(templateSlug)
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : null

  const service = smartBriefServiceClient()
  const { data, error } = await service
    .from('smart_briefs')
    .insert({
      template_slug: templateSlug,
      client_name: clientName || null,
      title: clientName ? `${template.name} — ${clientName}` : template.name,
      created_by_email: user.email ?? null,
      created_by_name: typeof body.createdByName === 'string' ? body.createdByName : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
