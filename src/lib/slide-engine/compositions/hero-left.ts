/**
 * Hero Left / Hero Right — Asymmetric split with dominant side
 * RTL-aware: "hero-left" means text on READING-START side (right in RTL)
 * Best for: brief, audience
 */

import type { CompositionFn, SlideContent, SlideDirection, Grid, TypoScale } from '../types'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type { SlideElement } from '@/types/presentation'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor } from '../core/colors'
import { Z, titleShadow, subtitleShadow, getBorderRadius, cardShadow } from '../core/depth'
import { text, shape, image, resetIds } from '../core/elements'
import { estimateTextHeight, getAdaptiveTitleScale, getTypoScale } from '../core/typography'

function heroSplitLayout(
  content: SlideContent,
  direction: SlideDirection,
  ds: PremiumDesignSystem,
  grid: Grid,
  typo: TypoScale,
  side: 'left' | 'right',
) {
  resetIds()
  const elements: SlideElement[] = []

  const background = buildBackground(
    direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle,
  )

  // RTL-aware split: in RTL, "hero-left" = text on RIGHT (reading start)
  const isRTL = ds.direction === 'rtl'
  let textCols, imgCols
  if (side === 'left') {
    textCols = isRTL ? grid.col(5, 8) : grid.col(1, 7)
    imgCols = isRTL ? grid.col(1, 4) : grid.col(9, 4)
  } else {
    textCols = isRTL ? grid.col(1, 7) : grid.col(6, 7)
    imgCols = isRTL ? grid.col(9, 4) : grid.col(1, 4)
  }

  // Adaptive title
  const adaptedScale = getAdaptiveTitleScale(content.title, direction.titleScale, ds, textCols.width, grid.usable.height * 0.35)
  const adaptedTypo = adaptedScale !== direction.titleScale ? getTypoScale(adaptedScale, ds) : typo

  const { y: zoneY } = grid.zone(direction.titlePlacement)
  let currentY = zoneY + 20

  // Title
  const titleH = estimateTextHeight(content.title, adaptedTypo.titleSize, adaptedTypo.titleLineHeight, textCols.width)
  elements.push(text({
    content: content.title,
    rect: { x: textCols.x, y: currentY, width: textCols.width, height: Math.max(titleH, adaptedTypo.titleLineHeightPx) },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    lineHeight: adaptedTypo.titleLineHeight,
    letterSpacing: adaptedTypo.titleSize >= 72 ? -2 : 0,
    textShadow: titleShadow(),
  }))
  currentY += Math.max(titleH, adaptedTypo.titleLineHeightPx) + 20

  // Subtitle
  if (content.subtitle) {
    const subH = estimateTextHeight(content.subtitle, adaptedTypo.subtitleSize, 1.4, textCols.width)
    elements.push(text({
      content: content.subtitle,
      rect: { x: textCols.x, y: currentY, width: textCols.width, height: Math.max(subH, 36) },
      fontSize: adaptedTypo.subtitleSize,
      fontWeight: adaptedTypo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
      lineHeight: 1.4,
      textShadow: subtitleShadow(),
    }))
    currentY += Math.max(subH, 36) + 24
  }

  // Accent line
  elements.push(shape({
    rect: { x: textCols.x, y: currentY, width: 60, height: 4 },
    fill: accentColor(ds),
    shapeType: 'decorative',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))
  currentY += 28

  // Body text
  if (content.bodyText) {
    const bodyH = estimateTextHeight(content.bodyText, adaptedTypo.bodySize, 1.6, textCols.width)
    elements.push(text({
      content: content.bodyText,
      rect: { x: textCols.x, y: currentY, width: textCols.width, height: Math.max(bodyH, 60) },
      fontSize: adaptedTypo.bodySize,
      fontWeight: adaptedTypo.bodyWeight,
      color: mutedColor(ds),
      role: 'body',
      zIndex: Z.BODY,
      lineHeight: 1.6,
    }))
    currentY += Math.max(bodyH, 60) + 20
  }

  // Bullet points
  if (content.bulletPoints?.length) {
    for (const bullet of content.bulletPoints) {
      const bH = estimateTextHeight(`• ${bullet}`, adaptedTypo.bodySize, 1.5, textCols.width)
      elements.push(text({
        content: `• ${bullet}`,
        rect: { x: textCols.x, y: currentY, width: textCols.width, height: Math.max(bH, 30) },
        fontSize: adaptedTypo.bodySize,
        fontWeight: adaptedTypo.bodyWeight,
        color: textColor(ds),
        role: 'list-item',
        zIndex: Z.BODY,
        lineHeight: 1.5,
      }))
      currentY += Math.max(bH, 30) + 8
    }
  }

  // Image on the other side
  if (content.imageUrl) {
    const imgMarginY = grid.usable.y + 40
    const imgHeight = grid.usable.height - 80
    elements.push(image({
      src: content.imageUrl,
      rect: { x: imgCols.x, y: imgMarginY, width: imgCols.width, height: imgHeight },
      zIndex: Z.CONTENT,
      borderRadius: getBorderRadius(ds, 'lg'),
      boxShadow: cardShadow(ds),
    }))
  } else {
    // No image — decorative card
    const cardY = grid.usable.y + 60
    const cardH = grid.usable.height - 120
    elements.push(shape({
      rect: { x: imgCols.x, y: cardY, width: imgCols.width, height: cardH },
      fill: cardBgColor(ds),
      shapeType: 'rectangle',
      zIndex: Z.CARD,
      borderRadius: getBorderRadius(ds, 'lg'),
      border: `1px solid ${cardBorderColor(ds)}`,
      boxShadow: cardShadow(ds),
    }))
  }

  return { background, elements }
}

export const heroLeftLayout: CompositionFn = (content, direction, ds, grid, typo) =>
  heroSplitLayout(content, direction, ds, grid, typo, 'left')

export const heroRightLayout: CompositionFn = (content, direction, ds, grid, typo) =>
  heroSplitLayout(content, direction, ds, grid, typo, 'right')
