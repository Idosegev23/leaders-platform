/**
 * Semantic Token System — the vocabulary GPT speaks.
 * GPT picks tokens. Layout Resolver converts tokens → pixel coordinates.
 *
 * Slide Engine v5
 */

// ─── Position Tokens ─────────────────────────────────
export type PositionToken =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'upper-third' | 'lower-third'
  | 'left-half' | 'right-half'
  | 'full-bleed'

// ─── Size Tokens ─────────────────────────────────────
export type SizeToken =
  | 'hero'       // ~96-120px
  | 'headline'   // ~64-80px
  | 'title'      // ~48-56px
  | 'subtitle'   // ~32-40px
  | 'body'       // ~22-28px
  | 'caption'    // ~16-18px
  | 'micro'      // ~12-14px

// ─── Weight / Dominance ──────────────────────────────
export type WeightToken = 'dominant' | 'prominent' | 'supporting' | 'subtle'

// ─── Mood ────────────────────────────────────────────
export type MoodToken = 'dramatic' | 'professional' | 'warm' | 'minimal' | 'energetic' | 'elegant'

// ─── Color Tokens ────────────────────────────────────
export type ColorToken = 'primary' | 'secondary' | 'accent' | 'on-dark' | 'on-light' | 'muted'

// ─── Background Tokens ───────────────────────────────
export type BackgroundToken =
  | 'solid-primary'
  | 'solid-dark'
  | 'solid-light'
  | 'gradient-primary'
  | 'gradient-dramatic'
  | 'gradient-subtle'
  | 'aurora'
  | 'image-full'
  | 'image-dimmed'

export const ALL_BACKGROUND_TOKENS: BackgroundToken[] = [
  'solid-primary', 'solid-dark', 'solid-light',
  'gradient-primary', 'gradient-dramatic', 'gradient-subtle',
  'aurora', 'image-full', 'image-dimmed',
]

// ─── Composition Tokens ──────────────────────────────
export type CompositionToken =
  // Hero / Cover
  | 'hero-center'
  | 'hero-bottom'
  | 'hero-left'
  // Split layouts
  | 'split-image-left'
  | 'split-image-right'
  | 'split-diagonal'
  // Data / Stats
  | 'big-number-center'
  | 'big-number-side'
  | 'data-grid-2'
  | 'data-grid-3'
  | 'data-grid-4'
  // Editorial / Content
  | 'editorial-stack'
  | 'editorial-sidebar'
  | 'quote-center'
  | 'quote-attributed'
  // Visual-heavy
  | 'full-bleed-image'
  | 'image-showcase'
  | 'image-grid-2'
  | 'image-grid-3'
  // Timeline / Process
  | 'timeline-horizontal'
  | 'timeline-vertical'
  | 'process-3-step'
  // Team / People
  | 'team-grid'
  | 'profile-spotlight'
  // Closing
  | 'closing-cta'
  | 'closing-minimal'

export const ALL_COMPOSITION_TOKENS: CompositionToken[] = [
  'hero-center', 'hero-bottom', 'hero-left',
  'split-image-left', 'split-image-right', 'split-diagonal',
  'big-number-center', 'big-number-side',
  'data-grid-2', 'data-grid-3', 'data-grid-4',
  'editorial-stack', 'editorial-sidebar', 'quote-center', 'quote-attributed',
  'full-bleed-image', 'image-showcase', 'image-grid-2', 'image-grid-3',
  'timeline-horizontal', 'timeline-vertical', 'process-3-step',
  'team-grid', 'profile-spotlight',
  'closing-cta', 'closing-minimal',
]

// ─── Element Intent (what GPT outputs per element) ───
export interface ElementIntent {
  type: 'text' | 'image' | 'shape'
  role: 'title' | 'subtitle' | 'body' | 'stat' | 'label' | 'quote' | 'caption' | 'cta' | 'decorative' | 'card-title' | 'card-body'
  content: string | null
  size: SizeToken | null
  weight: WeightToken | null
  position: PositionToken | null
  color: ColorToken | null
  imageUrl: string | null
  imageOpacity: number | null
}

// ─── Slide Intent (what GPT outputs per slide) ───────
export interface SlideIntent {
  composition: CompositionToken
  background: BackgroundToken
  mood: MoodToken
  elements: ElementIntent[]
}

// ─── All token values as arrays (for JSON schema enums) ─
export const ALL_SIZE_TOKENS: SizeToken[] = ['hero', 'headline', 'title', 'subtitle', 'body', 'caption', 'micro']
export const ALL_WEIGHT_TOKENS: WeightToken[] = ['dominant', 'prominent', 'supporting', 'subtle']
export const ALL_MOOD_TOKENS: MoodToken[] = ['dramatic', 'professional', 'warm', 'minimal', 'energetic', 'elegant']
export const ALL_COLOR_TOKENS: ColorToken[] = ['primary', 'secondary', 'accent', 'on-dark', 'on-light', 'muted']
export const ALL_POSITION_TOKENS: PositionToken[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
  'upper-third', 'lower-third',
  'left-half', 'right-half', 'full-bleed',
]
export const ALL_ELEMENT_TYPES = ['text', 'image', 'shape'] as const
export const ALL_ELEMENT_ROLES = [
  'title', 'subtitle', 'body', 'stat', 'label', 'quote',
  'caption', 'cta', 'decorative', 'card-title', 'card-body',
] as const
