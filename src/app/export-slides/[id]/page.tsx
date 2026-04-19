/**
 * Export Slides Page — renders all slides as static HTML for Playwright PDF capture.
 * URL: /export-slides/{documentId}
 *
 * No auth, no navigation, no interactivity — pure render only.
 * Each slide = 1920×1080 div with page-break-after.
 * Playwright navigates here and calls page.pdf().
 */

import { createClient } from '@supabase/supabase-js'
import type { Presentation, Slide, DesignSystem, SlideElement, BaseElement, TextElement, ImageElement, ShapeElement } from '@/types/presentation'

/** Service-role client — no cookies needed, bypasses RLS for headless export */
function getExportSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
import { borderRadiusToCss, maskToClipPath } from '@/types/presentation'

const W = 1920
const H = 1080

// ─── Background ─────────────────────────────────────────

function getBackgroundCSS(bg: Slide['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid': return { background: bg.value }
    case 'gradient': return { background: bg.value }
    case 'image': return { background: `url('${bg.value}') center/cover no-repeat` }
    default: return { background: '#1a1a2e' }
  }
}

// ─── 3D Transform ───────────────────────────────────────

function build3DTransform(el: BaseElement): string | undefined {
  const parts: string[] = []
  if (el.perspective) parts.push(`perspective(${el.perspective}px)`)
  if (el.rotateX) parts.push(`rotateX(${el.rotateX}deg)`)
  if (el.rotateY) parts.push(`rotateY(${el.rotateY}deg)`)
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`)
  return parts.length ? parts.join(' ') : undefined
}

// ─── Element Renderers ──────────────────────────────────

function RenderText({ el, defaultFont }: { el: TextElement; defaultFont: string }) {
  const fontFamily = el.fontFamily || defaultFont
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: el.fontSize || 16,
    fontWeight: el.fontWeight || 400,
    color: el.gradientFill ? 'transparent' : (el.color || '#F5F5F7'),
    textAlign: el.textAlign || 'right',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflow: ['title', 'subtitle', 'decorative'].includes(el.role || '') ? 'visible' : 'hidden',
    direction: 'rtl',
    fontFamily: `'${fontFamily}', sans-serif`,
    lineHeight: el.lineHeight || undefined,
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    textDecoration: el.textDecoration !== 'none' ? el.textDecoration : undefined,
    textTransform: el.textTransform !== 'none' ? el.textTransform : undefined,
    backgroundColor: el.backgroundColor || undefined,
    borderRadius: borderRadiusToCss(el.borderRadius) || undefined,
    padding: el.padding ? `${el.padding}px` : undefined,
    WebkitTextStroke: el.textStroke ? `${el.textStroke.width}px ${el.textStroke.color}` : undefined,
    textShadow: el.textShadow || undefined,
    boxShadow: el.boxShadow || undefined,
    mixBlendMode: (el.mixBlendMode && el.mixBlendMode !== 'normal') ? el.mixBlendMode as React.CSSProperties['mixBlendMode'] : undefined,
  }
  if (el.gradientFill) {
    style.background = el.gradientFill
    style.WebkitBackgroundClip = 'text'
    style.backgroundClip = 'text'
  }
  return <div style={style}>{el.content}</div>
}

function RenderImage({ el }: { el: ImageElement }) {
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: borderRadiusToCss(el.borderRadius) || undefined,
    clipPath: maskToClipPath(el.mask) || el.clipPath || undefined,
    border: el.border || undefined,
  }
  return (
    <div style={containerStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={el.src}
        alt={el.alt || ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: el.objectFit || 'cover',
          display: 'block',
          filter: el.filter || undefined,
        }}
      />
    </div>
  )
}

function RenderShape({ el }: { el: ShapeElement }) {
  const fill = el.fill || 'transparent'
  const isGradient = fill.includes('gradient') || fill.includes('linear') || fill.includes('radial')
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: isGradient ? fill : undefined,
    backgroundColor: !isGradient ? fill : undefined,
    borderRadius: borderRadiusToCss(el.borderRadius) || undefined,
    clipPath: maskToClipPath(el.mask) || el.clipPath || undefined,
    border: el.border || undefined,
    mixBlendMode: (el.mixBlendMode && el.mixBlendMode !== 'normal') ? el.mixBlendMode as React.CSSProperties['mixBlendMode'] : undefined,
    boxShadow: el.boxShadow || undefined,
    backdropFilter: el.backdropFilter || undefined,
    WebkitBackdropFilter: el.backdropFilter || undefined,
  }
  return <div style={style} />
}

function RenderElement({ el, defaultFont }: { el: SlideElement; defaultFont: string }) {
  switch (el.type) {
    case 'text': return <RenderText el={el as TextElement} defaultFont={defaultFont} />
    case 'image': return <RenderImage el={el as ImageElement} />
    case 'shape': return <RenderShape el={el as ShapeElement} />
    default: return null
  }
}

// ─── Slide Component ────────────────────────────────────

function ExportSlide({ slide, designSystem }: { slide: Slide; designSystem: DesignSystem }) {
  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)
  const font = designSystem.fonts.heading || 'Heebo'

  return (
    <div
      className="slide"
      data-rendered="true"
      data-slide-type={slide.slideType}
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: `'${font}', sans-serif`,
        direction: designSystem.direction || 'rtl',
        pageBreakAfter: 'always',
        ...getBackgroundCSS(slide.background),
      }}
    >
      {sorted.map((el) => {
        const transform = build3DTransform(el)
        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              zIndex: el.zIndex,
              opacity: el.opacity ?? 1,
              transform,
              transformStyle: transform ? 'preserve-3d' : undefined,
            }}
          >
            <RenderElement el={el} defaultFont={font} />
          </div>
        )
      })}
    </div>
  )
}

// ─── Page (Server Component) ────────────────────────────

export default async function ExportSlidesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let presentation: Presentation | null = null

  // Load from test-local or Supabase
  if (id === 'test-local') {
    try {
      const fs = await import('fs')
      const path = '/tmp/test-presentation.json'
      if (fs.existsSync(path)) {
        presentation = JSON.parse(fs.readFileSync(path, 'utf-8'))
      }
    } catch { /* ignore */ }
  }

  if (!presentation) {
    try {
      const supabase = getExportSupabase()
      const { data: doc } = await supabase.from('documents').select('data').eq('id', id).single()
      if (doc?.data) {
        presentation = (doc.data as Record<string, unknown>)._presentation as Presentation
      }
    } catch { /* ignore */ }
  }

  if (!presentation || !presentation.slides?.length) {
    return <div>No presentation found</div>
  }

  const fonts = new Set<string>([
    presentation.designSystem.fonts.heading || 'Heebo',
    presentation.designSystem.fonts.body || 'Heebo',
  ])
  for (const slide of presentation.slides) {
    for (const el of slide.elements) {
      if (el.type === 'text' && (el as TextElement).fontFamily) {
        fonts.add((el as TextElement).fontFamily!)
      }
    }
  }
  const fontFamilies = Array.from(fonts).map(f => `family=${encodeURIComponent(f)}:wght@100;200;300;400;500;600;700;800;900`).join('&')

  return (
    <html dir={presentation.designSystem.direction || 'rtl'} lang="he">
      <head>
        <meta charSet="UTF-8" />
        <link
          href={`https://fonts.googleapis.com/css2?${fontFamilies}&display=swap`}
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @page { size: ${W}px ${H}px; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: ${W}px; overflow-x: hidden; }
          body { font-family: 'Heebo', sans-serif; }
          html, body, div {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .slide * { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
          [style*="box-shadow"], [style*="text-shadow"] { -webkit-filter: blur(0) !important; }
        ` }} />
      </head>
      <body>
        {presentation.slides.map((slide) => (
          <ExportSlide
            key={slide.id}
            slide={slide}
            designSystem={presentation!.designSystem}
          />
        ))}
      </body>
    </html>
  )
}
