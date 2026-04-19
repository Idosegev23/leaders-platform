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
  DesignSystem,
} from '@/types/presentation'

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

  // In PDF mode, skip gradient text (causes rasterization in Chromium's print engine)
  // and force full opacity so text stays as vector for Canva editability
  const useGradient = isGradientText && !pdfMode
  const effectiveOpacity = pdfMode ? Math.max(el.opacity ?? 1, 0.85) : (el.opacity ?? 1)

  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `font-size: ${el.fontSize}px`,
    `font-weight: ${el.fontWeight}`,
    `color: ${useGradient ? 'transparent' : el.color}`,
    `text-align: ${el.textAlign}`,
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
  if (el.borderRadius) styles.push(`border-radius: ${el.borderRadius}px`)
  if (el.padding) styles.push(`padding: ${el.padding}px`)
  if (!pdfMode && el.mixBlendMode && el.mixBlendMode !== 'normal') styles.push(`mix-blend-mode: ${el.mixBlendMode}`)
  if (el.textStroke) styles.push(`-webkit-text-stroke: ${el.textStroke.width}px ${el.textStroke.color}`)
  if (useGradient) {
    styles.push(`background: ${el.gradientFill}`)
    styles.push(`-webkit-background-clip: text`)
    styles.push(`background-clip: text`)
  }

  return `<div style="${styles.join('; ')}">${escapeHtml(el.content)}</div>`
}

function renderImageElement(el: ImageElement): string {
  const containerStyles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `overflow: hidden`,
  ]

  if (el.borderRadius) containerStyles.push(`border-radius: ${el.borderRadius}px`)
  if (el.clipPath) containerStyles.push(`clip-path: ${el.clipPath}`)
  if (el.border) containerStyles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) containerStyles.push(`opacity: ${el.opacity}`)
  if (el.rotation) containerStyles.push(`transform: rotate(${el.rotation}deg)`)

  const imgStyles = [
    `width: 100%`,
    `height: 100%`,
    `object-fit: ${el.objectFit}`,
    `display: block`,
  ]

  return `<div style="${containerStyles.join('; ')}"><img src="${sanitizeUrl(el.src)}" alt="${escapeHtml(el.alt || '')}" style="${imgStyles.join('; ')}" onerror="this.style.display='none'" /></div>`
}

function renderShapeElement(el: ShapeElement): string {
  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
  ]

  // Fill can be a color or gradient
  if (el.fill.includes('gradient') || el.fill.includes('linear') || el.fill.includes('radial')) {
    styles.push(`background: ${el.fill}`)
  } else {
    styles.push(`background-color: ${el.fill}`)
  }

  if (el.borderRadius) styles.push(`border-radius: ${el.borderRadius}px`)
  if (el.clipPath) styles.push(`clip-path: ${el.clipPath}`)
  if (el.border) styles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)
  if (el.mixBlendMode && el.mixBlendMode !== 'normal') styles.push(`mix-blend-mode: ${el.mixBlendMode}`)

  return `<div style="${styles.join('; ')}"></div>`
}

function renderElement(el: SlideElement, defaultFont: string, pdfMode = false): string {
  switch (el.type) {
    case 'text':
      return renderTextElement(el, defaultFont, pdfMode)
    case 'image':
      return renderImageElement(el)
    case 'shape':
      return renderShapeElement(el)
    default:
      return ''
  }
}

/**
 * Convert a single Slide AST to a self-contained HTML document.
 * When pdfMode=true, optimizes for vector text output (Canva editability):
 * - Disables gradient text fill (causes rasterization)
 * - Forces minimum text opacity
 * - Skips blend modes on text
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
