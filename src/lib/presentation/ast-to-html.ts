/**
 * AST → HTML Converter
 * Converts Presentation AST to self-contained HTML slides for PDF export.
 * This is the ONLY place in the app that generates HTML from the AST.
 */

import type {
  Presentation,
  Slide,
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
import { borderRadiusToCss, maskToClipPath, extractYouTubeId, extractVimeoId } from '@/types/presentation'

const W = 1920
const H = 1080

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

function sanitizeUrl(url: string): string {
  if (!url) return ''
  const lower = url.trim().toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:text/html') || lower.startsWith('vbscript:')) {
    return ''
  }
  return url
}

function renderBackground(bg: Slide['background']): string {
  switch (bg.type) {
    case 'solid':
      return `background: ${bg.value};`
    case 'gradient':
      return `background: ${bg.value};`
    case 'image':
      return `background: url('${sanitizeUrl(bg.value)}') center/cover no-repeat;`
    default:
      return 'background: #1a1a2e;'
  }
}

function renderTextElement(el: TextElement, defaultFont: string, pdfMode = false): string {
  const isGradientText = !!el.gradientFill
  const fontFamily = el.fontFamily || defaultFont || 'Heebo'
  const overflowVisible = ['title', 'subtitle', 'decorative'].includes(el.role || '')

  // Keep gradient text in PDF — it renders correctly via screenshot, rasterization is acceptable
  const useGradient = isGradientText
  const effectiveOpacity = el.opacity ?? 1

  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `font-size: ${el.fontSize || 16}px`,
    `font-weight: ${el.fontWeight || 400}`,
    `color: ${useGradient ? 'transparent' : (el.color || '#F5F5F7')}`,
    `text-align: ${el.textAlign || 'right'}`,
    `white-space: pre-wrap`,
    `word-wrap: break-word`,
    `overflow: ${overflowVisible ? 'visible' : 'hidden'}`,
    `direction: rtl`,
    `font-family: '${fontFamily}', sans-serif`,
  ]

  if (el.lineHeight) styles.push(`line-height: ${el.lineHeight}`)
  if (el.letterSpacing) styles.push(`letter-spacing: ${el.letterSpacing}px`)
  if (el.textDecoration && el.textDecoration !== 'none') styles.push(`text-decoration: ${el.textDecoration}`)
  if (el.textTransform && el.textTransform !== 'none') styles.push(`text-transform: ${el.textTransform}`)
  if (effectiveOpacity !== 1) styles.push(`opacity: ${effectiveOpacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)
  if (el.backgroundColor) styles.push(`background-color: ${el.backgroundColor}`)
  const brCss = borderRadiusToCss(el.borderRadius)
  if (brCss) styles.push(`border-radius: ${brCss}`)
  if (el.padding) styles.push(`padding: ${el.padding}px`)
  if (el.mixBlendMode && el.mixBlendMode !== 'normal') styles.push(`mix-blend-mode: ${el.mixBlendMode}`)
  if (el.textStroke) {
    styles.push(`-webkit-text-stroke: ${el.textStroke.width}px ${el.textStroke.color}`)
  }
  if (el.textShadow) styles.push(`text-shadow: ${el.textShadow}`)
  if (el.boxShadow) styles.push(`box-shadow: ${el.boxShadow}`)
  if (useGradient) {
    styles.push(`background: ${el.gradientFill}`)
    styles.push(`-webkit-background-clip: text`)
    styles.push(`background-clip: text`)
  }

  return `<div style="${styles.join('; ')}">${escapeHtml(el.content)}</div>`
}

function renderImageElement(el: ImageElement, _pdfMode = false): string {
  const containerStyles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `overflow: hidden`,
  ]

  const imgBrCss = borderRadiusToCss(el.borderRadius)
  if (imgBrCss) containerStyles.push(`border-radius: ${imgBrCss}`)
  const imgClipPath = maskToClipPath(el.mask) || el.clipPath
  if (imgClipPath) containerStyles.push(`clip-path: ${imgClipPath}`)
  if (el.border) containerStyles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) containerStyles.push(`opacity: ${el.opacity}`)
  if (el.rotation) containerStyles.push(`transform: rotate(${el.rotation}deg)`)
  if (el.boxShadow) containerStyles.push(`box-shadow: ${el.boxShadow}`)

  const imgStyles = [
    `width: 100%`,
    `height: 100%`,
    `object-fit: ${el.objectFit || 'cover'}`,
    `display: block`,
  ]
  if (el.filter) imgStyles.push(`filter: ${el.filter}`)

  return `<div style="${containerStyles.join('; ')}"><img src="${sanitizeUrl(el.src)}" alt="${escapeHtml(el.alt || '')}" style="${imgStyles.join('; ')}" /></div>`
}

function renderShapeElement(el: ShapeElement, _pdfMode = false): string {
  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
  ]

  // Fill can be a color, gradient, or missing
  const fill = el.fill || 'transparent'
  if (fill.includes('gradient') || fill.includes('linear') || fill.includes('radial')) {
    styles.push(`background: ${fill}`)
  } else {
    styles.push(`background-color: ${fill}`)
  }

  const shapeBrCss = borderRadiusToCss(el.borderRadius)
  if (shapeBrCss) styles.push(`border-radius: ${shapeBrCss}`)
  const shapeClipPath = maskToClipPath(el.mask) || el.clipPath
  if (shapeClipPath) styles.push(`clip-path: ${shapeClipPath}`)
  if (el.border) styles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)
  if (el.mixBlendMode && el.mixBlendMode !== 'normal') styles.push(`mix-blend-mode: ${el.mixBlendMode}`)
  if (el.boxShadow) styles.push(`box-shadow: ${el.boxShadow}`)
  if (el.backdropFilter) {
    styles.push(`backdrop-filter: ${el.backdropFilter}`)
    styles.push(`-webkit-backdrop-filter: ${el.backdropFilter}`)
  }

  return `<div style="${styles.join('; ')}"></div>`
}

function renderVideoElement(el: VideoElement, _pdfMode = false): string {
  const containerStyles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `overflow: hidden`,
    `background: #000`,
  ]

  const brCss = borderRadiusToCss(el.borderRadius)
  if (brCss) containerStyles.push(`border-radius: ${brCss}`)
  const clipPath = maskToClipPath(el.mask)
  if (clipPath) containerStyles.push(`clip-path: ${clipPath}`)
  if (el.opacity !== undefined && el.opacity !== 1) containerStyles.push(`opacity: ${el.opacity}`)
  if (el.rotation) containerStyles.push(`transform: rotate(${el.rotation}deg)`)

  // For PDF: show poster image or YouTube thumbnail
  const ytId = el.videoProvider === 'youtube' ? extractYouTubeId(el.src) : null
  const poster = el.posterImage || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '')

  if (poster) {
    return `<div style="${containerStyles.join('; ')}"><img src="${sanitizeUrl(poster)}" alt="video" style="width: 100%; height: 100%; object-fit: ${el.objectFit || 'cover'}; display: block;" /><div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3);"><div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center;"><svg width="28" height="28" viewBox="0 0 24 24" fill="#000"><polygon points="6,3 20,12 6,21"/></svg></div></div></div>`
  }

  return `<div style="${containerStyles.join('; ')}"><div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #666; font-size: 14px;">וידאו</div></div>`
}

