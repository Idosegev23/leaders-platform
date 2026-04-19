/**
 * Cards Float — Floating cards with depth and shadows
 * Best for: approach, contentStrategy
 * Single card → centered. Two cards → side by side. 3+ → floating stack.
 */

import type { CompositionFn } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor, withAlpha } from '../core/colors'
import { Z, titleShadow, getBorderRadius, getShadow, cardShadow } from '../core/depth'
import { text, shape, resetIds } from '../core/elements'

export const cardsFloatLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle)

  // Title
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: grid.usable.y + 10, width: grid.col(1, 8).width, height: typo.titleLineHeightPx },
    fontSize: typo.titleSize,
    fontWeight: typo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
  }))

  let startY = grid.usable.y + typo.titleLineHeightPx + 20
  if (content.subtitle) {
    elements.push(text({
      content: content.subtitle,
      rect: { x: grid.usable.x, y: startY, width: grid.col(1, 8).width, height: 36 },
      fontSize: typo.subtitleSize,
      fontWeight: typo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
    }))
    startY += 50
  }

  const items = content.cards?.length
    ? content.cards
    : (content.bulletPoints?.map((b, i) => ({ title: `שלב ${i + 1}`, body: b })) || [])

  if (!items || items.length === 0) return { background, elements }

  const radius = getBorderRadius(ds, 'md')
  const count = Math.min(items.length, 5)
  const gap = ds.spacing.cardGap || 24
  const pad = ds.spacing.cardPadding || 28

  // Single card → centered
  if (count === 1) {
    const card = items[0]
    const cardW = grid.col(2, 10).width
    const cardH = Math.min(280, grid.usable.y + grid.usable.height - startY - 40)
    const cx = grid.col(2, 10).x
    const cy = Math.round(startY + (grid.usable.y + grid.usable.height - startY - cardH) / 2)

    elements.push(shape({
      rect: { x: cx, y: cy, width: cardW, height: cardH },
      fill: withAlpha(ds.colors.accent, 0.08),
      shapeType: 'rectangle',
      zIndex: Z.CARD,
      borderRadius: getBorderRadius(ds, 'lg'),
      border: `1px solid ${withAlpha(ds.colors.accent, 0.2)}`,
      boxShadow: getShadow(ds.effects.shadowStyle, 'heavy'),
    }))
    elements.push(text({
      content: card.title,
      rect: { x: cx + pad, y: cy + pad, width: cardW - pad * 2, height: 40 },
      fontSize: typo.subtitleSize + 4,
      fontWeight: 700,
      color: accentColor(ds),
      role: 'label',
      zIndex: Z.CONTENT,
    }))
    if (card.body) {
      elements.push(text({
        content: card.body,
        rect: { x: cx + pad, y: cy + pad + 52, width: cardW - pad * 2, height: cardH - pad * 2 - 52 },
        fontSize: typo.bodySize,
        fontWeight: typo.bodyWeight,
        color: mutedColor(ds),
        role: 'body',
        zIndex: Z.CONTENT,
        lineHeight: 1.6,
      }))
    }
    return { background, elements }
  }

  // Two cards → side by side
  if (count === 2) {
    const totalW = grid.col(1, 12).width
    const cardW = (totalW - gap) / 2
    const cardH = Math.min(280, grid.usable.y + grid.usable.height - startY - 40)
    const cy = Math.round(startY + (grid.usable.y + grid.usable.height - startY - cardH) / 2)

    for (let i = 0; i < 2; i++) {
      const card = items[i]
      const cx = Math.round(grid.usable.x + i * (cardW + gap))

      elements.push(shape({
        rect: { x: cx, y: cy, width: Math.round(cardW), height: cardH },
        fill: i === 0 ? withAlpha(ds.colors.accent, 0.08) : cardBgColor(ds),
        shapeType: 'rectangle',
        zIndex: Z.CARD,
        borderRadius: radius,
        border: `1px solid ${i === 0 ? withAlpha(ds.colors.accent, 0.2) : cardBorderColor(ds)}`,
        boxShadow: cardShadow(ds),
      }))
      elements.push(text({
        content: card.title,
        rect: { x: cx + pad, y: cy + pad, width: Math.round(cardW) - pad * 2, height: 30 },
        fontSize: typo.bodySize + 2,
        fontWeight: 700,
        color: i === 0 ? accentColor(ds) : textColor(ds),
        role: 'label',
        zIndex: Z.CONTENT,
      }))
      if (card.body) {
        elements.push(text({
          content: card.body,
          rect: { x: cx + pad, y: cy + pad + 38, width: Math.round(cardW) - pad * 2, height: cardH - pad * 2 - 38 },
          fontSize: typo.bodySize - 2,
          fontWeight: typo.bodyWeight,
          color: mutedColor(ds),
          role: 'body',
          zIndex: Z.CONTENT,
          lineHeight: 1.4,
        }))
      }
    }
    return { background, elements }
  }

  // 3+ cards — floating stack
  const cardW = grid.col(1, 9).width
  const availH = grid.usable.y + grid.usable.height - startY - 20
  const cardH = Math.min(160, Math.round(availH / count * 1.2))
  const overlapOffset = Math.round((availH - cardH) / Math.max(count - 1, 1))
  const xShift = 30

  for (let i = 0; i < count; i++) {
    const card = items[i]
    const cx = grid.usable.x + i * xShift
    const cy = Math.round(startY + i * overlapOffset)
    const shadowIntensity = i === count - 1 ? 'light' as const : i === 0 ? 'heavy' as const : 'medium' as const

    elements.push(shape({
      rect: { x: cx, y: cy, width: cardW - i * xShift, height: cardH },
      fill: i === 0 ? withAlpha(ds.colors.accent, 0.08) : cardBgColor(ds),
      shapeType: 'rectangle',
      zIndex: Z.CARD + i,
      borderRadius: radius,
      border: `1px solid ${i === 0 ? withAlpha(ds.colors.accent, 0.2) : cardBorderColor(ds)}`,
      boxShadow: getShadow(ds.effects.shadowStyle, shadowIntensity),
    }))

    elements.push(text({
      content: card.title,
      rect: { x: cx + pad, y: cy + pad, width: cardW - i * xShift - pad * 2, height: 30 },
      fontSize: typo.bodySize + 2,
      fontWeight: 700,
      color: i === 0 ? accentColor(ds) : textColor(ds),
      role: 'label',
      zIndex: Z.CONTENT + i,
    }))

    if (card.body) {
      elements.push(text({
        content: card.body,
        rect: { x: cx + pad, y: cy + pad + 36, width: cardW - i * xShift - pad * 2, height: cardH - pad * 2 - 36 },
        fontSize: typo.bodySize - 2,
        fontWeight: typo.bodyWeight,
        color: mutedColor(ds),
        role: 'body',
        zIndex: Z.CONTENT + i,
        lineHeight: 1.4,
      }))
    }
  }

  return { background, elements }
}
