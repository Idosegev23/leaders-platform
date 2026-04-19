'use client'

import React from 'react'
import type { SlideElement } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/types/presentation'

type AlignDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

interface AlignmentToolbarProps {
  selectedElements: SlideElement[]
  onUpdateElement: (id: string, changes: Partial<SlideElement>) => void
}

export default function AlignmentToolbar({
  selectedElements,
  onUpdateElement,
}: AlignmentToolbarProps) {
  if (selectedElements.length < 2) return null

  const align = (direction: AlignDirection) => {
    const els = selectedElements

    switch (direction) {
      case 'left': {
        const minX = Math.min(...els.map(e => e.x))
        els.forEach(e => onUpdateElement(e.id, { x: minX }))
        break
      }
      case 'center': {
        const avgCx = els.reduce((sum, e) => sum + e.x + e.width / 2, 0) / els.length
        els.forEach(e => onUpdateElement(e.id, { x: Math.round(avgCx - e.width / 2) }))
        break
      }
      case 'right': {
        const maxRight = Math.max(...els.map(e => e.x + e.width))
        els.forEach(e => onUpdateElement(e.id, { x: maxRight - e.width }))
        break
      }
      case 'top': {
        const minY = Math.min(...els.map(e => e.y))
        els.forEach(e => onUpdateElement(e.id, { y: minY }))
        break
      }
      case 'middle': {
        const avgCy = els.reduce((sum, e) => sum + e.y + e.height / 2, 0) / els.length
        els.forEach(e => onUpdateElement(e.id, { y: Math.round(avgCy - e.height / 2) }))
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...els.map(e => e.y + e.height))
        els.forEach(e => onUpdateElement(e.id, { y: maxBottom - e.height }))
        break
      }
    }
  }

  const distribute = (axis: 'x' | 'y') => {
    if (selectedElements.length < 3) return
    const sorted = [...selectedElements].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    if (axis === 'x') {
      const totalWidth = sorted.reduce((sum, e) => sum + e.width, 0)
      const space = (last.x + last.width - first.x - totalWidth) / (sorted.length - 1)
      let currentX = first.x + first.width + space
      for (let i = 1; i < sorted.length - 1; i++) {
        onUpdateElement(sorted[i].id, { x: Math.round(currentX) })
        currentX += sorted[i].width + space
      }
    } else {
      const totalHeight = sorted.reduce((sum, e) => sum + e.height, 0)
      const space = (last.y + last.height - first.y - totalHeight) / (sorted.length - 1)
      let currentY = first.y + first.height + space
      for (let i = 1; i < sorted.length - 1; i++) {
        onUpdateElement(sorted[i].id, { y: Math.round(currentY) })
        currentY += sorted[i].height + space
      }
    }
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg" dir="rtl">
      <span className="text-blue-400 text-[10px] font-medium ml-1">{selectedElements.length} נבחרו</span>
      <div className="w-px h-4 bg-blue-500/20 mx-1" />

      {/* Horizontal alignment */}
      <AlignBtn onClick={() => align('left')} title="ישר לשמאל">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="2" x2="4" y2="22" /><rect x="4" y="6" width="12" height="4" rx="1" /><rect x="4" y="14" width="8" height="4" rx="1" />
        </svg>
      </AlignBtn>
      <AlignBtn onClick={() => align('center')} title="מרכז אופקית">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="2" x2="12" y2="22" /><rect x="6" y="6" width="12" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" />
        </svg>
      </AlignBtn>
      <AlignBtn onClick={() => align('right')} title="ישר לימין">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="20" y1="2" x2="20" y2="22" /><rect x="8" y="6" width="12" height="4" rx="1" /><rect x="12" y="14" width="8" height="4" rx="1" />
        </svg>
      </AlignBtn>

      <div className="w-px h-4 bg-blue-500/20 mx-0.5" />

      {/* Vertical alignment */}
      <AlignBtn onClick={() => align('top')} title="ישר למעלה">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="4" x2="22" y2="4" /><rect x="6" y="4" width="4" height="12" rx="1" /><rect x="14" y="4" width="4" height="8" rx="1" />
        </svg>
      </AlignBtn>
      <AlignBtn onClick={() => align('middle')} title="מרכז אנכית">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="12" x2="22" y2="12" /><rect x="6" y="6" width="4" height="12" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" />
        </svg>
      </AlignBtn>
      <AlignBtn onClick={() => align('bottom')} title="ישר למטה">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="20" x2="22" y2="20" /><rect x="6" y="8" width="4" height="12" rx="1" /><rect x="14" y="12" width="4" height="8" rx="1" />
        </svg>
      </AlignBtn>

      {/* Distribute (only 3+) */}
      {selectedElements.length >= 3 && (
        <>
          <div className="w-px h-4 bg-blue-500/20 mx-0.5" />
          <AlignBtn onClick={() => distribute('x')} title="חלק אופקית">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="8" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="8" rx="1" /><rect x="18" y="8" width="4" height="8" rx="1" />
            </svg>
          </AlignBtn>
          <AlignBtn onClick={() => distribute('y')} title="חלק אנכית">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="8" y="2" width="8" height="4" rx="1" /><rect x="8" y="10" width="8" height="4" rx="1" /><rect x="8" y="18" width="8" height="4" rx="1" />
            </svg>
          </AlignBtn>
        </>
      )}
    </div>
  )
}

function AlignBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1 text-blue-300/60 hover:text-blue-300 hover:bg-blue-500/20 rounded transition-colors"
    >
      {children}
    </button>
  )
}
