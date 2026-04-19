/**
 * Slide Design utilities — color, spatial, and validation.
 * Merged from color-utils.ts, spatial-utils.ts, and validation.ts (gentle version).
 */

import type {
  Slide,
  TextElement,
  ImageElement,
  SlideElement,
} from '@/types/presentation'
import { isTextElement } from '@/types/presentation'
import type {
  PremiumDesignSystem,
  PacingDirective,
  ValidationResult,
  ValidationIssue,
  BoundingBox,
} from './types'

// ═══════════════════════════════════════════════════════════
//  COLOR UTILITIES
// ═══════════════════════════════════════════════════════════

/** Consolidated hex parser — handles 3-char, 6-char, and 8-char (alpha) hex codes */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let clean = hex.replace('#', '')
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
  if (clean.length === 8) clean = clean.slice(0, 6)
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r, g, b }
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function hexToLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.2
  return relativeLuminance(rgb.r, rgb.g, rgb.b)
}

export function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  if (!c1 || !c2) return 1
  const l1 = relativeLuminance(c1.r, c1.g, c1.b)
  const l2 = relativeLuminance(c2.r, c2.g, c2.b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export function adjustLightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const adjust = (v: number) => Math.min(255, Math.max(0, Math.round(v + amount * 255)))
  const r = adjust(rgb.r).toString(16).padStart(2, '0')
  const g = adjust(rgb.g).toString(16).padStart(2, '0')
  const b = adjust(rgb.b).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export function validateAndFixColors(colors: PremiumDesignSystem['colors']): PremiumDesignSystem['colors'] {
  const fixed = { ...colors }

  let textContrast = contrastRatio(fixed.text, fixed.background)
  let attempts = 0
  while (textContrast < 4.5 && attempts < 20) {
    fixed.text = adjustLightness(fixed.text, textContrast < 2 ? 0.1 : 0.03)
    textContrast = contrastRatio(fixed.text, fixed.background)
    attempts++
  }

  let accentContrast = contrastRatio(fixed.accent, fixed.background)
  attempts = 0
  while (accentContrast < 3 && attempts < 20) {
    fixed.accent = adjustLightness(fixed.accent, 0.05)
    accentContrast = contrastRatio(fixed.accent, fixed.background)
    attempts++
  }

  if (contrastRatio(fixed.cardBg, fixed.background) < 1.1) {
    fixed.cardBg = adjustLightness(fixed.cardBg, 0.06)
  }

  let mutedContrast = contrastRatio(fixed.muted, fixed.background)
  attempts = 0
  while (mutedContrast < 3 && attempts < 20) {
    fixed.muted = adjustLightness(fixed.muted, 0.04)
    mutedContrast = contrastRatio(fixed.muted, fixed.background)
    attempts++
  }

  return fixed
}

// ═══════════════════════════════════════════════════════════
//  SPATIAL UTILITIES
// ═══════════════════════════════════════════════════════════

export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

export function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image'
}

export function computeOccupiedArea(elements: BoundingBox[]): number {
  const canvasArea = 1920 * 1080
  let occupied = 0
  for (const el of elements) occupied += el.width * el.height
  return Math.min(occupied / canvasArea, 1)
}

export function computeBalanceScore(elements: BoundingBox[]): number {
  const cols = 4, rows = 3
  const cellW = 1920 / cols, cellH = 1080 / rows
  const cells = Array.from({ length: cols * rows }, () => 0)

  for (const el of elements) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * cellW, cy = r * cellH
        const overlapX = Math.max(0, Math.min(el.x + el.width, cx + cellW) - Math.max(el.x, cx))
        const overlapY = Math.max(0, Math.min(el.y + el.height, cy + cellH) - Math.max(el.y, cy))
        cells[r * cols + c] += overlapX * overlapY
      }
    }
  }

  const maxCell = Math.max(...cells)
  if (maxCell === 0) return 0.5
  const normalized = cells.map(c => c / maxCell)
  const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length
  const variance = normalized.reduce((a, b) => a + (b - mean) ** 2, 0) / normalized.length
  return Math.max(0, 1 - variance * 2)
}

