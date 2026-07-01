import type { SupabaseClient } from '@supabase/supabase-js'
import type { InfluencerProfile } from '@/types/wizard'

export interface ResolvedDeck {
  id: string
  title: string
  clientName: string
  campaignName: string
  influencers: InfluencerProfile[]
}

/**
 * Read documents.data._stepData.influencers.influencers for the given deck.
 * Returns null if the doc doesn't exist. Empty influencer list is allowed
 * (caller decides how to handle it).
 */
export async function resolveDeckInfluencers(
  service: SupabaseClient,
  deckDocId: string,
): Promise<ResolvedDeck | null> {
  const { data: doc, error } = await service
    .from('documents')
    .select('id, title, data')
    .eq('id', deckDocId)
    .maybeSingle()
  if (error || !doc) return null

  const data = (doc.data ?? {}) as {
    _stepData?: {
      influencers?: { influencers?: InfluencerProfile[] }
      brief?: { brandName?: string; campaignName?: string }
    }
  }
  const influencers = data._stepData?.influencers?.influencers ?? []
  return {
    id: doc.id as string,
    title: (doc.title as string) ?? 'Deck',
    clientName: data._stepData?.brief?.brandName ?? (doc.title as string) ?? '',
    campaignName: data._stepData?.brief?.campaignName ?? (doc.title as string) ?? '',
    influencers,
  }
}

export function formatFollowers(n?: number): string | undefined {
  if (!n || n <= 0) return undefined
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}
