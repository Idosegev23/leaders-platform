/**
 * Structured Slide Layouts — Gamma-model prototype
 *
 * Instead of free HTML, Gemini picks one of N layout archetypes and fills slots.
 * The renderer (React + CSS arsenal) produces the final HTML.
 *
 * Tradeoff: less creative per-slide variation, but editable + consistent.
 */

export type LayoutId =
  | 'hero-cover'              // Cover slide: big title + bg image
  | 'full-bleed-image-text'   // Image fills canvas, text overlay right side
  | 'split-image-text'        // 60/40 split: image left, text right
  | 'centered-insight'        // Big quote-style insight, centered
  | 'three-pillars-grid'      // 3 vertical pillars (for goals/strategy)
  | 'numbered-stats'          // Big numbers with labels (for metrics)
  | 'influencer-grid'         // Grid of influencer cards with pics
  | 'closing-cta'             // Minimal closing slide with CTA

export interface DesignSystem {
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    muted: string
    cardBg: string
  }
  fonts: {
    heading: string
    body: string
  }
  creativeDirection?: {
    visualMetaphor?: string
    oneRule?: string
  }
}

// ─── Slot schemas per layout ───────────────────────────

export interface HeroCoverSlots {
  brandName: string
  title: string
  subtitle?: string
  tagline?: string
  backgroundImage?: string
  eyebrowLabel?: string  // e.g. "INITIATION", "STRATEGIC SHIFT // 02"
}

export interface FullBleedImageTextSlots {
  image: string
  eyebrowLabel?: string
  title: string
  subtitle?: string
  body?: string
}

export interface SplitImageTextSlots {
  image: string
  imageSide: 'left' | 'right'
  eyebrowLabel?: string
  title: string
  bodyText?: string
  bullets?: string[]
}

export interface CenteredInsightSlots {
  eyebrowLabel?: string
  title: string        // The insight itself
  dataPoint?: string   // "73%"
  dataLabel?: string   // "מהקונים מחליטים לפי חבר"
  source?: string
}

export interface ThreePillarsGridSlots {
  eyebrowLabel?: string
  title: string
  pillars: Array<{
    number: string     // "01", "02", "03"
    title: string
    description: string
  }>
}

export interface NumberedStatsSlots {
  eyebrowLabel?: string
  title: string
  stats: Array<{
    value: string      // "1.5M", "₪150K"
    label: string
    accent?: boolean
  }>
}

export interface InfluencerGridSlots {
  eyebrowLabel?: string
  title: string
  subtitle?: string
  influencers: Array<{
    name: string
    handle: string
    followers: string  // formatted "250K"
    engagement: string // "3.5%"
    profilePicUrl?: string
    isVerified?: boolean
  }>
}

export interface ClosingCTASlots {
  brandName: string
  title: string        // e.g. "בואו נתחיל"
  tagline?: string     // "Leaders × {brand}"
  backgroundImage?: string
}

// ─── Unified slide shape ───────────────────────────────

export type SlideLayout =
  | { layout: 'hero-cover'; slots: HeroCoverSlots }
  | { layout: 'full-bleed-image-text'; slots: FullBleedImageTextSlots }
  | { layout: 'split-image-text'; slots: SplitImageTextSlots }
  | { layout: 'centered-insight'; slots: CenteredInsightSlots }
  | { layout: 'three-pillars-grid'; slots: ThreePillarsGridSlots }
  | { layout: 'numbered-stats'; slots: NumberedStatsSlots }
  | { layout: 'influencer-grid'; slots: InfluencerGridSlots }
  | { layout: 'closing-cta'; slots: ClosingCTASlots }

export interface StructuredSlide {
  slideType: string    // cover, brief, goals, insight, strategy, etc.
  layout: SlideLayout['layout']
  slots: SlideLayout['slots']
  slideNumber?: number
  /**
   * Per-element style overrides (hybrid free-move).
   * Keyed by data-role (e.g. "title", "eyebrow", "stat-0", "pillar-1").
   * Value is a CSS string appended after the renderer's default styles.
   * Example: { title: "left:120px; top:200px; width:800px; font-size:140px;" }
   */
  elementStyles?: Record<string, string>
  /**
   * Free-floating elements added on top of the layout (image / video / text).
   * Each gets a unique id and is positioned absolutely via inline style.
   * The drag/resize editor treats them like any other [data-role] element.
   */
  freeElements?: FreeElement[]
  /** data-role names to hide on this slide (used for decorations the user deleted). */
  hiddenRoles?: string[]
  /** Per-slide background override (swaps background on .slide). */
  bg?: { color?: string; image?: string }
  /** Validation / trust metadata (computed + persisted). */
  meta?: {
    validation?: {
      source?: { status: 'verified' | 'unverified' | 'fake'; reasoning?: string; checkedAt?: string; foundUrl?: string }
      reference?: { status: 'verified' | 'unverified' | 'fake'; reasoning?: string; checkedAt?: string }
      image?: { status: 'ok' | 'broken' | 'mismatch'; reasoning?: string; checkedAt?: string }
    }
  }
}

export interface FreeElement {
  id: string                       // unique within slide, also serves as data-role
  kind: 'image' | 'video' | 'text' | 'shape'
  src?: string                     // URL for image/video
  text?: string                    // text content
  shape?: 'rect' | 'circle' | 'line'
  fill?: string                    // shape fill color
  stroke?: string                  // shape stroke color
  /** per-element text formatting (applied via inline style on text elements) */
  format?: {
    fontSize?: number
    fontWeight?: string
    color?: string
    textAlign?: 'right' | 'center' | 'left'
    fontStyle?: 'normal' | 'italic'
    textDecoration?: string
  }
  style?: string                   // initial CSS (default centered if omitted)
}

export interface StructuredPresentation {
  brandName: string
  designSystem: DesignSystem
  slides: StructuredSlide[]
}
