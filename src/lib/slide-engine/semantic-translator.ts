/**
 * Semantic Translator — converts GPT-5.4's creative intent to pixel-positioned SlideElements.
 *
 * GPT-5.4 says: { kind: 'title', size: 'giant', position: 'center', effect: 'hollow-stroke' }
 * Translator outputs: { type: 'text', x: 80, y: 380, width: 1760, fontSize: 196, textStroke: {...} }
 */

import type { SlideElement, SlideBackground, Slide, TextElement, ShapeElement, ImageElement } from '@/types/presentation'
import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type {
  SemanticSlide, SemanticElement, SemanticBackground,
  Position, Align, TitleEffect, CardLayout, CardStyle, ImagePlacement,
} from './semantic-types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './types'

const W = CANVAS_WIDTH
const H = CANVAS_HEIGHT
const MARGIN = 80
const USABLE_W = W - MARGIN * 2
const USABLE_H = H - MARGIN * 2

let _id = 0
function id(prefix: string) { return `${prefix}-${++_id}` }

// ─── Main Translator ────────────────────────────────────

export function translateSlide(
  semantic: SemanticSlide,
  plan: SlidePlan,
  ds: PremiumDesignSystem,
  images: Record<string, string>,
  slideIndex: number,
): Slide {
  _id = 0
  const elements: SlideElement[] = []
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined

  // Translate background
  const background = translateBackground(semantic.background, ds)

  // Y tracker — prevents overlaps for sequential elements
  let nextY = MARGIN
  let titleBottomY = 0

  // Translate each element — cap at 15 content elements to prevent overcrowding
  const MAX_CONTENT_ELEMENTS = 15
  let contentCount = 0
  for (const el of semantic.elements) {
    // Overlays (images, watermarks, decorative) don't count toward cap
    if (!isOverlayElement(el)) {
      if (contentCount >= MAX_CONTENT_ELEMENTS) continue
    }
    // Skip elements that would overflow below canvas
    if (nextY > H - MARGIN - 40 && !isOverlayElement(el)) continue

    const result = translateElement(el, ds, plan, imageUrl, nextY, titleBottomY)
    if (result) {
      elements.push(...result.elements)
      if (!isOverlayElement(el)) {
        contentCount += result.elements.length
      }
      if (result.bottomY > nextY && !isOverlayElement(el)) {
        nextY = result.bottomY + 16
      }
      if (el.kind === 'title') {
        titleBottomY = result.bottomY
      }
    }
  }

  return {
    id: `slide-${slideIndex}`,
    slideType: plan.slideType as Slide['slideType'],
    label: plan.title.slice(0, 30),
    archetype: semantic.elements.map(e => e.kind).join('+'),
    dramaticChoice: semantic.dramaticChoice,
    background,
    elements,
  }
}

function isOverlayElement(el: SemanticElement): boolean {
  return el.kind === 'image' && (el.placement === 'full-bleed')
    || el.kind === 'gradient-overlay'
    || el.kind === 'watermark'
    || el.kind === 'decorative-shape'
    || el.kind === 'quote-mark'
}

// ─── Background ─────────────────────────────────────────

