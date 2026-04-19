/**
 * Semantic Slide Schema — what GPT-5.4 outputs.
 * No pixels, no x/y — just creative intent.
 * The translator converts these to real SlideElement[].
 */

// ─── Element Kinds (what GPT-5.4 can place) ─────────────

export type SemanticElement =
  | { kind: 'title'; size: 'giant' | 'large' | 'medium' | 'small'; position: Position; align?: Align; effect?: TitleEffect }
  | { kind: 'subtitle'; position: Position; align?: Align }
  | { kind: 'body'; position: Position; align?: Align; maxLines?: number }
  | { kind: 'bullets'; items: string[]; position: Position; style?: 'dots' | 'numbers' | 'dashes' }
  | { kind: 'cards'; items: { title: string; body?: string }[]; layout: CardLayout; style?: CardStyle }
  | { kind: 'key-number'; value: string; label?: string; size: 'massive' | 'large' | 'medium'; position: Position; color?: 'accent' | 'primary' | 'text' }
  | { kind: 'image'; placement: ImagePlacement; opacity?: number; filter?: 'darken' | 'blur' | 'saturate' | 'none'; borderRadius?: 'large' | 'small' | 'none' }
  | { kind: 'accent-line'; position: LinePosition; color?: 'accent' | 'primary' }
  | { kind: 'watermark'; text: string; size: 'massive' | 'large'; opacity?: number }
  | { kind: 'decorative-shape'; shape: 'circle' | 'square' | 'blob'; position: CornerPosition; color?: 'accent' | 'primary' | 'secondary'; opacity?: number; size?: 'large' | 'medium' | 'small' }
  | { kind: 'gradient-overlay'; direction: number; from: string; to: string; opacity?: number }
  | { kind: 'quote-mark'; position: 'top-left' | 'top-right'; size?: 'large' | 'small' }
  | { kind: 'divider'; orientation: 'vertical' | 'horizontal'; position: 'center' | 'left-third' | 'right-third' }
  | { kind: 'glass-card'; position: Position; width: 'full' | 'half' | 'third'; content: string }
  | { kind: 'tag'; text: string; position: CornerPosition; color?: 'accent' | 'primary' }
  | { kind: 'number-grid'; items: { value: string; label: string }[]; columns: 2 | 3 | 4 }
  | { kind: 'timeline'; phases: { title: string; body?: string }[]; style?: 'horizontal' | 'vertical' }
  | { kind: 'icon-row'; icons: string[]; position: Position }

// ─── Shared Enums ───────────────────────────────────────

export type Position =
  | 'top' | 'center' | 'bottom'
  | 'top-right' | 'top-left'
  | 'bottom-right' | 'bottom-left'
  | 'right-half' | 'left-half'
  | 'below-title' | 'below-subtitle' | 'above-bottom'

export type CornerPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
export type Align = 'right' | 'center' | 'left'
export type TitleEffect = 'hollow-stroke' | 'glow' | 'heavy-shadow' | 'none'
export type CardLayout = 'grid-2x2' | 'grid-3' | 'grid-2' | 'horizontal' | 'stacked' | 'bento'
export type CardStyle = 'glass' | 'solid' | 'outlined' | 'accent-first'
export type ImagePlacement = 'full-bleed' | 'right-half' | 'left-half' | 'top-right' | 'bottom-left' | 'center-contained'
export type LinePosition = 'below-title' | 'below-subtitle' | 'left-edge' | 'right-edge' | 'top' | 'bottom'

// ─── Semantic Slide ─────────────────────────────────────

export interface SemanticBackground {
  style: 'gradient' | 'aurora' | 'image-overlay' | 'solid' | 'dark-gradient'
  colors?: string[]       // color token names: 'primary', 'background', 'accent', etc.
  angle?: number          // gradient angle
}

export interface SemanticSlide {
  slideType: string
  background: SemanticBackground
  elements: SemanticElement[]
  dramaticChoice: string
}

export interface SemanticPresentation {
  slides: SemanticSlide[]
}
