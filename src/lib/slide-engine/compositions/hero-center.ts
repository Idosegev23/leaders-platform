/**
 * Hero Center — Dominant central element with support below
 * Best for: cover, bigIdea, closing
 */

import type { CompositionFn } from '../types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, withAlpha } from '../core/colors'
import { Z, titleShadow, subtitleShadow } from '../core/depth'
import { text, shape, image, resetIds } from '../core/elements'
import { estimateTextHeight, getAdaptiveTitleScale, getTypoScale } from '../core/typography'

export const heroCenterLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []

  const background = buildBackground(
    direction.backgroundStyle, direction.colorEmphasis, ds,
    direction.gradientAngle, content.imageUrl,
  )

  // Image-overlay handling
  if (direction.backgroundStyle === 'image-overlay' && content.imageUrl) {
    elements.push(image({
      src: content.imageUrl,
      rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      zIndex: Z.BACKGROUND,
      opacity: 0.4,
      filter: 'brightness(0.55) contrast(1.15) saturate(1.1)',
    }))
    elements.push(shape({
      rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      fill: `linear-gradient(180deg, ${ds.colors.background}cc, ${ds.colors.background}90)`,
      shapeType: 'background',
      zIndex: Z.GRADIENT_OVERLAY,
    }))
  }

  // Adaptive title scale
  const titleWidth = grid.col(2, 10).width
  const adaptedScale = getAdaptiveTitleScale(content.title, direction.titleScale, ds, titleWidth, grid.usable.height * 0.4)
  const adaptedTypo = adaptedScale !== direction.titleScale ? getTypoScale(adaptedScale, ds) : typo

  const { y: zoneY } = grid.zone(direction.titlePlacement)
  const titleX = grid.col(2, 10).x

  // Giant hollow watermark — only for short titles at xl+
  const titleWords = content.title.split(/\s+/)
  if (adaptedTypo.titleSize >= 100 && titleWords.length <= 3) {
    elements.push(text({
      content: titleWords[0],
      rect: { x: -60, y: CANVAS_HEIGHT / 2 - 180, width: CANVAS_WIDTH + 120, height: 350 },
      fontSize: 320,
      fontWeight: 900,
      color: 'transparent',
      role: 'decorative',
      zIndex: Z.DECORATIVE,
      textAlign: 'center',
      letterSpacing: 30,
      opacity: 1,
      textStroke: { width: 1, color: withAlpha(ds.colors.text, 0.06) },
    }))
  }

  // Hero title
  const titleH = estimateTextHeight(content.title, adaptedTypo.titleSize, adaptedTypo.titleLineHeight, titleWidth)
  elements.push(text({
    content: content.title,
    rect: { x: titleX, y: zoneY + 20, width: titleWidth, height: Math.max(titleH, adaptedTypo.titleLineHeightPx) },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textAlign: 'center',
    lineHeight: adaptedTypo.titleLineHeight,
    letterSpacing: adaptedTypo.titleSize >= 80 ? -4 : -1,
    textShadow: `0 6px 40px rgba(0,0,0,0.6), 0 0 80px ${withAlpha(ds.colors.accent, 0.2)}`,
  }))

  let currentY = zoneY + 20 + Math.max(titleH, adaptedTypo.titleLineHeightPx) + 24

  // Tagline or subtitle
  const sub = content.tagline || content.subtitle
  if (sub) {
    const subH = estimateTextHeight(sub, adaptedTypo.subtitleSize, 1.4, titleWidth)
    elements.push(text({
      content: sub,
      rect: { x: titleX, y: currentY, width: titleWidth, height: Math.max(subH, 40) },
      fontSize: adaptedTypo.subtitleSize,
      fontWeight: adaptedTypo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
      textAlign: 'center',
      lineHeight: 1.4,
      textShadow: subtitleShadow(),
    }))
    currentY += Math.max(subH, 40) + 32
  }

  // Body text
  if (content.bodyText && direction.titlePlacement !== 'bottom') {
    const bodyWidth = grid.col(3, 8).width
    const bodyX = grid.col(3, 8).x
    const bodyH = estimateTextHeight(content.bodyText, adaptedTypo.bodySize, 1.6, bodyWidth)
    elements.push(text({
      content: content.bodyText,
      rect: { x: bodyX, y: currentY, width: bodyWidth, height: Math.max(bodyH, 60) },
      fontSize: adaptedTypo.bodySize,
      fontWeight: adaptedTypo.bodyWeight,
      color: mutedColor(ds),
      role: 'body',
      zIndex: Z.BODY,
      textAlign: 'center',
      lineHeight: 1.6,
    }))
    currentY += Math.max(bodyH, 60) + 24
  }

  // Accent line
  elements.push(shape({
    rect: { x: Math.round((CANVAS_WIDTH - 80) / 2), y: currentY, width: 80, height: 4 },
    fill: accentColor(ds),
    shapeType: 'decorative',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))

  // Key number
  if (content.keyNumber) {
    elements.push(text({
      content: content.keyNumber,
      rect: { x: titleX, y: currentY + 40, width: titleWidth, height: adaptedTypo.metricSize + 20 },
      fontSize: adaptedTypo.metricSize,
      fontWeight: adaptedTypo.metricWeight,
      color: accentColor(ds),
      role: 'metric-value',
      zIndex: Z.HERO,
      textAlign: 'center',
      letterSpacing: -2,
    }))
  }

  return { background, elements }
}