function translateBackground(bg: SemanticBackground, ds: PremiumDesignSystem): SlideBackground {
  const c = ds.colors
  switch (bg.style) {
    case 'solid':
      return { type: 'solid', value: c.background }
    case 'gradient':
      return { type: 'gradient', value: `linear-gradient(${bg.angle || 135}deg, ${resolveColor(bg.colors?.[0], ds)}, ${resolveColor(bg.colors?.[1], ds)})` }
    case 'dark-gradient':
      return { type: 'gradient', value: `linear-gradient(${bg.angle || 180}deg, ${c.background}, ${c.secondary})` }
    case 'aurora':
      return { type: 'gradient', value: ds.effects.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${c.auroraA || c.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${c.auroraB || c.accent}30, transparent 50%), ${c.background}` }
    case 'image-overlay':
      return { type: 'solid', value: c.background } // actual image added as element
    default:
      return { type: 'solid', value: c.background }
  }
}

function resolveColor(token: string | undefined, ds: PremiumDesignSystem): string {
  if (!token) return ds.colors.background
  const map: Record<string, string> = {
    primary: ds.colors.primary, secondary: ds.colors.secondary, accent: ds.colors.accent,
    background: ds.colors.background, text: ds.colors.text, cardBg: ds.colors.cardBg,
    muted: ds.colors.muted, highlight: ds.colors.highlight,
    gradientStart: ds.colors.gradientStart, gradientEnd: ds.colors.gradientEnd,
  }
  return map[token] || token // if it's a raw hex, pass through
}

// ─── Element Translator ─────────────────────────────────

interface TranslateResult {
  elements: SlideElement[]
  bottomY: number
}

function translateElement(
  el: SemanticElement,
  ds: PremiumDesignSystem,
  plan: SlidePlan,
  imageUrl: string | undefined,
  currentY: number,
  titleBottomY: number,
): TranslateResult | null {
  switch (el.kind) {
    case 'title': return translateTitle(el, ds, plan.title, currentY)
    case 'subtitle': return translateSubtitle(el, ds, plan.subtitle || plan.tagline || '', currentY, titleBottomY)
    case 'body': return translateBody(el, ds, plan.bodyText || '', currentY, titleBottomY)
    case 'bullets': return translateBullets(el, ds, plan.bulletPoints || el.items, currentY)
    case 'cards': return translateCards(el, ds, plan.cards || [], currentY)
    case 'key-number': return translateKeyNumber(el, ds, plan.keyNumber || el.value, plan.keyNumberLabel || el.label, currentY)
    case 'image': return translateImage(el, ds, imageUrl, currentY)
    case 'accent-line': return translateAccentLine(el, ds, currentY, titleBottomY)
    case 'watermark': return translateWatermark(el, ds)
    case 'decorative-shape': return translateDecorativeShape(el, ds)
    case 'gradient-overlay': return translateGradientOverlay(el, ds)
    case 'quote-mark': return translateQuoteMark(el, ds)
    case 'divider': return translateDivider(el, ds)
    case 'glass-card': return translateGlassCard(el, ds, currentY)
    case 'number-grid': return translateNumberGrid(el, ds, currentY)
    case 'timeline': return translateTimeline(el, ds, plan.cards || [], currentY)
    case 'tag': return translateTag(el, ds)
    default: return null
  }
}

// ─── Individual Translators ─────────────────────────────

function translateTitle(
  el: { size: string; position: Position; align?: Align; effect?: TitleEffect },
  ds: PremiumDesignSystem,
  text: string,
  currentY: number,
): TranslateResult {
  const sizes = { giant: 196, large: 120, medium: 80, small: 56 }
  const fontSize = sizes[el.size as keyof typeof sizes] || 80
  const y = positionToY(el.position, currentY, fontSize + 20)
  const align = el.align || 'right'
  const x = MARGIN
  const w = USABLE_W

  const elements: SlideElement[] = []

  // Title text
  const titleEl: TextElement = {
    id: id('txt'), type: 'text',
    x, y, width: w, height: fontSize + 40,
    content: text,
    fontSize, fontWeight: 800,
    color: ds.colors.text,
    textAlign: align as 'right' | 'center' | 'left',
    role: 'title', zIndex: 9,
    lineHeight: 1.05,
    letterSpacing: fontSize >= 100 ? -4 : fontSize >= 60 ? -2 : 0,
    textShadow: '0 4px 30px rgba(0,0,0,0.5)',
  }

  // Apply effects
  if (el.effect === 'hollow-stroke') {
    titleEl.color = 'transparent'
    titleEl.textStroke = { width: 2, color: `${ds.colors.text}40` }
    titleEl.textShadow = undefined
    titleEl.opacity = 0.8
    titleEl.zIndex = 2
    titleEl.fontSize = Math.round(fontSize * 1.5)
    titleEl.height = titleEl.fontSize + 60
  } else if (el.effect === 'glow') {
    titleEl.textShadow = `0 0 60px ${ds.colors.accent}60, 0 4px 30px rgba(0,0,0,0.5)`
  } else if (el.effect === 'heavy-shadow') {
    titleEl.textShadow = `0 8px 40px rgba(0,0,0,0.7), 0 0 120px ${ds.colors.accent}20`
  }

  elements.push(titleEl)

  return { elements, bottomY: y + titleEl.height }
}

function translateSubtitle(
  el: { position: Position; align?: Align },
  ds: PremiumDesignSystem,
  text: string,
  currentY: number,
  titleBottomY: number,
): TranslateResult {
  if (!text) return { elements: [], bottomY: currentY }
  const fontSize = ds.typography.subheadingSize || 32
  const y = el.position === 'below-title' ? titleBottomY + 12 : positionToY(el.position, currentY, fontSize + 10)

  return {
    elements: [{
      id: id('txt'), type: 'text',
      x: MARGIN, y, width: USABLE_W, height: fontSize + 20,
      content: text,
      fontSize, fontWeight: 400,
      color: ds.colors.muted || `${ds.colors.text}80`,
      textAlign: (el.align || 'right') as 'right' | 'center' | 'left',
      role: 'subtitle', zIndex: 8,
      lineHeight: 1.4,
      textShadow: '0 2px 12px rgba(0,0,0,0.3)',
    } as TextElement],
    bottomY: y + fontSize + 20,
  }
}

function translateBody(
  el: { position: Position; align?: Align; maxLines?: number },
  ds: PremiumDesignSystem,
  text: string,
  currentY: number,
  titleBottomY: number,
): TranslateResult {
  if (!text) return { elements: [], bottomY: currentY }
  const fontSize = ds.typography.bodySize || 22
  const y = el.position === 'below-title' ? titleBottomY + 16
    : el.position === 'below-subtitle' ? currentY
    : positionToY(el.position, currentY, 80)
  const isHalf = el.position === 'right-half' || el.position === 'left-half'
  const x = el.position === 'left-half' ? MARGIN : el.position === 'right-half' ? W / 2 + 20 : MARGIN
  const w = isHalf ? USABLE_W / 2 - 20 : USABLE_W * 0.7
  const h = Math.min((el.maxLines || 4) * fontSize * 1.6, 200)

  return {
    elements: [{
      id: id('txt'), type: 'text',
      x, y, width: w, height: h,
      content: text,
      fontSize, fontWeight: 400,
      color: ds.colors.muted || `${ds.colors.text}80`,
      textAlign: (el.align || 'right') as 'right' | 'center' | 'left',
      role: 'body', zIndex: 6,
      lineHeight: 1.6,
    } as TextElement],
    bottomY: y + h,
  }
}

function translateBullets(
  el: { items: string[]; position: Position; style?: string },
  ds: PremiumDesignSystem,
  items: string[],
  currentY: number,
): TranslateResult {
  const fontSize = ds.typography.bodySize || 22
  const y = positionToY(el.position, currentY, items.length * (fontSize + 12))
  const prefix = el.style === 'numbers' ? (i: number) => `${i + 1}.` : el.style === 'dashes' ? () => '—' : () => '•'

  return {
    elements: items.slice(0, 5).map((item, i) => ({
      id: id('txt'), type: 'text' as const,
      x: MARGIN, y: y + i * (fontSize + 16), width: USABLE_W * 0.7, height: fontSize + 10,
      content: `${prefix(i)} ${item}`,
      fontSize, fontWeight: 400,
      color: ds.colors.text,
      textAlign: 'right' as const,
      role: 'list-item' as const, zIndex: 6,
      lineHeight: 1.4,
    })),
    bottomY: y + items.length * (fontSize + 16),
  }
}

function translateCards(
  el: { items: { title: string; body?: string }[]; layout: CardLayout; style?: CardStyle },
  ds: PremiumDesignSystem,
  cards: { title: string; body: string }[],
  currentY: number,
): TranslateResult {
  const items = cards.length ? cards : el.items
  if (!items?.length) return { elements: [], bottomY: currentY }
  const count = Math.min(items.length, 5)
  const gap = ds.spacing.cardGap || 24
  const pad = ds.spacing.cardPadding || 28
  const radius = ds.effects.borderRadiusValue || 16
  const isAccentFirst = el.style === 'accent-first'
  const isGlass = el.style === 'glass'
  const isOutlined = el.style === 'outlined'

  const elements: SlideElement[] = []
  let cells: { x: number; y: number; w: number; h: number }[]

  const availH = H - currentY - MARGIN - 20
  const layout = el.layout || 'grid-2x2'

  if (layout === 'grid-2x2' && count >= 4) {
    const cw = (USABLE_W - gap) / 2
    const ch = (availH - gap) / 2
    cells = [
      { x: MARGIN, y: currentY, w: cw, h: ch },
      { x: MARGIN + cw + gap, y: currentY, w: cw, h: ch },
      { x: MARGIN, y: currentY + ch + gap, w: cw, h: ch },
      { x: MARGIN + cw + gap, y: currentY + ch + gap, w: cw, h: ch },
    ]
  } else if (layout === 'grid-3' && count >= 3) {
    const cw = (USABLE_W - gap * 2) / 3
    cells = items.slice(0, 3).map((_, i) => ({
      x: MARGIN + i * (cw + gap), y: currentY, w: cw, h: availH,
    }))
  } else if (layout === 'horizontal') {
    const cw = (USABLE_W - (count - 1) * gap) / count
    cells = items.slice(0, count).map((_, i) => ({
      x: MARGIN + i * (cw + gap), y: currentY, w: cw, h: Math.min(availH, 220),
    }))
  } else if (layout === 'stacked') {
    const ch = Math.min(160, (availH - (count - 1) * gap) / count)
    cells = items.slice(0, count).map((_, i) => ({
      x: MARGIN + i * 30, y: currentY + i * (ch - 20), w: USABLE_W - i * 30, h: ch,
    }))
  } else if (layout === 'bento') {
    // First card big, rest small
    const bigH = Math.round(availH * 0.55)
    const smallH = availH - bigH - gap
    const halfW = (USABLE_W - gap) / 2
    cells = [
      { x: MARGIN, y: currentY, w: USABLE_W, h: bigH },
      ...items.slice(1, 3).map((_, i) => ({
        x: MARGIN + i * (halfW + gap), y: currentY + bigH + gap, w: halfW, h: smallH,
      })),
    ]
  } else {
    // grid-2
    const cw = (USABLE_W - gap) / 2
    cells = items.slice(0, count).map((_, i) => ({
      x: MARGIN + (i % 2) * (cw + gap),
      y: currentY + Math.floor(i / 2) * (Math.min(availH / 2, 220) + gap),
      w: cw, h: Math.min(availH / 2, 220),
    }))
  }

  let maxBottomY = currentY
  for (let i = 0; i < Math.min(count, cells.length); i++) {
    const c = cells[i]
    const item = items[i]
    const isFirst = i === 0 && isAccentFirst

    // Card background
    const fill = isGlass ? 'rgba(255,255,255,0.05)'
      : isFirst ? `${ds.colors.accent}18`
      : ds.colors.cardBg
    const border = isOutlined ? `1px solid ${ds.colors.cardBorder}`
      : isFirst ? `1px solid ${ds.colors.accent}40`
      : `1px solid ${ds.colors.cardBorder}`

    elements.push({
      id: id('shp'), type: 'shape',
      x: c.x, y: c.y, width: c.w, height: c.h,
      fill, shapeType: 'rectangle', zIndex: 4,
      borderRadius: radius, border,
      boxShadow: ds.effects.shadowStyle === 'glow' ? `0 0 30px rgba(255,255,255,0.06)` : `0 4px 20px rgba(0,0,0,0.2)`,
      backdropFilter: isGlass ? 'blur(20px)' : undefined,
    } as ShapeElement)

    // Card title
    elements.push({
      id: id('txt'), type: 'text',
      x: c.x + pad, y: c.y + pad, width: c.w - pad * 2, height: 30,
      content: item.title,
      fontSize: 20, fontWeight: 700,
      color: isFirst ? ds.colors.accent : ds.colors.text,
      textAlign: 'right', role: 'label', zIndex: 6,
    } as TextElement)

    // Card body
    if (item.body) {
      elements.push({
        id: id('txt'), type: 'text',
        x: c.x + pad, y: c.y + pad + 36, width: c.w - pad * 2, height: c.h - pad * 2 - 36,
        content: item.body,
        fontSize: 17, fontWeight: 400,
        color: ds.colors.muted || `${ds.colors.text}80`,
        textAlign: 'right', role: 'body', zIndex: 6,
        lineHeight: 1.5,
      } as TextElement)
    }

    maxBottomY = Math.max(maxBottomY, c.y + c.h)
  }

  return { elements, bottomY: maxBottomY }
}

function translateKeyNumber(
  el: { value: string; label?: string; size: string; position: Position; color?: string },
  ds: PremiumDesignSystem,
  value: string,
  label: string | undefined,
  currentY: number,
): TranslateResult {
  const sizes = { massive: 160, large: 100, medium: 72 }
  const fontSize = sizes[el.size as keyof typeof sizes] || 100
  const y = positionToY(el.position, currentY, fontSize + 40)
  const color = el.color === 'primary' ? ds.colors.primary : el.color === 'text' ? ds.colors.text : ds.colors.accent

  const elements: SlideElement[] = [{
    id: id('txt'), type: 'text',
    x: MARGIN, y, width: USABLE_W, height: fontSize + 20,
    content: value,
    fontSize, fontWeight: 900,
    color,
    textAlign: 'right', role: 'metric-value', zIndex: 9,
    letterSpacing: -4,
    textShadow: `0 4px 30px ${color}40`,
  } as TextElement]

  let bottomY = y + fontSize + 20
  if (label) {
    elements.push({
      id: id('txt'), type: 'text',
      x: MARGIN, y: bottomY + 4, width: USABLE_W, height: 28,
      content: label,
      fontSize: 16, fontWeight: 400,
      color: ds.colors.muted,
      textAlign: 'right', role: 'metric-label', zIndex: 6,
      letterSpacing: 2,
    } as TextElement)
    bottomY += 32
  }

  return { elements, bottomY }
}

function translateImage(
  el: { placement: ImagePlacement; opacity?: number; filter?: string; borderRadius?: string },
  ds: PremiumDesignSystem,
  imageUrl: string | undefined,
  _currentY: number,
): TranslateResult | null {
  if (!imageUrl) return null
  const placements: Record<ImagePlacement, { x: number; y: number; w: number; h: number }> = {
    'full-bleed': { x: 0, y: 0, w: W, h: H },
    'right-half': { x: W / 2 + 20, y: MARGIN, w: W / 2 - MARGIN - 20, h: H - MARGIN * 2 },
    'left-half': { x: MARGIN, y: MARGIN, w: W / 2 - MARGIN - 20, h: H - MARGIN * 2 },
    'top-right': { x: W * 0.55, y: MARGIN, w: W * 0.45 - MARGIN, h: H * 0.6 },
    'bottom-left': { x: MARGIN, y: H * 0.4, w: W * 0.45 - MARGIN, h: H * 0.6 - MARGIN },
    'center-contained': { x: W * 0.2, y: H * 0.15, w: W * 0.6, h: H * 0.7 },
  }
  const p = placements[el.placement] || placements['right-half']
  const br = el.borderRadius === 'large' ? 24 : el.borderRadius === 'small' ? 8 : 0
  const filter = el.filter === 'darken' ? 'brightness(0.5) contrast(1.15)'
    : el.filter === 'blur' ? 'blur(4px) brightness(0.7)'
    : el.filter === 'saturate' ? 'saturate(1.3) brightness(0.8)'
    : undefined

  return {
    elements: [{
      id: id('img'), type: 'image',
      x: p.x, y: p.y, width: p.w, height: p.h,
      src: imageUrl, alt: '', objectFit: 'cover',
      zIndex: el.placement === 'full-bleed' ? 0 : 5,
      opacity: el.opacity ?? 1,
      filter,
      borderRadius: br,
      boxShadow: el.placement !== 'full-bleed' ? '0 8px 40px rgba(0,0,0,0.3)' : undefined,
    } as ImageElement],
    bottomY: p.y + p.h,
  }
}

function translateAccentLine(
  el: { position: string; color?: string },
  ds: PremiumDesignSystem,
  currentY: number,
  titleBottomY: number,
): TranslateResult {
  const color = el.color === 'primary' ? ds.colors.primary : ds.colors.accent
  let x = MARGIN, y = currentY, w = 60, h = 4

  if (el.position === 'below-title') { y = titleBottomY + 12 }
  else if (el.position === 'below-subtitle') { y = currentY }
  else if (el.position === 'left-edge' || el.position === 'right-edge') {
    const isRight = el.position === 'right-edge' || ds.direction === 'rtl'
    x = isRight ? W - 6 : 0; y = 0; w = 6; h = 200
  }
  else if (el.position === 'top') { x = MARGIN; y = 0; w = 120; h = 6 }

  return {
    elements: [{
      id: id('shp'), type: 'shape',
      x, y, width: w, height: h,
      fill: color, shapeType: 'decorative', zIndex: 2,
      borderRadius: 2,
    } as ShapeElement],
    bottomY: y + h,
  }
}

function translateWatermark(
  el: { text: string; size: string; opacity?: number },
  ds: PremiumDesignSystem,
): TranslateResult {
  const fontSize = el.size === 'massive' ? 300 : 200
  return {
    elements: [{
      id: id('txt'), type: 'text',
      x: -40, y: H / 2 - fontSize / 2, width: W + 80, height: fontSize + 40,
      content: el.text,
      fontSize, fontWeight: 900,
      color: 'transparent',
      textAlign: 'center', role: 'decorative', zIndex: 2,
      letterSpacing: 20,
      opacity: 1,
      textStroke: { width: 1, color: `${ds.colors.text}${Math.round((el.opacity || 0.04) * 255).toString(16).padStart(2, '0')}` },
    } as TextElement],
    bottomY: 0,
  }
}

function translateDecorativeShape(
  el: { shape: string; position: string; color?: string; opacity?: number; size?: string },
  ds: PremiumDesignSystem,
): TranslateResult {
  const sizes = { large: 400, medium: 250, small: 150 }
  const s = sizes[el.size as keyof typeof sizes] || 250
  const color = resolveColor(el.color || 'accent', ds)
  const opacity = el.opacity || 0.08
  const pos: Record<string, { x: number; y: number }> = {
    'top-right': { x: W - s + 50, y: -50 },
    'top-left': { x: -50, y: -50 },
    'bottom-right': { x: W - s + 50, y: H - s + 50 },
    'bottom-left': { x: -50, y: H - s + 50 },
  }
  const p = pos[el.position] || pos['top-right']
  const br = el.shape === 'circle' ? s / 2 : el.shape === 'blob' ? s * 0.35 : ds.effects.borderRadiusValue || 16

  return {
    elements: [{
      id: id('shp'), type: 'shape',
      x: p.x, y: p.y, width: s, height: s,
      fill: `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
      shapeType: 'decorative', zIndex: 2,
      borderRadius: br,
      rotation: el.shape === 'square' ? 45 : undefined,
    } as ShapeElement],
    bottomY: 0,
  }
}

