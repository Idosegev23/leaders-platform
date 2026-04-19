/**
 * Fallback slide builders — used when AI generation fails.
 */

import type {
  Slide,
  SlideType,
  FontWeight,
  SlideElement,
} from '@/types/presentation'
import type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
} from './types'
import { validateAndFixColors } from './color-utils'
import { findBestImagePlacement } from './spatial-utils'

export function buildFallbackDesignSystem(brand: BrandDesignInput): PremiumDesignSystem {
  return {
    colors: validateAndFixColors({
      primary: brand.brandColors.primary, secondary: brand.brandColors.secondary,
      accent: brand.brandColors.accent, background: '#0a0a12', text: '#f0f0f5',
      cardBg: '#14142a', cardBorder: brand.brandColors.primary + '25',
      gradientStart: brand.brandColors.primary, gradientEnd: brand.brandColors.accent,
      muted: '#808090', highlight: brand.brandColors.accent,
      auroraA: brand.brandColors.primary + '50', auroraB: brand.brandColors.accent + '50',
      auroraC: brand.brandColors.secondary + '60',
    }),
    fonts: { heading: 'Heebo', body: 'Heebo' }, direction: 'rtl',
    typography: {
      displaySize: 104, headingSize: 56, subheadingSize: 32, bodySize: 22, captionSize: 15,
      letterSpacingTight: -3, letterSpacingWide: 5,
      lineHeightTight: 1.0, lineHeightRelaxed: 1.5,
      weightPairs: [[800, 400]],
    },
    spacing: { unit: 8, cardPadding: 40, cardGap: 32, safeMargin: 80 },
    effects: {
      borderRadius: 'soft', borderRadiusValue: 16,
      decorativeStyle: 'geometric', shadowStyle: 'none',
      auroraGradient: `radial-gradient(circle at 20% 50%, ${brand.brandColors.primary}40 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${brand.brandColors.accent}30 0%, transparent 50%)`,
    },
    motif: { type: 'diagonal-lines', opacity: 0.08, color: brand.brandColors.primary, implementation: 'repeating-linear-gradient' },
  }
}

/** Simple fallback for single-slide mode */
export function buildSimpleFallbackSlide(
  slide: SlideContentInput,
  index: number,
  colors: PremiumDesignSystem['colors'],
): Slide {
  return {
    id: `slide-${index}`,
    slideType: slide.slideType as SlideType,
    label: slide.title || `שקף ${index + 1}`,
    background: { type: 'solid' as const, value: colors.background },
    elements: [
      {
        id: `el-${index}-0`, type: 'shape' as const, x: 0, y: 0, width: 1920, height: 1080,
        zIndex: 0, shapeType: 'background' as const,
        fill: `linear-gradient(135deg, ${colors.primary}30 0%, ${colors.background} 60%, ${colors.accent}20 100%)`,
        opacity: 1,
      },
      {
        id: `el-${index}-1`, type: 'text' as const, x: 120, y: 400, width: 1680, height: 120,
        zIndex: 10, content: slide.title || `שקף ${index + 1}`,
        fontSize: 64, fontWeight: 800 as FontWeight, color: colors.text,
        textAlign: 'right' as const, role: 'title' as const, lineHeight: 1.1,
      },
    ] as SlideElement[],
  }
}

