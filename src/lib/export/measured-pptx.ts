/**
 * Measured PPTX emitter — turns MeasuredSlide[] (real DOM boxes from
 * measure-slide.ts) into a native, editable PPTX whose elements land at the
 * EXACT positions the user saw in the editor.
 *
 * Why this beats semantic placement (structured-pptx.ts): it doesn't re-derive
 * positions from layout intent — it uses the measured pixel box of every
 * element, so import fidelity is limited only by Canva's PPTX converter, not by
 * our guesses.
 *
 * Canva-specific hardening (from verified research 2026-07-02):
 *  - Font mapping: Canva does NOT substitute fonts — Hebrew on a non-Hebrew font
 *    renders as tofu (☒/▯). We map every family to a name Canva's library has
 *    and that supports Hebrew, so text stays readable AND positions don't reflow.
 *  - Explicit per-run font size, no autofit → Canva won't reflow/resize text.
 *  - One text box per measured element (already 1:1) → minimal converter drift.
 */

import PptxGenJS from 'pptxgenjs'
import type { MeasuredSlide, MeasuredElement } from './measure-slide'

const PX_PER_IN = 144
const SLIDE_W_IN = 13.333
const SLIDE_H_IN = 7.5
const FETCH_TIMEOUT_MS = 10_000
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_DIM = 1920

const inches = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000
const pt = (px: number) => Math.round((px / 2) * 10) / 10

/**
 * Font mapping → Canva-available families that support Hebrew.
 * Heebo, Rubik, Assistant and Frank Ruhl Libre are all in Canva's font library
 * (Google Fonts with Hebrew subsets), so mapping by exact name avoids the tofu
 * substitution. Unknown families collapse to Heebo (always Hebrew-safe).
 */
function mapFont(cssFamily: string): string {
  const first = (cssFamily.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  if (first.includes('frank')) return 'Frank Ruhl Libre'
  if (first.includes('rubik')) return 'Rubik'
  if (first.includes('assistant')) return 'Assistant'
  if (first.includes('anton')) return 'Anton'
  if (first.includes('plex')) return 'IBM Plex Mono'
  // Heebo (and any serif/sans fallback) — Hebrew-safe default.
  return 'Heebo'
}

interface PptxColor { color: string; transparency?: number }

function cssColor(value: string | undefined, fallback = '000000'): PptxColor {
  if (!value) return { color: fallback }
  const v = value.trim()
  const hex = v.match(/^#([0-9a-fA-F]{6})$/)
  if (hex) return { color: hex[1].toUpperCase() }
  const m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0'))
    let alpha = 1
    if (m[4] !== undefined) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    const out: PptxColor = { color: `${r}${g}${b}`.toUpperCase() }
    if (alpha < 1) out.transparency = Math.round((1 - alpha) * 100)
    return out
  }
  return { color: fallback }
}

function isTransparent(value: string | undefined): boolean {
  if (!value) return true
  const c = cssColor(value)
  return c.transparency !== undefined && c.transparency >= 99
}

// ─── Image prefetch + recompress (pptxgenjs needs base64) ─────────────────

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
}

async function fetchImage(url: string, warnings: string[]): Promise<string | null> {
  try {
    if (url.startsWith('data:')) {
      const m = url.match(/^data:([^;,]+);base64,([\s\S]+)$/)
      if (!m || m[1].includes('svg')) return null
      return await recompress(Buffer.from(m[2], 'base64'), m[1], warnings)
    }
    if (!/^https?:\/\//i.test(url)) return null
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    clearTimeout(t)
    if (!res.ok) { warnings.push(`image ${res.status}: ${url.slice(0, 80)}`); return null }
    const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const extMime = EXT_MIME[(url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase()]
    const mime = headerMime.startsWith('image/') ? headerMime : (extMime || 'image/jpeg')
    if (mime.includes('svg')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null
    return await recompress(buf, mime, warnings)
  } catch (e) {
    warnings.push(`image fetch failed: ${e instanceof Error ? e.message : e}`)
    return null
  }
}

async function recompress(buf: Buffer, mime: string, warnings: string[]): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buf, { animated: false, limitInputPixels: 100_000_000 })
    const meta = await img.metadata()
    const transparent = meta.hasAlpha ? !(await img.stats()).isOpaque : false
    const big = (meta.width ?? 0) > MAX_IMAGE_DIM || (meta.height ?? 0) > MAX_IMAGE_DIM
    const pipe = big ? img.resize({ width: MAX_IMAGE_DIM, height: MAX_IMAGE_DIM, fit: 'inside', withoutEnlargement: true }) : img
    if (transparent) return `image/png;base64,${(await pipe.png({ compressionLevel: 9 }).toBuffer()).toString('base64')}`
    return `image/jpeg;base64,${(await pipe.jpeg({ quality: 86, mozjpeg: true }).toBuffer()).toString('base64')}`
  } catch (e) {
    warnings.push(`recompress failed: ${e instanceof Error ? e.message : e}`)
    return `${mime};base64,${buf.toString('base64')}`
  }
}