function translateGradientOverlay(
  el: { direction: number; from: string; to: string; opacity?: number },
  ds: PremiumDesignSystem,
): TranslateResult {
  const from = resolveColor(el.from, ds)
  const to = resolveColor(el.to, ds)
  const op = el.opacity ? Math.round(el.opacity * 255).toString(16).padStart(2, '0') : 'cc'
  return {
    elements: [{
      id: id('shp'), type: 'shape',
      x: 0, y: 0, width: W, height: H,
      fill: `linear-gradient(${el.direction}deg, ${from}${op}, ${to}40)`,
      shapeType: 'background', zIndex: 1,
    } as ShapeElement],
    bottomY: 0,
  }
}

function translateQuoteMark(
  el: { position: string; size?: string },
  ds: PremiumDesignSystem,
): TranslateResult {
  const fontSize = el.size === 'large' ? 200 : 120
  const x = el.position === 'top-left' ? MARGIN : W - MARGIN - 100
  return {
    elements: [{
      id: id('txt'), type: 'text',
      x, y: MARGIN, width: 120, height: fontSize * 0.7,
      content: '״',
      fontSize, fontWeight: 900,
      color: `${ds.colors.accent}30`,
      textAlign: 'right', role: 'decorative', zIndex: 2,
      lineHeight: 0.6,
    } as TextElement],
    bottomY: 0,
  }
}

