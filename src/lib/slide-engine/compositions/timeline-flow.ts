/**
 * Timeline Flow — Horizontal progression with connected phases
 * Best for: timeline
 * Max 5 phases (6 is too cramped). Min phase width 260px.
 */

import type { CompositionFn } from '../types'
import { buildBackground, textColor, mutedColor, accentColor, cardBgColor, cardBorderColor, withAlpha } from '../core/colors'
import { Z, titleShadow, getBorderRadius, cardShadow } from '../core/depth'
import { text, shape, resetIds } from '../core/elements'

export const timelineFlowLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle)

  // Title
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: grid.usable.y + 10, width: grid.usable.width, height: typo.titleLineHeightPx },
    fontSize: typo.titleSize,
    fontWeight: typo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
  }))

  let phaseStartY = grid.usable.y + typo.titleLineHeightPx + 20
  if (content.subtitle) {
    elements.push(text({
      content: content.subtitle,
      rect: { x: grid.usable.x, y: phaseStartY, width: grid.usable.width, height: 36 },
      fontSize: typo.subtitleSize,
      fontWeight: typo.subtitleWeight,
      color: mutedColor(ds),
      role: 'subtitle',
      zIndex: Z.SUBTITLE,
    }))
    phaseStartY += 50
  }

  // Build phases
  const phases: { title: string; body: string }[] = []
  if (content.cards?.length) phases.push(...content.cards)
  else if (content.bulletPoints?.length) phases.push(...content.bulletPoints.map((b, i) => ({ title: `שלב ${i + 1}`, body: b })))

  // Max 5 phases, min width 260px
  const MIN_PHASE_W = 260
  const gap = 20
  const maxPhases = Math.floor((grid.usable.width + gap) / (MIN_PHASE_W + gap))
  const count = Math.min(phases.length, 5, maxPhases)
  if (count === 0) return { background, elements }

  const phaseW = (grid.usable.width - (count - 1) * gap) / count
  const phaseH = grid.usable.y + grid.usable.height - phaseStartY - 30
  const connectorY = Math.round(phaseStartY + phaseH * 0.3)
  const radius = getBorderRadius(ds, 'md')

  // Adaptive text sizes
  const phaseTitleSize = count >= 5 ? typo.captionSize + 2 : typo.bodySize
  const phaseBodySize = count >= 5 ? typo.captionSize : typo.captionSize + 1

  // Horizontal connector
  elements.push(shape({
    rect: { x: grid.usable.x, y: connectorY, width: grid.usable.width, height: 3 },
    fill: withAlpha(ds.colors.accent, 0.3),
    shapeType: 'line',
    zIndex: Z.DECORATIVE,
    borderRadius: 2,
  }))

  for (let i = 0; i < count; i++) {
    const phase = phases[i]
    const px = Math.round(grid.usable.x + i * (phaseW + gap))
    const pad = count >= 5 ? 16 : ds.spacing.cardPadding || 24

    // Phase node
    const nodeSize = 16
    elements.push(shape({
      rect: { x: Math.round(px + phaseW / 2 - nodeSize / 2), y: connectorY - nodeSize / 2 + 1, width: nodeSize, height: nodeSize },
      fill: i === 0 ? accentColor(ds) : ds.colors.primary,
      shapeType: 'circle',
      zIndex: Z.CONTAINER,
      borderRadius: nodeSize / 2,
      border: `3px solid ${ds.colors.background}`,
    }))

    // Phase card
    const cardY = connectorY + 30
    const cardH = phaseH - (connectorY - phaseStartY) - 40

    elements.push(shape({
      rect: { x: px, y: cardY, width: Math.round(phaseW), height: Math.round(cardH) },
      fill: i === 0 ? withAlpha(ds.colors.accent, 0.1) : cardBgColor(ds),
      shapeType: 'rectangle',
      zIndex: Z.CARD,
      borderRadius: radius,
      border: `1px solid ${i === 0 ? withAlpha(ds.colors.accent, 0.25) : cardBorderColor(ds)}`,
      boxShadow: cardShadow(ds),
    }))

    // Phase number
    elements.push(text({
      content: `${i + 1}`,
      rect: { x: px + pad, y: cardY + pad, width: 40, height: 40 },
      fontSize: typo.subtitleSize,
      fontWeight: 800,
      color: i === 0 ? accentColor(ds) : withAlpha(ds.colors.text, 0.3),
      role: 'label',
      zIndex: Z.CONTENT,
    }))

    // Phase title
    elements.push(text({
      content: phase.title,
      rect: { x: px + pad, y: cardY + pad + 44, width: Math.round(phaseW) - pad * 2, height: 28 },
      fontSize: phaseTitleSize,
      fontWeight: 700,
      color: textColor(ds),
      role: 'label',
      zIndex: Z.CONTENT,
    }))

    // Phase body
    if (phase.body && cardH >= 140) {
      elements.push(text({
        content: phase.body,
        rect: { x: px + pad, y: cardY + pad + 78, width: Math.round(phaseW) - pad * 2, height: Math.round(cardH) - pad * 2 - 78 },
        fontSize: phaseBodySize,
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
