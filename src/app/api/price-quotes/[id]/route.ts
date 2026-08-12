/**
 * GET    /api/price-quotes/[id]  — editor payload (quote + current revision + is_dirty)
 * PATCH  /api/price-quotes/[id]  — autosave with optimistic lock; 409 on version race
 * DELETE /api/price-quotes/[id]  — soft archive; 409 if a live signature request exists
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { priceQuoteService, isDirty } from '@/lib/price-quotes/service'
import type { PriceQuoteData } from '@/types/price-quote'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireUser() {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  return user?.email ? user : null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = priceQuoteService()

  const { data: quote, error } = await svc
    .from('price_quotes')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!quote) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let current = null
  if (quote.current_revision_id) {
    const { data } = await svc
      .from('price_quote_revisions')
      .select('id, revision_number, data, published_at, signature_request_id, signature_token, pdf_drive_view_link')
      .eq('id', quote.current_revision_id)
      .maybeSingle()
    current = data
  }

  return NextResponse.json({
    quote,
    draft_data: quote.draft_data,
    draft_version: quote.draft_version,
    current_revision: current,
    is_dirty: await isDirty(svc, params.id),
  })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    data?: PriceQuoteData
    expected_draft_version?: number
  } | null
  if (!body?.data || typeof body.expected_draft_version !== 'number') {
    return NextResponse.json({ error: 'data and expected_draft_version required' }, { status: 400 })
  }

  const svc = priceQuoteService()
  const { data, error } = await svc
    .from('price_quotes')
    .update({
      draft_data: body.data,
      draft_version: body.expected_draft_version + 1,
      draft_updated_by: user.email,
      client_name: body.data.clientName || '',
      campaign_name: body.data.campaignName || '',
    })
    .eq('id', params.id)
    .eq('draft_version', body.expected_draft_version) // optimistic lock
    .select('draft_version, draft_updated_by, draft_updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    // Lost the race — return the winner's identity so the client can reconcile.
    const { data: cur } = await svc
      .from('price_quotes')
      .select('draft_version, draft_updated_by, draft_updated_at')
      .eq('id', params.id)
      .maybeSingle()
    return NextResponse.json(cur ?? { error: 'not found' }, { status: 409 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = priceQuoteService()

  // Block archiving a quote that still has a live (pending/opened) signature request.
  const { data: live } = await svc
    .from('signature_requests')
    .select('id, status, price_quote_revisions!inner(quote_id)')
    .eq('price_quote_revisions.quote_id', params.id)
    .in('status', ['pending', 'opened'])
    .limit(1)
  if (live && live.length > 0) {
    return NextResponse.json(
      { error: 'לא ניתן להעביר לארכיון: קיימת בקשת חתימה פעילה. יש לבטלה תחילה.' },
      { status: 409 },
    )
  }

  const { error } = await svc
    .from('price_quotes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
