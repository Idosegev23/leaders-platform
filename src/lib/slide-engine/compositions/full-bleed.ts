/**
 * Full Bleed — Full-bleed image + text overlay with strong gradient
 * Best for: cover (with image), brief
 */

import type { CompositionFn } from '../types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types'
import { buildBackground, textColor, mutedColor, accentColor } from '../core/colors'
import { Z, titleShadow, subtitleShadow } from '../core/depth'
import { text, shape, image, resetIds } from '../core/elements'
import { estimateTextHeight, getAdaptiveTitleScale, getTypoScale } from '../core/typography'

export const fullBleedLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground('solid', 'dark', ds)

  // Full-bleed image
  if (content.imageUrl) {
    elements.push(image({
      src: content.imageUrl,
      rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      zIndex: Z.BACKGROUND,
      filter: 'brightness(0.55) contrast(1.15) saturate(1.1)',
    }))
  }

  // Strong directional gradient overlay
  const gradDir = direction.titlePlacement === 'top' ? '180deg'
    : direction.titlePlacement === 'bottom' ? '0deg' : '180deg'

  elements.push(shape({
    rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    fill: `linear-gradient(${gradDir}, ${ds.colors.background}e8 0%, ${ds.colors.background}80 40%, ${ds.colors.background}20 70%, transparent 100%)`,
    shapeType: 'background',
    zIndex: Z.GRADIENT_OVERLAY,
  }))

  // Extra scrim for text protection
  elements.push(shape({
    rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    fill: `linear-gradient(${gradDir}, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)`,
    shapeType: 'background',
    zIndex: Z.GRADIENT_OVERLAY,
  }))

  // Adaptive title
  const textWidth = grid.col(1, 10).width
  const adaptedScale = getAdaptiveTitleScale(content.title, direction.titleScale, ds, textWidth, grid.usable.height * 0.4)
  const adaptedTypo = adaptedScale !== direction.titleScale ? getTypoScale(adaptedScale, ds) : typo

  const { y: zoneY } = grid.zone(direction.titlePlacement)
  let currentY = zoneY + 20

  // Title
  const titleH = estimateTextHeight(content.title, adaptedTypo.titleSize, adaptedTypo.titleLineHeight, textWidth)
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: currentY, width: textWidth, height: Math.max(titleH, adaptedTypo.titleLineHeightPx) },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: '#FFFFFF',
    role: 'title',
    zIndex: Z.HERO,
    lineHeight: adaptedTypo.titleLineHeight,
    letterSpacing: adaptedTypo.titleSize >= 80 ? -3 : -1,
    textShadow: titleShadow(),
  }))
  currentY += Math.max(titleH, adaptedTypo.titleLineHeightPx) + 20

  // Subtitle
  const sub = content.tagline || content.subtitle
  if (sub) {
    elements.push(text({
      content: sub,
      rect: { x: grid.usable.x, y: currentY, width: textWidth, height: 40 },
      fontSize: adaptedTypo.subtitleSize,
      fontWeight: adaptedTypo.subtitleWeight,
      color: '#FFFFFFcc',
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
      textShadow: subtitleShadow(),
    }))
    currentY += 50
  }

  // Accent line
  elements.push(shape({
    rect: { x: grid.usable.x, y: currentY, width: 60, height: 4 },
    fill: accentColor(ds),
    shapeType: 'decorative',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))

  // Body text
  if (content.bodyText) {
    elements.push(text({
      content: content.bodyText,
      rect: { x: grid.usable.x, y: currentY + 28, width: grid.col(1, 7).width, height: 80 },
      fontSize: adaptedTypo.bodySize,
      fontWeight: adaptedTypo.bodyWeight,
      color: '#FFFFFFaa',
      role: 'body',
      zIndex: Z.BODY,
      lineHeight: 1.6,
    }))
  }

  return { background, elements }
}
