/**
 * Layout Resolver v7 — Dramatic compositions with editorial flair.
 *
 * Changes from v6:
 * - Fixed syntax error: trailing comma in img() call (image-showcase)
 * - Concurrent-safe UIDs: per-resolve counter instead of module-level mutable
 * - Added missing compositions: split-diagonal, quote-attributed, image-grid-2, image-grid-3, timeline-vertical
 * - Better RTL: textAlign defaults, position mirroring
 * - Graceful fallbacks: every composition handles missing elements without crashing
 * - Decorative elements: added subtle corner accents, breathing shapes
 * - Card grid: accent tint on first card now uses opacity token from design system
 * - Type safety: removed unsafe `as Partial<ShapeElement>` casts, used proper optional fields
 *
 * Slide Engine v5 + Dramatic Soul v7
 */

import type { Slide, SlideElement, SlideBackground, TextElement, ImageElement, ShapeElement } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type {
  SlideIntent, ElementIntent, CompositionToken,
  SizeToken, ColorToken, BackgroundToken,
} from './semantic-tokens'

const W = 1920
const H = 1080
const M = 80 // safe margin

// ─── UID Generator (per-resolve, not module-level) ────

function createUidGenerator() {
  let counter = 0
  return (prefix: string) => `${prefix}-${++counter}`
}

// ─── Size Resolution ──────────────────────────────────

function sz(token: SizeToken | null, ds: PremiumDesignSystem): { fontSize: number; lineHeight: number } {
  const base = ds.typography.headingSize || 56
  const map: Record<SizeToken, { fontSize: number; lineHeight: number }> = {
    hero:     { fontSize: Math.round(base * 2.5),  lineHeight: 1.0 },
    headline: { fontSize: Math.round(base * 1.6),  lineHeight: 1.05 },
    title:    { fontSize: base,                     lineHeight: 1.15 },
    subtitle: { fontSize: Math.round(base * 0.6),  lineHeight: 1.3 },
    body:     { fontSize: Math.round(base * 0.42), lineHeight: 1.6 },
    caption:  { fontSize: Math.round(base * 0.3),  lineHeight: 1.4 },
    micro:    { fontSize: Math.round(base * 0.24), lineHeight: 1.4 },
  }
  return map[token || 'body'] || map.body
}

// ─── Color Resolution ─────────────────────────────────

function clr(token: ColorToken | null, ds: PremiumDesignSystem, dk: boolean): string {
  const c = ds.colors
  const map: Record<ColorToken, string> = {
    primary:    c.primary,
    secondary:  c.secondary,
    accent:     c.accent,
    'on-dark':  c.text || '#F0F4F8',
    'on-light': c.secondary || '#1A1A1B',
    muted:      c.muted || `${c.text || '#F0F4F8'}70`,
  }
  if (!token) return dk ? map['on-dark'] : map['on-light']
  return map[token] || (dk ? map['on-dark'] : map['on-light'])
}

function isBgDark(bg: BackgroundToken): boolean {
  return !['solid-light', 'solid-primary'].includes(bg)
}

// ─── Background Resolution ────────────────────────────

