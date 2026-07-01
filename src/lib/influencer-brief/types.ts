// Narrow read-types for the influencer brief generator.
// Source of truth: the deck's persisted `data._stepData` (proposal-agent shape).

export interface DeckInfluencer {
  name: string
  username?: string
  categories?: string[]
  followers?: number
  engagementRate?: number
  bio?: string
  profileUrl?: string
  profilePicUrl?: string
}

export interface DeckStepData {
  brief?: { brandName?: string; brandBrief?: string; brandObjective?: string }
  strategy?: {
    strategyHeadline?: string
    strategyDescription?: string
    strategyPillars?: { title: string; description: string }[]
  }
  creative?: {
    activityTitle?: string
    activityConcept?: string
    activityDescription?: string
    activityApproach?: { title: string; description: string }[]
    activityDifferentiator?: string
  }
  deliverables?: {
    deliverables?: { type: string; quantity?: number; description?: string; purpose?: string }[]
    deliverablesSummary?: string
  }
  key_insight?: { keyInsight?: string; insightSource?: string; insightData?: string }
  influencers?: {
    influencers?: DeckInfluencer[]
    influencerStrategy?: string
    influencerCriteria?: string[]
  }
}

export interface DeckDocData {
  brandName?: string
  _extractedData?: {
    brand?: { name?: string; officialName?: string; industry?: string; background?: string }
    budget?: { amount?: number | null; currency?: string }
  }
  _stepData?: DeckStepData | null
}

export interface InfluencerBriefInput {
  brandName: string
  brandTagline?: string
  data: DeckDocData
}