function renderMockupElement(el: MockupElement): string {
  const styles = [
    `position: absolute`, `left: ${el.x}px`, `top: ${el.y}px`,
    `width: ${el.width}px`, `height: ${el.height}px`, `z-index: ${el.zIndex}`,
  ]
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)

  const frameColor = (el.deviceColor === 'white' || el.deviceColor === 'gold') ? '#f5f5f7' : el.deviceColor === 'silver' ? '#e0e0e0' : '#1d1d1f'
  const isPhone = el.deviceType.includes('iPhone') || el.deviceType.includes('Galaxy') || el.deviceType.includes('Nexus') || el.deviceType.includes('Lumia') || el.deviceType.includes('HTC') || el.deviceType.includes('Samsung')
  const borderRadius = isPhone ? el.width * 0.12 : el.deviceType.includes('MacBook') ? el.width * 0.02 : el.width * 0.04
  const content = el.contentType === 'image' && el.contentSrc
    ? `<img src="${sanitizeUrl(el.contentSrc)}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;" />`
    : `<div style="width: 100%; height: 100%; background: ${el.contentSrc || '#1a1a2e'};"></div>`

  return `<div style="${styles.join('; ')}"><div style="width: 100%; height: 100%; background: ${frameColor}; border-radius: ${borderRadius}px; padding: 4%; box-shadow: 0 20px 60px rgba(0,0,0,0.4); display: flex;"><div style="flex: 1; border-radius: ${borderRadius * 0.5}px; overflow: hidden; background: #000;">${content}</div></div></div>`
}

function renderCompareElement(el: CompareElement): string {
  const styles = [
    `position: absolute`, `left: ${el.x}px`, `top: ${el.y}px`,
    `width: ${el.width}px`, `height: ${el.height}px`, `z-index: ${el.zIndex}`,
    `overflow: hidden`,
  ]
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  const pos = el.initialPosition || 50
  return `<div style="${styles.join('; ')}"><img src="${sanitizeUrl(el.afterImage)}" alt="" style="width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0;" /><div style="position: absolute; inset: 0; clip-path: inset(0 ${100 - pos}% 0 0);"><img src="${sanitizeUrl(el.beforeImage)}" alt="" style="width: 100%; height: 100%; object-fit: cover;" /></div><div style="position: absolute; top: 0; bottom: 0; left: ${pos}%; transform: translateX(-50%); width: 3px; background: white; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div></div>`
}