export function findBestImagePlacement(
  elements: SlideElement[],
  _bgColor: string,
): { x: number; y: number; width: number; height: number; fullBleed: boolean } {
  const contentBoxes = elements
    .filter(e => e.type === 'text' || (e.type === 'shape' && (e as SlideElement & { shapeType?: string }).shapeType !== 'background'))
    .map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height }))

  if (contentBoxes.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
  }

  const contentMinX = Math.min(...contentBoxes.map(b => b.x))
  const contentMaxX = Math.max(...contentBoxes.map(b => b.x + b.width))

  if (contentMinX > 800) {
    return { x: 0, y: 0, width: Math.min(contentMinX - 40, 960), height: 1080, fullBleed: false }
  }
  if (contentMaxX < 1120) {
    return { x: Math.max(contentMaxX + 40, 960), y: 0, width: 1920 - Math.max(contentMaxX + 40, 960), height: 1080, fullBleed: false }
  }

  const contentMaxY = Math.max(...contentBoxes.map(b => b.y + b.height))
  if (contentMaxY < 600) {
    return { x: 80, y: contentMaxY + 40, width: 1760, height: 1080 - contentMaxY - 80, fullBleed: false }
  }

  return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
}

// ═══════════════════════════════════════════════════════════
//  VALIDATION (gentle — from 21f9163 baseline)
// ═══════════════════════════════════════════════════════════

