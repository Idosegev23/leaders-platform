/**
 * Lite Validation — bounds + contrast + overlap only.
 * Non-destructive. No median-flattening, no variety-killing.
 *
 * Slide Engine v5
 */

import type { Slide, SlideElement, TextElement, ImageElement } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import { hexToRgb, relativeLuminance, contrastRatio, adjustLightness } from '@/lib/gemini/slide-design/utils'

const W = 1920
const H = 1080

function isText(el: SlideElement): el is TextElement { return el.type === 'text' }
function isImage(el: SlideElement): el is ImageElement { return el.type === 'image' }

export function liteValidateSlide(slide: Slide, ds: PremiumDesignSystem): Slide {
  const elements = slide.elements.map(el => ({ ...el }))

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]

    // ── 1. Bounds clamping ──
    if (el.x + el.width > W + 100) el.width = W - el.x
    if (el.y + el.height > H + 100) el.height = H - el.y
    if (isText(el)) {
      el.x = Math.max(0, Math.min(el.x, W - 100))
      el.y = Math.max(0, Math.min(el.y, H - 50))
    }
    if (isImage(el)) {
      el.x = Math.max(-20, el.x)
      el.y = Math.max(-20, el.y)
      if (el.x + el.width > W + 20) el.width = W + 20 - el.x
      if (el.y + el.height > H + 20) el.height = H + 20 - el.y
    }

    // ── 2. Contrast fix (text only) ──
    if (isText(el) && el.color && !el.color.includes('transparent')) {
      const bgColor = ds.colors.background || '#0A0A12'
      const cr = contrastRatio(el.color.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7), bgColor)
      const minCr = (el.fontSize || 20) >= 48 ? 3 : 4.5
      if (cr < minCr) {
        let color = el.color
        let attempts = 0
        while (contrastRatio(color, bgColor) < minCr && attempts < 15) {
          color = adjustLightness(color, 0.06)
          attempts++
        }
        el.color = color
      }
    }

    elements[i] = el
  }

  // ── 3. Overlap detection & nudge (text elements only) ──
  const textEls = elements.filter(isText).filter(e => e.role !== 'decorative')
  for (let a = 0; a < textEls.length; a++) {
    for (let b = a + 1; b < textEls.length; b++) {
      const elA = textEls[a]
      const elB = textEls[b]
      const overlapX = elA.x < elB.x + elB.width && elA.x + elA.width > elB.x
      const overlapY = elA.y < elB.y + elB.height && elA.y + elA.height > elB.y
      if (overlapX && overlapY) {
        // Nudge the less important element down
        const nudge = elB
        nudge.y = elA.y + elA.height + 16
        if (nudge.y + nudge.height > H - 40) {
          nudge.y = elA.y
          nudge.x = elA.x + elA.width + 40
        }
      }
    }
  }

  return { ...slide, elements }
}
