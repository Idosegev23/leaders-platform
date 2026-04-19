/**
 * Editorial — Large quote + attribution, magazine style
 * Best for: insight, audience
 * Quote length guard: scales down for short quotes
 */

import type { CompositionFn } from '../types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, withAlpha } from '../core/colors'
import { Z, titleShadow, subtitleShadow, getBorderRadius } from '../core/depth'
import { text, shape, image, resetIds } from '../core/elements'
import { estimateTextHeight } from '../core/typography'

export const editorialLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []

  const background = buildBackground(
    direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle,
  )

  // If image, use as side panel
  if (content.imageUrl && direction.backgroundStyle !== 'image-overlay') {
    const isRTL = ds.direction === 'rtl'
    const imgX = isRTL ? 0 : CANVAS_WIDTH * 0.55
    const gradAngle = isRTL ? '270deg' : '90deg'
    elements.push(image({
      src: content.imageUrl,
      rect: { x: imgX, y: 0, width: CANVAS_WIDTH * 0.45, height: CANVAS_HEIGHT },
      zIndex: Z.BACKGROUND,
      opacity: 0.7,
      filter: 'brightness(0.7)',
    }))
    elements.push(shape({
      rect: { x: imgX, y: 0, width: CANVAS_WIDTH * 0.45, height: CANVAS_HEIGHT },
      fill: `linear-gradient(${gradAngle}, ${ds.colors.background}, transparent)`,
      shapeType: 'background',
      zIndex: Z.GRADIENT_OVERLAY,
    }))
  }

  // Quotation mark — decorative
  elements.push(text({
    content: '״',
    rect: { x: grid.usable.x, y: grid.usable.y + 40, width: 120, height: 120 },
    fontSize: 200,
    fontWeight: 900,
    color: withAlpha(ds.colors.accent, 0.2),
    role: 'decorative',
    zIndex: Z.DECORATIVE,
    textAlign: 'right',
    lineHeight: 0.6,
  }))

  // Quote text — adapt scale based on length
  const quoteText = content.bodyText || content.title
  const quoteWords = quoteText.split(/\s+/).length
  const quoteScale = quoteWords < 5 ? 0.7 : quoteWords < 10 ? 0.85 : 1.0
  const quoteSize = Math.round(
    (direction.heroElement === 'quote' ? typo.titleSize : typo.titleSize * 0.85) * quoteScale
  )
  const quoteAlignment = quoteWords < 8 ? 'center' as const : 'right' as const

  const quoteWidth = grid.col(1, 9).width
  const quoteX = grid.usable.x
  const { y: zoneY } = grid.zone(direction.titlePlacement)
  const quoteH = estimateTextHeight(quoteText, quoteSize, 1.3, quoteWidth)

  elements.push(text({
    content: quoteText,
    rect: { x: quoteX, y: zoneY, width: quoteWidth, height: Math.max(quoteH, quoteSize + 20) },
    fontSize: quoteSize,
    fontWeight: typo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    lineHeight: 1.3,
    letterSpacing: -1,
    textShadow: titleShadow(),
    textAlign: quoteAlignment,
  }))

  // Attribution
  const attributionY = zoneY + Math.max(quoteH, quoteSize + 20) + 32
  if (content.bodyText && content.title !== content.bodyText) {
    elements.push(text({
      content: content.title,
      rect: { x: quoteX, y: attributionY, width: quoteWidth, height: 40 },
      fontSize: typo.subtitleSize,
      fontWeight: typo.subtitleWeight,
      color: accentColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
      textShadow: subtitleShadow(),
    }))
  } else if (content.subtitle) {
    elements.push(text({
      content: content.subtitle,
      rect: { x: quoteX, y: attributionY, width: quoteWidth, height: 40 },
      fontSize: typo.subtitleSize,
      fontWeight: typo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
    }))
  }

  // Key number
  if (content.keyNumber) {
    elements.push(text({
      content: content.keyNumber,
      rect: { x: grid.usable.x + grid.usable.width - 250, y: grid.usable.y + grid.usable.height - 100, width: 230, height: 70 },
      fontSize: typo.metricSize * 0.7,
      fontWeight: 900,
      color: accentColor(ds),
      role: 'metric-value',
      zIndex: Z.HERO,
      textAlign: 'left',
    }))
    if (content.keyNumberLabel) {
      elements.push(text({
        content: content.keyNumberLabel,
        rect: { x: grid.usable.x + grid.usable.width - 250, y: grid.usable.y + grid.usable.height - 35, width: 230, height: 24 },
        fontSize: typo.captionSize,
        fontWeight: 400,
        color: mutedColor(ds),
        role: 'metric-label',
        zIndex: Z.BODY,
        textAlign: 'left',
        letterSpacing: 2,
      }))
    }
  }

  // Accent line
  elements.push(shape({
    rect: { x: quoteX, y: attributionY + 52, width: 60, height: 3 },
    fill: accentColor(ds),
    shapeType: 'decorative',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))

  return { background, elements }
}
