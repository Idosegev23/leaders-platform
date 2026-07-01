/**
 * Native PPTX export — StructuredPresentation → real editable PowerPoint elements.
 *
 * Unlike pptx-generator.ts (screenshot-per-slide), every slot here becomes a
 * native text box / image / shape so Canva's PPTX import yields an editable
 * design. Placement mirrors layout-prototypes/renderer.tsx semantically:
 * rich CSS effects (aurora, glass, gradients, text shadows) are deliberately
 * simplified — that trade-off is accepted; users re-polish in Canva.
 *
 * Geometry: canvas 1920×1080 px → 13.333″×7.5″ (144 px/inch, font pt = px/2).
 */

import PptxGenJS from 'pptxgenjs'
import type {
  StructuredPresentation,
  StructuredSlide,
  DesignSystem,
  FreeElement,
  HeroCoverSlots,
  FullBleedImageTextSlots,
  SplitImageTextSlots,
  CenteredInsightSlots,
  ThreePillarsGridSlots,
  NumberedStatsSlots,
  InfluencerGridSlots,
  ClosingCTASlots,
} from '@/lib/gemini/layout-prototypes/types'

type Slide = ReturnType<PptxGenJS['addSlide']>

const PX_PER_IN = 144
const CANVAS_W = 1920
const CANVAS_H = 1080
const SLIDE_W_IN = 13.333
const SLIDE_H_IN = 7.5

const FETCH_TIMEOUT_MS = 10_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

const inches = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000
const points = (px: number) => Math.round((px / 2) * 10) / 10

interface BoxPx { x: number; y: number; w: number; h: number }

// ─── Color parsing (hex / rgb / rgba → pptxgenjs color+transparency) ──────

interface PptxColor { color: string; transparency?: number }

function cssColor(value: string | undefined, fallback = '000000'): PptxColor {
  if (!value) return { color: fallback }
  const v = value.trim()
  const hexMatch = v.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length === 6) return { color: hex.toUpperCase() }
    if (hex.length === 8) {
      const alpha = parseInt(hex.slice(6, 8), 16) / 255
      return { color: hex.slice(0, 6).toUpperCase(), transparency: Math.round((1 - alpha) * 100) }
    }
    return { color: fallback }
  }
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (rgbMatch) {
    const [r, g, b] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) =>
      Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0'),
    )
    const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
    const out: PptxColor = { color: `${r}${g}${b}`.toUpperCase() }
    if (alpha < 1) out.transparency = Math.round((1 - alpha) * 100)
    return out
  }
  return { color: fallback }
}

/** WCAG-ish relative luminance from a css color (ignores alpha). */
function luminance(cssValue: string | undefined): number {
  const { color } = cssColor(cssValue, '000000')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string | undefined, b: string | undefined): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * The HTML renderer paints `primary` with heavy glow/text-shadow, which keeps
 * even a near-background primary legible. Native PPTX has no glow — when
 * primary can't hold its own against the background, fall back to the first
 * brand color that can (accent → secondary → text).
 */
function pickDisplayPrimary(ds: DesignSystem): string {
  const bg = ds.colors.background
  for (const candidate of [ds.colors.primary, ds.colors.accent, ds.colors.secondary, ds.colors.text]) {
    if (candidate && contrastRatio(candidate, bg) >= 1.8) return candidate
  }
  return ds.colors.text
}

// ─── Inline-CSS parsing (elementStyles / freeElements.style) ──────────────

function parseStyle(css?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!css) return out
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const key = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (key && val) out[key] = val
  }
  return out
}

function pxOf(styles: Record<string, string>, key: string): number | undefined {
  const v = styles[key]
  if (!v) return undefined
  const m = v.match(/^(-?[\d.]+)px$/) || v.match(/^(-?[\d.]+)$/)
  return m ? parseFloat(m[1]) : undefined
}

/** Apply a drag-editor override (canvas-absolute px) onto a default box. */
function applyOverrideBox(box: BoxPx, styles: Record<string, string>): BoxPx {
  const out = { ...box }
  const left = pxOf(styles, 'left')
  const top = pxOf(styles, 'top')
  const width = pxOf(styles, 'width')
  const height = pxOf(styles, 'height')
  const right = pxOf(styles, 'right')
  if (width !== undefined) out.w = width
  if (height !== undefined) out.h = height
  if (left !== undefined) out.x = left
  else if (right !== undefined) out.x = CANVAS_W - right - out.w
  if (top !== undefined) out.y = top
  return out
}

// ─── Rough text-height estimate (Hebrew avg glyph ≈ 0.52em) ───────────────

function estTextHeightPx(text: string, fontPx: number, widthPx: number, lineHeight = 1.2): number {
  const charsPerLine = Math.max(4, Math.floor(widthPx / (fontPx * 0.52)))
  const lines = Math.max(1, Math.ceil((text || ' ').length / charsPerLine))
  return Math.ceil(lines * fontPx * lineHeight)
}

// ─── Image prefetch (pptxgenjs in Node needs base64, not URLs) ────────────

