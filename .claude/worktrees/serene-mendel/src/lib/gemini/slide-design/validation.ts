/**
 * Slide validation, auto-fix, and visual consistency checks.
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
import { contrastRatio, adjustLightness } from './color-utils'
import {
  boxesOverlap,
  isImageElement,
  computeOccupiedArea,
  computeBalanceScore,
  findBestImagePlacement,
} from './spatial-utils'

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
        issues.push({
          severity: 'critical', category: 'contrast',
          message: `contrast ${cr.toFixed(1)}:1 (min ${minContrast}:1)`,
          elementId: el.id, autoFixable: true,
        })
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

    // Missing image — find best placement by analyzing existing layout
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
  }

  return fixed
}

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
    // Align title Y positions to median (60px threshold — tight consistency)
    const medianY = regularTitles.map(t => t.y).sort((a, b) => a - b)[Math.floor(regularTitles.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.y - medianY) > 60) t.element.y = medianY
    }

    // Normalize heading font sizes (6-30px range — catch drifts but allow intentional variance)
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const medianSize = headingSizes.sort((a, b) => a - b)[Math.floor(headingSizes.length / 2)]
    for (const t of regularTitles) {
      const diff = Math.abs(t.fontSize - medianSize)
      if (diff > 6 && diff < 30) {
        t.element.fontSize = medianSize
      }
    }
  }

  return slides
}
