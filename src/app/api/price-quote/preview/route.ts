/**
 * POST /api/price-quote/preview
 *
 * Body: { data: PriceQuoteData, page?: 1..4 }  →  text/html for one page.
 * The client wraps the response in a blob: URL for the iframe.
 *
 * Replaces the old `GET /api/price-quote?data=<json>` preview, which was an
 * IDOR-adjacent, URL-length-capped design (the data rode in the query string).
 * POST-and-blob has no DB read, no uuid in any URL, and no length ceiling.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { generateAllQuotePages } from '@/templates/price-quote/price-quote-template'
import type { PriceQuoteData } from '@/types/price-quote'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    data?: PriceQuoteData
    page?: number
  } | null
  if (!body?.data) return NextResponse.json({ error: 'data required' }, { status: 400 })

  const origin =
    request.headers.get('origin') ||
    request.headers.get('referer')?.replace(/\/[^/]*$/, '') ||
    'http://localhost:3000'

  const pages = generateAllQuotePages(body.data, origin)
  const idx = Math.max(0, Math.min((body.page ?? 1) - 1, pages.length - 1))

  return new NextResponse(pages[idx], {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
