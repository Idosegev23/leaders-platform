/**
 * Grid System — 12-column grid with safe margins + RTL support
 *
 * Canvas: 1920 × 1080
 * Safe margin: 80px → Usable: 1760 × 920
 * 12 columns with configurable gutter
 */

import type { Grid, GridConfig, Rect, TitlePlacement } from '../types'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types'

const DEFAULT_CONFIG: GridConfig = {
  columns: 12,
  gutter: 24,
  margin: 80,
  canvasWidth: CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
  direction: 'rtl',
}

export function createGrid(overrides?: Partial<GridConfig>): Grid {
  const cfg = { ...DEFAULT_CONFIG, ...overrides }
  const direction = cfg.direction || 'rtl'

  const usableX = cfg.margin
  const usableY = cfg.margin
  const usableW = cfg.canvasWidth - cfg.margin * 2
  const usableH = cfg.canvasHeight - cfg.margin * 2

  const totalGutters = cfg.columns - 1
  const colWidth = (usableW - totalGutters * cfg.gutter) / cfg.columns

  const usable: Rect = { x: usableX, y: usableY, width: usableW, height: usableH }

  return {
    usable,

    col(start: number, span: number) {
      const s = Math.max(1, Math.min(start, cfg.columns)) - 1
      const guttersSpanned = Math.max(0, span - 1)
      const x = usableX + s * (colWidth + cfg.gutter)
      const width = span * colWidth + guttersSpanned * cfg.gutter
      return { x: Math.round(x), width: Math.round(width) }
    },

    colRTL(start: number, span: number) {
      if (direction === 'ltr') return this.col(start, span)
      // Mirror: col 1 from right = col (columns - start - span + 2) from left
      const mirroredStart = cfg.columns - start - span + 2
      return this.col(mirroredStart, span)
    },

    zone(placement: TitlePlacement) {
      const zoneHeight = Math.round(usableH / 3)
      switch (placement) {
        case 'top':
          return { y: usableY, height: zoneHeight }
        case 'center':
          return { y: usableY + zoneHeight, height: zoneHeight }
        case 'bottom':
          return { y: usableY + zoneHeight * 2, height: zoneHeight }
      }
    },

    centerY(blockHeight: number) {
      return Math.round(usableY + (usableH - blockHeight) / 2)
    },

    bentoCell(row, col, rowSpan, colSpan, totalRows, totalCols, gap) {
      const cellW = (usableW - (totalCols - 1) * gap) / totalCols
      const cellH = (usableH - (totalRows - 1) * gap) / totalRows

      return {
        x: Math.round(usableX + col * (cellW + gap)),
        y: Math.round(usableY + row * (cellH + gap)),
        width: Math.round(colSpan * cellW + (colSpan - 1) * gap),
        height: Math.round(rowSpan * cellH + (rowSpan - 1) * gap),
      }
    },
  }
}
