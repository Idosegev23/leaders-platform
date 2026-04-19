/**
 * Decorative Layer — RTL-aware visual flair
 */

import type { SlideElement } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type { DecorativeType } from '../types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types'
import { Z } from '../core/depth'
import { text, shape } from '../core/elements'
import { withAlpha } from '../core/colors'

export function addDecorative(
  decorType: DecorativeType,
  ds: PremiumDesignSystem,
  brandName: string,
): SlideElement[] {
  switch (decorType) {
    case 'watermark': return watermark(ds, brandName)
    case 'accent-line': return accentLine(ds)
    case 'motif-pattern': return motifPattern(ds)
    case 'floating-shape': return floatingShape(ds)
    case 'none': return []
  }
}

function watermark(ds: PremiumDesignSystem, brandName: string): SlideElement[] {
  return [
    text({
      content: brandName,
      rect: { x: -40, y: CANVAS_HEIGHT - 250, width: CANVAS_WIDTH + 80, height: 220 },
      fontSize: 200,
      fontWeight: 900,
      color: withAlpha(ds.colors.text, 0.04),
      role: 'decorative',
      zIndex: Z.DECORATIVE,
      textAlign: 'center',
      letterSpacing: 20,
      textTransform: 'uppercase',
    }),
  ]
}

function accentLine(ds: PremiumDesignSystem): SlideElement[] {
  const isRTL = ds.direction === 'rtl'
  const x = isRTL ? CANVAS_WIDTH - 6 : 0
  const lineX = isRTL ? CANVAS_WIDTH - 120 : 0

  return [
    shape({
      rect: { x, y: 0, width: 6, height: 200 },
      fill: ds.colors.accent,
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      opacity: 0.6,
    }),
    shape({
      rect: { x: lineX, y: 0, width: 120, height: 6 },
      fill: ds.colors.accent,
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      opacity: 0.6,
    }),
  ]
}

function motifPattern(ds: PremiumDesignSystem): SlideElement[] {
  const isRTL = ds.direction === 'rtl'
  const motifColor = withAlpha(ds.motif?.color || ds.colors.accent, ds.motif?.opacity || 0.06)
  const elements: SlideElement[] = []
  const patternType = ds.motif?.type || 'diagonal-lines'
  const baseX = isRTL ? 80 : CANVAS_WIDTH - 240

  if (patternType === 'dots' || patternType === 'grid-lines') {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        elements.push(shape({
          rect: { x: baseX + col * 40, y: CANVAS_HEIGHT - 200 + row * 40, width: 6, height: 6 },
          fill: motifColor,
          shapeType: 'circle',
          zIndex: Z.MOTIF,
          borderRadius: 3,
        }))
      }
    }
  } else {
    for (let i = 0; i < 5; i++) {
      elements.push(shape({
        rect: { x: baseX + i * 40, y: CANVAS_HEIGHT - 300 + i * 40, width: 300, height: 2 },
        fill: motifColor,
        shapeType: 'line',
        zIndex: Z.MOTIF,
        rotation: -45,
      }))
    }
  }

  return elements
}

function floatingShape(ds: PremiumDesignSystem): SlideElement[] {
  const isRTL = ds.direction === 'rtl'
  const style = ds.effects.decorativeStyle || 'geometric'
  const shapeX = isRTL ? -100 : CANVAS_WIDTH - 300

  if (style === 'organic' || style === 'minimal') {
    return [
      shape({
        rect: { x: shapeX, y: -100, width: 400, height: 400 },
        fill: withAlpha(ds.colors.accent, 0.08),
        shapeType: 'circle',
        zIndex: Z.DECORATIVE,
        borderRadius: 200,
      }),
    ]
  }

  return [
    shape({
      rect: { x: shapeX, y: -80, width: 250, height: 250 },
      fill: withAlpha(ds.colors.primary, 0.06),
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      rotation: 45,
      borderRadius: ds.effects.borderRadiusValue || 12,
    }),
  ]
}
