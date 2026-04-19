/**
 * Internal types for the Slide Designer pipeline.
 * These types are NOT exported from the main package — they're internal implementation detail.
 * External consumers use the types from @/types/presentation.
 */

import type {
  DesignSystem,
  Slide,
  SlideType,
  FontWeight,
  SlideElement,
  CuratedSlideContent,
} from '@/types/presentation'

// Re-export for convenience within slide-design modules
export type { Slide, SlideType, FontWeight, SlideElement, CuratedSlideContent }

// ─── Brand & Input Types ──────────────────────────────

export interface BrandDesignInput {
  brandName: string
  industry?: string
  brandPersonality?: string[]
  brandColors: {
    primary: string
    secondary: string
    accent: string
    background?: string
    text?: string
    style?: string
    mood?: string
  }
  logoUrl?: string
  coverImageUrl?: string
  targetAudience?: string
}

export interface SlideContentInput {
  slideType: string
  title: string
  content: Record<string, unknown>
  imageUrl?: string
}

// ─── Premium Design System ────────────────────────────

export interface PremiumDesignSystem extends DesignSystem {
  colors: {
    primary: string; secondary: string; accent: string
    background: string; text: string; cardBg: string; cardBorder: string
    gradientStart: string; gradientEnd: string; muted: string; highlight: string
    auroraA: string; auroraB: string; auroraC: string
  }
  fonts: { heading: string; body: string }
  direction: 'rtl' | 'ltr'
  typography: {
    displaySize: number; headingSize: number; subheadingSize: number
    bodySize: number; captionSize: number
    letterSpacingTight: number; letterSpacingWide: number
    lineHeightTight: number; lineHeightRelaxed: number
    weightPairs: [number, number][]
  }
  spacing: { unit: number; cardPadding: number; cardGap: number; safeMargin: number }
  effects: {
    borderRadius: 'sharp' | 'soft' | 'pill'
    borderRadiusValue: number
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist'
    shadowStyle: 'none' | 'fake-3d' | 'glow'
    auroraGradient: string
  }
  motif: { type: string; opacity: number; color: string; implementation: string }
  creativeDirection?: {
    visualMetaphor: string
    visualTension: string
    oneRule: string
    colorStory: string
    typographyVoice: string
    emotionalArc: string
  }
}

// ─── Context Types ────────────────────────────────────

export interface BatchContext {
  previousSlidesVisualSummary: string
  slideIndex: number
  totalSlides: number
}

export interface SingleSlideContext {
  allCurated: CuratedSlideContent[]
  previousSlides: Slide[]
  totalSlides: number
}

export interface PacingDirective {
  energy: 'calm' | 'building' | 'peak' | 'breath' | 'finale'
  density: 'minimal' | 'balanced' | 'dense'
  surprise: boolean
  maxElements: number
  minWhitespace: number
}

// ─── Validation Types ─────────────────────────────────

export interface ValidationResult {
  valid: boolean
  score: number
  issues: ValidationIssue[]
}

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'suggestion'
  category: string
  message: string
  elementId?: string
  autoFixable: boolean
}

export interface BoundingBox { x: number; y: number; width: number; height: number }

// ─── Pipeline Types (exported from main package) ──────

export interface PipelineFoundation {
  designSystem: PremiumDesignSystem
  batches: SlideContentInput[][]
  curatedBatches?: CuratedSlideContent[][]
  /** Flat list of all curated slides for full-story context */
  allCurated: CuratedSlideContent[]
  /** Flat list of all raw inputs (1 per slide) */
  allSlides: SlideContentInput[]
  brandName: string
  clientLogo: string
  leadersLogo: string
  totalSlides: number
}

export interface BatchResult {
  slides: Slide[]
  /** @deprecated — kept for backwards compat but no longer used for context */
  visualSummary: string
  slideIndex: number
  /** Full JSON of generated slides for sequential context passing */
  generatedSlides?: Slide[]
}

// ─── Data Types ───────────────────────────────────────

export interface InfluencerResearchData {
  strategySummary?: string
  strategyTitle?: string
  recommendations?: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }[]
  contentThemes?: { theme?: string; description?: string }[]
  tiers?: { name?: string; description?: string; recommendedCount?: number; budgetAllocation?: number; purpose?: string }[]
  expectedKPIs?: { metric?: string; target?: string; rationale?: string }[]
  suggestedTimeline?: { phase?: string; duration?: string; activities?: string[] }[]
  potentialRisks?: { risk?: string; mitigation?: string }[]
  [key: string]: unknown
}

export interface PremiumProposalData {
  brandName?: string
  issueDate?: string
  campaignName?: string
  campaignSubtitle?: string
  brandBrief?: string
  brandPainPoints?: string[]
  brandObjective?: string
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  keyInsight?: string
  insightSource?: string
  insightData?: string
  strategyHeadline?: string
  strategyDescription?: string
  strategyPillars?: { title: string; description: string }[]
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  activityDifferentiator?: string
  deliverables?: string[]
  deliverablesDetailed?: { type: string; quantity: number; description: string; purpose: string }[]
  deliverablesSummary?: string
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
  successMetrics?: string[]
  clientSpecificRequests?: string[]
  measurableTargets?: { metric: string; value: string; timeline: string }[]
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  influencerResearch?: InfluencerResearchData
  scrapedInfluencers?: { name?: string; username?: string; profilePicUrl?: string; followers?: number; engagementRate?: number }[]
  enhancedInfluencers?: { name: string; username: string; profilePicUrl: string; categories: string[]; followers: number; engagementRate: number }[]
  _brandColors?: { primary: string; secondary: string; accent: string; background?: string; text?: string; style?: string; mood?: string; palette?: string[] }
  _brandResearch?: {
    industry?: string
    brandPersonality?: string[]
    brandValues?: string[]
    brandPromise?: string
    companyDescription?: string
    whyNowTrigger?: string
    israeliMarketContext?: string
    dominantPlatformInIsrael?: string
    competitiveGap?: string
    competitiveAdvantages?: string[]
    uniqueSellingPoints?: string[]
    marketPosition?: string
    competitors?: { name?: string; description?: string; differentiator?: string }[]
    competitorCampaigns?: { competitorName?: string; campaignDescription?: string; opportunityForBrand?: string }[]
    industryTrends?: string[]
    targetDemographics?: { primaryAudience?: { gender?: string; ageRange?: string; socioeconomic?: string; lifestyle?: string; interests?: string[]; painPoints?: string[]; aspirations?: string[] }; behavior?: string; purchaseDrivers?: string[] }
    toneOfVoice?: string
    suggestedApproach?: string
    [key: string]: unknown
  }
  _scraped?: { logoUrl?: string; [key: string]: unknown }
  _generatedImages?: Record<string, string>
  _extraImages?: { id: string; url: string; placement: string }[]
  _imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  _influencerStrategy?: InfluencerResearchData
  [key: string]: unknown
}
