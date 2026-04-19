'use client'

import React, { useEffect } from 'react'
import type {
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  VideoElement,
  MockupElement,
  CompareElement,
  LogoStripElement,
  MapElement,
  DesignSystem,
} from '@/types/presentation'
import { isTextElement, isImageElement, isShapeElement, isVideoElement, isMockupElement, isCompareElement, isLogoStripElement, isMapElement, borderRadiusToCss, maskToClipPath, extractYouTubeId, extractVimeoId } from '@/types/presentation'
import DeviceMockup from './DeviceMockup'

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
    textShadow: element.textShadow || undefined,
    boxShadow: element.boxShadow || undefined,
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

  const resolvedClipPath = maskToClipPath(element.mask) || element.clipPath || undefined

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: borderRadiusToCss(element.borderRadius),
    clipPath: resolvedClipPath,
    border: element.border || undefined,
    boxShadow: element.boxShadow || undefined,
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
            filter: element.filter || undefined,
          }}
          onError={handleError}
          draggable={false}
        />
      )}
    </div>
  )
}

function ShapeElementView({ element }: { element: ShapeElement }) {
  const resolvedClipPath = maskToClipPath(element.mask) || element.clipPath || undefined

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    borderRadius: borderRadiusToCss(element.borderRadius),
    clipPath: resolvedClipPath,
    border: element.border || undefined,
    mixBlendMode: element.mixBlendMode !== 'normal' ? element.mixBlendMode : undefined,
    boxShadow: element.boxShadow || undefined,
    backdropFilter: element.backdropFilter || undefined,
    WebkitBackdropFilter: element.backdropFilter || undefined,
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

function VideoElementView({ element, isEditing }: { element: VideoElement; isEditing?: boolean }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const resolvedClipPath = maskToClipPath(element.mask) || undefined

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: borderRadiusToCss(element.borderRadius),
    clipPath: resolvedClipPath,
    position: 'relative',
    background: '#000',
  }

  // In editor: show poster/thumbnail with play icon overlay
  if (isEditing) {
    const ytId = element.videoProvider === 'youtube' ? extractYouTubeId(element.src) : null
    const vimeoId = element.videoProvider === 'vimeo' ? extractVimeoId(element.src) : null
    const poster = element.posterImage
      || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined)

    return (
      <div style={containerStyle}>
        {poster ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={poster} alt="video poster" style={{ width: '100%', height: '100%', objectFit: element.objectFit || 'cover', display: 'block' }} draggable={false} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#666', fontSize: 14 }}>{vimeoId ? 'Vimeo' : 'וידאו'}</span>
          </div>
        )}
        {/* Play icon overlay */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#000">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // In viewer: actual playback
  const ytId = element.videoProvider === 'youtube' ? extractYouTubeId(element.src) : null
  const vimeoId = element.videoProvider === 'vimeo' ? extractVimeoId(element.src) : null

  if (ytId) {
    return (
      <div style={containerStyle}>
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&rel=0`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      </div>
    )
  }

  if (vimeoId) {
    return (
      <div style={containerStyle}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay"
          allowFullScreen
        />
      </div>
    )
  }

  // Direct / storage video
  return (
    <div style={containerStyle}>
      <video
        ref={videoRef}
        src={element.src}
        poster={element.posterImage}
        autoPlay={element.autoPlay !== false}
        muted={element.muted !== false}
        loop={element.loop !== false}
        playsInline
        style={{ width: '100%', height: '100%', objectFit: element.objectFit || 'cover', display: 'block' }}
      />
    </div>
  )
}

// ─── Mockup Element ─────────────────────────────────

function MockupElementView({ element }: { element: MockupElement }) {
  const hasRealContent = element.contentType !== 'color' && !!element.contentSrc

  // For MagicUI devices, pass image/video via props (not children)
  const imageSrc = element.contentType === 'image' && element.contentSrc ? element.contentSrc : undefined
  const videoSrc = element.contentType === 'video' && element.contentSrc ? element.contentSrc : undefined

  // For frameset devices, render content as children
  const content = hasRealContent
    ? element.contentType === 'image'
      ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={element.contentSrc} alt="mockup content" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
      )
      : element.contentType === 'video'
        ? <video src={element.contentSrc} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: '#000' }} />
    : (
      // Empty state placeholder
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, color: 'rgba(255,255,255,0.3)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <span style={{ fontSize: 11, fontFamily: 'Heebo, sans-serif' }}>בחר תוכן בפאנל הצד</span>
      </div>
    )

  return (
    <DeviceMockup
      deviceType={element.deviceType}
      deviceColor={element.deviceColor}
      landscape={element.landscape}
      imageSrc={imageSrc}
      videoSrc={videoSrc}
    >
      {content}
    </DeviceMockup>
  )
}

// ─── Compare (Before/After) Element ─────────────────

function CompareElementView({ element }: { element: CompareElement }) {
  const [position, setPosition] = React.useState(element.initialPosition || 50)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)

  const handleMove = React.useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const isHorizontal = element.orientation === 'horizontal'
    const pos = isHorizontal
      ? ((clientX - rect.left) / rect.width) * 100
      : ((clientX - rect.top) / rect.height) * 100
    setPosition(Math.max(0, Math.min(100, pos)))
  }, [element.orientation])

  const onMouseDown = () => { dragging.current = true }
  const onMouseUp = () => { dragging.current = false }
  const onMouseMove = (e: React.MouseEvent) => { if (dragging.current) handleMove(e.clientX) }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: 'col-resize' }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onMouseMove={onMouseMove}
    >
      {/* After image (full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={element.afterImage} alt={element.afterLabel || 'after'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0 }} draggable={false} />
      {/* Before image (clipped) */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={element.beforeImage} alt={element.beforeLabel || 'before'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
      </div>
      {/* Divider line */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${position}%`, transform: 'translateX(-50%)',
        width: 3, background: 'white',
        boxShadow: '0 0 8px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 32, height: 32, borderRadius: '50%', background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2">
            <polyline points="7 8 3 12 7 16" /><polyline points="17 8 21 12 17 16" />
          </svg>
        </div>
      </div>
      {/* Labels */}
      {element.beforeLabel && (
        <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
          {element.beforeLabel}
        </span>
      )}
      {element.afterLabel && (
        <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
          {element.afterLabel}
        </span>
      )}
    </div>
  )
}

// ─── Logo Strip Element ─────────────────────────────

function LogoStripElementView({ element }: { element: LogoStripElement }) {
  const gap = element.gap || 60
  const logos = element.logos || []
  if (logos.length === 0) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12 }}>הוסף לוגואים</div>
  }

  // Duplicate logos for infinite scroll
  const allLogos = [...logos, ...logos]
  const speed = element.speed || 40
  const totalWidth = allLogos.length * (element.height * 1.5 + gap)
  const duration = totalWidth / speed

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap,
          animation: `logoScroll ${duration}s linear infinite`,
          direction: element.direction === 'ltr' ? 'ltr' : 'rtl',
        }}
      >
        {allLogos.map((logo, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${logo}-${i}`}
            src={logo}
            alt=""
            style={{
              height: element.height * 0.6,
              width: 'auto',
              objectFit: 'contain',
              filter: element.grayscale ? 'grayscale(100%)' : undefined,
              transition: 'filter 0.3s',
              flexShrink: 0,
            }}
            draggable={false}
            onMouseEnter={(e) => { if (element.grayscale) (e.target as HTMLElement).style.filter = 'grayscale(0%)' }}
            onMouseLeave={(e) => { if (element.grayscale) (e.target as HTMLElement).style.filter = 'grayscale(100%)' }}
          />
        ))}
      </div>
      <style>{`
        @keyframes logoScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

// ─── Map Element ────────────────────────────────────

function MapElementView({ element }: { element: MapElement }) {
  const zoom = element.zoom || 15
  const q = encodeURIComponent(element.address || '')
  const mapUrl = element.lat && element.lng
    ? `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d3000!2d${element.lng}!3d${element.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f${zoom}!5e0!3m2!1sen!2sil`
    : `https://www.google.com/maps/embed/v1/place?key=&q=${q}&zoom=${zoom}`

  const brCss = borderRadiusToCss(element.borderRadius)

  return (
    <div style={{ width: '100%', height: '100%', borderRadius: brCss, overflow: 'hidden', background: '#1a1a2e' }}>
      {q || (element.lat && element.lng) ? (
        <iframe
          src={mapUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12 }}>
          הזן כתובת במאפיינים
        </div>
      )}
    </div>
  )
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
  if (isVideoElement(element)) {
    return <VideoElementView element={element} isEditing={isEditing} />
  }
  if (isMockupElement(element)) {
    return <MockupElementView element={element} />
  }
  if (isCompareElement(element)) {
    return <CompareElementView element={element} />
  }
  if (isLogoStripElement(element)) {
    return <LogoStripElementView element={element} />
  }
  if (isMapElement(element)) {
    return <MapElementView element={element} />
  }
  return null
}
