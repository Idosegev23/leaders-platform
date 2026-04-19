/**
 * Art Director Engine — Entry Point
 * Orchestrates: AI Art Direction → Layout Engine → Collision Fix → Decorative → Logos
 */

import type { Slide, SlideElement } from '@/types/presentation'
import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { ArtDirectionResult, SlideContent, SlideDirection } from './types'
import { CANVAS_WIDTH, CANVAS_HEIGHT, planToContent } from './types'
import { createGrid } from './core/grid'
import { getTypoScale, getAdaptiveTitleScale } from './core/typography'
import { getComposition } from './compositions'
import { addDecorative } from './decorative'
import { fixOverlaps } from './core/collision'

export { buildArtDirectionPrompt, ART_DIRECTION_SCHEMA, parseArtDirection, buildFallbackArtDirection } from './art-direction'
export type { ArtDirectionResult, SlideDirection } from './types'

/**
 * Generate all slides from art direction decisions + content plans.
 */
export function generateSlides(
  artDirection: ArtDirectionResult,
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  images: Record<string, string>,
  brandName: string,
  options?: { clientLogoUrl?: string },
): Slide[] {
  const slides: Slide[] = []

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]
    const direction = artDirection.slides[i] || artDirection.slides[0]
    const content = planToContent(plan, images)
    slides.push(layoutSingleSlide(content, direction, ds, brandName, i))
  }

  // Logo injection
  try {
    const { injectLeadersLogo, injectClientLogo } = require('@/lib/gemini/slide-design/logo-injection')
    let result = injectLeadersLogo(slides)
    if (options?.clientLogoUrl) {
      result = injectClientLogo(result, options.clientLogoUrl)
    }
    return result
  } catch {
    return slides
  }
}

function layoutSingleSlide(
  content: SlideContent,
  direction: SlideDirection,
  ds: PremiumDesignSystem,
  brandName: string,
  index: number,
): Slide {
  // Grid with RTL direction
  const grid = createGrid({
    margin: ds.spacing.safeMargin || 80,
    gutter: ds.spacing.cardGap || 24,
    direction: ds.direction || 'rtl',
  })

  // Adaptive title scale — downscale if title is too long
  const adaptedScale = getAdaptiveTitleScale(
    content.title, direction.titleScale, ds,
    grid.usable.width, grid.usable.height,
  )
  const typo = getTypoScale(adaptedScale, ds)

  if (adaptedScale !== direction.titleScale) {
    console.log(`[LayoutEngine] Slide ${index}: title scale ${direction.titleScale} → ${adaptedScale} for "${content.title.slice(0, 30)}..."`)
  }

  // Run composition
  const compositionFn = getComposition(direction.composition)
  const { background, elements } = compositionFn(content, direction, ds, grid, typo)

  // Add decorative elements
  const decorativeElements = addDecorative(direction.decorativeElement, ds, brandName)

  // Fix overlaps + assemble
  const allElements = fixOverlaps([...elements, ...decorativeElements])

  return {
    id: `slide-${index}`,
    slideType: content.slideType,
    label: content.title.slice(0, 30),
    archetype: direction.composition,
    dramaticChoice: direction.dramaticChoice,
    background,
    elements: allElements,
  }
}
