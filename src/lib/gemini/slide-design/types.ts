/**
 * Internal types + schemas for the Slide Designer pipeline.
 * Types are internal implementation detail — external consumers use @/types/presentation.
 * Schemas define Gemini structured output format.
 */

import { Type } from '@google/genai'
import type {
  DesignSystem,
  Slide,
  SlideType,
  FontWeight,
  SlideElement,
} from '@/types/presentation'

// Re-export for convenience within slide-design modules
export type { Slide, SlideType, FontWeight, SlideElement }

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
    visualMetaphor_translates_to?: {
      whitespace_ratio: string
      max_colors_per_slide: number
      text_alignment: string
      image_treatment: string
    }
  }
}

// ─── Context Types ────────────────────────────────────

export interface BatchContext {
  previousSlidesVisualSummary: string
  slideIndex: number
  totalSlides: number
}

export interface SingleSlideContext {
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

// ─── Slide Plan (output of Planner AI) ───────────────

export interface SlidePlan {
  slideType: string
  title: string
  subtitle?: string
  bodyText?: string
  bulletPoints?: string[]
  cards?: { title: string; body: string }[]
  keyNumber?: string
  keyNumberLabel?: string
  tagline?: string
  /** Description of what image is needed — for future AI image generation */
  imageDirection?: string
  /** Key in the images map for an existing image */
  existingImageKey?: string
  /** Emotional tone: dramatic, warm, analytical, energetic, etc. */
  emotionalTone: string
}

// ─── Pipeline Types (exported from main package) ──────

export interface PipelineFoundation {
  designSystem: PremiumDesignSystem
  /** Per-slide plan from the Planner AI — content + image direction */
  plan: SlidePlan[]
  /** 3 batch groups of plan indices */
  batches: number[][]
  /** Full wizard data — available for reference */
  proposalData: PremiumProposalData
  brandName: string
  clientLogo: string
  leadersLogo: string
  totalSlides: number
  /** Image URLs from wizard/scraping */
  images: Record<string, string>
  /** Number of batches (typically 3) */
  batchCount?: number
  /** Slide count per batch */
  batchSizes?: number[]
  /** Gemini explicit cache name (if created) — reused across all batches for cost savings */
  geminiCacheName?: string
}

export interface BatchResult {
  slides: Slide[]
  visualSummary: string
  slideIndex: number
}

// ─── HTML-Native Pipeline Types (v6) ─────────────────

export interface HtmlBatchResult {
  htmlSlides: string[]
  slideTypes: string[]
  slideIndex: number
}

export interface HtmlPresentation {
  title: string
  brandName: string
  designSystem: PremiumDesignSystem
  htmlSlides: string[]
  slideTypes: string[]
  metadata: {
    brandName?: string
    createdAt: string
    version: number
    pipeline: string
    qualityScore: number
    duration?: number
  }
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

// ═══════════════════════════════════════════════════════════
//  GEMINI STRUCTURED OUTPUT SCHEMAS
// ═══════════════════════════════════════════════════════════

export const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    creativeDirection: {
      type: Type.OBJECT,
      properties: {
        visualMetaphor: { type: Type.STRING },
        visualTension: { type: Type.STRING },
        oneRule: { type: Type.STRING },
        colorStory: { type: Type.STRING },
        typographyVoice: { type: Type.STRING },
        emotionalArc: { type: Type.STRING },
        visualMetaphor_translates_to: {
          type: Type.OBJECT,
          properties: {
            whitespace_ratio: { type: Type.STRING },
            max_colors_per_slide: { type: Type.INTEGER },
            text_alignment: { type: Type.STRING },
            image_treatment: { type: Type.STRING },
          },
          required: ['whitespace_ratio', 'max_colors_per_slide', 'text_alignment', 'image_treatment'],
        },
      },
      required: ['visualMetaphor', 'visualTension', 'oneRule', 'colorStory', 'typographyVoice', 'emotionalArc', 'visualMetaphor_translates_to'],
    },
    colors: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING }, secondary: { type: Type.STRING },
        accent: { type: Type.STRING }, background: { type: Type.STRING },
        text: { type: Type.STRING }, cardBg: { type: Type.STRING },
        cardBorder: { type: Type.STRING }, gradientStart: { type: Type.STRING },
        gradientEnd: { type: Type.STRING }, muted: { type: Type.STRING },
        highlight: { type: Type.STRING }, auroraA: { type: Type.STRING },
        auroraB: { type: Type.STRING }, auroraC: { type: Type.STRING },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'cardBg', 'cardBorder',
        'gradientStart', 'gradientEnd', 'muted', 'highlight', 'auroraA', 'auroraB', 'auroraC'],
    },
    fonts: {
      type: Type.OBJECT,
      properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ['heading', 'body'],
    },
    typography: {
      type: Type.OBJECT,
      properties: {
        displaySize: { type: Type.INTEGER }, headingSize: { type: Type.INTEGER },
        subheadingSize: { type: Type.INTEGER }, bodySize: { type: Type.INTEGER },
        captionSize: { type: Type.INTEGER },
        letterSpacingTight: { type: Type.NUMBER }, letterSpacingWide: { type: Type.NUMBER },
        lineHeightTight: { type: Type.NUMBER }, lineHeightRelaxed: { type: Type.NUMBER },
        weightPairs: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
      },
      required: ['displaySize', 'headingSize', 'subheadingSize', 'bodySize', 'captionSize',
        'letterSpacingTight', 'letterSpacingWide', 'lineHeightTight', 'lineHeightRelaxed', 'weightPairs'],
    },
    spacing: {
      type: Type.OBJECT,
      properties: {
        unit: { type: Type.INTEGER }, cardPadding: { type: Type.INTEGER },
        cardGap: { type: Type.INTEGER }, safeMargin: { type: Type.INTEGER },
      },
      required: ['unit', 'cardPadding', 'cardGap', 'safeMargin'],
    },
    effects: {
      type: Type.OBJECT,
      properties: {
        borderRadius: { type: Type.STRING, enum: ['sharp', 'soft', 'pill'] },
        borderRadiusValue: { type: Type.INTEGER },
        decorativeStyle: { type: Type.STRING, enum: ['geometric', 'organic', 'minimal', 'brutalist'] },
        shadowStyle: { type: Type.STRING, enum: ['none', 'fake-3d', 'glow'] },
        auroraGradient: { type: Type.STRING },
      },
      required: ['borderRadius', 'borderRadiusValue', 'decorativeStyle', 'shadowStyle', 'auroraGradient'],
    },
    motif: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING }, opacity: { type: Type.NUMBER },
        color: { type: Type.STRING }, implementation: { type: Type.STRING },
      },
      required: ['type', 'opacity', 'color', 'implementation'],
    },
  },
  required: ['creativeDirection', 'colors', 'fonts', 'typography', 'spacing', 'effects', 'motif'],
}

