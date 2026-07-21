/**
 * POST /api/price-quotes        — create a draft (first autosave)
 * GET  /api/price-quotes        — list, ?q=&owner=&state=
 *
 * Session-checked. Writes via the service-role client in the service layer.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { priceQuoteService, quoteState, type QuoteRow, type QuoteState } from '@/lib/price-quotes/service'
import type { PriceQuoteData } from '@/types/price-quote'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    title?: string
    draft_data?: PriceQuoteData
  } | null
  const draft = body?.draft_data ?? ({} as PriceQuoteData)

  const svc = priceQuoteService()
  const { data, error } = await svc
    .from('price_quotes')
    .insert({
      owner_email: user.email,
      owner_user_id: user.id,
      title: body?.title || draft.clientName || 'הצעת מחיר',
      client_name: draft.clientName || '',
      campaign_name: draft.campaignName || '',
      draft_data: draft,
      draft_updated_by: user.email,
    })
    .select('id, quote_number, draft_version')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function GET(request: Request) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const owner = searchParams.get('owner')?.trim()
  const wantState = searchParams.get('state') as QuoteState | null

  const svc = priceQuoteService()
  let query = svc
    .from('price_quotes')
    .select('id, quote_number, owner_email, title, client_name, campaign_name, draft_version, draft_updated_at, current_revision_id, published_count, origin, archived_at, created_at')
    .order('draft_updated_at', { ascending: false })
    .limit(200)

  if (owner) query = query.eq('owner_email', owner)
  if (q) query = query.or(`client_name.ilike.%${q}%,quote_number.ilike.%${q}%,title.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as Array<Pick<QuoteRow, 'id' | 'quote_number' | 'owner_email' | 'title' | 'client_name' | 'campaign_name' | 'draft_version' | 'draft_updated_at' | 'current_revision_id' | 'published_count' | 'origin' | 'archived_at' | 'created_at'>>

  const items = await Promise.all(
    rows.map(async (r) => ({ ...r, state: await quoteState(svc, r) })),
  )
  const filtered = wantState ? items.filter((i) => i.state === wantState) : items

  return NextResponse.json({ items: filtered })
}
