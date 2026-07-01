import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import InfluencerContractsClient from './InfluencerContractsClient'

export const dynamic = 'force-dynamic'

export default async function InfluencerContractsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: quote } = await supabase
    .from('signature_requests')
    .select('id, title, status, recipient_name, signed_at, payload')
    .eq('id', id)
    .maybeSingle()
  if (!quote) notFound()

  const deckId =
    (quote.payload as { deck_document_id?: string } | null)?.deck_document_id ?? null

  return (
    <InfluencerContractsClient
      quoteId={quote.id as string}
      quoteTitle={quote.title as string}
      quoteStatus={quote.status as string}
      clientName={(quote.recipient_name as string) ?? ''}
      deckId={deckId}
    />
  )
}