/** Flat element schema — all element type fields combined, type-specific ones are optional */
const SLIDE_ELEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['text', 'shape', 'image'] },
    x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
    width: { type: Type.NUMBER, description: 'Element width in px. Text: ensure width fits content at fontSize' },
    height: { type: Type.NUMBER, description: 'Element height in px. Text: ensure height fits number of lines' },
    zIndex: { type: Type.INTEGER },
    opacity: { type: Type.NUMBER },
    rotation: { type: Type.NUMBER },
    // Text fields
    content: { type: Type.STRING, description: 'Text content (Hebrew). Required for type=text' },
    fontSize: { type: Type.NUMBER, description: 'Font size in px. Required for type=text. Titles: 60-140, body: 18-24, caption: 14-16' },
    fontWeight: { type: Type.INTEGER, description: 'Font weight 100-900. Required for type=text. Titles: 700-900, body: 300-400' },
    color: { type: Type.STRING, description: 'Text color hex. Required for type=text. Must contrast with background' },
    textAlign: { type: Type.STRING, description: 'Text alignment. Always "right" for RTL Hebrew' },
    role: { type: Type.STRING, description: 'Required for type=text: title|subtitle|body|caption|label|decorative' },
    lineHeight: { type: Type.NUMBER },
    letterSpacing: { type: Type.NUMBER },
    textStroke: {
      type: Type.OBJECT,
      properties: { width: { type: Type.NUMBER }, color: { type: Type.STRING } },
      required: ['width', 'color'],
    },
    // Shape fields
    shapeType: { type: Type.STRING, description: 'Required for type=shape: background|decorative|divider|card' },
    fill: { type: Type.STRING, description: 'Required for type=shape. Color hex, gradient, or "transparent"' },
    borderRadius: { type: Type.NUMBER },
    clipPath: { type: Type.STRING },
    border: { type: Type.STRING },
    // Image fields
    src: { type: Type.STRING, description: 'Image URL. Required for type=image. Use exact URL from content' },
    alt: { type: Type.STRING },
    objectFit: { type: Type.STRING, description: 'Required for type=image: "cover" or "contain"' },
    // Depth & effects
    boxShadow: { type: Type.STRING, description: 'CSS box-shadow. Cards: "0 4px 20px rgba(0,0,0,0.2)"' },
    textShadow: { type: Type.STRING, description: 'CSS text-shadow for type=text' },
    filter: { type: Type.STRING, description: 'CSS filter for type=image. e.g. "brightness(0.85) contrast(1.1)"' },
    backdropFilter: { type: Type.STRING, description: 'CSS backdrop-filter for glassmorphism' },
  },
  required: ['id', 'type', 'x', 'y', 'width', 'height', 'zIndex',
    'color', 'fill', 'role', 'content', 'fontSize', 'fontWeight', 'shapeType', 'src', 'objectFit'],
}