export function validateSlide(
  slide: Slide,
  designSystem: PremiumDesignSystem,
  pacing: PacingDirective,
  expectedImageUrl?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  const elements: SlideElement[] = slide.elements || []
  const textElements = elements.filter(isTextElement)
  const imageElements = elements.filter(isImageElement)
  const contentTexts = textElements.filter(el => el.role !== 'decorative')
  const allBoxes: BoundingBox[] = elements.map(e => ({ x: e.x || 0, y: e.y || 0, width: e.width || 0, height: e.height || 0 }))

  // Contrast check
  for (const el of contentTexts) {
    const color = el.color
    if (color && !color.includes('transparent')) {
      const bgColor = designSystem.colors.background
      const cr = contrastRatio(color.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7), bgColor)
      const fontSize = el.fontSize || 20
      const minContrast = fontSize >= 48 ? 3 : 4.5
      if (cr < minContrast) {
        issues.push({ severity: 'critical', category: 'contrast', message: `contrast ${cr.toFixed(1)}:1 (min ${minContrast}:1)`, elementId: el.id, autoFixable: true })
        score -= 15
      }
    }
  }

  // Element count
  if (elements.length > pacing.maxElements) {
    issues.push({ severity: 'warning', category: 'density', message: `${elements.length} elements (max ${pacing.maxElements})`, autoFixable: false })
    score -= 10
  }

  // Whitespace
  const whitespace = 1 - computeOccupiedArea(allBoxes)
  if (whitespace < pacing.minWhitespace) {
    issues.push({ severity: 'warning', category: 'whitespace', message: `Whitespace ${Math.round(whitespace * 100)}% (min ${Math.round(pacing.minWhitespace * 100)}%)`, autoFixable: false })
    score -= 8
  }

  // Safe zone
  for (const el of contentTexts) {
    if (el.x < 60 || (el.x + el.width) > 1860 || el.y < 60 || (el.y + el.height) > 1020) {
      issues.push({ severity: 'warning', category: 'safe-zone', message: 'Content outside safe zone', elementId: el.id, autoFixable: true })
      score -= 5
    }
  }

  // Scale contrast
  const fontSizes = contentTexts.map(e => e.fontSize || 20).filter(s => s > 0)
  if (fontSizes.length >= 2) {
    const ratio = Math.max(...fontSizes) / Math.min(...fontSizes)
    const minRatio = pacing.energy === 'peak' ? 8 : 4
    if (ratio < minRatio) {
      issues.push({ severity: 'suggestion', category: 'scale', message: `Font ratio ${ratio.toFixed(1)}:1 (recommend ≥${minRatio}:1)`, autoFixable: false })
      score -= 5
    }
  }

  // Hierarchy
  const titles = contentTexts.filter(e => e.role === 'title')
  if (titles.length === 0 && slide.slideType !== 'cover') {
    issues.push({ severity: 'warning', category: 'hierarchy', message: 'No title element', autoFixable: false })
    score -= 10
  }

  // Title-too-low — title pushed near bottom leaves no room for content
  for (const title of titles) {
    const titleBottom = (title.y || 0) + (title.height || (title.fontSize || 48) + 40)
    if (titleBottom > 850 && slide.slideType !== 'closing') {
      issues.push({ severity: 'critical', category: 'title-too-low', message: `Title at y=${title.y}, bottom=${titleBottom} — too low`, elementId: title.id, autoFixable: true })
      score -= 15
    }
  }

  // Image validation
  if (expectedImageUrl && imageElements.length === 0) {
    issues.push({ severity: 'warning', category: 'missing-image', message: 'Slide has imageUrl but no image element', autoFixable: true })
    score -= 20
  }

  for (const img of imageElements) {
    const ix = img.x || 0, iy = img.y || 0, iw = img.width || 0, ih = img.height || 0
    if (ix < -10 || iy < -10 || ix + iw > 1930 || iy + ih > 1090) {
      issues.push({ severity: 'warning', category: 'image-bounds', message: `Image "${img.id}" out of canvas bounds`, elementId: img.id, autoFixable: true })
      score -= 10
    }

    const imgArea = iw * ih
    const canvasArea = 1920 * 1080
    if (imgArea > 0 && imgArea < canvasArea * 0.15) {
      issues.push({ severity: 'suggestion', category: 'image-small', message: `Image "${img.id}" is only ${Math.round(imgArea / canvasArea * 100)}% of canvas`, elementId: img.id, autoFixable: true })
      score -= 5
    }

    const imgBox: BoundingBox = { x: ix, y: iy, width: iw, height: ih }
    for (const title of titles) {
      const titleBox: BoundingBox = { x: title.x || 0, y: title.y || 0, width: title.width || 0, height: title.height || 0 }
      if (boxesOverlap(imgBox, titleBox)) {
        issues.push({ severity: 'warning', category: 'image-overlap-title', message: `Image "${img.id}" overlaps title "${title.id}"`, elementId: img.id, autoFixable: true })
        score -= 12
      }
    }
  }

  // Text-text overlap detection
  for (let a = 0; a < contentTexts.length; a++) {
    for (let b = a + 1; b < contentTexts.length; b++) {
      const elA = contentTexts[a], elB = contentTexts[b]
      const boxA: BoundingBox = { x: elA.x || 0, y: elA.y || 0, width: elA.width || 0, height: elA.height || 0 }
      const boxB: BoundingBox = { x: elB.x || 0, y: elB.y || 0, width: elB.width || 0, height: elB.height || 0 }
      if (boxesOverlap(boxA, boxB)) {
        const overlapX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x)
        const overlapY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y)
        const overlapArea = overlapX * overlapY
        const smallerArea = Math.min(boxA.width * boxA.height, boxB.width * boxB.height)
        const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0
        if (overlapRatio > 0.15) {
          issues.push({
            severity: overlapRatio > 0.5 ? 'critical' : 'warning',
            category: 'text-text-overlap',
            message: `Text "${elA.id}" overlaps "${elB.id}" (${Math.round(overlapRatio * 100)}%)`,
            elementId: elB.id,
            autoFixable: true,
          })
          score -= overlapRatio > 0.5 ? 15 : 8
        }
      }
    }
  }

  // Balance
  const balance = computeBalanceScore(allBoxes)
  if (balance < 0.3) {
    issues.push({ severity: 'suggestion', category: 'balance', message: `Balance ${(balance * 100).toFixed(0)}/100`, autoFixable: false })
    score -= 5
  }

  return { valid: issues.filter(i => i.severity === 'critical').length === 0, score: Math.max(0, score), issues }
}

