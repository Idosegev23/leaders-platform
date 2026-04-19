'use client'

/**
 * HtmlSlideViewer — renders a single HTML slide in a sandboxed iframe.
 * The iframe is 1920×1080 native, scaled down via CSS transform.
 * The wrapper div is sized to the SCALED dimensions to prevent layout overflow.
 */

interface HtmlSlideViewerProps {
  html: string
  scale?: number
  className?: string
  onClick?: () => void
  isActive?: boolean
}

export default function HtmlSlideViewer({
  html,
  scale = 1,
  className = '',
  onClick,
  isActive = false,
}: HtmlSlideViewerProps) {
  const W = 1920
  const H = 1080

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: Math.round(W * scale),
        height: Math.round(H * scale),
        cursor: onClick ? 'pointer' : 'default',
        outline: isActive ? '3px solid #3b82f6' : 'none',
        outlineOffset: '2px',
        borderRadius: 4,
      }}
      onClick={onClick}
    >
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
        title="Slide"
      />
    </div>
  )
}
