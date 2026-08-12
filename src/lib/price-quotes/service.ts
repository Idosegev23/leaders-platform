/**
 * price_quotes service layer. ALL writes to price_quotes / price_quote_revisions
 * go through here, under a raw service-role client (RLS has no write policy —
 * see migration 20260721_price_quotes_draft_published.sql). Routes own the
 * session check; this module owns the data access.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PriceQuoteData } from '@/types/price-quote'

export function priceQuoteService(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export type QuoteState = 'draft' | 'sent' | 'signed' | 'archived'

export interface QuoteRow {
  id: string
  quote_number: string
  owner_email: string
  title: string
  client_name: string
  campaign_name: string
  draft_data: PriceQuoteData
  draft_version: number
  draft_updated_at: string
  draft_updated_by: string | null
  current_revision_id: string | null
  published_count: number
  origin: string
  salesforce_project_id: string | null
  archived_at: string | null
  created_at: string
}

export interface RevisionRow {
  id: string
  quote_id: string
  revision_number: number
  data: PriceQuoteData
  template_version: string
  legacy_backfill: boolean
  published_at: string
  signature_request_id: string | null
  signature_token: string | null
  pdf_drive_view_link: string | null
}

/** Derive the display state of a quote from its rows. */
export async function quoteState(
  svc: SupabaseClient,
  quote: Pick<QuoteRow, 'id' | 'archived_at' | 'published_count'>,
): Promise<QuoteState> {
  if (quote.archived_at) return 'archived'
  if (quote.published_count === 0) return 'draft'
  // Any signature_request bound to a revision of this quote that is signed?
  const { data } = await svc
    .from('signature_requests')
    .select('status, price_quote_revisions!inner(quote_id)')
    .eq('price_quote_revisions.quote_id', quote.id)
  const rows = (data ?? []) as Array<{ status: string }>
  if (rows.some((r) => r.status === 'signed')) return 'signed'
  return 'sent'
}

/**
 * True when the draft differs from the current published revision. Computed in
 * SQL via `jsonb IS DISTINCT FROM` — a JS JSON.stringify compare does NOT round-
 * trip against Postgres's normalized jsonb, so it would flicker the "unpublished
 * changes" chip on every reload. Returns false when nothing is published yet.
 */
export async function isDirty(svc: SupabaseClient, quoteId: string): Promise<boolean> {
  const { data, error } = await svc.rpc('price_quote_is_dirty', { p_quote_id: quoteId })
  if (error) return false
  return Boolean(data)
}