export function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem, expectedImageUrl?: string): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable) continue

    if (issue.category === 'missing-image' && expectedImageUrl) {
      const placement = findBestImagePlacement(fixed.elements, designSystem.colors.background)
      const imgElement: ImageElement = {
        id: `autofix-img-${slide.id}`, type: 'image',
        x: placement.x, y: placement.y,
        width: placement.width, height: placement.height,
        zIndex: placement.fullBleed ? 1 : 5,
        src: expectedImageUrl, objectFit: 'cover',
        borderRadius: placement.fullBleed ? 0 : 16,
        opacity: placement.fullBleed ? 0.4 : 1,
      }
      fixed.elements.push(imgElement)

      if (placement.fullBleed) {
        fixed.elements.push({
          id: `autofix-overlay-${slide.id}`, type: 'shape' as const,
          x: 0, y: 0, width: 1920, height: 1080, zIndex: 2,
          shapeType: 'background' as const,
          fill: `linear-gradient(180deg, ${designSystem.colors.background}CC 0%, ${designSystem.colors.background}40 40%, ${designSystem.colors.background}CC 100%)`,
          opacity: 1,
        })
      }
      continue
    }

    if (!issue.elementId) continue
    const elIndex = fixed.elements.findIndex(e => e.id === issue.elementId)
    if (elIndex === -1) continue

    if (issue.category === 'contrast') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        let color = updated.color || '#ffffff'
        let attempts = 0
        while (contrastRatio(color, designSystem.colors.background) < 4.5 && attempts < 20) {
          color = adjustLightness(color, 0.05)
          attempts++
        }
        updated.color = color
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'safe-zone') {
      const el = fixed.elements[elIndex]
      const updated = { ...el }
      updated.x = Math.max(80, Math.min(updated.x, 1920 - 80 - (updated.width || 200)))
      updated.y = Math.max(80, Math.min(updated.y, 1080 - 80 - (updated.height || 60)))
      fixed.elements[elIndex] = updated
    }

    if (issue.category === 'image-bounds') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        updated.x = Math.max(0, updated.x)
        updated.y = Math.max(0, updated.y)
        if (updated.x + updated.width > 1920) updated.width = 1920 - updated.x
        if (updated.y + updated.height > 1080) updated.height = 1080 - updated.y
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'image-small') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        const targetArea = 1920 * 1080 * 0.25
        const currentArea = updated.width * updated.height
        if (currentArea > 0 && currentArea < targetArea) {
          const scale = Math.sqrt(targetArea / currentArea)
          updated.width = Math.min(1920, Math.round(updated.width * scale))
          updated.height = Math.min(1080, Math.round(updated.height * scale))
          if (updated.x + updated.width > 1920) updated.x = 1920 - updated.width
          if (updated.y + updated.height > 1080) updated.y = 1080 - updated.height
          updated.x = Math.max(0, updated.x)
          updated.y = Math.max(0, updated.y)
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'image-overlap-title') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        const titleEls = fixed.elements.filter(e => isTextElement(e) && e.role === 'title') as TextElement[]
        if (titleEls.length > 0) {
          const titleCenterX = (titleEls[0].x || 0) + (titleEls[0].width || 0) / 2
          if (titleCenterX > 960) {
            updated.x = 80
          } else {
            updated.x = 1920 - updated.width - 80
          }
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'title-too-low') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        const titleHeight = updated.height || (updated.fontSize || 48) + 40
        updated.y = Math.max(80, 780 - titleHeight)
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'text-text-overlap') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        const otherTexts = fixed.elements.filter(
          (e, idx) => idx !== elIndex && isTextElement(e) && e.role !== 'decorative'
        ) as TextElement[]
        for (const other of otherTexts) {
          const myBox: BoundingBox = { x: updated.x, y: updated.y, width: updated.width, height: updated.height }
          const otherBox: BoundingBox = { x: other.x, y: other.y, width: other.width, height: other.height }
          if (boxesOverlap(myBox, otherBox)) {
            updated.y = other.y + other.height + 20
            if (updated.y + updated.height > 1020) {
              updated.y = other.y
              updated.x = other.x + other.width + 40
              if (updated.x + updated.width > 1860) {
                updated.x = other.x - updated.width - 40
              }
            }
            break
          }
        }
        fixed.elements[elIndex] = updated
      }
    }
  }

  return fixed
}

