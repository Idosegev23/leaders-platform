'use client'

import React, { useEffect } from 'react'
import type {
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  DesignSystem,
} from '@/types/presentation'
import { isTextElement, isImageElement, isShapeElement } from '@/types/presentation'

interface ElementRendererProps {
  element: SlideElement
  designSystem: DesignSystem
  isEditing?: boolean
  onTextChange?: (content: string) => void
}

function TextElementView({ element, isEditing, onTextChange }: {
  element: TextElement
  isEditing?: boolean
  onTextChange?: (content: string) => void
}) {
  const isGradientText = !!element.gradientFill
  const overflowVisible = ['title', 'subtitle', 'decorative'].includes(element.role || '')

  // Dynamically load custom font if specified
  useEffect(() => {
    if (element.fontFamily && element.fontFamily !== 'Heebo') {
      const encodedFont = encodeURIComponent(element.fontFamily)
      const linkId = `font-${encodedFont}`
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link')
        link.id = linkId
        link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@300;400;500;600;700;800;900&display=swap`
        document.head.appendChild(link)
      }
    }
  }, [element.fontFamily])

  const fontFamily = element.fontFamily || 'Heebo'

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    color: isGradientText ? 'transparent' : element.color,
    textAlign: element.textAlign,
    lineHeight: element.lineHeight || 1.3,
    letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : undefined,
    textDecoration: element.textDecoration !== 'none' ? element.textDecoration : undefined,
    textTransform: element.textTransform !== 'none' ? element.textTransform : undefined,
    fontFamily: `'${fontFamily}', sans-serif`,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflow: overflowVisible ? 'visible' : 'hidden',
    direction: 'rtl',
    backgroundColor: element.backgroundColor || undefined,
    borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined,
    padding: element.padding ? `${element.padding}px` : undefined,
    outline: 'none',
    cursor: isEditing ? 'text' : 'default',
    mixBlendMode: element.mixBlendMode !== 'normal' ? element.mixBlendMode : undefined,
    // Hollow/Stroke Typography
    ...(element.textStroke ? {
      WebkitTextStroke: `${element.textStroke.width}px ${element.textStroke.color}`,
    } : {}),
    // Gradient text fill (background-clip: text)
    ...(isGradientText ? {
      background: element.gradientFill,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
    } : {}),
  }

  if (isEditing) {
    return (
      <div
        contentEditable
        suppressContentEditableWarning
        style={style}
        onBlur={(e) => onTextChange?.(e.currentTarget.textContent || '')}
        dangerouslySetInnerHTML={{ __html: element.content }}
      />
    )
  }

  return <div style={style}>{element.content}</div>
}

function ImageElementView({ element }: { element: ImageElement }) {
  const [hasError, setHasError] = React.useState(false)
  const [retryCount, setRetryCount] = React.useState(0)

  // Reset error state when src changes
  React.useEffect(() => {
    setHasError(false)
    setRetryCount(0)
  }, [element.src])

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined,
    clipPath: element.clipPath || undefined,
    border: element.border || undefined,
  }

  const handleError = () => {
    // Retry once with cache-busted URL
    if (retryCount < 1 && element.src) {
      setRetryCount(prev => prev + 1)
      return
    }
    console.warn('[ElementRenderer] Image failed to load:', element.src?.slice(0, 80))
    setHasError(true)
  }

  // Build src with cache-busting on retry
  const imgSrc = retryCount > 0 && element.src
    ? `${element.src}${element.src.includes('?') ? '&' : '?'}t=${Date.now()}`
    : element.src

  return (
    <div style={containerStyle}>
      {hasError ? (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          color: '#666',
          fontSize: '12px',
          textAlign: 'center',
          padding: '8px',
        }}>
          <span>תמונה לא זמינה</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${element.src}-${retryCount}`}
          src={imgSrc}
          alt={element.alt || ''}
          style={{
            width: '100%',
            height: '100%',
            objectFit: element.objectFit,
            display: 'block',
          }}
          onError={handleError}
          draggable={false}
        />
      )}
    </div>
  )
}

function ShapeElementView({ element }: { element: ShapeElement }) {
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: element.borderRadius ? `${element.borderRadius}px` : undefined,
    clipPath: element.clipPath || undefined,
    border: element.border || undefined,
    mixBlendMode: element.mixBlendMode !== 'normal' ? element.mixBlendMode : undefined,
  }

  // Handle gradient or solid fill
  const fill = element.fill || '#e2e8f0'
  if (fill.includes('gradient') || fill.includes('linear') || fill.includes('radial')) {
    style.background = fill
  } else {
    style.backgroundColor = fill
  }

  return <div style={style} />
}

export default function ElementRenderer({
  element,
  designSystem: _designSystem,
  isEditing,
  onTextChange,
}: ElementRendererProps) {
  if (isTextElement(element)) {
    return <TextElementView element={element} isEditing={isEditing} onTextChange={onTextChange} />
  }
  if (isImageElement(element)) {
    return <ImageElementView element={element} />
  }
  if (isShapeElement(element)) {
    return <ShapeElementView element={element} />
  }
  return null
}