function renderLogoStripElement(el: LogoStripElement): string {
  const styles = [
    `position: absolute`, `left: ${el.x}px`, `top: ${el.y}px`,
    `width: ${el.width}px`, `height: ${el.height}px`, `z-index: ${el.zIndex}`,
    `overflow: hidden`, `display: flex`, `align-items: center`,
  ]
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  const logos = (el.logos || []).map(logo =>
    `<img src="${sanitizeUrl(logo)}" alt="" style="height: ${el.height * 0.6}px; width: auto; object-fit: contain; flex-shrink: 0;${el.grayscale ? ' filter: grayscale(100%);' : ''}" />`
  ).join('')
  return `<div style="${styles.join('; ')}"><div style="display: flex; align-items: center; gap: ${el.gap || 60}px;">${logos}</div></div>`
}

function renderMapElement(el: MapElement): string {
  const styles = [
    `position: absolute`, `left: ${el.x}px`, `top: ${el.y}px`,
    `width: ${el.width}px`, `height: ${el.height}px`, `z-index: ${el.zIndex}`,
    `overflow: hidden`, `background: #1a1a2e`,
  ]
  const brCss = borderRadiusToCss(el.borderRadius)
  if (brCss) styles.push(`border-radius: ${brCss}`)
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  return `<div style="${styles.join('; ')}"><div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #666; font-size: 14px;">${escapeHtml(el.address || 'מפה')}</div></div>`
}

function renderElement(el: SlideElement, defaultFont: string, pdfMode = false): string {
  switch (el.type) {
    case 'text':
      return renderTextElement(el, defaultFont, pdfMode)
    case 'image':
      return renderImageElement(el, pdfMode)
    case 'shape':
      return renderShapeElement(el, pdfMode)
    case 'video':
      return renderVideoElement(el as VideoElement, pdfMode)
    case 'mockup':
      return renderMockupElement(el as MockupElement)
    case 'compare':
      return renderCompareElement(el as CompareElement)
    case 'logo-strip':
      return renderLogoStripElement(el as LogoStripElement)
    case 'map':
      return renderMapElement(el as MapElement)
    default:
      return ''
  }
}

/**
 * Convert a single Slide AST to a self-contained HTML document.
 * pdfMode is accepted for API compatibility but all visual effects are now
 * rendered identically to the editor — the PDF is generated via Puppeteer
 * screenshot/page.pdf which supports all CSS effects (gradients, blend modes,
 * backdrop-filter, shadows, etc.) so stripping them caused visual mismatches.
 */
export function slideToHtml(slide: Slide, designSystem: DesignSystem, pdfMode = false): string {
  const headingFont = designSystem.fonts.heading || 'Heebo'
  const bodyFont = designSystem.fonts.body || headingFont
  const bgCSS = renderBackground(slide.background)
  const elementsHtml = slide.elements
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(el => renderElement(el, headingFont, pdfMode))
    .join('\n    ')

  // Collect all unique fonts used in this slide (designSystem + per-element overrides)
  const usedFonts = new Set<string>([headingFont, bodyFont])
  for (const el of slide.elements) {
    if (el.type === 'text' && (el as TextElement).fontFamily) {
      usedFonts.add((el as TextElement).fontFamily!)
    }
  }
  const fontLinks = Array.from(usedFonts)
    .map(f => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800;900`)
    .join('&')

  return `<!DOCTYPE html>
<html dir="${designSystem.direction}" lang="he">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?${fontLinks}&display=swap" rel="stylesheet">
  <style>
    @page { size: ${W}px ${H}px; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: '${headingFont}', sans-serif;
      direction: ${designSystem.direction};
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
      width: ${W}px;
      height: ${H}px;
      overflow: hidden;
    }
    .slide {
      width: ${W}px;
      height: ${H}px;
      position: relative;
      overflow: hidden;
      ${bgCSS}
    }
    /* Ensure gradients and colors print correctly */
    div { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    /* Force text to remain as vector, not rasterized */
    .slide * { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
  </style>
</head>
<body>
  <div class="slide">
    ${elementsHtml}
  </div>
</body>
</html>`
}

/**
 * Convert all slides in a Presentation to HTML strings.
 * Used for PDF export via Puppeteer. Pass pdfMode=true for Canva-optimized output.
 */
export function presentationToHtmlSlides(presentation: Presentation, pdfMode = false): string[] {
  return presentation.slides.map(slide =>
    slideToHtml(slide, presentation.designSystem, pdfMode)
  )
}