function collectUrls(slides: MeasuredSlide[]): string[] {
  const s = new Set<string>()
  for (const sl of slides) {
    if (sl.bgImage) s.add(sl.bgImage)
    for (const el of sl.elements) if (el.kind === 'image' && el.src) s.add(el.src)
  }
  return Array.from(s)
}

// ─── Emit ─────────────────────────────────────────────────────────────────

export interface MeasuredPptxResult { buffer: Buffer; warnings: string[] }

export async function measuredSlidesToPptx(slides: MeasuredSlide[]): Promise<MeasuredPptxResult> {
  const warnings: string[] = []
  const urls = collectUrls(slides)
  const images = new Map<string, string | null>()
  const CONC = 6
  let idx = 0
  await Promise.all(Array.from({ length: Math.min(CONC, urls.length) }, async () => {
    while (idx < urls.length) {
      const u = urls[idx++]
      images.set(u, await fetchImage(u, warnings))
    }
  }))

  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'M_16x9', width: SLIDE_W_IN, height: SLIDE_H_IN })
  pptx.layout = 'M_16x9'
  pptx.rtlMode = true

  for (const s of slides) {
    const slide = pptx.addSlide()
    const bgImg = s.bgImage ? images.get(s.bgImage) : null
    if (bgImg) slide.background = { data: bgImg }
    else slide.background = { color: cssColor(s.bg, '0C0C10').color }

    // Painter order: measured z ascending (background-most first).
    const ordered = [...s.elements].sort((a, b) => a.z - b.z)
    for (const el of ordered) {
      try {
        emit(pptx, slide, el, images, s.bgImage)
      } catch (e) {
        warnings.push(`element emit failed (${el.kind}): ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return { buffer, warnings }
}

function emit(
  pptx: PptxGenJS,
  slide: ReturnType<PptxGenJS['addSlide']>,
  el: MeasuredElement,
  images: Map<string, string | null>,
  bgImageSrc?: string,
): void {
  const box = { x: inches(el.x), y: inches(el.y), w: inches(Math.max(1, el.w)), h: inches(Math.max(1, el.h)) }

  if (el.kind === 'image') {
    if (el.src === bgImageSrc) return // already the slide background
    const data = images.get(el.src)
    if (!data) return
    slide.addImage({
      data, ...box,
      sizing: { type: el.objectFit === 'contain' ? 'contain' : 'cover', w: box.w, h: box.h },
      rounding: el.radiusPx >= Math.min(el.w, el.h) / 2 - 1,
    })
    return
  }

  if (el.kind === 'shape') {
    // Skip near-invisible/near-fullbleed scrims — they'd flatten editable text.
    const fill = el.fill && !isTransparent(el.fill) ? cssColor(el.fill) : undefined
    const stroke = el.borderColor && el.borderWidthPx > 0 ? cssColor(el.borderColor) : undefined
    if (!fill && !stroke) return
    const type = el.circle ? pptx.ShapeType.ellipse : (el.radiusPx > 2 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect)
    slide.addShape(type, {
      ...box,
      fill: fill ? { color: fill.color, transparency: fill.transparency } : { type: 'none' },
      line: stroke ? { color: stroke.color, width: pt(el.borderWidthPx) } : { type: 'none' },
      rectRadius: el.radiusPx > 2 && !el.circle ? inches(el.radiusPx) : undefined,
    })
    return
  }

  // text
  const text = el.uppercase ? el.text.toUpperCase() : el.text
  const c = cssColor(el.color, 'FFFFFF')
  // Canva addElementAtPoint caps font size at 100pt; measured pt = px/2 so a
  // 180px display headline = 90pt, safely under the ceiling. Clamp regardless.
  const fontSize = Math.min(100, Math.max(4, pt(el.fontSizePx)))
  slide.addText(text, {
    ...box,
    fontFace: mapFont(el.fontFamily),
    fontSize,
    bold: el.fontWeight >= 600,
    italic: el.italic,
    color: c.color,
    transparency: c.transparency,
    align: el.align,
    valign: 'top',
    rtlMode: el.rtl,
    lang: el.rtl ? 'he-IL' : undefined,
    charSpacing: el.letterSpacingPx ? pt(el.letterSpacingPx) : undefined,
    lineSpacing: el.lineHeightPx ? pt(el.lineHeightPx) : undefined,
    margin: 0,
    // Fixed size — never let Canva autofit/reflow the measured box.
    autoFit: false,
    shrinkText: false,
  })
}
