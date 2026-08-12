/**
 * Price-quote generator entry. Server wrapper: when `?id=` is present it loads
 * the saved draft and hydrates the editor; otherwise the editor starts blank.
 * All the interactive logic lives in PriceQuoteEditor (client).
 */
import PriceQuoteEditor from './PriceQuoteEditor'
import { priceQuoteService } from '@/lib/price-quotes/service'
import type { PriceQuoteData } from '@/types/price-quote'

export const dynamic = 'force-dynamic'

export default async function PriceQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  if (!id) return <PriceQuoteEditor />

  const svc = priceQuoteService()
  const { data: quote } = await svc
    .from('price_quotes')
    .select('id, draft_data, draft_version')
    .eq('id', id)
    .maybeSingle()

  if (!quote) return <PriceQuoteEditor />

  return (
    <PriceQuoteEditor
      initialData={quote.draft_data as PriceQuoteData}
      quoteId={quote.id as string}
      initialDraftVersion={quote.draft_version as number}
    />
  )
}
