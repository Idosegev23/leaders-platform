/**
 * Build a single HTML document Canva can import as a presentation — one page
 * per slide — straight from the deck's rendered slides.
 *
 * Why this exists. Until now the Canva export went HTML → `_structuredPresentation`
 * → native PPTX, and that structured form was derived ONCE from the agent's raw
 * `_agentSlides` (their generation-time `content` fields, not their HTML) and
 * then reused forever. Every later change to the deck — content repairs,
 * removed duplicates, reordering, renumbering — landed on
 * `_htmlPresentation.htmlSlides` and never reached Canva. The deck people
 * opened in Canva was the raw first draft, with the cover on slide 8.
 *
 * Canva's url-import accepts an HTML file in which every element carrying
 * `data-document-role="page"` becomes one page (optional `data-label` names
 * it). Verified on a 21-slide deck: 21 editable pages, real text (not
 * flattened images), correct order, and visibly better fidelity than the
 * PPTX conversion, which garbled the letter-spaced eyebrows and cropped the
 * logo. Because the file is built from the CURRENT slides, it exports what
 * the critique actually approved — by construction.
 *
 * Each slide is a complete standalone HTML document with its own <style>
 * blocks and class names (`.eyebrow`, `.slide`, …) that collide across
 * slides. So every slide's CSS is scoped under its page id before the pages
 * are concatenated, and `html`/`body`/`:root` selectors are remapped to the
 * page element.
 *
 * Pure function; no I/O.
 */

export interface CanvaImportHtmlInput {
  htmlSlides: string[]
  slideTypes?: string[]
  /** Used for the page labels when a slide has no type. */
  brandName?: string
  lang?: string
  dir?: 'rtl' | 'ltr'
}

export interface CanvaImportHtmlResult {
  html: string
  pages: number
  scopedStyleBlocks: number
  fontLinks: number
}

interface CssRule {
  prelude: string
  body: string
}

/** Split a stylesheet into top-level rules, respecting nested braces. */
function splitRules(css: string): CssRule[] {
  const out: CssRule[] = []
  let i = 0
  const n = css.length
  while (i < n) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).trim()
    let depth = 1
    let k = open + 1
    while (k < n && depth > 0) {
      if (css[k] === '{') depth++
      else if (css[k] === '}') depth--
      k++
    }
    out.push({ prelude, body: css.slice(open + 1, k - 1) })
    i = k
  }
  return out
}

/** Prefix every selector with the page id so slides cannot restyle each other. */
function scopeSelector(selector: string, pid: string): string {
  const s = selector.trim()
  if (!s) return ''
  if (s === 'html' || s === 'body' || s === ':root') return `#${pid}`
  if (/^(html|body)\s+/.test(s)) return `#${pid} ${s.replace(/^(html|body)\s+/, '')}`
  if (/^(html|body)(?=[.#:\[])/.test(s)) return `#${pid}${s.replace(/^(html|body)/, '')}`
  return `#${pid} ${s}`
}

/**
 * Scope a stylesheet under `#pid`. `@media`/`@supports` recurse; `@keyframes`,
 * `@font-face` and other at-rules pass through untouched. `@import` rules are
 * returned separately so the caller can hoist them — an @import that is not
 * at the top of the sheet is ignored by browsers.
 */
export function scopeCss(css: string, pid: string): { css: string; imports: string[] } {
  const imports: string[] = []
  // Statement at-rules (no block): @import / @charset.
  const withoutImports = css.replace(/@import[^;]+;/g, (m) => {
    imports.push(m.trim())
    return ''
  }).replace(/@charset[^;]+;/g, '')

  const parts: string[] = []
  for (const { prelude, body } of splitRules(withoutImports)) {
    if (/^@(media|supports|container|layer)\b/.test(prelude)) {
      const inner = scopeCss(body, pid)
      imports.push(...inner.imports)
      parts.push(`${prelude}{${inner.css}}`)
    } else if (prelude.startsWith('@')) {
      parts.push(`${prelude}{${body}}`)
    } else {
      const selectors = prelude
        .split(',')
        .map((sel) => scopeSelector(sel, pid))
        .filter(Boolean)
      if (selectors.length) parts.push(`${selectors.join(',')}{${body}}`)
    }
  }
  return { css: parts.join('\n'), imports }
}

const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi
const FONT_LINK_RE = /<link[^>]+href="[^"]*fonts\.googleapis[^"]*"[^>]*>/gi
const BODY_RE = /<body([^>]*)>([\s\S]*?)<\/body>/i
const BODY_STYLE_RE = /style="([^"]*)"/i
const STRIP_RE = /<(script|link|meta|title)\b[^>]*>[\s\S]*?<\/\1>|<(script|link|meta|title)\b[^>]*\/?>/gi

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildCanvaImportHtml(input: CanvaImportHtmlInput): CanvaImportHtmlResult {
  const dir = input.dir ?? 'rtl'
  const lang = input.lang ?? 'he'
  const fontLinks = new Set<string>()
  const imports = new Set<string>()
  const styles: string[] = []
  const pages: string[] = []

  input.htmlSlides.forEach((html, i) => {
    const pid = `p${i}`

    for (const m of Array.from(html.matchAll(FONT_LINK_RE))) fontLinks.add(m[0])

    for (const m of Array.from(html.matchAll(STYLE_RE))) {
      const scoped = scopeCss(m[1], pid)
      scoped.imports.forEach((imp) => imports.add(imp))
      if (scoped.css.trim()) styles.push(scoped.css)
    }

    const bodyMatch = html.match(BODY_RE)
    const bodyAttrs = bodyMatch?.[1] ?? ''
    const inner = (bodyMatch?.[2] ?? html).replace(STRIP_RE, '')
    const bodyStyle = bodyAttrs.match(BODY_STYLE_RE)?.[1]?.trim() ?? ''
    const label = escapeAttr(input.slideTypes?.[i] || `${input.brandName || 'slide'} ${i + 1}`)

    pages.push(
      `<section id="${pid}" data-document-role="page" data-label="${label}" dir="${dir}" lang="${lang}" ` +
        `style="position:relative;width:1920px;height:1080px;overflow:hidden;${bodyStyle}">${inner}</section>`,
    )
  })

  const head =
    `<meta charset="utf-8">` +
    Array.from(fontLinks).sort().join('') +
    `<style>${Array.from(imports).join('\n')}\n${styles.join('\n')}</style>`

  const html = `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head>${head}</head><body style="margin:0">${pages.join('\n')}</body></html>`
  return { html, pages: pages.length, scopedStyleBlocks: styles.length, fontLinks: fontLinks.size }
}