/** Cluster-aware visual consistency — normalizes within position groups, preserves variety */
export function checkVisualConsistency(slides: Slide[], _designSystem: PremiumDesignSystem): Slide[] {
  const allTitles: { slideIndex: number; y: number; fontSize: number; element: TextElement }[] = []

  slides.forEach((slide, si) => {
    const titles = (slide.elements || []).filter(
      (e): e is TextElement => isTextElement(e) && e.role === 'title'
    )
    for (const t of titles) {
      allTitles.push({ slideIndex: si, y: t.y || 0, fontSize: t.fontSize || 48, element: t })
    }
  })

  if (allTitles.length < 3) return slides

  const regularTitles = allTitles.filter(t =>
    slides[t.slideIndex]?.slideType !== 'cover' && slides[t.slideIndex]?.slideType !== 'closing'
  )

  if (regularTitles.length > 0) {
    // ── Fix 1: title-too-low — clamp titles that would push content off canvas ──
    for (const t of regularTitles) {
      const titleHeight = t.element.height || (t.element.fontSize || 48) + 40
      if (t.element.y + titleHeight > 900) {
        // Push up so title bottom is at ~780 (leaves room for content below)
        t.element.y = Math.max(80, 780 - titleHeight)
      }
    }

    // ── Fix 2: cluster-based Y normalization (top / center / bottom bands) ──
    // Group titles into 3 position clusters instead of flattening to one median
    const TOP_BAND = 200    // y < 200 → "top" cluster
    const BOT_BAND = 600    // y > 600 → "bottom" cluster
    const clusters = {
      top: regularTitles.filter(t => t.element.y < TOP_BAND),
      center: regularTitles.filter(t => t.element.y >= TOP_BAND && t.element.y <= BOT_BAND),
      bottom: regularTitles.filter(t => t.element.y > BOT_BAND),
    }

    // Normalize within each cluster (40px threshold)
    for (const group of Object.values(clusters)) {
      if (group.length < 2) continue
      const ys = group.map(t => t.element.y).sort((a, b) => a - b)
      const clusterMedian = ys[Math.floor(ys.length / 2)]
      for (const t of group) {
        if (Math.abs(t.element.y - clusterMedian) > 40) {
          t.element.y = clusterMedian
        }
      }
    }

    // ── Fix 3: ensure variety — if >70% of titles ended up in one cluster, redistribute ──
    const total = regularTitles.length
    const largest = Math.max(clusters.top.length, clusters.center.length, clusters.bottom.length)
    if (largest / total > 0.7 && total >= 5) {
      // Sort all regular titles by slide index and alternate between top (80) and center (400)
      const sorted = [...regularTitles].sort((a, b) => a.slideIndex - b.slideIndex)
      const positions = [80, 80, 400, 80, 400] // 60% top, 40% center pattern
      sorted.forEach((t, i) => {
        t.element.y = positions[i % positions.length]
      })
    }

    // ── Fix 4: heading font sizes — snap only small drifts (6-30px from median) ──
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const sortedSizes = [...headingSizes].sort((a, b) => a - b)
    const medianSize = sortedSizes[Math.floor(sortedSizes.length / 2)]
    for (const t of regularTitles) {
      const diff = Math.abs((t.element.fontSize || 48) - medianSize)
      if (diff > 6 && diff < 30) {
        t.element.fontSize = medianSize
      }
    }
  }

  return slides
}
