'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import type { Slide, SlideElement, DesignSystem, BaseElement } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT, isTextElement } from '@/types/presentation'
import ElementRenderer from './ElementRenderer'
import GridOverlay from './GridOverlay'

function build3DTransform(el: BaseElement): string | undefined {
  const parts: string[] = []
  if (el.perspective) parts.push(`perspective(${el.perspective}px)`)
  if (el.rotateX) parts.push(`rotateX(${el.rotateX}deg)`)
  if (el.rotateY) parts.push(`rotateY(${el.rotateY}deg)`)
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`)
  return parts.length ? parts.join(' ') : undefined
}

function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

interface SlideEditorProps {
  slide: Slide
  designSystem: DesignSystem
  scale: number
  selectedElementId: string | null
  selectedElementIds?: string[]
  onElementSelect: (id: string | null) => void
  onAddToSelection?: (id: string) => void
  onRemoveFromSelection?: (id: string) => void
  onSelectElements?: (ids: string[]) => void
  onElementUpdate: (id: string, changes: Partial<SlideElement>) => void
  onUpdateElements?: (ids: string[], changes: Partial<SlideElement>) => void
  onElementDelete?: (id: string) => void
  onDeleteElements?: (ids: string[]) => void
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
  selectedElementIds = [],
  onElementSelect,
  onAddToSelection,
  onRemoveFromSelection,
  onSelectElements,
  onElementUpdate,
  onUpdateElements,
  onElementDelete,
  onDeleteElements,
  onDuplicateElement,
  gridSize = 80,
  snapToGrid = false,
  gridVisible = false,
}: SlideEditorProps) {
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const isMultiSelected = selectedElementIds.length > 1

  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return // Don't handle keys while editing text

      // Delete/Backspace — delete selected element(s)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
        const unlocked = selectedElementIds.filter(id => {
          const el = slide.elements.find(el => el.id === id)
          return el && !el.locked
        })
        if (unlocked.length > 0) {
          e.preventDefault()
          if (unlocked.length > 1 && onDeleteElements) {
            onDeleteElements(unlocked)
          } else {
            onElementDelete?.(unlocked[0])
          }
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
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

      // Ctrl+A — select all elements
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        onSelectElements?.(slide.elements.map(e => e.id))
      }

      // Ctrl+D — duplicate selected element
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedElementId) {
        e.preventDefault()
        onDuplicateElement?.(selectedElementId)
      }

      // Arrow keys — nudge selected element(s)
      if ((selectedElementId || selectedElementIds.length > 0) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const idsToNudge = selectedElementIds.length > 0 ? selectedElementIds : (selectedElementId ? [selectedElementId] : [])
        const step = e.shiftKey ? (snapToGrid ? gridSize : 10) : 1

        for (const id of idsToNudge) {
          const el = slide.elements.find(el => el.id === id)
          if (el && !el.locked) {
            e.preventDefault()
            const changes: Partial<SlideElement> = {}
            switch (e.key) {
              case 'ArrowUp': changes.y = el.y - step; break
              case 'ArrowDown': changes.y = el.y + step; break
              case 'ArrowLeft': changes.x = el.x - step; break
              case 'ArrowRight': changes.x = el.x + step; break
            }
            onElementUpdate(id, changes)
          }
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

  // Selection box (rubber band)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset?.canvas) return
    if (e.button !== 0) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y })
  }, [scale])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectionBox) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null)
  }, [selectionBox, scale])

  const handleCanvasMouseUp = useCallback(() => {
    if (!selectionBox) return
    const left = Math.min(selectionBox.startX, selectionBox.endX)
    const right = Math.max(selectionBox.startX, selectionBox.endX)
    const top = Math.min(selectionBox.startY, selectionBox.endY)
    const bottom = Math.max(selectionBox.startY, selectionBox.endY)

    // Only select if the box is big enough (>5px)
    if (right - left > 5 && bottom - top > 5) {
      const selected = slide.elements
        .filter(el => {
          const elRight = el.x + el.width
          const elBottom = el.y + el.height
          return el.x < right && elRight > left && el.y < bottom && elBottom > top
        })
        .map(el => el.id)

      if (selected.length > 0 && onSelectElements) {
        onSelectElements(selected)
      }
    }
    setSelectionBox(null)
  }, [selectionBox, slide.elements, onSelectElements])

  const handleElementClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.shiftKey && onAddToSelection) {
      // Shift+Click: toggle in multi-selection
      if (selectedElementIds.includes(id)) {
        onRemoveFromSelection?.(id)
      } else {
        onAddToSelection(id)
      }
    } else {
      onElementSelect(id)
    }
    setEditingTextId(null)
  }, [onElementSelect, onAddToSelection, onRemoveFromSelection, selectedElementIds])

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

  // ─── Rotation handle ─────────────────────────────
  const [isRotating, setIsRotating] = useState(false)
  const rotationRef = useRef<{ elementId: string; centerX: number; centerY: number; startAngle: number } | null>(null)

  const handleRotationStart = useCallback((elementId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const element = slide.elements.find(el => el.id === elementId)
    if (!element) return

    const centerX = (element.x + element.width / 2) * scale
    const centerY = (element.y + element.height / 2) * scale

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const startAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI)

    rotationRef.current = { elementId, centerX, centerY, startAngle: startAngle - (element.rotation || 0) }
    setIsRotating(true)

    const handleMouseMove = (ev: MouseEvent) => {
      if (!rotationRef.current || !rect) return
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      let angle = Math.atan2(my - rotationRef.current.centerY, mx - rotationRef.current.centerX) * (180 / Math.PI) - rotationRef.current.startAngle
      // Snap to 15deg with Shift
      if (ev.shiftKey) angle = Math.round(angle / 15) * 15
      onElementUpdate(rotationRef.current.elementId, { rotation: Math.round(angle) } as Partial<SlideElement>)
    }

    const handleMouseUp = () => {
      setIsRotating(false)
      rotationRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [slide.elements, scale, onElementUpdate])

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
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => selectionBox && setSelectionBox(null)}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: 'relative',
          overflow: 'clip',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          transformStyle: 'preserve-3d',
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

        {/* Selection box (rubber band) */}
        {selectionBox && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.endX - selectionBox.startX),
              height: Math.abs(selectionBox.endY - selectionBox.startY),
              border: '1px dashed #3b82f6',
              background: 'rgba(59, 130, 246, 0.1)',
              zIndex: 9999,
              pointerEvents: 'none' as const,
            }}
          />
        )}

        {sortedElements.map((element) => {
          const isSelected = selectedElementId === element.id || selectedElementIds.includes(element.id)
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
                outline: isSelected ? '2px solid #3b82f6' : 'none',
                outlineOffset: '2px',
                cursor: isLocked ? 'default' : isEditingText ? 'text' : 'move',
              }}
              resizeHandleStyles={isSelected && !isLocked && !isEditingText ? {
                topLeft: handleStyle,
                topRight: handleStyle,
                bottomLeft: handleStyle,
                bottomRight: handleStyle,
                top: { ...barStyle, top: -3, left: '20%', width: '60%', height: 6 },
                bottom: { ...barStyle, bottom: -3, left: '20%', width: '60%', height: 6 },
                left: { ...barStyle, left: -3, top: '20%', width: 6, height: '60%' },
                right: { ...barStyle, right: -3, top: '20%', width: 6, height: '60%' },
              } : {
                topLeft: { display: 'none' }, topRight: { display: 'none' },
                bottomLeft: { display: 'none' }, bottomRight: { display: 'none' },
                top: { display: 'none' }, bottom: { display: 'none' },
                left: { display: 'none' }, right: { display: 'none' },
              }}
            >
              <div
                style={{
                  width: '100%', height: '100%', position: 'relative',
                  opacity: element.opacity ?? 1,
                  transform: build3DTransform(element),
                  transformStyle: 'preserve-3d',
                }}
                onClick={(e) => handleElementClick(element.id, e)}
                onDoubleClick={(e) => handleElementDoubleClick(element.id, e)}
              >
                <ElementRenderer
                  element={element}
                  designSystem={designSystem}
                  isEditing={isEditingText}
                  onTextChange={(content) => handleTextChange(element.id, content)}
                />
                {/* Rotation handle */}
                {isSelected && !isLocked && !isEditingText && !isMultiSelected && (
                  <div
                    onMouseDown={(e) => handleRotationStart(element.id, e)}
                    style={{
                      position: 'absolute',
                      top: -30,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#22c55e',
                      border: '2px solid white',
                      cursor: 'grab',
                      zIndex: 1000,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}
                    title={`סיבוב: ${element.rotation || 0}°`}
                  />
                )}
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
