/**
 * Art Director Engine — Types
 *
 * The AI makes creative DECISIONS (composition, emphasis, scale).
 * TypeScript executes the LAYOUT (pixel positions, sizes, alignment).
 */

import type {
  SlideType,
  SlideElement,
  SlideBackground,
  Slide,
  TextRole,
  FontWeight,
} from '@/types/presentation'
import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'

// ─── Composition Types ─────────────────────────────────

export type CompositionType =
  | 'hero-center'      // Dominant central element, support below/sides
  | 'hero-left'        // Hero 60% left, support 35% right
  | 'hero-right'       // Mirror of hero-left
  | 'split-screen'     // 55/45 split with visual divider
  | 'bento-grid'       // Asymmetric grid of mixed-size cells
  | 'data-art'         // Oversized numbers as visual centerpiece
  | 'editorial'        // Large quote + attribution, magazine style
  | 'cards-float'      // Floating cards with depth shadows
  | 'full-bleed'       // Full-bleed image + text overlay
  | 'timeline-flow'    // Horizontal progression with connected phases

export type HeroElement = 'title' | 'number' | 'image' | 'quote' | 'cards'
export type TitlePlacement = 'top' | 'center' | 'bottom'
export type TitleScale = 'md' | 'lg' | 'xl' | 'xxl'
export type BackgroundStyle = 'solid' | 'gradient' | 'aurora' | 'image-overlay'
export type DecorativeType = 'watermark' | 'accent-line' | 'motif-pattern' | 'floating-shape' | 'none'
export type ColorEmphasis = 'primary' | 'accent' | 'dark' | 'light'

// ─── AI Art Direction Output ───────────────────────────

export interface SlideDirection {
  slideType: string
  composition: CompositionType
  heroElement: HeroElement
  titlePlacement: TitlePlacement
  titleScale: TitleScale
  backgroundStyle: BackgroundStyle
  gradientAngle?: number               // 45, 90, 135, 180
  decorativeElement: DecorativeType
  colorEmphasis: ColorEmphasis
  dramaticChoice: string               // Describes the ONE bold visual decision
}

export interface ArtDirectionResult {
  slides: SlideDirection[]
}

// ─── Content passed to composition functions ────────────

export interface SlideContent {
  slideType: SlideType
  title: string
  subtitle?: string
  bodyText?: string
  bulletPoints?: string[]
  cards?: { title: string; body: string }[]
  keyNumber?: string
  keyNumberLabel?: string
  tagline?: string
  imageUrl?: string
  emotionalTone?: string
}

// ─── Grid System ────────────────────────────────────────

export const CANVAS_WIDTH = 1920
export const CANVAS_HEIGHT = 1080

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface GridConfig {
  columns: number
  gutter: number
  margin: number
  canvasWidth: number
  canvasHeight: number
  direction?: 'rtl' | 'ltr'
}

export interface Grid {
  /** Get x + width for column range (1-indexed, inclusive) */
  col(start: number, span: number): { x: number; width: number }
  /** RTL-aware column positioning. In RTL: col 1 starts from RIGHT edge. */
  colRTL(start: number, span: number): { x: number; width: number }
  /** Get usable area for a vertical zone */
  zone(placement: TitlePlacement): { y: number; height: number }
  /** Center a block of given height vertically in the usable area */
  centerY(blockHeight: number): number
  /** Full usable rect (inside safe margins) */
  usable: Rect
  /** Bento cell — row/col are 0-indexed */
  bentoCell(row: number, col: number, rowSpan: number, colSpan: number, totalRows: number, totalCols: number, gap: number): Rect
}

// ─── Typography Scale ───────────────────────────────────

export interface TypoScale {
  titleSize: number
  titleWeight: FontWeight
  titleLineHeight: number
  subtitleSize: number
  subtitleWeight: FontWeight
  bodySize: number
  bodyWeight: FontWeight
  captionSize: number
  captionWeight: FontWeight
  metricSize: number        // For key numbers
  metricWeight: FontWeight
  /** Estimated height for a single line of title text */
  titleLineHeightPx: number
}

// ─── Composition Function Signature ─────────────────────

export type CompositionFn = (
  content: SlideContent,
  direction: SlideDirection,
  ds: PremiumDesignSystem,
  grid: Grid,
  typo: TypoScale,
) => {
  background: SlideBackground
  elements: SlideElement[]
}

// ─── Utility: Convert SlidePlan → SlideContent ──────────

export function planToContent(plan: SlidePlan, images: Record<string, string>): SlideContent {
  return {
    slideType: plan.slideType as SlideType,
    title: plan.title,
    subtitle: plan.subtitle,
    bodyText: plan.bodyText,
    bulletPoints: plan.bulletPoints,
    cards: plan.cards,
    keyNumber: plan.keyNumber,
    keyNumberLabel: plan.keyNumberLabel,
    tagline: plan.tagline,
    imageUrl: plan.existingImageKey ? images[plan.existingImageKey] : undefined,
    emotionalTone: plan.emotionalTone,
  }
}
