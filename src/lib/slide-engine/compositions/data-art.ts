/**
 * Data Art — Oversized numbers as visual centerpiece
 * Best for: metrics, whyNow
 * Fallback: if no keyNumber, uses large title as hero
 */

import type { CompositionFn } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor, withAlpha } from '../core/colors'
import { Z, titleShadow, getBorderRadius, cardShadow } from '../core/depth'
import { text, shape, resetIds } from '../core/elements'

export const dataArtLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle)

  // Title — compact at top
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: grid.usable.y + 10, width: grid.usable.width, height: typo.titleLineHeightPx },
    fontSize: Math.min(typo.titleSize, typo.subtitleSize * 2),
    fontWeight: typo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
  }))

  // Hero number — or fallback to large title
  const heroNumber = content.keyNumber
    || (content.cards?.[0]?.title?.match(/\d/) ? content.cards[0].title : null)

  if (heroNumber) {
    const numSize = Math.max(typo.metricSize, 100)
    const numY = grid.usable.y + typo.titleLineHeightPx + 30
    elements.push(text({
      content: heroNumber,
      rect: { x: grid.usable.x, y: numY, width: grid.col(1, 8).width, height: numSize + 20 },
      fontSize: numSize,
      fontWeight: 900,
      color: accentColor(ds),
      role: 'metric-value',
      zIndex: Z.HERO,
      letterSpacing: -4,
      textShadow: `0 4px 30px ${withAlpha(ds.colors.accent, 0.3)}`,
    }))

    if (content.keyNumberLabel) {
      elements.push(text({
        content: content.keyNumberLabel,
        rect: { x: grid.usable.x, y: numY + numSize + 10, width: grid.col(1, 6).width, height: 30 },
        fontSize: typo.captionSize + 2,
        fontWeight: 400,
        color: mutedColor(ds),
        role: 'metric-label',
        zIndex: Z.BODY,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }))
    }
  } else {
    // Fallback: large accent title
    const titleSize = Math.min(typo.titleSize * 1.5, 120)
    elements.push(text({
      content: content.title,
      rect: { x: grid.usable.x, y: grid.usable.y + typo.titleLineHeightPx + 40, width: grid.usable.width, height: titleSize + 20 },
      fontSize: titleSize,
      fontWeight: 800,
      color: accentColor(ds),
      role: 'title',
      zIndex: Z.HERO,
      letterSpacing: -3,
      textShadow: `0 4px 30px ${withAlpha(ds.colors.accent, 0.3)}`,
    }))
  }

  // Cards/metrics at bottom
  const items = content.cards?.length
    ? content.cards
    : (content.bulletPoints?.map((b, i) => ({ title: `${i + 1}`, body: b })) || [])

  if (items.length > 0) {
    const count = Math.min(items.length, 4)
    const cardGap = ds.spacing.cardGap || 24
    const cardW = (grid.usable.width - (count - 1) * cardGap) / count
    const cardH = 180
    const cardY = grid.usable.y + grid.usable.height - cardH - 10
    const radius = getBorderRadius(ds, 'md')

    for (let i = 0; i < count; i++) {
      const cx = Math.round(grid.usable.x + i * (cardW + cardGap))
      const item = items[i]
      const pad = ds.spacing.cardPadding || 28

      elements.push(shape({
        rect: { x: cx, y: cardY, width: Math.round(cardW), height: cardH },
        fill: cardBgColor(ds),
        shapeType: 'rectangle',
        zIndex: Z.CARD,
        borderRadius: radius,
        border: `1px solid ${cardBorderColor(ds)}`,
        boxShadow: cardShadow(ds),
      }))

      elements.push(text({
        content: item.title,
        rect: { x: cx + pad, y: cardY + pad, width: Math.round(cardW) - pad * 2, height: 50 },
        fontSize: typo.subtitleSize + 8,
        fontWeight: 800,
        color: i === 0 ? accentColor(ds) : textColor(ds),
        role: 'metric-value',
        zIndex: Z.CONTENT,
      }))

      if (item.body) {
        elements.push(text({
          content: item.body,
          rect: { x: cx + pad, y: cardY + pad + 56, width: Math.round(cardW) - pad * 2, height: cardH - pad * 2 - 56 },
          fontSize: typo.captionSize + 1,
          fontWeight: typo.bodyWeight,
          color: mutedColor(ds),
          role: 'caption',
          zIndex: Z.CONTENT,
          lineHeight: 1.4,
        }))
      }
    }
  }

  // Body text (if no cards)
  if (items.length === 0 && content.bodyText) {
    const bodyY = heroNumber
      ? grid.usable.y + typo.titleLineHeightPx + typo.metricSize + 100
      : grid.usable.y + typo.titleLineHeightPx + 60
    elements.push(text({
      content: content.bodyText,
      rect: { x: grid.usable.x, y: bodyY, width: grid.col(1, 8).width, height: 120 },
      fontSize: typo.bodySize,
      fontWeight: typo.bodyWeight,
      color: mutedColor(ds),
      role: 'body',
      zIndex: Z.BODY,
      lineHeight: 1.6,
    }))
  }

  return { background, elements }
}