function collectImageUrls(pres: StructuredPresentation): string[] {
  const urls = new Set<string>()
  const add = (u?: string) => {
    if (u && typeof u === 'string' && u.trim()) urls.add(u.trim())
  }
  add(pres.brandLogoUrl)
  for (const s of pres.slides || []) {
    const slots = (s.slots ?? {}) as unknown as Record<string, unknown>
    add(slots.backgroundImage as string)
    add(slots.image as string)
    add(slots.sideImage as string)
    const influencers = slots.influencers as Array<{ profilePicUrl?: string }> | undefined
    for (const inf of influencers || []) add(inf?.profilePicUrl)
    add(s.bg?.image)
    for (const el of s.freeElements || []) {
      if (el.kind === 'image') add(el.src)
    }
  }
  return Array.from(urls)
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
}

const MAX_IMAGE_DIM = 1920
const JPEG_QUALITY = 82

/**
 * Recompress via sharp: cap dimensions at 1920px and re-encode to JPEG (or PNG
 * when alpha is present). Kills two birds — deck source images are often 4K+
 * multi-MB PNGs (a 16-slide deck ballooned past 40MB without this), and
 * formats like webp/gif aren't valid inside PPTX for every importer.
 * Falls back to the original buffer when sharp is unavailable/fails.
 */
async function normalizeImage(
  buf: Buffer,
  mime: string,
  warnings: string[],
): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buf, { animated: false, limitInputPixels: 100_000_000 })
    const meta = await img.metadata()
    // Gemini/scraped PNGs routinely carry a fully-opaque alpha channel — check
    // actual pixel opacity, not just channel presence, before committing to PNG.
    const transparent = meta.hasAlpha ? !(await img.stats()).isOpaque : false
    const needsResize = (meta.width ?? 0) > MAX_IMAGE_DIM || (meta.height ?? 0) > MAX_IMAGE_DIM
    const pipeline = needsResize
      ? img.resize({ width: MAX_IMAGE_DIM, height: MAX_IMAGE_DIM, fit: 'inside', withoutEnlargement: true })
      : img
    if (transparent) {
      return { buf: await pipeline.png({ compressionLevel: 9 }).toBuffer(), mime: 'image/png' }
    }
    return { buf: await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' }
  } catch (e) {
    warnings.push(`image recompress failed (${e instanceof Error ? e.message : e}) — using original`)
    // Only PNG/JPEG/GIF/BMP are safe to embed as-is.
    if (['image/png', 'image/jpeg', 'image/gif', 'image/bmp'].includes(mime)) return { buf, mime }
    return null
  }
}

async function fetchImageData(url: string, warnings: string[]): Promise<string | null> {
  // Data URIs: decode, normalize (they can be just as huge as remote 4K PNGs).
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+);base64,([\s\S]+)$/)
    if (!m || m[1].startsWith('image/svg')) {
      warnings.push('skipped non-base64/svg data-uri image (pptx/Canva compat)')
      return null
    }
    const normalized = await normalizeImage(Buffer.from(m[2], 'base64'), m[1], warnings)
    return normalized ? `${normalized.mime};base64,${normalized.buf.toString('base64')}` : null
  }
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    clearTimeout(timer)
    if (!res.ok) {
      warnings.push(`image fetch ${res.status}: ${url.slice(0, 120)}`)
      return null
    }
    const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const extMime = EXT_MIME[(url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase()]
    const mime = headerMime.startsWith('image/') ? headerMime : (extMime || 'image/jpeg')
    if (mime === 'image/svg+xml') {
      // pptxgenjs-in-Node embeds raw SVG without a raster fallback; strict PPTX
      // importers (Canva included) can choke on it. Skip rather than risk the deck.
      warnings.push(`skipped svg image (pptx/Canva compat): ${url.slice(0, 120)}`)
      return null
    }
    const raw = Buffer.from(await res.arrayBuffer())
    if (raw.length === 0 || raw.length > MAX_IMAGE_BYTES) {
      warnings.push(`image size out of range (${raw.length}b): ${url.slice(0, 120)}`)
      return null
    }
    const normalized = await normalizeImage(raw, mime, warnings)
    if (!normalized) {
      warnings.push(`unsupported image format (${mime}): ${url.slice(0, 120)}`)
      return null
    }
    return `${normalized.mime};base64,${normalized.buf.toString('base64')}`
  } catch (e) {
    warnings.push(`image fetch failed (${e instanceof Error ? e.message : e}): ${url.slice(0, 120)}`)
    return null
  }
}

async function prefetchImages(urls: string[], warnings: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const CONCURRENCY = 6
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
      while (i < urls.length) {
        const url = urls[i++]
        map.set(url, await fetchImageData(url, warnings))
      }
    }),
  )
  return map
}

// ─── Per-slide builder ─────────────────────────────────────────────────────

interface TextOpts {
  fontPx: number
  color?: string
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  font?: 'heading' | 'body'
  charSpacingPx?: number
  lineSpacing?: number
  uppercase?: boolean
  shrink?: boolean
  italic?: boolean
  ltr?: boolean
}

class SlideBuilder {
  constructor(
    private pptx: PptxGenJS,
    readonly slide: Slide,
    readonly ds: DesignSystem,
    private structured: StructuredSlide,
    private images: Map<string, string | null>,
    private warnings: string[],
  ) {}