function translateDivider(
  el: { orientation: string; position: string },
  ds: PremiumDesignSystem,
): TranslateResult {
  const isVert = el.orientation === 'vertical'
  let x: number, y: number, w: number, h: number
  if (isVert) {
    x = el.position === 'left-third' ? W / 3 : el.position === 'right-third' ? W * 2 / 3 : W / 2
    y = MARGIN + 40; w = 2; h = USABLE_H - 80
  } else {
    x = MARGIN; y = H / 2; w = USABLE_W; h = 2
  }
  return {
    elements: [{
      id: id('shp'), type: 'shape',
      x, y, width: w, height: h,
      fill: `${ds.colors.text}15`,
      shapeType: 'divider', zIndex: 2,
    } as ShapeElement],
    bottomY: 0,
  }
}

function translateGlassCard(
  el: { position: Position; width: string; content: string },
  ds: PremiumDesignSystem,
  currentY: number,
): TranslateResult {
  const w = el.width === 'full' ? USABLE_W : el.width === 'half' ? USABLE_W / 2 : USABLE_W / 3
  const y = positionToY(el.position, currentY, 160)
  const x = el.position === 'top-right' || el.position === 'bottom-right' ? W - MARGIN - w : MARGIN

  return {
    elements: [
      {
        id: id('shp'), type: 'shape',
        x, y, width: w, height: 160,
        fill: 'rgba(255,255,255,0.05)',
        shapeType: 'rectangle', zIndex: 4,
        borderRadius: ds.effects.borderRadiusValue || 16,
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      } as ShapeElement,
      {
        id: id('txt'), type: 'text',
        x: x + 24, y: y + 24, width: w - 48, height: 112,
        content: el.content,
        fontSize: 20, fontWeight: 400,
        color: ds.colors.text,
        textAlign: 'right', role: 'body', zIndex: 6,
        lineHeight: 1.5,
      } as TextElement,
    ],
    bottomY: y + 160,
  }
}

