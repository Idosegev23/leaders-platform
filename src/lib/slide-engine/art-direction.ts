/**
 * AI Art Direction — content-aware prompt + validation
 * The AI's job: choose composition, emphasis, scale, and decorative style.
 * TypeScript's job: turn those decisions into pixel-perfect layouts.
 */

import { Type } from '@google/genai'
import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { SlideDirection, ArtDirectionResult, CompositionType, HeroElement, TitlePlacement, TitleScale, BackgroundStyle, DecorativeType, ColorEmphasis } from './types'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'

// ─── Schema ─────────────────────────────────────────────

export const ART_DIRECTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slideType: { type: Type.STRING },
          composition: { type: Type.STRING, description: 'hero-center | hero-left | hero-right | split-screen | bento-grid | data-art | editorial | cards-float | full-bleed | timeline-flow' },
          heroElement: { type: Type.STRING, description: 'title | number | image | quote | cards' },
          titlePlacement: { type: Type.STRING, description: 'top | center | bottom' },
          titleScale: { type: Type.STRING, description: 'md | lg | xl | xxl' },
          backgroundStyle: { type: Type.STRING, description: 'solid | gradient | aurora | image-overlay' },
          gradientAngle: { type: Type.INTEGER },
          decorativeElement: { type: Type.STRING, description: 'watermark | accent-line | motif-pattern | floating-shape | none' },
          colorEmphasis: { type: Type.STRING, description: 'primary | accent | dark | light' },
          dramaticChoice: { type: Type.STRING, description: 'One sentence describing the bold visual decision' },
        },
        required: ['slideType', 'composition', 'heroElement', 'titlePlacement', 'titleScale', 'backgroundStyle', 'decorativeElement', 'colorEmphasis', 'dramaticChoice'],
      },
    },
  },
  required: ['slides'],
}

// ─── Content-Aware Prompt ───────────────────────────────

export function buildArtDirectionPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  brandName: string,
): string {
  const slideList = plans.map((p, i) => {
    const hasImage = !!p.existingImageKey
    const hasCards = (p.cards?.length || 0) > 0
    const hasBullets = (p.bulletPoints?.length || 0) > 0
    const hasNumber = !!p.keyNumber
    const hasBody = !!p.bodyText && p.bodyText.length > 10
    const titleLen = p.title.length
    const titleClass = titleLen <= 15 ? 'short' : titleLen <= 35 ? 'medium' : 'long'
    const contentItems = (p.cards?.length || 0) + (p.bulletPoints?.length || 0)

    return `  ${i + 1}. type="${p.slideType}" title="${p.title}" titleLength=${titleClass}(${titleLen}) image=${hasImage} cards=${hasCards ? p.cards!.length : 0} bullets=${hasBullets ? p.bulletPoints!.length : 0} number=${hasNumber ? `"${p.keyNumber}"` : 'none'} hasBody=${hasBody} items=${contentItems} tone="${p.emotionalTone}"`
  }).join('\n')

  const cd = ds.creativeDirection
  const metaphor = cd?.visualMetaphor || 'premium editorial'
  const tension = cd?.visualTension || 'bold typography vs minimal whitespace'

  return `You are an art director designing a ${plans.length}-slide presentation for "${brandName}".

Visual direction: ${metaphor}. Tension: ${tension}.

For each slide, choose the BEST visual approach. Do NOT generate pixel positions — just make creative decisions.

SLIDES:
${slideList}

COMPOSITIONS available:
- hero-center: dominant central element (covers, big ideas, closings)
- hero-left / hero-right: 60/40 split with hero on one side (briefs, audience)
- split-screen: 55/45 with divider (strategy, competitive)
- bento-grid: asymmetric card grid (goals, deliverables, influencers)
- data-art: oversized numbers (metrics, whyNow)
- editorial: large quote, magazine style (insight) — REQUIRES hasBody=true
- cards-float: layered cards with depth (approach) — REQUIRES items ≥ 2
- full-bleed: full image with text overlay — REQUIRES image=true
- timeline-flow: horizontal phases (timeline) — REQUIRES items ≥ 3

CONTENT CONSTRAINTS (violating = broken slides):
- editorial ONLY if hasBody=true
- data-art ONLY if number is present
- full-bleed ONLY if image=true
- cards-float/bento-grid ONLY if items ≥ 2
- timeline-flow ONLY if items ≥ 3
- If none match → hero-center or hero-left

TITLE SCALE RULES:
- titleLength=short → xl or xxl
- titleLength=medium → lg or xl
- titleLength=long → md or lg (prevent overflow!)
- cover + closing → xxl or xl always

VARIETY RULES:
1. Never same composition on consecutive slides
2. Use all 3 title zones (top/center/bottom) across the deck
3. At least 2 slides xl or xxl
4. At least half gradient backgrounds
5. Vary decorative elements
6. cover → hero-center or full-bleed, titleScale xxl
7. closing → hero-center, titleScale xl or xxl`
}

