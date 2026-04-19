/**
 * Split Screen — 55/45 split with visual divider
 * RTL-aware: text on reading-start side
 * Best for: strategy, competitive
 */

import type { CompositionFn } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor, withAlpha } from '../core/colors'
import { Z, titleShadow, subtitleShadow, getBorderRadius, cardShadow } from '../core/depth'
import { text, shape, image, resetIds } from '../core/elements'
import { estimateTextHeight, getAdaptiveTitleScale, getTypoScale } from '../core/typography'

export const splitScreenLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle)
  const isRTL = ds.direction === 'rtl'

  // RTL-aware split: text on reading-start side
  const dividerX = Math.round(grid.usable.x + grid.usable.width * 0.55)
  const textX = isRTL ? dividerX + 40 : grid.usable.x
  const textW = isRTL ? (grid.usable.x + grid.usable.width) - dividerX - 40 : dividerX - grid.usable.x - 40
  const cardX = isRTL ? grid.usable.x : dividerX + 40
  const cardW = isRTL ? dividerX - grid.usable.x - 40 : grid.usable.x + grid.usable.width - dividerX - 40

  // Divider
  elements.push(shape({
    rect: { x: dividerX - 1, y: grid.usable.y + 40, width: 2, height: grid.usable.height - 80 },
    fill: withAlpha(ds.colors.text, 0.1),
    shapeType: 'divider',
    zIndex: Z.DECORATIVE,
  }))

  // Adaptive title
  const adaptedScale = getAdaptiveTitleScale(content.title, direction.titleScale, ds, textW, grid.usable.height * 0.35)
  const adaptedTypo = adaptedScale !== direction.titleScale ? getTypoScale(adaptedScale, ds) : typo

  let leftY = grid.usable.y + 30

  // Title
  const titleH = estimateTextHeight(content.title, adaptedTypo.titleSize, adaptedTypo.titleLineHeight, textW)
  elements.push(text({
    content: content.title,
    rect: { x: textX, y: leftY, width: textW, height: Math.max(titleH, adaptedTypo.titleLineHeightPx) },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
    letterSpacing: adaptedTypo.titleSize >= 72 ? -2 : 0,
  }))
  leftY += Math.max(titleH, adaptedTypo.titleLineHeightPx) + 20

  if (content.subtitle) {
    elements.push(text({
      content: content.subtitle,
      rect: { x: textX, y: leftY, width: textW, height: 36 },
      fontSize: adaptedTypo.subtitleSize,
      fontWeight: adaptedTypo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
      textShadow: subtitleShadow(),
    }))
    leftY += 50
  }

  // Accent
  elements.push(shape({
    rect: { x: textX, y: leftY, width: 50, height: 4 },
    fill: accentColor(ds),
    shapeType: 'decorative',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))
  leftY += 28

  if (content.bodyText) {
    const bodyH = estimateTextHeight(content.bodyText, adaptedTypo.bodySize, 1.6, textW)
    elements.push(text({
      content: content.bodyText,
      rect: { x: textX, y: leftY, width: textW, height: Math.max(bodyH, 80) },
      fontSize: adaptedTypo.bodySize,
      fontWeight: adaptedTypo.bodyWeight,
      color: mutedColor(ds),
      role: 'body',
      zIndex: Z.BODY,
      lineHeight: 1.6,
    }))
    leftY += Math.max(bodyH, 80) + 16
  }

  if (content.bulletPoints?.length) {
    for (const bullet of content.bulletPoints) {
      elements.push(text({
        content: `• ${bullet}`,
        rect: { x: textX, y: leftY, width: textW, height: 32 },
        fontSize: adaptedTypo.bodySize,
        fontWeight: adaptedTypo.bodyWeight,
        color: textColor(ds),
        role: 'list-item',
        zIndex: Z.BODY,
        lineHeight: 1.4,
      }))
      leftY += 36
    }
  }

  // Right side: Cards or image
  const radius = getBorderRadius(ds, 'md')
  const gap = ds.spacing.cardGap || 20

  if (content.imageUrl) {
    elements.push(image({
      src: content.imageUrl,
      rect: { x: cardX, y: grid.usable.y + 30, width: cardW, height: grid.usable.height - 60 },
      zIndex: Z.CONTENT,
      borderRadius: getBorderRadius(ds, 'lg'),
      boxShadow: cardShadow(ds),
    }))
  } else if (content.cards?.length) {
    const MIN_CARD_H = 100
    let count = Math.min(content.cards.length, 5)
    let cardH = (grid.usable.height - 60 - (count - 1) * gap) / count
    if (cardH < MIN_CARD_H) {
      count = Math.floor((grid.usable.height - 60 + gap) / (MIN_CARD_H + gap))
      cardH = (grid.usable.height - 60 - (count - 1) * gap) / count
    }

    for (let i = 0; i < count; i++) {
      const card = content.cards[i]
      const cy = Math.round(grid.usable.y + 30 + i * (cardH + gap))
      const pad = cardH < 140 ? 16 : ds.spacing.cardPadding || 24

      elements.push(shape({
        rect: { x: cardX, y: cy, width: cardW, height: Math.round(cardH) },
        fill: i === 0 ? withAlpha(ds.colors.accent, 0.1) : cardBgColor(ds),
        shapeType: 'rectangle',
        zIndex: Z.CARD,
        borderRadius: radius,
        border: `1px solid ${i === 0 ? withAlpha(ds.colors.accent, 0.25) : cardBorderColor(ds)}`,
        boxShadow: cardShadow(ds),
      }))

      elements.push(text({
        content: card.title,
        rect: { x: cardX + pad, y: cy + pad, width: cardW - pad * 2, height: 28 },
        fontSize: adaptedTypo.bodySize + 2,
        fontWeight: 700,
        color: i === 0 ? accentColor(ds) : textColor(ds),
        role: 'label',
        zIndex: Z.CONTENT,
      }))

      if (card.body && cardH >= 140) {
        elements.push(text({
          content: card.body,
          rect: { x: cardX + pad, y: cy + pad + 34, width: cardW - pad * 2, height: Math.round(cardH) - pad * 2 - 34 },
          fontSize: adaptedTypo.bodySize - 2,
          fontWeight: adaptedTypo.bodyWeight,
          color: mutedColor(ds),
          role: 'body',
          zIndex: Z.CONTENT,
          lineHeight: 1.4,
        }))
      }
    }
  }

  return { background, elements }
}