export const SLIDE_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slideType: { type: Type.STRING, description: 'Slide type: cover|brief|goals|audience|insight|whyNow|strategy|competitive|bigIdea|approach|deliverables|metrics|influencerStrategy|contentStrategy|influencers|timeline|closing' },
          title: { type: Type.STRING, description: 'Hebrew title — creative, punchy, brand-specific' },
          subtitle: { type: Type.STRING, description: 'Hebrew subtitle (optional)' },
          bodyText: { type: Type.STRING, description: 'Hebrew body text — max 2-3 sentences (optional)' },
          bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Hebrew bullet points (optional)' },
          cards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                body: { type: Type.STRING },
              },
              required: ['title', 'body'],
            },
            description: 'Cards for grid/bento layouts (optional)',
          },
          keyNumber: { type: Type.STRING, description: 'Key statistic or number (optional)' },
          keyNumberLabel: { type: Type.STRING, description: 'Label for the key number (optional)' },
          tagline: { type: Type.STRING, description: 'CTA or tagline (optional)' },
          imageDirection: { type: Type.STRING, description: 'Description of what image is needed for this slide (optional)' },
          existingImageKey: { type: Type.STRING, description: 'Key of existing image to use: coverImage|brandImage|audienceImage|activityImage or extra image ID (optional)' },
          emotionalTone: { type: Type.STRING, description: 'Emotional direction: dramatic|warm|analytical|energetic|inspiring|confident|intimate|bold' },
        },
        required: ['slideType', 'title', 'emotionalTone'],
      },
    },
  },
  required: ['slides'],
}

export const SLIDE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          slideType: { type: Type.STRING },
          archetype: { type: Type.STRING, description: 'Layout archetype used' },
          dramaticChoice: { type: Type.STRING, description: 'The ONE dramatic visual decision for this slide' },
          label: { type: Type.STRING },
          background: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['solid', 'gradient', 'image'] },
              value: { type: Type.STRING },
            },
            required: ['type', 'value'],
          },
          elements: { type: Type.ARRAY, items: SLIDE_ELEMENT_SCHEMA },
        },
        required: ['id', 'slideType', 'archetype', 'dramaticChoice', 'label', 'background', 'elements'],
      },
    },
  },
  required: ['slides'],
}