function translateNumberGrid(
  el: { items: { value: string; label: string }[]; columns: number },
  ds: PremiumDesignSystem,
  currentY: number,
): TranslateResult {
  const cols = el.columns || 3
  const gap = 24
  const cw = (USABLE_W - (cols - 1) * gap) / cols
  const ch = 120
  const elements: SlideElement[] = []

  for (let i = 0; i < Math.min(el.items.length, cols * 2); i++) {
    const item = el.items[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = MARGIN + col * (cw + gap)
    const y = currentY + row * (ch + gap)

    elements.push({
      id: id('txt'), type: 'text',
      x, y, width: cw, height: 60,
      content: item.value,
      fontSize: 48, fontWeight: 900,
      color: i === 0 ? ds.colors.accent : ds.colors.text,
      textAlign: 'center', role: 'metric-value', zIndex: 6,
    } as TextElement)

    elements.push({
      id: id('txt'), type: 'text',
      x, y: y + 64, width: cw, height: 24,
      content: item.label,
      fontSize: 15, fontWeight: 400,
      color: ds.colors.muted,
      textAlign: 'center', role: 'metric-label', zIndex: 6,
    } as TextElement)
  }

  const rows = Math.ceil(el.items.length / cols)
  return { elements, bottomY: currentY + rows * (ch + gap) }
}

function translateTimeline(
  el: { phases: { title: string; body?: string }[]; style?: string },
  ds: PremiumDesignSystem,
  cards: { title: string; body: string }[],
  currentY: number,
): TranslateResult {
  const phases = cards.length ? cards : el.phases
  if (!phases?.length) return { elements: [], bottomY: currentY }
  const count = Math.min(phases.length, 5)
  const gap = 20
  const phaseW = (USABLE_W - (count - 1) * gap) / count
  const lineY = currentY + 20
  const cardY = lineY + 40
  const cardH = H - cardY - MARGIN - 20
  const elements: SlideElement[] = []

  // Horizontal line
  elements.push({
    id: id('shp'), type: 'shape',
    x: MARGIN, y: lineY, width: USABLE_W, height: 3,
    fill: `${ds.colors.accent}40`,
    shapeType: 'line', zIndex: 2, borderRadius: 2,
  } as ShapeElement)

  for (let i = 0; i < count; i++) {
    const phase = phases[i]
    const px = MARGIN + i * (phaseW + gap)
    const pad = 20

    // Node
    elements.push({
      id: id('shp'), type: 'shape',
      x: px + phaseW / 2 - 8, y: lineY - 7, width: 16, height: 16,
      fill: i === 0 ? ds.colors.accent : ds.colors.primary,
      shapeType: 'circle', zIndex: 3, borderRadius: 8,
      border: `3px solid ${ds.colors.background}`,
    } as ShapeElement)

    // Card
    elements.push({
      id: id('shp'), type: 'shape',
      x: px, y: cardY, width: phaseW, height: cardH,
      fill: i === 0 ? `${ds.colors.accent}12` : ds.colors.cardBg,
      shapeType: 'rectangle', zIndex: 4,
      borderRadius: ds.effects.borderRadiusValue || 16,
      border: `1px solid ${i === 0 ? `${ds.colors.accent}30` : ds.colors.cardBorder}`,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    } as ShapeElement)

    // Phase number
    elements.push({
      id: id('txt'), type: 'text',
      x: px + pad, y: cardY + pad, width: 40, height: 36,
      content: `${i + 1}`,
      fontSize: 28, fontWeight: 800,
      color: i === 0 ? ds.colors.accent : `${ds.colors.text}30`,
      textAlign: 'right', role: 'label', zIndex: 6,
    } as TextElement)

    // Title
    elements.push({
      id: id('txt'), type: 'text',
      x: px + pad, y: cardY + pad + 40, width: phaseW - pad * 2, height: 28,
      content: phase.title,
      fontSize: 18, fontWeight: 700,
      color: ds.colors.text,
      textAlign: 'right', role: 'label', zIndex: 6,
    } as TextElement)

    // Body
    if (phase.body && cardH > 120) {
      elements.push({
        id: id('txt'), type: 'text',
        x: px + pad, y: cardY + pad + 74, width: phaseW - pad * 2, height: cardH - pad * 2 - 74,
        content: phase.body,
        fontSize: 15, fontWeight: 400,
        color: ds.colors.muted,
        textAlign: 'right', role: 'body', zIndex: 6,
        lineHeight: 1.4,
      } as TextElement)
    }
  }

  return { elements, bottomY: cardY + cardH }
}

function translateTag(
  el: { text: string; position: string; color?: string },
  ds: PremiumDesignSystem,
): TranslateResult {
  const color = resolveColor(el.color || 'accent', ds)
  const pos: Record<string, { x: number; y: number }> = {
    'top-right': { x: W - MARGIN - 120, y: MARGIN },
    'top-left': { x: MARGIN, y: MARGIN },
    'bottom-right': { x: W - MARGIN - 120, y: H - MARGIN - 36 },
    'bottom-left': { x: MARGIN, y: H - MARGIN - 36 },
  }
  const p = pos[el.position] || pos['top-right']

  return {
    elements: [{
      id: id('txt'), type: 'text',
      x: p.x, y: p.y, width: 120, height: 28,
      content: el.text,
      fontSize: 13, fontWeight: 600,
      color,
      textAlign: 'center', role: 'tag', zIndex: 8,
      letterSpacing: 2,
      backgroundColor: `${color}15`,
      borderRadius: 20,
      padding: 8,
    } as TextElement],
    bottomY: 0,
  }
}

// ─── Position Helper ────────────────────────────────────

function positionToY(pos: Position, currentY: number, blockHeight: number): number {
  switch (pos) {
    case 'top': return MARGIN
    case 'center': return Math.round((H - blockHeight) / 2)
    case 'bottom': return H - MARGIN - blockHeight
    case 'top-right': case 'top-left': return MARGIN
    case 'bottom-right': case 'bottom-left': return H - MARGIN - blockHeight
    case 'right-half': case 'left-half': return MARGIN
    case 'below-title': return currentY
    case 'below-subtitle': return currentY
    case 'above-bottom': return H - MARGIN - blockHeight - 100
    default: return currentY
  }
}