// ─── Response Parser with Content Validation ────────────

const VALID_COMPOSITIONS: CompositionType[] = ['hero-center', 'hero-left', 'hero-right', 'split-screen', 'bento-grid', 'data-art', 'editorial', 'cards-float', 'full-bleed', 'timeline-flow']
const VALID_HEROES: HeroElement[] = ['title', 'number', 'image', 'quote', 'cards']
const VALID_PLACEMENTS: TitlePlacement[] = ['top', 'center', 'bottom']
const VALID_SCALES: TitleScale[] = ['md', 'lg', 'xl', 'xxl']
const VALID_BG: BackgroundStyle[] = ['solid', 'gradient', 'aurora', 'image-overlay']
const VALID_DECO: DecorativeType[] = ['watermark', 'accent-line', 'motif-pattern', 'floating-shape', 'none']
const VALID_EMPHASIS: ColorEmphasis[] = ['primary', 'accent', 'dark', 'light']

export function parseArtDirection(raw: string, plans: SlidePlan[]): ArtDirectionResult {
  let parsed: { slides?: unknown[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = parseGeminiJson<{ slides: unknown[] }>(raw)
  }

  return {
    slides: plans.map((plan, i) =>
      sanitizeDirection((parsed?.slides?.[i] || {}) as Record<string, unknown>, plan)
    ),
  }
}

function sanitizeDirection(raw: Record<string, unknown>, plan: SlidePlan): SlideDirection {
  let composition = validateEnum(raw.composition, VALID_COMPOSITIONS, getDefaultComposition(plan.slideType))

  // Content-aware composition override — prevent broken layouts
  const hasCards = (plan.cards?.length || 0) >= 2
  const hasBullets = (plan.bulletPoints?.length || 0) >= 2
  const hasNumber = !!plan.keyNumber
  const hasImage = !!plan.existingImageKey
  const hasBody = !!plan.bodyText && plan.bodyText.length > 30

  if (composition === 'editorial' && !hasBody) composition = 'hero-center'
  if (composition === 'data-art' && !hasNumber) composition = hasCards ? 'bento-grid' : 'hero-center'
  if (composition === 'full-bleed' && !hasImage) composition = 'hero-center'
  if (composition === 'cards-float' && !hasCards && !hasBullets) composition = 'hero-center'
  if (composition === 'bento-grid' && !hasCards && !hasBullets) composition = 'hero-left'
  if (composition === 'timeline-flow' && !hasCards && !hasBullets) composition = 'hero-center'

  // Title scale based on length
  let titleScale = validateEnum(raw.titleScale, VALID_SCALES, 'lg')
  const titleLen = plan.title.length
  if (titleLen > 35 && (titleScale === 'xxl' || titleScale === 'xl')) titleScale = 'lg'
  if (titleLen > 50) titleScale = 'md'

  return {
    slideType: plan.slideType,
    composition,
    heroElement: validateEnum(raw.heroElement, VALID_HEROES, hasNumber ? 'number' : hasImage ? 'image' : 'title'),
    titlePlacement: validateEnum(raw.titlePlacement, VALID_PLACEMENTS, 'top'),
    titleScale,
    backgroundStyle: validateEnum(raw.backgroundStyle, VALID_BG, hasImage ? 'image-overlay' : 'gradient'),
    gradientAngle: typeof raw.gradientAngle === 'number' ? raw.gradientAngle : 135,
    decorativeElement: validateEnum(raw.decorativeElement, VALID_DECO, 'none'),
    colorEmphasis: validateEnum(raw.colorEmphasis, VALID_EMPHASIS, 'dark'),
    dramaticChoice: typeof raw.dramaticChoice === 'string' ? raw.dramaticChoice : 'Bold typography',
  }
}

function validateEnum<T extends string>(value: unknown, valid: T[], fallback: T): T {
  return valid.includes(value as T) ? (value as T) : fallback
}

function getDefaultComposition(slideType: string): CompositionType {
  const defaults: Record<string, CompositionType> = {
    cover: 'hero-center', brief: 'hero-left', goals: 'bento-grid',
    audience: 'editorial', insight: 'editorial', whyNow: 'data-art',
    strategy: 'split-screen', competitive: 'split-screen', bigIdea: 'hero-center',
    approach: 'cards-float', deliverables: 'bento-grid', metrics: 'data-art',
    influencerStrategy: 'split-screen', contentStrategy: 'cards-float',
    influencers: 'bento-grid', timeline: 'timeline-flow', closing: 'hero-center',
  }
  return defaults[slideType] || 'hero-center'
}

// ─── Fallback ───────────────────────────────────────────

export function buildFallbackArtDirection(plans: SlidePlan[]): ArtDirectionResult {
  const placements: TitlePlacement[] = ['top', 'center', 'bottom']
  const scales: TitleScale[] = ['lg', 'xl', 'xxl', 'lg']
  const bgs: BackgroundStyle[] = ['gradient', 'aurora', 'solid', 'gradient']
  const decos: DecorativeType[] = ['accent-line', 'watermark', 'none', 'floating-shape', 'motif-pattern']

  return {
    slides: plans.map((plan, i) => {
      // Content-aware scale
      const titleLen = plan.title.length
      let scale: TitleScale = plan.slideType === 'cover' || plan.slideType === 'closing' ? 'xxl'
        : plan.slideType === 'bigIdea' ? 'xl'
        : scales[i % scales.length]
      if (titleLen > 35 && (scale === 'xxl' || scale === 'xl')) scale = 'lg'
      if (titleLen > 50) scale = 'md'

      // Content-aware composition
      let composition = getDefaultComposition(plan.slideType)
      const hasCards = (plan.cards?.length || 0) >= 2
      const hasBullets = (plan.bulletPoints?.length || 0) >= 2
      const hasBody = !!plan.bodyText && plan.bodyText.length > 30
      if (composition === 'editorial' && !hasBody) composition = 'hero-center'
      if (composition === 'cards-float' && !hasCards && !hasBullets) composition = 'hero-center'

      return {
        slideType: plan.slideType,
        composition,
        heroElement: (plan.keyNumber ? 'number' : plan.existingImageKey ? 'image' : 'title') as HeroElement,
        titlePlacement: placements[i % placements.length],
        titleScale: scale,
        backgroundStyle: plan.existingImageKey ? 'image-overlay' as BackgroundStyle : bgs[i % bgs.length],
        gradientAngle: [135, 180, 45, 90][i % 4],
        decorativeElement: decos[i % decos.length],
        colorEmphasis: 'dark' as ColorEmphasis,
        dramaticChoice: 'Art direction fallback',
      }
    }),
  }
}