  get c() { return this.ds.colors }
  private get headingFont() { return this.ds.fonts?.heading || 'Heebo' }
  private get bodyFont() { return this.ds.fonts?.body || 'Heebo' }

  hidden(role: string): boolean {
    return (this.structured.hiddenRoles || []).includes(role)
  }

  private override(role: string): Record<string, string> {
    return parseStyle(this.structured.elementStyles?.[role])
  }

  img(url?: string): string | null {
    if (!url || !url.trim()) return null
    return this.images.get(url.trim()) ?? null
  }

  text(role: string, content: string | undefined, box: BoxPx, opts: TextOpts): void {
    if (!content || !content.trim() || this.hidden(role)) return
    const ov = this.override(role)
    const b = applyOverrideBox(box, ov)
    const fontPx = pxOf(ov, 'font-size') ?? opts.fontPx
    const color = cssColor(ov['color'] || opts.color, this.c.text.replace('#', ''))
    const align = (ov['text-align'] as TextOpts['align']) || opts.align || 'right'
    let str = content.trim()
    if (opts.uppercase) str = str.toUpperCase()
    this.slide.addText(str, {
      x: inches(b.x), y: inches(b.y), w: inches(b.w), h: inches(b.h),
      fontSize: points(fontPx),
      fontFace: opts.font === 'heading' ? this.headingFont : this.bodyFont,
      color: color.color,
      transparency: color.transparency,
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      align,
      valign: opts.valign || 'top',
      rtlMode: !opts.ltr,
      lang: opts.ltr ? undefined : 'he-IL',
      charSpacing: opts.charSpacingPx ? points(opts.charSpacingPx) : undefined,
      lineSpacingMultiple: opts.lineSpacing,
      fit: opts.shrink ? 'shrink' : undefined,
      margin: 0,
    })
  }

  /** Multi-line bullets in one editable text box ("●" tinted primary). */
  bullets(role: string, items: string[], box: BoxPx, fontPx: number): void {
    if (!items.length || this.hidden(role)) return
    const ov = this.override(role)
    const b = applyOverrideBox(box, ov)
    const size = points(pxOf(ov, 'font-size') ?? fontPx)
    const runs = items.flatMap((t) => [
      { text: '●  ', options: { color: cssColor(this.c.primary).color, fontSize: size } },
      { text: t.trim(), options: { breakLine: true, fontSize: size } },
    ])
    this.slide.addText(runs, {
      x: inches(b.x), y: inches(b.y), w: inches(b.w), h: inches(b.h),
      fontFace: this.bodyFont,
      color: cssColor(this.c.text).color,
      align: 'right', valign: 'top', rtlMode: true, lang: 'he-IL',
      lineSpacingMultiple: 1.4, paraSpaceAfter: 6, margin: 0,
    })
  }

  image(role: string, url: string | undefined, box: BoxPx, opts?: {
    fit?: 'cover' | 'contain'; transparencyPct?: number; circle?: boolean
  }): boolean {
    if (this.hidden(role)) return false
    const data = this.img(url)
    if (!data) return false
    const b = applyOverrideBox(box, this.override(role))
    const w = inches(b.w); const h = inches(b.h)
    this.slide.addImage({
      data,
      x: inches(b.x), y: inches(b.y), w, h,
      sizing: { type: opts?.fit ?? 'cover', w, h },
      transparency: opts?.transparencyPct,
      rounding: opts?.circle,
    })
    return true
  }

  shape(role: string, type: 'rect' | 'roundRect' | 'ellipse', box: BoxPx, opts: {
    fill?: string; strokeColor?: string; strokeWidthPx?: number; radiusPx?: number
  }): void {
    if (this.hidden(role)) return
    const b = applyOverrideBox(box, this.override(role))
    const fill = opts.fill ? cssColor(opts.fill) : undefined
    const stroke = opts.strokeColor ? cssColor(opts.strokeColor) : undefined
    this.slide.addShape(this.pptx.ShapeType[type], {
      x: inches(b.x), y: inches(b.y), w: inches(b.w), h: inches(b.h),
      fill: fill ? { color: fill.color, transparency: fill.transparency } : { type: 'none' },
      line: stroke
        ? { color: stroke.color, transparency: stroke.transparency, width: points(opts.strokeWidthPx ?? 2) }
        : { type: 'none' },
      rectRadius: opts.radiusPx ? inches(opts.radiusPx) : undefined,
    })
  }

