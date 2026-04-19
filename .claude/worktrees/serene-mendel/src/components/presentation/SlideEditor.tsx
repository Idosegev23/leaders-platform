'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import type { Slide, SlideElement, DesignSystem } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT, isTextElement } from '@/types/presentation'
import ElementRenderer from './ElementRenderer'
import GridOverlay from './GridOverlay'

function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

interface SlideEditorProps {
  slide: Slide
  designSystem: DesignSystem
  scale: number
  selectedElementId: string | null
  onElementSelect: (id: string | null) => void
  onElementUpdate: (id: string, changes: Partial<SlideElement>) => void
  onElementDelete?: (id: string) => void
  onDuplicateElement?: (id: string) => void
  gridSize?: number
  snapToGrid?: boolean
  gridVisible?: boolean
}

function getBackgroundStyle(bg: Slide['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid':
      return { background: bg.value }
    case 'gradient':
      return { background: bg.value }
    case 'image':
      return { background: `url('${bg.value}') center/cover no-repeat` }
    default:
      return { background: '#1a1a2e' }
  }
}

const GUIDE_SNAP_THRESHOLD = 8

interface GuideLine { pos: number; axis: 'x' | 'y' }

function computeGuides(
  dragged: { x: number; y: number; width: number; height: number },
  others: SlideElement[],
): GuideLine[] {
  const guides: GuideLine[] = []
  const dCx = dragged.x + dragged.width / 2
  const dCy = dragged.y + dragged.height / 2

  // Canvas center guides
  if (Math.abs(dCx - CANVAS_WIDTH / 2) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: CANVAS_WIDTH / 2, axis: 'x' })
  if (Math.abs(dCy - CANVAS_HEIGHT / 2) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: CANVAS_HEIGHT / 2, axis: 'y' })

  for (const el of others) {
    const eCx = el.x + el.width / 2
    const eCy = el.y + el.height / 2

    // Left/right edge alignment
    if (Math.abs(dragged.x - el.x) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.x, axis: 'x' })
    if (Math.abs(dragged.x + dragged.width - (el.x + el.width)) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.x + el.width, axis: 'x' })
    if (Math.abs(dragged.x - (el.x + el.width)) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.x + el.width, axis: 'x' })
    if (Math.abs(dragged.x + dragged.width - el.x) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.x, axis: 'x' })

    // Center alignment
    if (Math.abs(dCx - eCx) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: eCx, axis: 'x' })
    if (Math.abs(dCy - eCy) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: eCy, axis: 'y' })

    // Top/bottom edge alignment
    if (Math.abs(dragged.y - el.y) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.y, axis: 'y' })
    if (Math.abs(dragged.y + dragged.height - (el.y + el.height)) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.y + el.height, axis: 'y' })
    if (Math.abs(dragged.y - (el.y + el.height)) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.y + el.height, axis: 'y' })
    if (Math.abs(dragged.y + dragged.height - el.y) < GUIDE_SNAP_THRESHOLD) guides.push({ pos: el.y, axis: 'y' })
  }

  // Deduplicate
  const seen = new Set<string>()
  return guides.filter(g => {
    const key = `${g.axis}-${g.pos}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function SlideEditor({
  slide,
  designSystem,
  scale,
  selectedElementId,
  onElementSelect,
  onElementUpdate,
  onElementDelete,
  onDuplicateElement,
  gridSize = 80,
  snapToGrid = false,
  gridVisible = false,
}: SlideEditorProps) {
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return // Don't handle keys while editing text

      // Delete/Backspace — delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        const el = slide.elements.find(el => el.id === selectedElementId)
        if (el && !el.locked) {
          e.preventDefault()
          onElementDelete?.(selectedElementId)
        }
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        onElementSelect(null)
        setEditingTextId(null)
      }

      // Ctrl+D — duplicate selected element
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedElementId) {
        e.preventDefault()
        onDuplicateElement?.(selectedElementId)
      }

      // Arrow keys — nudge selected element (Shift = bigger step, with snap uses gridSize)
      if (selectedElementId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const el = slide.elements.find(el => el.id === selectedElementId)
        if (el && !el.locked) {
          e.preventDefault()
          const step = e.shiftKey ? (snapToGrid ? gridSize : 10) : 1
          const changes: Partial<SlideElement> = {}
          switch (e.key) {
            case 'ArrowUp': changes.y = el.y - step; break
            case 'ArrowDown': changes.y = el.y + step; break
            case 'ArrowLeft': changes.x = el.x - step; break
            case 'ArrowRight': changes.x = el.x + step; break
          }
          onElementUpdate(selectedElementId, changes)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElementId, editingTextId, slide.elements, onElementSelect, onElementDelete, onDuplicateElement, onElementUpdate, snapToGrid, gridSize])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas === 'true') {
      onElementSelect(null)
      setEditingTextId(null)
    }
  }, [onElementSelect])

  const handleElementClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onElementSelect(id)
    setEditingTextId(null)
  }, [onElementSelect])

  const handleElementDoubleClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const element = slide.elements.find(el => el.id === id)
    if (element && isTextElement(element) && !element.locked) {
      setEditingTextId(id)
      onElementSelect(id)
    }
  }, [slide.elements, onElementSelect])

  const handleTextChange = useCallback((id: string, content: string) => {
    onElementUpdate(id, { content } as Partial<SlideElement>)
    setEditingTextId(null)
  }, [onElementUpdate])

  return (
    <div
      ref={containerRef}
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scaled inner container */}
      <div
        data-canvas="true"
        onClick={handleCanvasClick}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: 'relative',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          fontFamily: `'${designSystem.fonts.heading}', sans-serif`,
          direction: designSystem.direction,
          cursor: 'default',
          ...getBackgroundStyle(slide.background),
        }}
      >
        <GridOverlay gridSize={gridSize} visible={gridVisible} />

        {/* Alignment guides */}
        {activeGuides.map((guide, i) => (
          <div
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              [guide.axis === 'x' ? 'left' : 'top']: guide.pos,
              [guide.axis === 'x' ? 'top' : 'left']: 0,
              [guide.axis === 'x' ? 'width' : 'height']: 1,
              [guide.axis === 'x' ? 'height' : 'width']: guide.axis === 'x' ? CANVAS_HEIGHT : CANVAS_WIDTH,
              background: '#f43f5e',
              opacity: 0.7,
              zIndex: 9998,
              pointerEvents: 'none' as const,
            }}
          />
        ))}

        {sortedElements.map((element) => {
          const isSelected = selectedElementId === element.id
          const isEditingText = editingTextId === element.id
          const isLocked = element.locked

          return (
            <Rnd
              key={element.id}
              size={{ width: element.width, height: element.height }}
              position={{ x: element.x, y: element.y }}
              scale={scale}
              disableDragging={isLocked || isEditingText}
              enableResizing={!isLocked && !isEditingText && isSelected}
              onDrag={(_e, d) => {
                const others = slide.elements.filter(el => el.id !== element.id)
                const guides = computeGuides(
                  { x: Math.round(d.x), y: Math.round(d.y), width: element.width, height: element.height },
                  others,
                )
                setActiveGuides(guides)
              }}
              onDragStop={(_e, d) => {
                setActiveGuides([])
                const x = snapToGrid ? snapValue(Math.round(d.x), gridSize) : Math.round(d.x)
                const y = snapToGrid ? snapValue(Math.round(d.y), gridSize) : Math.round(d.y)
                onElementUpdate(element.id, { x, y } as Partial<SlideElement>)
              }}
              onResizeStop={(_e, _direction, ref, _delta, position) => {
                const x = snapToGrid ? snapValue(Math.round(position.x), gridSize) : Math.round(position.x)
                const y = snapToGrid ? snapValue(Math.round(position.y), gridSize) : Math.round(position.y)
                const w = snapToGrid ? snapValue(Math.round(parseFloat(ref.style.width)), gridSize) : Math.round(parseFloat(ref.style.width))
                const h = snapToGrid ? snapValue(Math.round(parseFloat(ref.style.height)), gridSize) : Math.round(parseFloat(ref.style.height))
                onElementUpdate(element.id, { width: w, height: h, x, y } as Partial<SlideElement>)
              }}
              bounds="parent"
              style={{
                zIndex: element.zIndex,
                opacity: element.opacity ?? 1,
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                outline: isSelected ? '2px solid #3b82f6' : 'none',
                outlineOffset: '2px',
                cursor: isLocked ? 'default' : isEditingText ? 'text' : 'move',
              }}
              resizeHandleStyles={{
                topLeft: handleStyle,
                topRight: handleStyle,
                bottomLeft: handleStyle,
                bottomRight: handleStyle,
                top: { ...barStyle, top: -3, left: '20%', width: '60%', height: 6 },
                bottom: { ...barStyle, bottom: -3, left: '20%', width: '60%', height: 6 },
                left: { ...barStyle, left: -3, top: '20%', width: 6, height: '60%' },
                right: { ...barStyle, right: -3, top: '20%', width: 6, height: '60%' },
              }}
            >
              <div
                style={{ width: '100%', height: '100%', position: 'relative' }}
                onClick={(e) => handleElementClick(element.id, e)}
                onDoubleClick={(e) => handleElementDoubleClick(element.id, e)}
              >
                <ElementRenderer
                  element={element}
                  designSystem={designSystem}
                  isEditing={isEditingText}
                  onTextChange={(content) => handleTextChange(element.id, content)}
                />
              </div>
            </Rnd>
          )
        })}
      </div>
    </div>
  )
}

// Styles for resize handles
const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#3b82f6',
  borderRadius: '50%',
  border: '2px solid white',
  zIndex: 999,
}

const barStyle: React.CSSProperties = {
  background: 'transparent',
  cursor: 'default',
  zIndex: 998,
}