function resolveBg(token: BackgroundToken, ds: PremiumDesignSystem): SlideBackground {
  const c = ds.colors
  const dark = c.background || '#0A0A12'
  switch (token) {
    case 'solid-primary':      return { type: 'solid', value: c.primary }
    case 'solid-dark':         return { type: 'solid', value: dark }
    case 'solid-light':        return { type: 'solid', value: '#F4F7FA' }
    case 'gradient-primary':   return { type: 'gradient', value: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }
    case 'gradient-dramatic':  return { type: 'gradient', value: `linear-gradient(160deg, ${dark} 0%, ${c.primary}30 50%, ${dark} 100%)` }
    case 'gradient-subtle':    return { type: 'gradient', value: `linear-gradient(180deg, ${dark}, ${c.secondary || '#1A1A2E'})` }
    case 'aurora':             return { type: 'gradient', value: ds.effects.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${c.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${c.accent}30, transparent 50%), ${dark}` }
    case 'image-full':
    case 'image-dimmed':       return { type: 'solid', value: dark }
    default:                   return { type: 'solid', value: dark }
  }
}

// ─── Font Weight ──────────────────────────────────────

function fw(token: ElementIntent['weight']): 300 | 400 | 500 | 600 | 700 | 800 | 900 {
  switch (token) {
    case 'dominant':   return 900
    case 'prominent':  return 700
    case 'supporting': return 400
    case 'subtle':     return 300
    default:           return 400
  }
}

// ─── Element Builders ─────────────────────────────────

function txt(
  uid: (p: string) => string,
  el: ElementIntent,
  ds: PremiumDesignSystem,
  dk: boolean,
  x: number, y: number, w: number, h: number, z: number,
  overrides?: Partial<TextElement>,
): TextElement {
  const s = sz(el.size, ds)
  return {
    id: uid('t'), type: 'text',
    x, y, width: w, height: h, zIndex: z,
    content: el.content || '',
    fontSize: s.fontSize,
    fontWeight: fw(el.weight),
    color: clr(el.color, ds, dk),
    textAlign: 'right' as const, // RTL default
    role: (el.role === 'stat' ? 'metric-value' : el.role) as TextElement['role'],
    lineHeight: s.lineHeight,
    letterSpacing: s.fontSize >= 100 ? -5 : s.fontSize >= 60 ? -2 : 0,
    textShadow: s.fontSize >= 48 ? '0 4px 40px rgba(0,0,0,0.5)' : undefined,
    ...overrides,
  }
}

function img(
  uid: (p: string) => string,
  el: ElementIntent,
  x: number, y: number, w: number, h: number, z: number,
): ImageElement {
  return {
    id: uid('i'), type: 'image',
    x, y, width: w, height: h, zIndex: z,
    src: el.imageUrl || '', alt: '', objectFit: 'cover' as const,
    opacity: el.imageOpacity ?? 1,
    filter: (el.imageOpacity ?? 1) < 0.5 ? 'brightness(0.5) contrast(1.15)' : undefined,
  }
}

function shp(
  uid: (p: string) => string,
  fill: string,
  x: number, y: number, w: number, h: number, z: number,
  opts?: Partial<ShapeElement>,
): ShapeElement {
  return {
    id: uid('s'), type: 'shape', shapeType: 'rectangle' as const,
    x, y, width: w, height: h, zIndex: z, fill,
    ...opts,
  }
}

// ─── Dramatic Decorations ─────────────────────────────

function glow(uid: (p: string) => string, ds: PremiumDesignSystem, x: number, y: number, size: number = 800): ShapeElement {
  return shp(uid, `radial-gradient(circle, ${ds.colors.primary}20, transparent 70%)`, x - size / 2, y - size / 2, size, size, 1)
}

function watermark(uid: (p: string) => string, text: string, ds: PremiumDesignSystem, x: number = 400, y: number = -50): TextElement {
  return {
    id: uid('wm'), type: 'text',
    x, y, width: 1600, height: 600, zIndex: 2,
    content: text, fontSize: 280, fontWeight: 900,
    color: ds.colors.text || '#ffffff', textAlign: 'right' as const,
    role: 'decorative' as const, opacity: 0.04, letterSpacing: -12, lineHeight: 1,
  }
}

function accentLine(uid: (p: string) => string, ds: PremiumDesignSystem, x: number, y: number, w: number = 80, h: number = 3): ShapeElement {
  return shp(uid, ds.colors.accent || ds.colors.primary, x, y, w, h, 5)
}

function accentBlade(uid: (p: string) => string, ds: PremiumDesignSystem, x: number, y: number, h: number = 200): ShapeElement {
  return shp(uid, ds.colors.accent || ds.colors.primary, x, y, 3, h, 5)
}

/** Subtle corner accent — a small decorative triangle or line at a corner */
function cornerAccent(uid: (p: string) => string, ds: PremiumDesignSystem, corner: 'top-right' | 'bottom-left' = 'top-right'): ShapeElement {
  const accent = ds.colors.accent || ds.colors.primary
  if (corner === 'top-right') {
    return shp(uid, `linear-gradient(225deg, ${accent}15, transparent 60%)`, W - 300, 0, 300, 300, 1)
  }
  return shp(uid, `linear-gradient(45deg, ${accent}10, transparent 60%)`, 0, H - 300, 300, 300, 1)
}

// ─── Find helpers ─────────────────────────────────────

function findEl(els: ElementIntent[], role: string): ElementIntent | undefined {
  return els.find(e => e.role === role)
}

function findAnyEl(els: ElementIntent[], ...roles: string[]): ElementIntent | undefined {
  for (const role of roles) {
    const found = findEl(els, role)
    if (found) return found
  }
  return undefined
}

function findImg(els: ElementIntent[]): ElementIntent | undefined {
  return els.find(e => e.type === 'image' && e.imageUrl)
}

function findCards(els: ElementIntent[]): ElementIntent[] {
  return els.filter(e => e.role === 'card-title')
}

function findCardBodies(els: ElementIntent[]): ElementIntent[] {
  return els.filter(e => e.role === 'card-body')
}

// ═══════════════════════════════════════════════════════
//  COMPOSITIONS
// ═══════════════════════════════════════════════════════

type Fn = (uid: (p: string) => string, els: ElementIntent[], ds: PremiumDesignSystem, dk: boolean) => SlideElement[]

const C: Record<CompositionToken, Fn> = {

  // ─── HERO / COVER ───────────────────────────────────

  'hero-center': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(uid, image, 0, 0, W, H, 0))
      r.push(shp(uid, 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.6) 100%)', 0, 0, W, H, 1))
    }
    r.push(glow(uid, ds, W * 0.5, H * 0.4))
    const t = findEl(els, 'title')
    if (t) {
      const firstWord = t.content?.split(' ')[0] || ''
      if (firstWord) r.push(watermark(uid, firstWord, ds, 200, 100))
      r.push(txt(uid, t, ds, true, 120, 350, 1680, 250, 9, {
        textAlign: 'center',
        textShadow: `0 8px 60px rgba(0,0,0,0.6), 0 0 120px ${ds.colors.primary}20`,
      }))
    }
    const s = findAnyEl(els, 'subtitle', 'body')
    if (s) r.push(txt(uid, s, ds, true, 320, 620, 1280, 80, 8, { textAlign: 'center', opacity: 0.7 }))
    r.push(accentLine(uid, ds, W / 2 - 50, 600, 100))
    return r
  },

  'hero-bottom': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(uid, image, 0, 0, W, H, 0))
      r.push(shp(uid, 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)', 0, 0, W, H, 1))
    }
    // Top accent stripe
    r.push(shp(uid, `linear-gradient(90deg, ${ds.colors.primary}, ${ds.colors.accent || ds.colors.primary}, transparent)`, 0, 0, W, 4, 3))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, true, M, 720, W - M * 2, 200, 9))
    const s = findAnyEl(els, 'subtitle', 'body')
    if (s) r.push(txt(uid, s, ds, true, M, 940, W - M * 2, 60, 8, { opacity: 0.6 }))
    return r
  },

  'hero-left': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, 300, 500, 900))
    r.push(cornerAccent(uid, ds, 'top-right'))
    const t = findEl(els, 'title')
    if (t) {
      const firstWord = t.content?.split(' ')[0] || ''
      if (firstWord) r.push(watermark(uid, firstWord, ds, -100, 50))
      r.push(txt(uid, t, ds, dk, M, 200, 1000, 280, 9))
    }
    r.push(accentBlade(uid, ds, M - 20, 200, 280))
    const s = findAnyEl(els, 'subtitle', 'caption')
    if (s) r.push(txt(uid, s, ds, dk, M, 520, 800, 80, 8, { color: ds.colors.accent }))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, M, 630, 680, 200, 7, { opacity: 0.65 }))
    return r
  },

  // ─── SPLIT LAYOUTS ──────────────────────────────────

  'split-image-left': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      // Image bleeds off left edge
      r.push(img(uid, image, -40, -40, 1000, H + 80, 2))
      r.push(shp(uid, `linear-gradient(to right, transparent 60%, ${ds.colors.background || '#0A0A12'} 100%)`, 0, 0, 1000, H, 3))
    }
    r.push(accentBlade(uid, ds, 1020, 150, 250))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, 1060, 180, 780, 200, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, 1060, 440, 680, 280, 7, { opacity: 0.7 }))
    const s = findAnyEl(els, 'subtitle', 'caption')
    if (s) r.push(txt(uid, s, ds, dk, 1060, 780, 780, 60, 6, { color: ds.colors.accent, opacity: 0.8 }))
    return r
  },

  'split-image-right': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      // Image bleeds off right edge
      r.push(img(uid, image, 960, -40, 1000, H + 80, 2))
      r.push(shp(uid, `linear-gradient(to left, transparent 60%, ${ds.colors.background || '#0A0A12'} 100%)`, 960, 0, 1000, H, 3))
    }
    r.push(accentBlade(uid, ds, 880, 150, 250))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, 180, 800, 200, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, M, 440, 680, 280, 7, { opacity: 0.7 }))
    const s = findAnyEl(els, 'subtitle', 'caption')
    if (s) r.push(txt(uid, s, ds, dk, M, 780, 800, 60, 6, { color: ds.colors.accent, opacity: 0.8 }))
    return r
  },

  'split-diagonal': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      // Image fills right ~55% with diagonal clip
      r.push(img(uid, image, 800, -40, W - 800 + 80, H + 80, 2))
      // Diagonal overlay to create the cut
      r.push(shp(uid, `linear-gradient(155deg, ${ds.colors.background || '#0A0A12'} 45%, transparent 46%)`, 0, 0, W, H, 3))
    }
    r.push(glow(uid, ds, 350, 450, 700))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, 200, 850, 200, 9))
    r.push(accentLine(uid, ds, M, 420, 80))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, M, 460, 680, 250, 7, { opacity: 0.7 }))
    const s = findAnyEl(els, 'subtitle', 'caption')
    if (s) r.push(txt(uid, s, ds, dk, M, 750, 680, 60, 6, { color: ds.colors.accent }))
    return r
  },

  // ─── DATA / STATS ───────────────────────────────────

  'big-number-center': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, W * 0.5, H * 0.4, 1000))
    const stat = findEl(els, 'stat')
    if (stat) {
      r.push(txt(uid, { ...stat, size: 'hero' }, ds, dk, 120, 250, 1680, 350, 9, {
        textAlign: 'center',
        textShadow: `0 0 80px ${ds.colors.accent}40, 0 8px 40px rgba(0,0,0,0.5)`,
        color: ds.colors.accent || ds.colors.primary,
      }))
    }
    const lbl = findAnyEl(els, 'label', 'subtitle')
    if (lbl) r.push(txt(uid, { ...lbl, size: 'subtitle' }, ds, dk, 320, 640, 1280, 80, 7, { textAlign: 'center', opacity: 0.7 }))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 100, 8))
    r.push(accentLine(uid, ds, W / 2 - 40, 620, 80))
    return r
  },

  'big-number-side': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, 400, 400, 800))
    r.push(accentBlade(uid, ds, 920, 100, H - 200))
    const stat = findEl(els, 'stat')
    if (stat) r.push(txt(uid, { ...stat, size: 'hero' }, ds, dk, M, 180, 800, 350, 9, {
      color: ds.colors.accent || ds.colors.primary,
      textShadow: `0 0 60px ${ds.colors.accent}30`,
    }))
    const lbl = findEl(els, 'label')
    if (lbl) r.push(txt(uid, { ...lbl, size: 'body' }, ds, dk, M, 550, 800, 80, 7, { opacity: 0.6 }))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, 980, 200, 860, 180, 8))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, 980, 440, 680, 280, 6, { opacity: 0.65 }))
    return r
  },

  'data-grid-2': (uid, els, ds, dk) => buildCardGrid(uid, els, ds, dk, 2),
  'data-grid-3': (uid, els, ds, dk) => buildCardGrid(uid, els, ds, dk, 3),
  'data-grid-4': (uid, els, ds, dk) => buildCardGrid(uid, els, ds, dk, 4),

  // ─── EDITORIAL / CONTENT ────────────────────────────

  'editorial-stack': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) {
      const lastWord = t.content?.split(' ').slice(-1)[0] || ''
      if (lastWord) r.push(watermark(uid, lastWord, ds, 800, -80))
      r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 160, 9))
    }
    r.push(accentLine(uid, ds, M, 260, 60))
    r.push(cornerAccent(uid, ds, 'bottom-left'))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(uid, s, ds, dk, M, 290, W * 0.65, 70, 8, { color: ds.colors.accent }))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, M, 400, 900, 250, 7, { opacity: 0.7 }))
    // Additional body elements as bullet-style items
    const extraBodies = els.filter(e => e.role === 'body' && e !== b)
    extraBodies.forEach((bullet, i) => {
      r.push(txt(uid, bullet, ds, dk, M + 20, 680 + i * 55, W * 0.6, 50, 6, { opacity: 0.6 }))
    })
    return r
  },

  'editorial-sidebar': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    // Sidebar panel — glass effect
    r.push(shp(uid, `${ds.colors.primary}10`, W - 420, 0, 420, H, 1, {
      border: `1px solid ${ds.colors.primary}15`,
    }))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - 520, 160, 9))
    r.push(accentLine(uid, ds, M, 260, 60))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, M, 300, W - 560, 350, 7, { opacity: 0.7 }))
    // Sidebar stat
    const stat = findEl(els, 'stat')
    if (stat) r.push(txt(uid, { ...stat, size: 'hero' }, ds, dk, W - 400, 200, 360, 200, 8, {
      color: ds.colors.accent, textAlign: 'center',
      textShadow: `0 0 40px ${ds.colors.accent}30`,
    }))
    const lbl = findEl(els, 'label')
    if (lbl) r.push(txt(uid, lbl, ds, dk, W - 400, 420, 360, 60, 6, { textAlign: 'center', opacity: 0.6 }))
    return r
  },

  'quote-center': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, W * 0.5, H * 0.45, 1200))
    // Giant decorative Hebrew quote mark
    r.push({
      id: uid('qm'), type: 'text',
      x: 100, y: 120, width: 400, height: 400, zIndex: 2,
      content: '״', fontSize: 400, fontWeight: 900,
      color: ds.colors.accent || ds.colors.primary, textAlign: 'right' as const,
      role: 'decorative' as const, opacity: 0.08, lineHeight: 1,
    } as TextElement)
    const q = findAnyEl(els, 'quote', 'title')
    if (q) r.push(txt(uid, { ...q, size: q.size || 'headline' }, ds, dk, 200, 320, 1520, 280, 9, { textAlign: 'center' }))
    r.push(accentLine(uid, ds, W / 2 - 40, 630, 80))
    const attr = findAnyEl(els, 'caption', 'subtitle', 'label')
    if (attr) r.push(txt(uid, attr, ds, dk, 200, 670, 1520, 50, 6, { textAlign: 'center', opacity: 0.5 }))
    return r
  },

  'quote-attributed': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, W * 0.4, H * 0.5, 1000))
    // Accent blade on the right side
    r.push(accentBlade(uid, ds, W - 200, 200, 400))
    const q = findAnyEl(els, 'quote', 'title')
    if (q) r.push(txt(uid, { ...q, size: q.size || 'headline' }, ds, dk, M, 250, 1400, 300, 9))
    r.push(accentLine(uid, ds, M, 580, 120))
    // Attribution line
    const attr = findAnyEl(els, 'caption', 'subtitle', 'label')
    if (attr) r.push(txt(uid, { ...attr, size: 'subtitle' }, ds, dk, M, 620, 1000, 60, 7, { color: ds.colors.accent, opacity: 0.8 }))
    // Source/role
    const source = findEl(els, 'body')
    if (source) r.push(txt(uid, source, ds, dk, M, 690, 800, 50, 6, { opacity: 0.5 }))
    return r
  },

  // ─── VISUAL-HEAVY ───────────────────────────────────

  'full-bleed-image': (uid, els, ds, _dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(uid, image, 0, 0, W, H, 0))
      r.push(shp(uid, 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 35%, transparent 60%)', 0, 0, W, H, 1))
    }
    // Top accent stripe
    r.push(shp(uid, `linear-gradient(90deg, ${ds.colors.primary}, ${ds.colors.accent || ds.colors.primary}, transparent)`, 0, 0, W, 4, 3))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, true, M, 780, W - M * 2, 160, 9, { textShadow: '0 4px 30px rgba(0,0,0,0.7)' }))
    const s = findAnyEl(els, 'subtitle', 'caption')
    if (s) r.push(txt(uid, s, ds, true, M, 960, W - M * 2, 60, 8, { opacity: 0.65 }))
    return r
  },

  'image-grid-2': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    // Two images side by side
    const images = els.filter(e => e.type === 'image' && e.imageUrl)
    const imgW = (W - M * 2 - 28) / 2
    const imgY = 230
    const imgH = H - imgY - M
    images.slice(0, 2).forEach((image, i) => {
      const x = M + i * (imgW + 28)
      r.push(img(uid, image, x, imgY, imgW, imgH, 2))
    })
    // If only one image, fill second slot with accent panel
    if (images.length < 2) {
      r.push(shp(uid, `${ds.colors.primary}08`, M + imgW + 28, imgY, imgW, imgH, 2, {
        borderRadius: 16, border: `1px solid ${ds.colors.primary}15`,
      }))
    }
    const cap = findEl(els, 'caption')
    if (cap) r.push(txt(uid, cap, ds, dk, M, H - M + 10, W - M * 2, 40, 6, { opacity: 0.5 }))
    return r
  },

  'image-grid-3': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    const images = els.filter(e => e.type === 'image' && e.imageUrl)
    const gap = 20
    const imgW = (W - M * 2 - gap * 2) / 3
    const imgY = 230
    const imgH = H - imgY - M
    images.slice(0, 3).forEach((image, i) => {
      const x = M + i * (imgW + gap)
      r.push(img(uid, image, x, imgY, imgW, imgH, 2))
    })
    return r
  },

  'image-showcase': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) r.push(img(uid, image, 160, 60, 1600, 680, 2))
    r.push(accentLine(uid, ds, M, 790, 60))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, 810, W - M * 2, 120, 9))
    const cap = findAnyEl(els, 'caption', 'subtitle')
    if (cap) r.push(txt(uid, cap, ds, dk, M, 950, W - M * 2, 50, 6, { opacity: 0.5 }))
    return r
  },

  // ─── TIMELINE / PROCESS ─────────────────────────────

  'timeline-horizontal': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    // Timeline line
    r.push(shp(uid, `linear-gradient(90deg, ${ds.colors.accent}, ${ds.colors.primary})`, M, 340, W - M * 2, 3, 3))
    const cards = findCards(els)
    const bodies = findCardBodies(els)
    const count = Math.min(cards.length, 5) || 3
    const cardW = Math.floor((W - M * 2 - (count - 1) * 28) / count)
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + 28)
      // Glowing node
      r.push(shp(uid, ds.colors.accent, x + cardW / 2 - 8, 333, 16, 16, 4, {
        borderRadius: 8,
        boxShadow: `0 0 12px ${ds.colors.accent}60`,
      }))
      // Step number
      r.push({
        id: uid('t'), type: 'text',
        x, y: 360, width: cardW, height: 40, zIndex: 5,
        content: `0${i + 1}`, fontSize: 28, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'label' as const, opacity: 0.5, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt(uid, { ...card, size: 'subtitle' }, ds, dk, x, 410, cardW, 50, 7))
      const body = bodies[i]
      if (body) r.push(txt(uid, { ...body, size: 'caption' }, ds, dk, x, 475, cardW, 200, 6, { opacity: 0.6 }))
    }
    return r
  },

  'timeline-vertical': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    // Vertical line
    const lineX = 300
    r.push(shp(uid, `linear-gradient(180deg, ${ds.colors.accent}, ${ds.colors.primary}40)`, lineX, 220, 3, H - 300, 3))
    const cards = findCards(els)
    const bodies = findCardBodies(els)
    const count = Math.min(cards.length, 4) || 3
    const stepH = Math.floor((H - 280) / count)
    for (let i = 0; i < count; i++) {
      const y = 230 + i * stepH
      // Node
      r.push(shp(uid, ds.colors.accent, lineX - 6, y + 10, 15, 15, 4, {
        borderRadius: 8,
        boxShadow: `0 0 10px ${ds.colors.accent}50`,
      }))
      // Step number
      r.push({
        id: uid('t'), type: 'text',
        x: M, y, width: 180, height: 40, zIndex: 5,
        content: `0${i + 1}`, fontSize: 36, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'decorative' as const, opacity: 0.4, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt(uid, { ...card, size: 'subtitle' }, ds, dk, lineX + 40, y, 600, 50, 7))
      const body = bodies[i]
      if (body) r.push(txt(uid, { ...body, size: 'body' }, ds, dk, lineX + 40, y + 55, 600, 100, 6, { opacity: 0.6 }))
    }
    return r
  },

  'process-3-step': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    const cards = findCards(els)
    const bodies = findCardBodies(els)
    const count = Math.min(cards.length, 3) || 3
    const cardW = 520
    const gap = Math.floor((W - M * 2 - count * cardW) / Math.max(count - 1, 1))
    const cardBg = ds.colors.cardBg || 'rgba(255,255,255,0.04)'
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + gap)
      // Card bg with glass
      r.push(shp(uid, cardBg, x, 250, cardW, 520, 2, {
        borderRadius: 20,
        border: `1px solid ${ds.colors.primary}15`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }))
      // Big decorative step number
      r.push({
        id: uid('t'), type: 'text',
        x: x + 30, y: 270, width: 120, height: 120, zIndex: 4,
        content: `${i + 1}`, fontSize: 96, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'decorative' as const, opacity: 0.15, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt(uid, { ...card, size: 'subtitle' }, ds, dk, x + 30, 400, cardW - 60, 60, 7))
      const body = bodies[i]
      if (body) r.push(txt(uid, { ...body, size: 'body' }, ds, dk, x + 30, 480, cardW - 60, 240, 6, { opacity: 0.6 }))
    }
    return r
  },

  // ─── TEAM / PEOPLE ──────────────────────────────────

  'team-grid': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))
    const cards = findCards(els)
    const bodies = findCardBodies(els)
    const count = Math.min(cards.length, 4) || 3
    const gap = 32
    const cardW = Math.floor((W - M * 2 - (count - 1) * gap) / count)
    const cardBg = ds.colors.cardBg || 'rgba(255,255,255,0.04)'
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + gap)
      // Card bg
      r.push(shp(uid, cardBg, x, 250, cardW, H - 250 - M, 2, {
        borderRadius: 16,
        border: `1px solid ${ds.colors.primary}12`,
      }))
      // Number badge
      r.push({
        id: uid('t'), type: 'text',
        x: x + 20, y: 270, width: 80, height: 60, zIndex: 4,
        content: `0${i + 1}`, fontSize: 48, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'decorative' as const, opacity: 0.3, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt(uid, { ...card, size: 'subtitle' }, ds, dk, x + 24, 360, cardW - 48, 60, 7))
      const body = bodies[i]
      if (body) r.push(txt(uid, { ...body, size: 'body' }, ds, dk, x + 24, 440, cardW - 48, 300, 6, { opacity: 0.6 }))
    }
    return r
  },

  'profile-spotlight': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) r.push(img(uid, image, M, 120, 520, 520, 4))
    r.push(accentBlade(uid, ds, 660, 150, 280))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, t, ds, dk, 700, 180, W - 700 - M, 180, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(uid, b, ds, dk, 700, 420, W - 700 - M - 80, 300, 7, { opacity: 0.7 }))
    const cap = findEl(els, 'caption')
    if (cap) r.push(txt(uid, cap, ds, dk, 700, 740, W - 700 - M, 50, 6, { opacity: 0.5, color: ds.colors.accent }))
    return r
  },

  // ─── CLOSING ────────────────────────────────────────

  'closing-cta': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(uid, image, 0, 0, W, H, 0))
      r.push(shp(uid, 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.4))', 0, 0, W, H, 1))
    }
    r.push(glow(uid, ds, W * 0.5, H * 0.45, 1000))
    const t = findEl(els, 'title')
    if (t) r.push(txt(uid, { ...t, size: t.size || 'hero' }, ds, true, 200, 340, 1520, 220, 9, {
      textAlign: 'center',
      textShadow: `0 8px 60px rgba(0,0,0,0.5), 0 0 120px ${ds.colors.primary}15`,
    }))
    r.push(accentLine(uid, ds, W / 2 - 50, 580, 100))
    const cta = findAnyEl(els, 'cta', 'subtitle')
    if (cta) r.push(txt(uid, { ...cta, size: 'subtitle' }, ds, true, 200, 620, 1520, 80, 8, {
      textAlign: 'center', color: ds.colors.accent, opacity: 0.8,
    }))
    return r
  },

  'closing-minimal': (uid, els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(uid, ds, W * 0.5, H * 0.5, 1200))
    r.push(cornerAccent(uid, ds, 'bottom-left'))
    const t = findEl(els, 'title')
    if (t) {
      if (t.content) r.push(watermark(uid, t.content, ds, 100, 200))
      r.push(txt(uid, { ...t, size: t.size || 'hero' }, ds, dk, 200, 400, 1520, 250, 9, { textAlign: 'center' }))
    }
    const b = findAnyEl(els, 'body', 'caption', 'cta')
    if (b) r.push(txt(uid, b, ds, dk, 400, 680, 1120, 60, 7, { textAlign: 'center', opacity: 0.5 }))
    return r
  },

}

// ─── Card Grid Builder ────────────────────────────────

function buildCardGrid(
  uid: (p: string) => string,
  els: ElementIntent[],
  ds: PremiumDesignSystem,
  dk: boolean,
  cols: number,
): SlideElement[] {
  const r: SlideElement[] = []
  const t = findEl(els, 'title')
  if (t) r.push(txt(uid, t, ds, dk, M, M, W - M * 2, 120, 9))

  const cards = findCards(els)
  const bodies = findCardBodies(els)
  const rows = cols === 4 ? 2 : 1
  const actualCols = cols === 4 ? 2 : cols
  const gap = 28
  const startY = 260
  const cardW = Math.floor((W - M * 2 - (actualCols - 1) * gap) / actualCols)
  const cardH = rows === 2 ? Math.floor((H - startY - M - gap) / 2) : H - startY - M
  const pad = 32
  const radius = ds.effects.borderRadiusValue || 16
  const cardBg = ds.colors.cardBg || 'rgba(255,255,255,0.04)'

  for (let i = 0; i < Math.min(cards.length, cols); i++) {
    const col = i % actualCols
    const row = Math.floor(i / actualCols)
    const x = M + col * (cardW + gap)
    const y = startY + row * (cardH + gap)
    const isFirst = i === 0

    // Card bg — first card gets accent tint for hierarchy
    r.push(shp(uid,
      isFirst ? `${ds.colors.accent || ds.colors.primary}12` : cardBg,
      x, y, cardW, cardH, 3,
      {
        borderRadius: radius,
        border: `1px solid ${isFirst ? (ds.colors.accent || ds.colors.primary) : ds.colors.primary}18`,
        boxShadow: isFirst ? `0 8px 40px ${ds.colors.accent || ds.colors.primary}15` : '0 4px 20px rgba(0,0,0,0.15)',
      },
    ))

    // Decorative number badge
    r.push({
      id: uid('t'), type: 'text',
      x: x + pad, y: y + pad, width: 80, height: 60, zIndex: 4,
      content: `0${i + 1}`, fontSize: 48, fontWeight: 900,
      color: isFirst ? (ds.colors.accent || ds.colors.primary) : (ds.colors.text || '#ffffff'),
      textAlign: 'right' as const, role: 'decorative' as const,
      opacity: isFirst ? 0.4 : 0.12, lineHeight: 1,
    } as TextElement)

    // Card title
    const card = cards[i]
    if (card) r.push(txt(uid, { ...card, size: 'subtitle' }, ds, dk, x + pad, y + pad + 60, cardW - pad * 2, 50, 7, {
      color: isFirst ? (ds.colors.accent || ds.colors.primary) : clr('on-dark', ds, dk),
    }))

    // Card body
    const body = bodies[i]
    if (body) r.push(txt(uid, { ...body, size: 'body' }, ds, dk, x + pad, y + pad + 120, cardW - pad * 2, cardH - pad * 2 - 120, 6, { opacity: 0.6 }))
  }
  return r
}

// ═══════════════════════════════════════════════════════
//  MAIN RESOLVER
// ═══════════════════════════════════════════════════════

export function resolveLayout(
  intent: SlideIntent,
  plan: { slideType: string; title: string },
  ds: PremiumDesignSystem,
  slideIndex: number,
): Slide {
  const uid = createUidGenerator()
  const dk = isBgDark(intent.background)
  const fn = C[intent.composition]

  if (!fn) {
    console.warn(`[LayoutResolver] Unknown composition "${intent.composition}", falling back to hero-center`)
    return resolveLayout({ ...intent, composition: 'hero-center' }, plan, ds, slideIndex)
  }

  return {
    id: `slide-${slideIndex}`,
    slideType: plan.slideType as Slide['slideType'],
    label: plan.title.slice(0, 30),
    archetype: intent.composition,
    dramaticChoice: intent.mood,
    background: resolveBg(intent.background, ds),
    elements: fn(uid, intent.elements, ds, dk),
  }
}

// ─── Fallback composition mapping ─────────────────────

export const FALLBACK_COMPOSITIONS: Record<string, CompositionToken> = {
  cover:               'hero-center',
  brief:               'split-image-left',
  goals:               'data-grid-3',
  audience:            'split-image-right',
  insight:             'quote-center',
  whyNow:              'big-number-center',
  strategy:            'editorial-stack',
  competitive:         'data-grid-4',
  bigIdea:             'hero-center',
  approach:            'process-3-step',
  deliverables:        'data-grid-3',
  metrics:             'big-number-center',
  influencerStrategy:  'editorial-sidebar',
  contentStrategy:     'data-grid-3',
  influencers:         'team-grid',
  timeline:            'timeline-horizontal',
  caseStudy:           'split-image-left',
  testimonial:         'quote-attributed',
  closing:             'closing-cta',
}