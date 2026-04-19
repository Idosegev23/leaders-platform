/**
 * Bento Grid — Asymmetric grid of mixed-size rounded cells
 * Best for: goals, deliverables, influencers, competitive
 * Adaptive: reduces card count if too cramped, min card height 120px
 */

import type { CompositionFn, TitleScale } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor, withAlpha } from '../core/colors'
import { Z, titleShadow, getBorderRadius, cardShadow } from '../core/depth'
import { text, shape, resetIds } from '../core/elements'
import { getTypoScale } from '../core/typography'

export const bentoGridLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle)
  const gap = ds.spacing.cardGap || 24

  // Determine items
  const items: { title: string; body: string }[] = []
  if (content.cards?.length) items.push(...content.cards)
  else if (content.bulletPoints?.length) items.push(...content.bulletPoints.map((b, i) => ({ title: `${i + 1}`, body: b })))
  if (items.length === 0 && content.bodyText) items.push({ title: content.title, body: content.bodyText })

  const count = Math.min(items.length, 6)

  // Adaptive title — smaller if many cards
  const titleScaleOverride: TitleScale = count >= 5 ? 'md' : count >= 3 ? 'lg' : direction.titleScale
  const adaptedTypo = titleScaleOverride !== direction.titleScale ? getTypoScale(titleScaleOverride, ds) : typo

  // Title
  const titleZone = grid.zone('top')
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: titleZone.y + 10, width: grid.usable.width, height: adaptedTypo.titleLineHeightPx + 10 },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
    letterSpacing: adaptedTypo.titleSize >= 72 ? -2 : 0,
  }))

  let gridStartY = titleZone.y + adaptedTypo.titleLineHeightPx + 30
  if (content.subtitle) {
    elements.push(text({
      content: content.subtitle,
      rect: { x: grid.usable.x, y: gridStartY, width: grid.usable.width, height: 36 },
      fontSize: adaptedTypo.subtitleSize,
      fontWeight: adaptedTypo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
    }))
    gridStartY += 50
  }

  const gridH = grid.usable.y + grid.usable.height - gridStartY - 20

  // Min card height check — reduce count if needed
  const MIN_CARD_H = 120
  let cells = getBentoCells(count, grid.usable.x, gridStartY, grid.usable.width, gridH, gap)
  let actualCount = count
  const minCellH = cells.length > 0 ? Math.min(...cells.map(c => c.height)) : 0
  if (minCellH < MIN_CARD_H && count > 3) {
    actualCount = Math.min(4, count)
    cells = getBentoCells(actualCount, grid.usable.x, gridStartY, grid.usable.width, gridH, gap)
  }

  const radius = getBorderRadius(ds, 'md')

  for (let i = 0; i < actualCount; i++) {
    const cell = cells[i]
    const item = items[i]
    const isFirst = i === 0

    // Adaptive padding
    const pad = cell.height < 160 ? 16 : cell.height < 220 ? 24 : ds.spacing.cardPadding || 32
    const cardTitleSize = cell.height < 160 ? adaptedTypo.bodySize : isFirst ? adaptedTypo.subtitleSize + 4 : adaptedTypo.bodySize + 2

    // Card bg
    elements.push(shape({
      rect: cell,
      fill: isFirst ? withAlpha(ds.colors.accent, 0.12) : cardBgColor(ds),
      shapeType: 'rectangle',
      zIndex: Z.CARD,
      borderRadius: radius,
      border: `1px solid ${isFirst ? withAlpha(ds.colors.accent, 0.3) : cardBorderColor(ds)}`,
      boxShadow: cardShadow(ds),
    }))

    // Card title
    elements.push(text({
      content: item.title,
      rect: { x: cell.x + pad, y: cell.y + pad, width: cell.width - pad * 2, height: 36 },
      fontSize: cardTitleSize,
      fontWeight: 700,
      color: isFirst ? accentColor(ds) : textColor(ds),
      role: 'label',
      zIndex: Z.CONTENT,
    }))

    // Card body — only if enough room
    const bodyAvailH = cell.height - pad * 2 - cardTitleSize - 12
    if (item.body && bodyAvailH >= 30) {
      elements.push(text({
        content: item.body,
        rect: { x: cell.x + pad, y: cell.y + pad + cardTitleSize + 8, width: cell.width - pad * 2, height: bodyAvailH },
        fontSize: adaptedTypo.bodySize - 2,
        fontWeight: adaptedTypo.bodyWeight,
        color: mutedColor(ds),
        role: 'body',
        zIndex: Z.CONTENT,
        lineHeight: 1.5,
      }))
    }
  }

  // Key number badge
  if (content.keyNumber) {
    elements.push(text({
      content: content.keyNumber,
      rect: { x: grid.usable.x + grid.usable.width - 200, y: titleZone.y + 10, width: 180, height: 60 },
      fontSize: adaptedTypo.metricSize * 0.6,
      fontWeight: adaptedTypo.metricWeight,
      color: accentColor(ds),
      role: 'metric-value',
      zIndex: Z.HERO,
      textAlign: 'left',
    }))
  }

  return { background, elements }
}

// ─── Bento Cell Calculator ──────────────────────────────

interface CellRect { x: number; y: number; width: number; height: number }

function getBentoCells(count: number, startX: number, startY: number, totalW: number, totalH: number, gap: number): CellRect[] {
  const cells: CellRect[] = []

  if (count <= 2) {
    const w = (totalW - gap) / 2
    for (let i = 0; i < count; i++) {
      cells.push({ x: Math.round(startX + i * (w + gap)), y: startY, width: Math.round(w), height: totalH })
    }
  } else if (count === 3) {
    const topH = Math.round(totalH * 0.45)
    const botH = totalH - topH - gap
    const halfW = (totalW - gap) / 2
    cells.push({ x: startX, y: startY, width: totalW, height: topH })
    cells.push({ x: startX, y: Math.round(startY + topH + gap), width: Math.round(halfW), height: botH })
    cells.push({ x: Math.round(startX + halfW + gap), y: Math.round(startY + topH + gap), width: Math.round(halfW), height: botH })
  } else if (count === 4) {
    const halfW = (totalW - gap) / 2
    const halfH = (totalH - gap) / 2
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        cells.push({
          x: Math.round(startX + c * (halfW + gap)),
          y: Math.round(startY + r * (halfH + gap)),
          width: Math.round(halfW),
          height: Math.round(halfH),
        })
      }
    }
  } else if (count === 5) {
    const topH = Math.round(totalH * 0.45)
    const botH = totalH - topH - gap
    const thirdW = (totalW - 2 * gap) / 3
    const halfW = (totalW - gap) / 2
    for (let i = 0; i < 3; i++) {
      cells.push({ x: Math.round(startX + i * (thirdW + gap)), y: startY, width: Math.round(thirdW), height: topH })
    }
    for (let i = 0; i < 2; i++) {
      cells.push({ x: Math.round(startX + i * (halfW + gap)), y: Math.round(startY + topH + gap), width: Math.round(halfW), height: botH })
    }
  } else {
    const thirdW = (totalW - 2 * gap) / 3
    const halfH = (totalH - gap) / 2
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        cells.push({
          x: Math.round(startX + c * (thirdW + gap)),
          y: Math.round(startY + r * (halfH + gap)),
          width: Math.round(thirdW),
          height: Math.round(halfH),
        })
      }
    }
  }

  return cells
}
