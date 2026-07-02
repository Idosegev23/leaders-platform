/**
 * DOM measurement — the max-fidelity technique for HTML → editable Canva.
 *
 * Verified research verdict (2026-07-02, all claims 3-0): Canva's element-level
 * positioning API (addElementAtPoint / Design Editing) exists ONLY in the Apps
 * SDK (an app running *inside* the editor) — it can't be driven from a server.
 * The Connect API our pipeline uses has NO element-write endpoint; url-import of
 * a PPTX is the only server-side path. So the drift the user sees is inherent to
 * re-deriving positions semantically. The fix: stop guessing positions — RENDER
 * the exact editor HTML in headless Chrome and MEASURE every element's real box
 * (getBoundingClientRect) + computed style, then emit a native PPTX at those
 * measured coordinates. What Canva imports then matches what the user saw.
 *
 * This module owns the measurement half; structured-pptx.ts consumes MeasuredSlide[].
 */

import { getBrowser } from '@/lib/playwright/pdf'

export interface MeasuredText {
  kind: 'text'
  x: number; y: number; w: number; h: number   // px, relative to the 1920×1080 .slide
  z: number
  text: string
  fontFamily: string
  fontSizePx: number
  fontWeight: number
  italic: boolean
  color: string                                  // rgb(...)
  align: 'left' | 'center' | 'right'
  lineHeightPx: number
  letterSpacingPx: number
  uppercase: boolean
  rtl: boolean
}

export interface MeasuredImage {
  kind: 'image'
  x: number; y: number; w: number; h: number
  z: number
  src: string
  radiusPx: number
  objectFit: 'cover' | 'contain' | 'fill'
}

export interface MeasuredShape {
  kind: 'shape'
  x: number; y: number; w: number; h: number
  z: number
  fill?: string                                  // rgba(...)
  radiusPx: number
  circle: boolean
  borderColor?: string
  borderWidthPx: number
  opacity: number
}

export type MeasuredElement = MeasuredText | MeasuredImage | MeasuredShape

export interface MeasuredSlide {
  bg: string                                     // rgb(...) of .slide
  bgImage?: string                               // full-bleed background image src, if any
  elements: MeasuredElement[]                    // painter order (z ascending)
}

// This runs INSIDE the browser page (serialized). Keep it self-contained — no
// imports, no TS-only syntax that survives to runtime.
const EXTRACT_FN = `() => {
  const slide = document.querySelector('.slide');
  if (!slide) return null;
  const sb = slide.getBoundingClientRect();
  const SW = 1920, SH = 1080;
  const sx = SW / sb.width, sy = SH / sb.height;
  const rel = (r) => ({
    x: (r.left - sb.left) * sx, y: (r.top - sb.top) * sy,
    w: r.width * sx, h: r.height * sy,
  });
  const px = (v) => parseFloat(v) || 0;
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const visible = (cs, r) => cs.display !== 'none' && cs.visibility !== 'hidden' &&
    num(cs.opacity) > 0.02 && r.width > 1 && r.height > 1;
  const directText = (el) => Array.from(el.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();

  const out = [];
  let z = 0;
  const slideCS = getComputedStyle(slide);
  const walk = (el) => {
    for (const child of Array.from(el.children)) {
      const cs = getComputedStyle(child);
      const r = child.getBoundingClientRect();
      z++;
      const box = rel(r);
      const tag = child.tagName.toLowerCase();

      if (!visible(cs, r)) { walk(child); continue; }

      // IMAGE
      if (tag === 'img' && child.getAttribute('src')) {
        out.push({ kind: 'image', ...box, z, src: child.currentSrc || child.src,
          radiusPx: px(cs.borderTopLeftRadius) * sx,
          objectFit: (cs.objectFit === 'contain' || cs.objectFit === 'fill') ? cs.objectFit : 'cover' });
        continue;
      }

      // TEXT — element that directly holds visible text (leaf-ish)
      const dt = directText(child);
      const hasElementChildren = child.children.length > 0;
      if (dt && (!hasElementChildren || child.querySelectorAll('*').length <= 2)) {
        const fullText = (child.innerText || dt).trim();
        if (fullText) {
          out.push({ kind: 'text', ...box, z, text: fullText,
            fontFamily: cs.fontFamily, fontSizePx: px(cs.fontSize) * sx,
            fontWeight: parseInt(cs.fontWeight, 10) || 400,
            italic: cs.fontStyle === 'italic',
            color: cs.color,
            align: (cs.textAlign === 'center' || cs.textAlign === 'left') ? cs.textAlign
              : (cs.textAlign === 'start' ? 'right' : (cs.textAlign === 'end' ? 'left' : 'right')),
            lineHeightPx: (cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight)) * sx,
            letterSpacingPx: (cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing)) * sx,
            uppercase: cs.textTransform === 'uppercase',
            rtl: cs.direction === 'rtl' });
          continue; // text nodes are terminal — don't descend into inline spans
        }
      }

      // SHAPE — element with a visible fill or border and no text of its own
      const bg = cs.backgroundColor;
      const hasFill = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const bw = px(cs.borderTopWidth);
      const hasBorder = bw > 0 && cs.borderTopStyle !== 'none';
      const rad = px(cs.borderTopLeftRadius);
      if ((hasFill || hasBorder) && box.w < SW * 0.98) {
        out.push({ kind: 'shape', ...box, z,
          fill: hasFill ? bg : undefined,
          radiusPx: rad * sx,
          circle: cs.borderRadius === '50%' || rad >= Math.min(r.width, r.height) / 2 - 1,
          borderColor: hasBorder ? cs.borderTopColor : undefined,
          borderWidthPx: bw * sx,
          opacity: num(cs.opacity) });
      }
      walk(child);
    }
  };
  walk(slide);

  // Full-bleed background image (an img.img-bleed covering the slide)
  let bgImage;
  const bleed = out.find(e => e.kind === 'image' && e.x <= 2 && e.y <= 2 && e.w >= SW * 0.97 && e.h >= SH * 0.97);
  if (bleed) bgImage = bleed.src;

  return {
    bg: slideCS.backgroundColor,
    bgImage,
    elements: out,
  };
}`

/**
 * Render each slide's HTML in headless Chrome and measure every element.
 * `htmlSlides` must be the SAME HTML the editor shows (renderStructuredSlide
 * output) so measurements match the user's view 1:1.
 */
export async function measureSlides(htmlSlides: string[]): Promise<MeasuredSlide[]> {
  const browser = await getBrowser()
  const out: MeasuredSlide[] = []
  try {
    for (let i = 0; i < htmlSlides.length; i++) {
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
        await page.emulateMediaType('screen')
        await page.setContent(htmlSlides[i], { waitUntil: 'networkidle0' })
        await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
        // Let webfonts settle so measured boxes reflect final metrics.
        await new Promise(r => setTimeout(r, i === 0 ? 900 : 350))
        // Pass as an IIFE string so puppeteer invokes it in page context.
        const measured = (await page.evaluate(`(${EXTRACT_FN})()`)) as MeasuredSlide | null
        out.push(measured ?? { bg: 'rgb(12,12,16)', elements: [] })
      } catch (e) {
        console.warn(`[measure-slide] slide ${i} failed:`, e instanceof Error ? e.message : e)
        out.push({ bg: 'rgb(12,12,16)', elements: [] })
      } finally {
        await page.close().catch(() => undefined)
      }
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
  return out
}
