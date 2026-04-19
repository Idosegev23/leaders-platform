'use client'

import React from 'react'
import type { Slide, DesignSystem, BaseElement } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/types/presentation'
import ElementRenderer from './ElementRenderer'

interface SlideViewerProps {
  slide: Slide
  designSystem: DesignSystem
  scale?: number
  className?: string
}

function build3DTransform(el: BaseElement): string | undefined {
  const parts: string[] = []
  if (el.perspective) parts.push(`perspective(${el.perspective}px)`)
  if (el.rotateX) parts.push(`rotateX(${el.rotateX}deg)`)
  if (el.rotateY) parts.push(`rotateY(${el.rotateY}deg)`)
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`)
  return parts.length ? parts.join(' ') : undefined
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

/**
 * Read-only slide renderer.
 * Takes a Slide AST and renders it as positioned React elements.
 * Used for: thumbnails, print page, PDF export.
 */
export default function SlideViewer({
  slide,
  designSystem,
  scale = 1,
  className = '',
}: SlideViewerProps) {
  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div
      className={className}
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
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
          ...getBackgroundStyle(slide.background),
        }}
      >
        {sortedElements.map((element) => (
          <div
            key={element.id}
            style={{
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              zIndex: element.zIndex,
              opacity: element.opacity ?? 1,
              transform: build3DTransform(element),
            }}
          >
            <ElementRenderer element={element} designSystem={designSystem} />
          </div>
        ))}
      </div>
    </div>
  )
}
