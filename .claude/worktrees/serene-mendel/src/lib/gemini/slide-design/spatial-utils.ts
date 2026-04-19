/**
 * Spatial utilities for the Slide Designer.
 * Overlap detection, area computation, balance scoring, and image placement.
 */

import type { SlideElement, ImageElement } from '@/types/presentation'
import type { BoundingBox } from './types'

export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

export function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image'
}

export function computeOccupiedArea(elements: BoundingBox[]): number {
  const canvasArea = 1920 * 1080
  let occupied = 0
  for (const el of elements) occupied += el.width * el.height
  return Math.min(occupied / canvasArea, 1)
}

export function computeBalanceScore(elements: BoundingBox[]): number {
  const cols = 4, rows = 3
  const cellW = 1920 / cols, cellH = 1080 / rows
  const cells = Array.from({ length: cols * rows }, () => 0)

  for (const el of elements) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * cellW, cy = r * cellH
        const overlapX = Math.max(0, Math.min(el.x + el.width, cx + cellW) - Math.max(el.x, cx))
        const overlapY = Math.max(0, Math.min(el.y + el.height, cy + cellH) - Math.max(el.y, cy))
        cells[r * cols + c] += overlapX * overlapY
      }
    }
  }

  const maxCell = Math.max(...cells)
  if (maxCell === 0) return 0.5
  const normalized = cells.map(c => c / maxCell)
  const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length
  const variance = normalized.reduce((a, b) => a + (b - mean) ** 2, 0) / normalized.length
  return Math.max(0, 1 - variance * 2)
}

/**
 * Find the best placement for an image by analyzing existing elements.
 * Scans the canvas for the largest unoccupied region.
 */
export function findBestImagePlacement(
  elements: SlideElement[],
  _bgColor: string,
): { x: number; y: number; width: number; height: number; fullBleed: boolean } {
  const contentBoxes = elements
    .filter(e => e.type === 'text' || (e.type === 'shape' && (e as SlideElement & { shapeType?: string }).shapeType !== 'background'))
    .map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height }))

  if (contentBoxes.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
  }

  const contentMinX = Math.min(...contentBoxes.map(b => b.x))
  const contentMaxX = Math.max(...contentBoxes.map(b => b.x + b.width))

  // Left half is free — place image there
  if (contentMinX > 800) {
    return { x: 0, y: 0, width: Math.min(contentMinX - 40, 960), height: 1080, fullBleed: false }
  }

  // Right half is free
  if (contentMaxX < 1120) {
    return { x: Math.max(contentMaxX + 40, 960), y: 0, width: 1920 - Math.max(contentMaxX + 40, 960), height: 1080, fullBleed: false }
  }

  // Content spans the width — check vertical space
  const contentMaxY = Math.max(...contentBoxes.map(b => b.y + b.height))

  // Bottom half is free
  if (contentMaxY < 600) {
    return { x: 80, y: contentMaxY + 40, width: 1760, height: 1080 - contentMaxY - 80, fullBleed: false }
  }

  // No clear empty space — use full-bleed behind content
  return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
}
