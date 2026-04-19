'use client'

import React from 'react'
import type { Slide, SlideElement } from '@/types/presentation'
import { isTextElement, isImageElement, isShapeElement } from '@/types/presentation'

interface LayerPanelProps {
  slide: Slide
  selectedElementId: string | null
  selectedElementIds: string[]
  onElementSelect: (id: string | null) => void
  onBringToFront: (id: string) => void
  onSendToBack: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onToggleLock: (id: string, locked: boolean) => void
  isOpen: boolean
  onToggle: () => void
}

function getElementIcon(el: SlideElement): string {
  if (isTextElement(el)) return 'T'
  if (isImageElement(el)) return '\u{1F5BC}' // frame with picture
  if (isShapeElement(el)) return '\u25A0' // filled square
  return '?'
}

function getElementLabel(el: SlideElement): string {
  if (isTextElement(el)) {
    const roleLabels: Record<string, string> = {
      title: 'כותרת', subtitle: 'כותרת משנית', body: 'גוף', caption: 'כיתוב',
      'metric-value': 'מדד', 'metric-label': 'תווית', 'list-item': 'פריט', tag: 'תגית', decorative: 'דקורטיבי',
    }
    const label = roleLabels[el.role || ''] || 'טקסט'
    const preview = el.content.slice(0, 20) + (el.content.length > 20 ? '...' : '')
    return `${label}: ${preview}`
  }
  if (isImageElement(el)) return el.alt || 'תמונה'
  if (isShapeElement(el)) {
    const shapes: Record<string, string> = { rectangle: 'מלבן', circle: 'עיגול', line: 'קו', decorative: 'דקורטיבי', background: 'רקע', divider: 'מפריד' }
    return shapes[el.shapeType] || 'צורה'
  }
  return 'אלמנט'
}

export default function LayerPanel({
  slide,
  selectedElementId,
  selectedElementIds,
  onElementSelect,
  onBringToFront,
  onSendToBack,
  onMoveUp,
  onMoveDown,
  onToggleLock,
  isOpen,
  onToggle,
}: LayerPanelProps) {
  // Sort by zIndex descending (highest = top of list)
  const sortedElements = [...slide.elements].sort((a, b) => b.zIndex - a.zIndex)

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`absolute top-2 left-2 z-50 p-1.5 rounded-lg text-[10px] font-medium transition-colors ${
          isOpen
            ? 'bg-white/20 text-white ring-1 ring-white/30'
            : 'bg-black/40 backdrop-blur-sm text-gray-400 hover:text-white hover:bg-black/60'
        }`}
        title="שכבות"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="absolute top-10 left-2 z-50 w-[200px] bg-[#12121f]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          dir="rtl"
        >
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
            <span className="text-white text-[11px] font-medium">שכבות</span>
            <span className="text-gray-600 text-[9px]">{slide.elements.length}</span>
          </div>

          <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
            {sortedElements.map((el) => {
              const isSelected = selectedElementId === el.id || selectedElementIds.includes(el.id)
              return (
                <div
                  key={el.id}
                  onClick={() => onElementSelect(el.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors text-[10px] border-b border-white/[0.03] ${
                    isSelected
                      ? 'bg-blue-500/15 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
                  }`}
                >
                  {/* Type icon */}
                  <span className="w-4 text-center text-[11px] opacity-60 flex-shrink-0">
                    {getElementIcon(el)}
                  </span>

                  {/* Label */}
                  <span className="flex-1 truncate">{getElementLabel(el)}</span>

                  {/* Lock */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(el.id, !el.locked) }}
                    className={`p-0.5 rounded transition-colors ${
                      el.locked ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
                    }`}
                    title={el.locked ? 'בטל נעילה' : 'נעל'}
                  >
                    {el.locked ? '\u{1F512}' : '\u{1F513}'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Layer controls (for selected element) */}
          {selectedElementId && (
            <div className="px-2 py-1.5 border-t border-white/5 flex items-center gap-0.5 justify-center">
              <LayerBtn onClick={() => onBringToFront(selectedElementId)} title="הבא לחזית">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="17 11 12 6 7 11" /><line x1="12" y1="6" x2="12" y2="18" />
                  <line x1="5" y1="3" x2="19" y2="3" />
                </svg>
              </LayerBtn>
              <LayerBtn onClick={() => onMoveUp(selectedElementId)} title="העלה שכבה">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="17 14 12 9 7 14" />
                </svg>
              </LayerBtn>
              <LayerBtn onClick={() => onMoveDown(selectedElementId)} title="הורד שכבה">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="7 10 12 15 17 10" />
                </svg>
              </LayerBtn>
              <LayerBtn onClick={() => onSendToBack(selectedElementId)} title="שלח לרקע">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="7 13 12 18 17 13" /><line x1="12" y1="18" x2="12" y2="6" />
                  <line x1="5" y1="21" x2="19" y2="21" />
                </svg>
              </LayerBtn>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function LayerBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
    >
      {children}
    </button>
  )
}
