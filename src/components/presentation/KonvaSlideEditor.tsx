'use client'

/**
 * KonvaSlideEditor — Canvas-based slide editor using react-konva.
 *
 * Replaces iframe+contentEditable approach with proper Canvas rendering:
 * - Real drag & drop with snap-to-grid
 * - Transformer handles (resize, rotate)
 * - Undo/Redo
 * - Properties panel integration
 *
 * Phase 1 (this file): Basic rendering + selection + transform.
 * Phase 2: Full editing (add/delete elements, text editing).
 * Phase 3: Replace HTML-native editor entirely.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer } from 'react-konva'
import type Konva from 'konva'

const CANVAS_W = 1920
const CANVAS_H = 1080

export interface KonvaElement {
  id: string
  type: 'text' | 'shape' | 'image'
  x: number
  y: number
  width: number
  height: number
  // Text
  text?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string // 'bold', 'italic', 'bold italic'
  fill?: string
  align?: string
  // Shape
  shapeFill?: string
  cornerRadius?: number
  opacity?: number
  // Image
  imageSrc?: string
}

export interface KonvaSlide {
  id: string
  background: string // CSS color or gradient (simplified to color for Konva)
  elements: KonvaElement[]
}

interface KonvaSlideEditorProps {
  slide: KonvaSlide
  scale?: number
  onSlideChange?: (slide: KonvaSlide) => void
  className?: string
}

export default function KonvaSlideEditor({
  slide,
  scale = 0.55,
  onSlideChange,
  className = '',
}: KonvaSlideEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<KonvaSlide[]>([slide])
  const [historyIndex, setHistoryIndex] = useState(0)
  const trRef = useRef<Konva.Transformer>(null)
  const stageRef = useRef<Konva.Stage>(null)

  // Update transformer when selection changes
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return
    if (selectedId) {
      const node = stageRef.current.findOne('#' + selectedId)
      if (node) {
        trRef.current.nodes([node])
        trRef.current.getLayer()?.batchDraw()
      }
    } else {
      trRef.current.nodes([])
    }
  }, [selectedId])

  // Undo/Redo with Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1)
          onSlideChange?.(history[historyIndex - 1])
        }
      }
      if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1)
          onSlideChange?.(history[historyIndex + 1])
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !(document.activeElement instanceof HTMLInputElement)) {
          const updated = {
            ...slide,
            elements: slide.elements.filter(el => el.id !== selectedId),
          }
          pushHistory(updated)
          setSelectedId(null)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, historyIndex, history, slide, onSlideChange])

  const pushHistory = useCallback((newSlide: KonvaSlide) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newSlide)
    if (newHistory.length > 30) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    onSlideChange?.(newSlide)
  }, [history, historyIndex, onSlideChange])

  const handleDragEnd = useCallback((id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const updated = {
      ...slide,
      elements: slide.elements.map(el =>
        el.id === id ? { ...el, x: e.target.x(), y: e.target.y() } : el
      ),
    }
    pushHistory(updated)
  }, [slide, pushHistory])

  const handleTransformEnd = useCallback((id: string, e: Konva.KonvaEventObject<Event>) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    const updated = {
      ...slide,
      elements: slide.elements.map(el =>
        el.id === id ? {
          ...el,
          x: node.x(),
          y: node.y(),
          width: Math.max(20, node.width() * scaleX),
          height: Math.max(20, node.height() * scaleY),
        } : el
      ),
    }
    pushHistory(updated)
  }, [slide, pushHistory])

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm border-b border-gray-700 rounded-t-lg text-[10px]">
        <span className="text-emerald-400 font-medium">Canvas Editor</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">גרירה = הזזה</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">handles = שינוי גודל</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">Ctrl+Z = undo</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">Delete = מחיקה</span>
      </div>

      <Stage
        ref={stageRef}
        width={CANVAS_W * scale}
        height={CANVAS_H * scale}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <Layer>
          {/* Background */}
          <Rect
            x={0} y={0}
            width={CANVAS_W} height={CANVAS_H}
            fill={slide.background || '#0C0C10'}
          />

          {/* Elements */}
          {slide.elements.map(el => {
            if (el.type === 'text') {
              return (
                <Text
                  key={el.id}
                  id={el.id}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  text={el.text || ''}
                  fontSize={el.fontSize || 24}
                  fontFamily={el.fontFamily || 'Heebo'}
                  fontStyle={el.fontStyle || 'normal'}
                  fill={el.fill || '#ffffff'}
                  align={el.align || 'right'}
                  opacity={el.opacity ?? 1}
                  draggable
                  onClick={() => setSelectedId(el.id)}
                  onTap={() => setSelectedId(el.id)}
                  onDragEnd={(e) => handleDragEnd(el.id, e)}
                  onTransformEnd={(e) => handleTransformEnd(el.id, e)}
                />
              )
            }
            if (el.type === 'shape') {
              return (
                <Rect
                  key={el.id}
                  id={el.id}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  fill={el.shapeFill || '#333'}
                  cornerRadius={el.cornerRadius || 0}
                  opacity={el.opacity ?? 1}
                  draggable
                  onClick={() => setSelectedId(el.id)}
                  onTap={() => setSelectedId(el.id)}
                  onDragEnd={(e) => handleDragEnd(el.id, e)}
                  onTransformEnd={(e) => handleTransformEnd(el.id, e)}
                />
              )
            }
            return null
          })}

          {/* Transformer (resize/rotate handles) */}
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) return oldBox
              return newBox
            }}
          />
        </Layer>
      </Stage>
    </div>
  )
}