/** Fallback for batch mode — includes subtitle */
export function buildFallbackSlide(
  slide: SlideContentInput,
  index: number,
  ctx: BatchContext,
  colors: PremiumDesignSystem['colors'],
): Slide {
  const globalIndex = ctx.slideIndex + index
  return {
    id: `slide-${globalIndex}`,
    slideType: slide.slideType as SlideType,
    label: slide.title || `שקף ${globalIndex + 1}`,
    background: { type: 'solid' as const, value: colors.background },
    elements: [
      {
        id: `el-${globalIndex}-0`, type: 'shape' as const, x: 0, y: 0, width: 1920, height: 1080,
        zIndex: 0, shapeType: 'background' as const,
        fill: `linear-gradient(135deg, ${colors.primary}30 0%, ${colors.background} 60%, ${colors.accent}20 100%)`,
        opacity: 1,
      },
      {
        id: `el-${globalIndex}-1`, type: 'text' as const, x: 120, y: 400, width: 1680, height: 120,
        zIndex: 10, content: slide.title || `שקף ${globalIndex + 1}`,
        fontSize: 64, fontWeight: 800 as FontWeight, color: colors.text,
        textAlign: 'right' as const, role: 'title' as const, lineHeight: 1.1,
      },
      {
        id: `el-${globalIndex}-2`, type: 'text' as const, x: 120, y: 560, width: 1680, height: 300,
        zIndex: 8, content: String(slide.content?.subtitle || slide.content?.description || slide.content?.text || ''),
        fontSize: 24, fontWeight: 300 as FontWeight, color: colors.text + '90',
        textAlign: 'right' as const, role: 'body' as const, lineHeight: 1.6,
      },
    ] as SlideElement[],
  }
}

/** Rich fallback with image support */
export function createFallbackSlide(input: SlideContentInput, designSystem: PremiumDesignSystem, index: number): Slide {
  const colors = designSystem.colors
  const typo = designSystem.typography
  const content = input.content
  const title = (typeof content.headline === 'string' ? content.headline : undefined)
    || (typeof content.brandName === 'string' ? content.brandName : undefined)
    || input.title
    || `שקף ${index + 1}`

  const elements: SlideElement[] = [
    { id: `fb-${index}-bg`, type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
      shapeType: 'decorative', fill: `radial-gradient(circle at 50% 50%, ${colors.cardBg} 0%, ${colors.background} 100%)`, opacity: 1 },
    { id: `fb-${index}-line`, type: 'shape', x: input.imageUrl ? 880 : 120, y: 200, width: 60, height: 4, zIndex: 4,
      shapeType: 'decorative', fill: colors.accent, opacity: 0.8 },
    { id: `fb-${index}-title`, type: 'text', x: input.imageUrl ? 880 : 120, y: 220, width: input.imageUrl ? 900 : 800, height: 100, zIndex: 10,
      content: title, fontSize: typo.headingSize, fontWeight: (typo.weightPairs[0]?.[0] || 800) as FontWeight,
      color: colors.text, textAlign: 'right', lineHeight: typo.lineHeightTight,
      letterSpacing: typo.letterSpacingTight, role: 'title' },
    { id: `fb-${index}-motif`, type: 'shape', x: -100, y: 800, width: 2200, height: 1, zIndex: 2,
      shapeType: 'decorative', fill: colors.muted, opacity: designSystem.motif.opacity, rotation: 15 },
  ]

  if (input.imageUrl) {
    const placement = findBestImagePlacement(elements, colors.background)
    elements.push({
      id: `fb-${index}-img`, type: 'image',
      x: placement.x, y: placement.y,
      width: placement.width, height: placement.height,
      zIndex: placement.fullBleed ? 1 : 5,
      src: input.imageUrl, objectFit: 'cover',
      borderRadius: placement.fullBleed ? 0 : 16,
      opacity: placement.fullBleed ? 0.4 : 1,
    })
    if (placement.fullBleed) {
      elements.push({
        id: `fb-${index}-overlay`, type: 'shape',
        x: 0, y: 0, width: 1920, height: 1080, zIndex: 2,
        shapeType: 'background' as const,
        fill: `linear-gradient(180deg, ${colors.background}CC 0%, ${colors.background}40 40%, ${colors.background}CC 100%)`,
        opacity: 1,
      })
    }
  }

  return {
    id: `slide-fallback-${index}`,
    slideType: input.slideType as SlideType,
    label: input.title,
    background: { type: 'solid', value: colors.background },
    elements,
  }
}
