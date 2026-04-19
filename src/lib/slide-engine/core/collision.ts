/**
 * Collision Detection — prevents elements from overlapping
 * Uses iterative approach (max 3 passes) to handle cascade collisions.
 */

import type { SlideElement } from '@/types/presentation'
import { CANVAS_HEIGHT } from '../types'

interface Box { x: number; y: number; width: number; height: number }

function getBox(el: SlideElement): Box {
  return { x: el.x, y: el.y, width: el.width, height: el.height }
}

function overlapArea(a: Box, b: Box): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

function isProtected(el: SlideElement): boolean {
  if (el.zIndex <= 3) return true
  if (el.type === 'shape') {
    const st = (el as { shapeType?: string }).shapeType
    if (st === 'background' || st === 'decorative' || st === 'divider' || st === 'line') return true
  }
  if (el.type === 'text' && (el as { role?: string }).role === 'decorative') return true
  return false
}

/**
 * Fix overlapping elements by nudging lower-priority elements down.
 * 3 passes to handle cascade collisions. 16px gap for breathing room.
 */
export function fixOverlaps(elements: SlideElement[]): SlideElement[] {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  const fixed = sorted.map(el => ({ ...el }))

  const MAX_PASSES = 3
  const GAP = 16

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let hadCollision = false

    for (let i = 0; i < fixed.length; i++) {
      const el = fixed[i]
      if (isProtected(el)) continue

      const elBox = getBox(el)

      for (let j = 0; j < i; j++) {
        const other = fixed[j]
        if (isProtected(other)) continue

        const otherBox = getBox(other)
        const area = overlapArea(elBox, otherBox)
        const minArea = Math.min(elBox.width * elBox.height, otherBox.width * otherBox.height)

        if (area > minArea * 0.05) {
          const newY = otherBox.y + otherBox.height + GAP
          el.y = newY
          elBox.y = newY
          hadCollision = true
        }
      }

      // Canvas bounds enforcement
      if (el.y + el.height > CANVAS_HEIGHT - 40) {
        const overflow = (el.y + el.height) - (CANVAS_HEIGHT - 40)
        if (el.height - overflow >= 40) {
          el.height = el.height - overflow
        } else {
          el.y = Math.min(el.y, CANVAS_HEIGHT - 80)
          el.height = Math.max(40, CANVAS_HEIGHT - 40 - el.y)
        }
      }
    }

    if (!hadCollision) break
  }

  return fixed
}