  /** Full-bleed image + dark legibility overlay (flattens the CSS gradient). */
  fullBleed(role: string, url: string | undefined, opts?: { imageTransparencyPct?: number; overlayTransparencyPct?: number }): boolean {
    const ok = this.image(role, url, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, {
      fit: 'cover', transparencyPct: opts?.imageTransparencyPct,
    })
    if (ok && !this.hidden('decor-img-overlay')) {
      this.shape('decor-img-overlay', 'rect', { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, {
        fill: `rgba(0,0,0,${1 - (opts?.overlayTransparencyPct ?? 55) / 100})`,
      })
    }
    return ok
  }

  stripeTop(): void {
    this.shape('decor-stripe-top', 'rect', { x: 0, y: 0, w: CANVAS_W, h: 4 }, { fill: this.c.primary })
  }

  stripeBottom(): void {
    this.shape('decor-stripe-bottom', 'rect', { x: 0, y: CANVAS_H - 4, w: CANVAS_W, h: 4 }, { fill: this.c.primary })
  }

  corners(): void {
    if (!this.hidden('decor-corner-tl')) {
      this.shape('decor-corner-tl-h', 'rect', { x: 40, y: 40, w: 60, h: 2 }, { fill: this.c.primary })
      this.shape('decor-corner-tl-v', 'rect', { x: 40, y: 40, w: 2, h: 60 }, { fill: this.c.primary })
    }
    if (!this.hidden('decor-corner-br')) {
      this.shape('decor-corner-br-h', 'rect', { x: CANVAS_W - 100, y: CANVAS_H - 42, w: 60, h: 2 }, { fill: this.c.primary })
      this.shape('decor-corner-br-v', 'rect', { x: CANVAS_W - 42, y: CANVAS_H - 100, w: 2, h: 60 }, { fill: this.c.primary })
    }
  }

  eyebrow(label?: string): void {
    this.text('eyebrow', label, { x: 80, y: 60, w: 800, h: 36 }, {
      fontPx: 14, color: this.c.muted, align: 'left', charSpacingPx: 8, uppercase: true, ltr: true,
    })
  }

  accentBar(role: string, box: BoxPx): void {
    this.shape(role, 'rect', box, { fill: this.c.primary })
  }

  warn(msg: string): void {
    this.warnings.push(msg)
  }
}

// ─── Vertical stacker (mimics flex column + justify-content:center) ───────

interface StackItem { hPx: number; gapAfterPx?: number; place: (yPx: number) => void }

function stackCentered(items: StackItem[], centerYPx: number, minYPx = 60): void {
  const present = items.filter(Boolean)
  if (!present.length) return
  const total = present.reduce(
    (acc, it, i) => acc + it.hPx + (i < present.length - 1 ? (it.gapAfterPx ?? 0) : 0), 0)
  let y = Math.max(minYPx, centerYPx - total / 2)
  for (const it of present) {
    it.place(y)
    y += it.hPx + (it.gapAfterPx ?? 0)
  }
}

// ─── Layout builders (positions mirror layout-prototypes/renderer.tsx) ────

function buildHeroCover(b: SlideBuilder, slots: HeroCoverSlots): void {
  b.fullBleed('decor-img-bleed', slots.backgroundImage)
  b.stripeTop()
  b.eyebrow(slots.eyebrowLabel)
  const titlePx = (slots.title || '').length > 25 ? 120 : 180
  const hasSubtitle = !!slots.subtitle?.trim()
  b.text('title', slots.title, { x: 640, y: 340, w: 1200, h: hasSubtitle ? 480 : 560 }, {
    fontPx: titlePx, color: b.c.text, bold: true, font: 'heading',
    align: 'right', valign: 'bottom', lineSpacing: 0.95, shrink: true,
  })
  if (hasSubtitle) {
    b.text('subtitle', slots.subtitle, { x: 940, y: 838, w: 900, h: 84 }, {
      fontPx: 28, color: b.c.muted, align: 'right',
    })
  }
  b.text('slide-num', slots.brandName, { x: 1240, y: 998, w: 600, h: 34 }, {
    fontPx: 14, color: b.c.muted, align: 'right', charSpacingPx: 6, uppercase: true, ltr: true,
  })
}

function buildFullBleedImageText(b: SlideBuilder, slots: FullBleedImageTextSlots): void {
  b.fullBleed('hero', slots.image)
  b.eyebrow(slots.eyebrowLabel)
  const colX = 1060; const colW = 780
  const items: StackItem[] = []
  items.push({ hPx: 80, gapAfterPx: 32, place: (y) => b.accentBar('decor-accent-bar', { x: 1836, y, w: 4, h: 80 }) })
  const titleH = estTextHeightPx(slots.title, 96, colW, 1.05)
  items.push({ hPx: titleH, gapAfterPx: 24, place: (y) => b.text('title', slots.title, { x: colX, y, w: colW, h: titleH + 20 }, {
    fontPx: 96, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.0, shrink: true,
  }) })
  if (slots.subtitle?.trim()) {
    const h = estTextHeightPx(slots.subtitle, 32, colW, 1.3)
    items.push({ hPx: h, gapAfterPx: 24, place: (y) => b.text('subtitle', slots.subtitle, { x: colX, y, w: colW, h: h + 16 }, {
      fontPx: 32, color: b.c.muted, lineSpacing: 1.3,
    }) })
  }
  if (slots.body?.trim()) {
    const h = estTextHeightPx(slots.body, 22, 700, 1.6)
    items.push({ hPx: h, place: (y) => b.text('body', slots.body, { x: colX + colW - 700, y, w: 700, h: h + 16 }, {
      fontPx: 22, color: b.c.text, lineSpacing: 1.5,
    }) })
  }
  stackCentered(items, 540)
}

function buildSplitImageText(b: SlideBuilder, slots: SplitImageTextSlots): void {
  const isLeft = slots.imageSide === 'left'
  b.image('hero', slots.image, { x: isLeft ? 0 : 768, y: 0, w: 1152, h: CANVAS_H }, { fit: 'cover' })
  const colX = isLeft ? 1136 : 80
  const colW = 704
  const items: StackItem[] = []
  if (slots.eyebrowLabel?.trim()) {
    items.push({ hPx: 26, gapAfterPx: 24, place: (y) => b.text('eyebrow', slots.eyebrowLabel, { x: colX, y, w: colW, h: 30 }, {
      fontPx: 13, color: b.c.muted, align: 'left', charSpacingPx: 8, uppercase: true, ltr: true,
    }) })
  }
  items.push({ hPx: 60, gapAfterPx: 28, place: (y) => b.accentBar('decor-accent-bar', { x: colX + colW - 4, y, w: 4, h: 60 }) })
  const titleH = estTextHeightPx(slots.title, 72, colW, 1.05)
  items.push({ hPx: titleH, gapAfterPx: 28, place: (y) => b.text('title', slots.title, { x: colX, y, w: colW, h: titleH + 20 }, {
    fontPx: 72, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.0, shrink: true,
  }) })
  if (slots.bodyText?.trim()) {
    const h = estTextHeightPx(slots.bodyText, 22, colW, 1.7)
    items.push({ hPx: h, gapAfterPx: 20, place: (y) => b.text('body', slots.bodyText, { x: colX, y, w: colW, h: h + 16 }, {
      fontPx: 22, color: b.c.text, lineSpacing: 1.6,
    }) })
  }
  const bullets = (slots.bullets || []).filter((t) => t?.trim())
  if (bullets.length) {
    const h = bullets.reduce((acc, t) => acc + estTextHeightPx(t, 20, colW - 30, 1.5) + 14, 0)
    items.push({ hPx: h, place: (y) => b.bullets('bullets', bullets, { x: colX, y, w: colW, h: h + 20 }, 20) })
  }
  stackCentered(items, 540, 100)
  b.stripeBottom()
}

function buildCenteredInsight(b: SlideBuilder, slots: CenteredInsightSlots): void {
  b.eyebrow(slots.eyebrowLabel)
  const items: StackItem[] = []
  if (slots.dataPoint?.trim()) {
    items.push({ hPx: 200, gapAfterPx: 16, place: (y) => b.text('data-point', slots.dataPoint, { x: 260, y, w: 1400, h: 220 }, {
      fontPx: 180, color: b.c.primary, bold: true, font: 'heading', align: 'center', lineSpacing: 0.95, shrink: true,
    }) })
  }
  if (slots.dataLabel?.trim()) {
    items.push({ hPx: 40, gapAfterPx: 48, place: (y) => b.text('data-label', slots.dataLabel, { x: 260, y, w: 1400, h: 44 }, {
      fontPx: 20, color: b.c.muted, align: 'center', charSpacingPx: 4,
    }) })
  }
  const titleH = estTextHeightPx(slots.title, 64, 1400, 1.3)
  items.push({ hPx: titleH, place: (y) => b.text('title', slots.title, { x: 260, y, w: 1400, h: titleH + 20 }, {
    fontPx: 64, color: b.c.text, bold: true, font: 'heading', align: 'center', lineSpacing: 1.25, shrink: true,
  }) })
  if (slots.source?.trim()) {
    items.push({ hPx: 30, gapAfterPx: 0, place: () => undefined })
    items.push({ hPx: 30, place: (y) => b.text('source', slots.source, { x: 260, y, w: 1400, h: 34 }, {
      fontPx: 14, color: b.c.muted, align: 'center', charSpacingPx: 2,
    }) })
  }
  stackCentered(items, 540)
  b.corners()
}

function buildThreePillarsGrid(b: SlideBuilder, slots: ThreePillarsGridSlots): void {
  const hasImage = !!slots.sideImage?.trim() &&
    b.image('side-image', slots.sideImage, { x: 80, y: 120, w: 576, h: 880 }, { fit: 'cover' })
  b.eyebrow(slots.eyebrowLabel)
  const areaL = hasImage ? 730 : 80
  b.text('title', slots.title, { x: areaL, y: 80, w: CANVAS_W - areaL - 80, h: 150 }, {
    fontPx: hasImage ? 60 : 72, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.0, shrink: true,
  })
  const pillars = (slots.pillars || []).slice(0, 3)
  if (!pillars.length) return
  const gap = hasImage ? 24 : 40
  const areaR = CANVAS_W - 80
  const colW = (areaR - areaL - gap * (pillars.length - 1)) / pillars.length
  const cardY = 300
  const cardH = 560
  const pad = hasImage ? 26 : 40
  pillars.forEach((p, i) => {
    const role = `pillar-${i}`
    if (b.hidden(role)) return
    // RTL: pillar 0 sits rightmost.
    const x = areaR - colW - i * (colW + gap)
    b.shape(role, 'roundRect', { x, y: cardY, w: colW, h: cardH }, {
      fill: b.c.cardBg, strokeColor: b.c.muted, strokeWidthPx: 1, radiusPx: 20,
    })
    b.text(`${role}-number`, p.number, { x: x + pad, y: cardY + pad, w: colW - pad * 2, h: hasImage ? 90 : 120 }, {
      fontPx: hasImage ? 72 : 96, color: i === 1 ? b.c.primary : b.c.muted, bold: true, font: 'heading', ltr: true, align: 'right',
    })
    b.text(`${role}-title`, p.title, { x: x + pad, y: cardY + pad + (hasImage ? 106 : 144), w: colW - pad * 2, h: 90 }, {
      fontPx: hasImage ? 22 : 28, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.15,
    })
    b.text(`${role}-desc`, p.description, { x: x + pad, y: cardY + pad + (hasImage ? 106 : 144) + 100, w: colW - pad * 2, h: cardH - pad * 2 - (hasImage ? 206 : 244) }, {
      fontPx: hasImage ? 14 : 16, color: b.c.muted, lineSpacing: 1.5,
    })
  })
  b.stripeBottom()
}

function buildNumberedStats(b: SlideBuilder, slots: NumberedStatsSlots): void {
  if (slots.backgroundImage?.trim()) {
    b.image('bg-image', slots.backgroundImage, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, {
      fit: 'cover', transparencyPct: 72,
    })
  }
  b.eyebrow(slots.eyebrowLabel)
  b.text('title', slots.title, { x: 80, y: 80, w: 1760, h: 150 }, {
    fontPx: 64, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.0, shrink: true,
  })
  const stats = slots.stats || []
  if (!stats.length) return
  const cols = Math.min(stats.length, 4)
  const gap = 40
  const areaL = 80; const areaR = CANVAS_W - 80
  const colW = (areaR - areaL - gap * (cols - 1)) / cols
  stats.forEach((stat, i) => {
    const role = `stat-${i}`
    if (b.hidden(role)) return
    const col = i % cols
    const row = Math.floor(i / cols)
    // RTL grid: first stat rightmost.
    const x = areaR - colW - col * (colW + gap)
    const y = 430 + row * 280
    b.text(`${role}-value`, stat.value, { x, y, w: colW, h: 140 }, {
      fontPx: 120, color: stat.accent !== false ? b.c.primary : b.c.text,
      bold: true, font: 'heading', align: 'right', ltr: true, shrink: true,
    })
    b.text(`${role}-label`, stat.label, { x, y: y + 150, w: colW, h: 60 }, {
      fontPx: 18, color: b.c.muted, align: 'right', lineSpacing: 1.3,
    })
  })
  b.stripeBottom()
}

function buildInfluencerGrid(b: SlideBuilder, slots: InfluencerGridSlots): void {
  b.eyebrow(slots.eyebrowLabel)
  b.text('title', slots.title, { x: 80, y: 80, w: 1760, h: 110 }, {
    fontPx: 64, color: b.c.text, bold: true, font: 'heading', lineSpacing: 1.0, shrink: true,
  })
  b.text('subtitle', slots.subtitle, { x: 80, y: 196, w: 1760, h: 50 }, {
    fontPx: 20, color: b.c.muted,
  })
  const list = (slots.influencers || []).filter((inf) => inf?.name?.trim())

  if (!list.length) {
    // Placeholder card (mirrors the renderer's "list pending" state).
    if (!b.hidden('placeholder')) {
      b.shape('placeholder', 'roundRect', { x: 320, y: 380, w: 1280, h: 460 }, {
        fill: b.c.cardBg, strokeColor: b.c.muted, strokeWidthPx: 1, radiusPx: 24,
      })
      b.text('placeholder-count', '+12', { x: 320, y: 430, w: 1280, h: 110 }, {
        fontPx: 80, color: b.c.primary, bold: true, font: 'heading', align: 'center', ltr: true,
      })
      b.text('body', 'רשימת המשפיענים בהתאמה אישית למותג', { x: 420, y: 570, w: 1080, h: 50 }, {
        fontPx: 22, color: b.c.text, bold: true, align: 'center',
      })
      b.text('caption', 'ננפיק רשימה מאומתת של 8-12 משפיעניות עם נתוני קהל ישראלי, ER ופרופילים מלאים — לאחר אישור ההצעה ובחירת תקציב המשפיענים.', { x: 420, y: 640, w: 1080, h: 140 }, {
        fontPx: 15, color: b.c.muted, align: 'center', lineSpacing: 1.5,
      })
    }
    b.stripeBottom()
    return
  }

  const cards = list.slice(0, 6)
  const cols = 3
  const gap = 24
  const areaL = 80; const areaR = CANVAS_W - 80
  const areaT = 280; const areaB = CANVAS_H - 80
  const rows = Math.ceil(cards.length / cols)
  const cardW = (areaR - areaL - gap * (cols - 1)) / cols
  const cardH = rows === 1 ? Math.min(480, areaB - areaT) : (areaB - areaT - gap) / 2
  cards.forEach((inf, i) => {
    const role = `influencer-${i}`
    if (b.hidden(role)) return
    const col = i % cols
    const row = Math.floor(i / cols)
    // RTL grid: first card top-right.
    const x = areaR - cardW - col * (cardW + gap)
    const y = areaT + row * (cardH + gap)
    b.shape(role, 'roundRect', { x, y, w: cardW, h: cardH }, {
      fill: b.c.cardBg, strokeColor: b.c.muted, strokeWidthPx: 1, radiusPx: 16,
    })
    const picSize = 96
    const picX = x + (cardW - picSize) / 2
    const havePic = b.image(`${role}-pic`, inf.profilePicUrl, { x: picX, y: y + 28, w: picSize, h: picSize }, {
      fit: 'cover', circle: true,
    })
    if (!havePic) {
      b.shape(`${role}-pic-bg`, 'ellipse', { x: picX, y: y + 28, w: picSize, h: picSize }, { fill: b.c.primary })
      b.text(`${role}-pic-initial`, inf.name.charAt(0), { x: picX, y: y + 40, w: picSize, h: 72 }, {
        fontPx: 40, color: b.c.background, bold: true, align: 'center',
      })
    }
    const nameLine = inf.isVerified ? `${inf.name} ✓` : inf.name
    b.text(`${role}-name`, nameLine, { x: x + 16, y: y + 140, w: cardW - 32, h: 40 }, {
      fontPx: 20, color: b.c.text, bold: true, align: 'center',
    })
    b.text(`${role}-handle`, inf.handle ? `@${inf.handle}` : '', { x: x + 16, y: y + 182, w: cardW - 32, h: 30 }, {
      fontPx: 13, color: b.c.muted, align: 'center', ltr: true,
    })
    const statsLine = [inf.followers ? `${inf.followers} עוקבים` : '', inf.engagement ? `ER ${inf.engagement}` : '']
      .filter(Boolean).join('   •   ')
    b.text(`${role}-stats`, statsLine, { x: x + 16, y: y + 224, w: cardW - 32, h: 40 }, {
      fontPx: 15, color: b.c.primary, bold: true, align: 'center',
    })
  })
}

function buildClosingCTA(b: SlideBuilder, slots: ClosingCTASlots): void {
  b.fullBleed('decor-img-bleed', slots.backgroundImage)
  const items: StackItem[] = []
  const titleH = Math.max(180, estTextHeightPx(slots.title, 160, 1600, 1.0))
  items.push({ hPx: titleH, gapAfterPx: 40, place: (y) => b.text('title', slots.title, { x: 160, y, w: 1600, h: titleH + 30 }, {
    fontPx: 160, color: b.c.text, bold: true, font: 'heading', align: 'center', lineSpacing: 0.95, shrink: true,
  }) })
  items.push({ hPx: 2, gapAfterPx: 40, place: (y) => b.accentBar('decor-divider', { x: 910, y, w: 100, h: 2 }) })
  if (slots.tagline?.trim()) {
    items.push({ hPx: 40, place: (y) => b.text('tagline', slots.tagline, { x: 260, y, w: 1400, h: 44 }, {
      fontPx: 22, color: b.c.muted, align: 'center', charSpacingPx: 6, uppercase: true, ltr: true,
    }) })
  }
  stackCentered(items, 540)
  b.corners()
}

// ─── Logo overlay (non-cover/closing slides) ──────────────────────────────

function buildLogoOverlay(b: SlideBuilder, layout: string, brandLogoUrl?: string): void {
  if (layout === 'hero-cover' || layout === 'closing-cta') return
  if (!b.hidden('leaders-mark')) {
    // The Leaders wordmark asset is SVG (skipped for pptx compat) — a small
    // letter-spaced text mark keeps the "powered by Leaders" branding editable.
    // y=32/h=24 keeps it clear of the eyebrow row at y=60 (renderer geometry).
    b.text('leaders-mark', 'LEADERS', { x: 32, y: 32, w: 160, h: 24 }, {
      fontPx: 10, color: b.c.muted, align: 'left', charSpacingPx: 3, ltr: true, bold: true,
    })
  }
  if (brandLogoUrl && !b.hidden('brand-mark')) {
    b.image('brand-mark', brandLogoUrl, { x: CANVAS_W - 32 - 140, y: 24, w: 140, h: 40 }, { fit: 'contain' })
  }
}

// ─── Free elements (user-added text / images / shapes) ────────────────────

function buildFreeElements(b: SlideBuilder, free?: FreeElement[]): void {
  for (const el of free || []) {
    if (!el?.id || b.hidden(el.id)) continue
    const styles = parseStyle(el.style)
    const box: BoxPx = {
      x: pxOf(styles, 'left') ?? 760,
      y: pxOf(styles, 'top') ?? 440,
      w: pxOf(styles, 'width') ?? 400,
      h: pxOf(styles, 'height') ?? (el.kind === 'text' ? 100 : 200),
    }
    if (el.kind === 'image') {
      if (!b.image(el.id, el.src, box, { fit: 'cover' })) b.warn(`free image skipped: ${el.id}`)
      continue
    }
    if (el.kind === 'video') {
      b.warn(`free video not exportable to pptx, skipped: ${el.id}`)
      continue
    }
    if (el.kind === 'shape') {
      if (el.shape === 'line') {
        b.shape(el.id, 'rect', { ...box, h: pxOf(styles, 'height') ?? 4 }, { fill: el.stroke || el.fill || b.c.primary })
      } else {
        b.shape(el.id, el.shape === 'circle' ? 'ellipse' : 'roundRect', box, {
          fill: el.fill || 'rgba(233,69,96,0.25)',
          strokeColor: el.stroke,
          strokeWidthPx: el.stroke ? 3 : undefined,
          radiusPx: el.shape === 'circle' ? undefined : 8,
        })
      }
      continue
    }
    // text
    const f = el.format || {}
    b.text(el.id, el.text || '', box, {
      fontPx: f.fontSize ?? 32,
      color: f.color || '#ffffff',
      bold: !f.fontWeight || parseInt(f.fontWeight, 10) >= 600,
      italic: f.fontStyle === 'italic',
      align: f.textAlign || 'right',
    })
  }
}

// ─── Slide dispatch ────────────────────────────────────────────────────────

function buildSlide(
  pptx: PptxGenJS,
  s: StructuredSlide,
  ds: DesignSystem,
  images: Map<string, string | null>,
  warnings: string[],
  brandLogoUrl?: string,
): void {
  const slide = pptx.addSlide()
  const b = new SlideBuilder(pptx, slide, ds, s, images, warnings)

  // Background: per-slide override > design system.
  const bgImageData = s.bg?.image ? images.get(s.bg.image.trim()) : null
  if (bgImageData) {
    slide.background = { data: bgImageData }
  } else {
    slide.background = { color: cssColor(s.bg?.color || ds.colors.background, '0F0F1A').color }
  }

  switch (s.layout) {
    case 'hero-cover':
      buildHeroCover(b, s.slots as HeroCoverSlots); break
    case 'full-bleed-image-text':
      buildFullBleedImageText(b, s.slots as FullBleedImageTextSlots); break
    case 'split-image-text':
      buildSplitImageText(b, s.slots as SplitImageTextSlots); break
    case 'centered-insight':
      buildCenteredInsight(b, s.slots as CenteredInsightSlots); break
    case 'three-pillars-grid':
      buildThreePillarsGrid(b, s.slots as ThreePillarsGridSlots); break
    case 'numbered-stats':
      buildNumberedStats(b, s.slots as NumberedStatsSlots); break
    case 'influencer-grid':
      buildInfluencerGrid(b, s.slots as InfluencerGridSlots); break
    case 'closing-cta':
      buildClosingCTA(b, s.slots as ClosingCTASlots); break
    default:
      warnings.push(`unknown layout "${(s as StructuredSlide).layout}" — emitted title-only slide`)
      b.text('title', ((s.slots ?? {}) as { title?: string }).title || s.slideType, { x: 80, y: 440, w: 1760, h: 200 }, {
        fontPx: 72, color: ds.colors.text, bold: true, align: 'center',
      })
  }

  buildLogoOverlay(b, s.layout, brandLogoUrl)
  buildFreeElements(b, s.freeElements)
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface StructuredPptxResult {
  buffer: Buffer
  warnings: string[]
}

export async function structuredPresentationToPptx(
  pres: StructuredPresentation,
): Promise<Buffer> {
  const { buffer } = await structuredPresentationToPptxDetailed(pres)
  return buffer
}

export async function structuredPresentationToPptxDetailed(
  pres: StructuredPresentation,
): Promise<StructuredPptxResult> {
  if (!pres?.slides?.length) throw new Error('structured presentation has no slides')
  const warnings: string[] = []

  // Glow-dependent primaries (e.g. near-black on near-black) get swapped for
  // the first legible brand color — native PPTX has no text-shadow to lean on.
  const displayPrimary = pickDisplayPrimary(pres.designSystem)
  const ds: DesignSystem = displayPrimary === pres.designSystem.colors.primary
    ? pres.designSystem
    : { ...pres.designSystem, colors: { ...pres.designSystem.colors, primary: displayPrimary } }
  if (displayPrimary !== pres.designSystem.colors.primary) {
    warnings.push(`primary ${pres.designSystem.colors.primary} has no contrast vs background — using ${displayPrimary} for accents`)
  }

  const urls = collectImageUrls(pres)
  console.log(`[structured-pptx] ${pres.slides.length} slides, prefetching ${urls.length} images…`)
  const images = await prefetchImages(urls, warnings)

  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'LEADERS_16x9', width: SLIDE_W_IN, height: SLIDE_H_IN })
  pptx.layout = 'LEADERS_16x9'
  pptx.rtlMode = true
  pptx.title = pres.brandName || 'Presentation'
  pptx.author = 'Leaders Platform'

  for (const s of pres.slides) {
    try {
      buildSlide(pptx, s, ds, images, warnings, pres.brandLogoUrl)
    } catch (e) {
      warnings.push(`slide "${s.slideType}" (${s.layout}) failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  if (warnings.length) console.warn('[structured-pptx] warnings:', warnings)
  console.log(`[structured-pptx] done — ${Math.round(buffer.length / 1024)}KB`)
  return { buffer, warnings }
}
