/**
 * JSON AST Types for the Presentation Editor
 * This is the Single Source of Truth for all slide data.
 * No HTML strings — everything is structured JSON.
 */

// ============================================================
// CORE PRESENTATION
// ============================================================

export interface Presentation {
  id: string
  title: string
  designSystem: DesignSystem
  slides: Slide[]
  metadata?: PresentationMetadata
}

export interface PresentationMetadata {
  brandName?: string
  createdAt?: string
  updatedAt?: string
  version: number
  pipeline?: string
  qualityScore?: number
  creativeDirection?: string
  duration?: number
}

// ============================================================
// DESIGN SYSTEM
// ============================================================

export interface DesignSystem {
  colors: DesignColors
  fonts: DesignFonts
  direction: 'rtl' | 'ltr'
}

export interface DesignColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  cardBg: string
  cardBorder: string
}

export interface DesignFonts {
  heading: string
  body: string
}

// ============================================================
// SLIDE
// ============================================================

export interface Slide {
  id: string
  slideType: SlideType
  label: string
  background: SlideBackground
  elements: SlideElement[]
}

export type SlideType =
  | 'cover'
  | 'brief'
  | 'goals'
  | 'audience'
  | 'insight'
  | 'whyNow'
  | 'strategy'
  | 'competitive'
  | 'bigIdea'
  | 'approach'
  | 'deliverables'
  | 'metrics'
  | 'influencerStrategy'
  | 'contentStrategy'
  | 'influencers'
  | 'timeline'
  | 'closing'

export interface SlideBackground {
  type: 'solid' | 'gradient' | 'image'
  value: string
}

// ============================================================
// ELEMENTS
// ============================================================

export interface BaseElement {
  id: string
  type: 'text' | 'image' | 'shape'
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  rotation?: number
  locked?: boolean
}

export type TextRole =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'label'
  | 'metric-value'
  | 'metric-label'
  | 'list-item'
  | 'tag'
  | 'decorative'

export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
  fontSize: number
  fontWeight: FontWeight
  fontFamily?: string // Override designSystem font for this element
  color: string
  textAlign: 'right' | 'center' | 'left'
  lineHeight?: number
  letterSpacing?: number
  textDecoration?: 'none' | 'underline'
  role?: TextRole
  backgroundColor?: string
  borderRadius?: number
  padding?: number
  // Advanced visual effects
  textStroke?: { width: number; color: string }
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  gradientFill?: string // CSS gradient for text fill (uses background-clip: text)
  mixBlendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion'
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  alt?: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius?: number
  clipPath?: string
  border?: string
}

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'decorative' | 'background' | 'divider'

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shapeType: ShapeType
  fill: string
  borderRadius?: number
  clipPath?: string
  border?: string
  mixBlendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion'
}

export type SlideElement = TextElement | ImageElement | ShapeElement

// ============================================================
// TYPE GUARDS
// ============================================================

export function isTextElement(el: SlideElement): el is TextElement {
  return el.type === 'text'
}

export function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image'
}

export function isShapeElement(el: SlideElement): el is ShapeElement {
  return el.type === 'shape'
}

// ============================================================
// CURATED SLIDE CONTENT (Content Curator output)
// ============================================================

/**
 * Pre-processed, presentation-ready content for a single slide.
 * Created by the Content Curator AI before the Design step.
 * The designer AI receives THIS instead of raw wizard JSON.
 */
export interface CuratedSlideContent {
  slideType: string
  /** Punchy headline — max 5 Hebrew words */
  title: string
  subtitle?: string
  /** Concise body — max ~40 words */
  bodyText?: string
  /** 3-5 items, max 8 words each */
  bulletPoints?: string[]
  /** Large formatted stat: "500K+", "₪120K", "4.2%" */
  keyNumber?: string
  /** Label under the key number */
  keyNumberLabel?: string
  /** Structured cards — max 4 */
  cards?: { title: string; body: string }[]
  /** Closing tagline or CTA */
  tagline?: string
  /** Passed through from input */
  imageUrl?: string
  /** How the image should be used */
  imageRole?: 'hero' | 'accent' | 'background' | 'portrait' | 'icon'
  /** Emotional tone for this specific slide */
  emotionalNote?: string
}

// ============================================================
// CANVAS CONSTANTS
// ============================================================

export const CANVAS_WIDTH = 1920
export const CANVAS_HEIGHT = 1080
export const SAFE_ZONE = 80
