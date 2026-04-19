// Types for the proposal wizard flow

export type WizardStepId =
  | 'brief'
  | 'research'
  | 'goals'
  | 'target_audience'
  | 'key_insight'
  | 'strategy'
  | 'creative'
  | 'deliverables'
  | 'quantities'
  | 'media_targets'
  | 'influencers'

export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped'

export interface WizardStepMeta {
  id: WizardStepId
  label: string
  labelShort: string
  description: string
  required: boolean
  order: number
  helpText?: string
  whyItMatters?: string
}

// Step data types

export interface BriefStepData {
  brandName: string
  brandBrief: string
  brandPainPoints: string[]
  brandObjective: string
  successMetrics?: string[]
  clientSpecificRequests?: string[]
}

export interface GoalsStepData {
  goals: { title: string; description: string }[]
  customGoals: string[]
  targets?: { metric: string; value: string; timeline: string }[]
}

export interface TargetAudienceStepData {
  targetGender: string
  targetAgeRange: string
  targetDescription: string
  targetBehavior: string
  targetInsights: string[]
  targetSecondary?: {
    gender: string
    ageRange: string
    description: string
  }
}

export interface KeyInsightStepData {
  keyInsight: string
  insightSource: string
  insightData?: string
}

export interface StrategyStepData {
  strategyHeadline: string
  strategyDescription?: string
  strategyPillars: { title: string; description: string }[]
  strategyFlow?: {
    steps: { label: string; description: string; icon?: string }[]
  }
}

export interface CreativeStepData {
  activityTitle: string
  activityConcept: string
  activityDescription: string
  activityApproach: { title: string; description: string }[]
  activityDifferentiator?: string
  referenceImages: { url: string; caption?: string }[]
  suggestedReferences?: { type: string; description: string; rationale: string }[]
}

export interface DeliverablesStepData {
  deliverables: {
    type: string
    quantity: number
    description: string
    purpose: string
  }[]
  deliverablesSummary?: string
  referenceImages: { url: string; caption?: string }[]
}

export interface QuantitiesStepData {
  influencerCount: number
  contentTypes: {
    type: string
    quantityPerInfluencer: number
    totalQuantity: number
  }[]
  campaignDurationMonths: number
  totalDeliverables: number
  formula?: string
}

export interface MediaTargetsStepData {
  budget: number
  currency: string
  potentialReach: number
  potentialEngagement: number
  cpe: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
}

export interface InfluencerProfile {
  name: string
  username: string
  profileUrl: string
  profilePicUrl: string
  categories: string[]
  followers: number
  avgStoryViews?: number
  avgReelViews?: number
  engagementRate: number
  israeliAudiencePercent?: number
  genderSplit?: { male: number; female: number }
  ageSplit?: { range: string; percent: number }[]
  bio?: string
  isVerified?: boolean
}

export interface InfluencersStepData {
  influencers: InfluencerProfile[]
  influencerStrategy?: string
  influencerCriteria?: string[]
  influencerNote?: string
}

export interface ResearchStepData {
  researchEnabled: boolean
  researchPhase: 'idle' | 'running' | 'complete' | 'error'

  brandResearch: {
    companyDescription: string
    industry: string
    competitors: { name: string; description: string; differentiator: string }[]
    mainProducts: { name: string; description: string }[]
    targetDemographics: {
      primaryAudience: {
        gender: string; ageRange: string; lifestyle: string
        interests: string[]; painPoints: string[]
      }
    }
    socialPresence: Record<string, { handle?: string; followers?: string; engagement?: string }>
    brandPersonality: string[]
    brandValues: string[]
    suggestedApproach: string
    industryTrends: string[]
    sources: { title: string; url: string }[]
  } | null

  influencerStrategy: {
    strategyTitle: string
    strategySummary: string
    tiers: { name: string; description: string; recommendedCount: number; budgetAllocation: string }[]
    recommendations: {
      name: string; handle: string; category: string; followers: string
      engagement: string; whyRelevant: string; contentStyle: string
    }[]
    contentThemes: { theme: string; description: string }[]
    expectedKPIs: { metric: string; target: string; rationale: string }[]
  } | null

  brandColors: {
    primary: string; secondary: string; accent: string
    background: string; text: string; palette: string[]
  } | null

  errorMessage?: string
}

// Map step IDs to their data types
export interface WizardStepDataMap {
  brief: BriefStepData
  research: ResearchStepData
  goals: GoalsStepData
  target_audience: TargetAudienceStepData
  key_insight: KeyInsightStepData
  strategy: StrategyStepData
  creative: CreativeStepData
  deliverables: DeliverablesStepData
  quantities: QuantitiesStepData
  media_targets: MediaTargetsStepData
  influencers: InfluencersStepData
}

// AI version history entry
export interface AiVersionEntry {
  data: Record<string, unknown>
  timestamp: string
  source: 'ai' | 'research' | 'manual'
}

// Full wizard state (persisted to document.data._wizardState)
export interface WizardState {
  documentId: string | null
  currentStep: WizardStepId
  stepStatuses: Record<WizardStepId, StepStatus>
  stepData: Partial<WizardStepDataMap>
  extractedData: Partial<WizardStepDataMap>
  isDirty: boolean
  lastSavedAt: string | null
  aiVersionHistory?: Record<string, { versions: AiVersionEntry[]; currentIndex: number }>
}

// Wizard reducer action types
export type WizardAction =
  | { type: 'GO_TO_STEP'; step: WizardStepId }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SKIP_STEP' }
  | { type: 'UPDATE_STEP_DATA'; step: WizardStepId; data: Partial<WizardStepDataMap[WizardStepId]> }
  | { type: 'MARK_STEP_COMPLETE'; step: WizardStepId }
  | { type: 'LOAD_STATE'; state: WizardState }
  | { type: 'MARK_SAVED'; timestamp: string }
  | { type: 'SET_DOCUMENT_ID'; id: string }
  | { type: 'SET_EXTRACTED_DATA'; data: Partial<WizardStepDataMap> }
  | { type: 'MARK_DIRTY' }
  | { type: 'PUSH_AI_VERSION'; key: string; data: Record<string, unknown>; source: 'ai' | 'research' | 'manual' }
  | { type: 'NAVIGATE_AI_VERSION'; key: string; direction: 'prev' | 'next' }

// Pipeline status for deferred processing (research + visuals run after wizard opens)
export interface PipelineStatus {
  textGeneration: 'pending' | 'complete' | 'error'
  research: 'pending' | 'in_progress' | 'complete' | 'error'
  visualAssets: 'pending' | 'in_progress' | 'complete' | 'error'
  slideGeneration: 'pending' | 'in_progress' | 'complete' | 'stale' | 'error'
}
