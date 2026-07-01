import type { InfluencerProfile } from '@/types/wizard'
import {
  generateInfluencerContractPages,
  INFLUENCER_CONTRACT_DEFAULTS,
  type InfluencerContractData,
} from '@/lib/templates/influencer-contract-template'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { formatFollowers, type ResolvedDeck } from './deck'

/** CONFIGURABLE per-batch commercial overrides passed from the endpoint. */
export interface ContractOverrides {
  engagementFee?: string
  paymentTerms?: string
  contentApprovalNote?: string
  exclusivityNote?: string
  usageRightsNote?: string
  deliverables?: string[]
  legalClauses?: string[]
}

export function buildInfluencerContractData(
  deck: ResolvedDeck,
  inf: InfluencerProfile,
  overrides: ContractOverrides = {},
): InfluencerContractData {
  const dateStr = new Date().toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  return {
    clientName: deck.clientName,
    campaignName: deck.campaignName,
    date: dateStr,
    influencerName: inf.name || inf.username || 'משפיען/ית',
    influencerHandle: inf.username?.startsWith('@') ? inf.username : `@${inf.username ?? ''}`,
    influencerFollowers: formatFollowers(inf.followers),
    deliverables: overrides.deliverables ?? [],           // CONFIGURABLE
    engagementFee: overrides.engagementFee ?? 'יסוכם בנפרד', // CONFIGURABLE
    paymentTerms: overrides.paymentTerms ?? INFLUENCER_CONTRACT_DEFAULTS.paymentTerms,
    contentApprovalNote: overrides.contentApprovalNote ?? INFLUENCER_CONTRACT_DEFAULTS.contentApprovalNote,
    exclusivityNote: overrides.exclusivityNote ?? INFLUENCER_CONTRACT_DEFAULTS.exclusivityNote,
    usageRightsNote: overrides.usageRightsNote ?? INFLUENCER_CONTRACT_DEFAULTS.usageRightsNote,
    legalClauses: overrides.legalClauses ?? [...INFLUENCER_CONTRACT_DEFAULTS.legalClauses],
    signature: null,
  }
}

export async function generateInfluencerContractPdf(
  data: InfluencerContractData,
  logoBaseUrl: string,
  title: string,
): Promise<Buffer> {
  const pages = generateInfluencerContractPages(data, logoBaseUrl)
  return generateMultiPagePdf(pages, { format: 'A4', title, brandName: data.clientName })
}
