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
  archetype?: string
  dramaticChoice?: string
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

// ============================================================
// SHARED VISUAL TYPES
// ============================================================

/** Per-corner border radius or uniform value */
export type BorderRadius = number | {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

export type MaskType = 'none' | 'circle' | 'ellipse' | 'diamond' | 'hexagon' | 'star' | 'blob' | 'arch' | 'custom'

export interface MaskConfig {
  type: MaskType
  customClipPath?: string  // for type='custom'
}

/** Predefined clip-path values for each mask type */
export const MASK_CLIP_PATHS: Record<Exclude<MaskType, 'none' | 'custom'>, string> = {
  circle: 'circle(50% at 50% 50%)',
  ellipse: 'ellipse(50% 40% at 50% 50%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  blob: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
  arch: 'polygon(0% 100%, 0% 30%, 5% 15%, 15% 5%, 30% 0%, 70% 0%, 85% 5%, 95% 15%, 100% 30%, 100% 100%)',
}

/** Convert BorderRadius to CSS string */
export function borderRadiusToCss(br: BorderRadius | undefined): string | undefined {
  if (br === undefined || br === null) return undefined
  if (typeof br === 'number') return br ? `${br}px` : undefined
  return `${br.topLeft}px ${br.topRight}px ${br.bottomRight}px ${br.bottomLeft}px`
}

/** Resolve mask config to CSS clip-path */
export function maskToClipPath(mask: MaskConfig | undefined): string | undefined {
  if (!mask || mask.type === 'none') return undefined
  if (mask.type === 'custom') return mask.customClipPath || undefined
  return MASK_CLIP_PATHS[mask.type]
}

// ============================================================
// BASE ELEMENT
// ============================================================

export type EntranceAnimationType = 'none' | 'fade-up' | 'fade-down' | 'slide-right' | 'slide-left' | 'scale' | 'blur-in'

export interface EntranceAnimation {
  type: EntranceAnimationType
  delay?: number    // ms, default 0
  duration?: number // ms, default 400
}

export interface BaseElement {
  id: string
  type: 'text' | 'image' | 'shape' | 'video' | 'mockup' | 'compare' | 'logo-strip' | 'map'
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  rotation?: number    // rotateZ (2D, backward compatible)
  rotateX?: number     // 3D tilt forward/back (-180 to 180)
  rotateY?: number     // 3D spin left/right (-180 to 180)
  perspective?: number // 3D depth of field (400-2000px, default 1200)
  locked?: boolean
  boxShadow?: string
  // Interactivity (Phase 2)
  entranceAnimation?: EntranceAnimation
  hidden?: boolean           // click-to-reveal: hidden in viewer until clicked
  revealTrigger?: 'click'    // how to reveal hidden elements
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
  textShadow?: string // e.g. "0 0 40px rgba(255,107,107,0.25)"
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  alt?: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius?: BorderRadius
  clipPath?: string
  mask?: MaskConfig
  border?: string
  filter?: string // e.g. "brightness(0.85) contrast(1.1)"
}

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'decorative' | 'background' | 'divider'

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shapeType: ShapeType
  fill: string
  borderRadius?: BorderRadius
  clipPath?: string
  mask?: MaskConfig
  border?: string
  mixBlendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion'
  backdropFilter?: string // e.g. "blur(16px) saturate(1.8)" for glassmorphism
}

export type VideoProvider = 'youtube' | 'vimeo' | 'direct' | 'storage'

export interface VideoElement extends BaseElement {
  type: 'video'
  src: string                    // URL or Supabase storage path
  videoProvider?: VideoProvider
  posterImage?: string           // thumbnail shown in editor / before play
  autoPlay?: boolean             // default true in viewer
  muted?: boolean                // default true (browsers block unmuted autoplay)
  loop?: boolean
  objectFit?: 'cover' | 'contain' | 'fill'
  borderRadius?: BorderRadius
  mask?: MaskConfig
}

/** Auto-detect video provider from URL */
export function detectVideoProvider(url: string): VideoProvider {
  if (!url) return 'direct'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('vimeo.com')) return 'vimeo'
  if (url.includes('supabase.co/storage')) return 'storage'
  return 'direct'
}

/** Extract YouTube video ID from URL */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  return match ? match[1] : null
}

/** Extract Vimeo video ID from URL */
export function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? match[1] : null
}

// ============================================================
// DEVICE MOCKUP ELEMENT
// ============================================================

// MagicUI high-fidelity SVG mockups
export type MagicUIDevice = 'iPhone 15 Pro' | 'Safari' | 'Android'
// react-device-frameset CSS mockups
export type FramesetDevice =
  | 'iPhone X' | 'iPhone 8' | 'iPhone 8 Plus' | 'iPhone 5s' | 'iPhone 5c' | 'iPhone 4s'
  | 'iPad Mini' | 'MacBook Pro'
  | 'Galaxy Note 8' | 'Samsung Galaxy S5' | 'Nexus 5'
  | 'HTC One' | 'Lumia 920'

export type MockupDeviceType = MagicUIDevice | FramesetDevice

export type MockupDeviceColor = 'black' | 'silver' | 'gold' | 'white' | 'red' | 'yellow' | 'green' | 'blue'

export const MAGICUI_DEVICES: MagicUIDevice[] = ['iPhone 15 Pro', 'Safari', 'Android']

export interface MockupElement extends BaseElement {
  type: 'mockup'
  deviceType: MockupDeviceType
  deviceColor?: MockupDeviceColor
  landscape?: boolean
  contentType: 'image' | 'video' | 'color'
  contentSrc: string              // image URL, video URL, or color value
  borderRadius?: BorderRadius
}

// ============================================================
// COMPARE (BEFORE/AFTER) ELEMENT
// ============================================================

export interface CompareElement extends BaseElement {
  type: 'compare'
  beforeImage: string
  afterImage: string
  beforeLabel?: string
  afterLabel?: string
  orientation: 'horizontal' | 'vertical'
  initialPosition: number // 0-100, default 50
}

// ============================================================
// LOGO STRIP ELEMENT
// ============================================================

export interface LogoStripElement extends BaseElement {
  type: 'logo-strip'
  logos: string[]          // array of image URLs
  speed: number            // px per second, default 40
  direction: 'rtl' | 'ltr'
  grayscale?: boolean      // logos in grayscale, color on hover
  gap?: number             // gap between logos in px, default 60
}

// ============================================================
// MAP ELEMENT
// ============================================================

export interface MapElement extends BaseElement {
  type: 'map'
  address: string          // address or place name
  lat?: number
  lng?: number
  zoom?: number            // default 15
  mapStyle?: 'roadmap' | 'satellite'
  borderRadius?: BorderRadius
}

export type SlideElement = TextElement | ImageElement | ShapeElement | VideoElement | MockupElement | CompareElement | LogoStripElement | MapElement

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

export function isVideoElement(el: SlideElement): el is VideoElement {
  return el.type === 'video'
}

export function isMockupElement(el: SlideElement): el is MockupElement {
  return el.type === 'mockup'
}

export function isCompareElement(el: SlideElement): el is CompareElement {
  return el.type === 'compare'
}

export function isLogoStripElement(el: SlideElement): el is LogoStripElement {
  return el.type === 'logo-strip'
}

export function isMapElement(el: SlideElement): el is MapElement {
  return el.type === 'map'
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
