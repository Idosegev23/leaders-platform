import { describe, it, expect } from 'vitest'
import { buildCanvaImportHtml, scopeCss } from './html-import'

/** A slide as the agent renders it: a full document with its own styles. */
function slide(opts: { css?: string; body: string; bodyStyle?: string; font?: boolean }) {
  return (
    '<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>x</title>' +
    (opts.font ? '<link href="https://fonts.googleapis.com/css2?family=Heebo&display=swap" rel="stylesheet">' : '') +
    `<style>${opts.css ?? ''}</style></head>` +
    `<body${opts.bodyStyle ? ` style="${opts.bodyStyle}"` : ''}>${opts.body}<script>console.log(1)</script></body></html>`
  )
}

describe('scopeCss', () => {
  it('prefixes every selector with the page id', () => {
    const { css } = scopeCss('.eyebrow{color:red} h1, .title{font-size:64px}', 'p3')
    expect(css).toContain('#p3 .eyebrow{color:red}')
    expect(css).toContain('#p3 h1,#p3 .title{font-size:64px}')
  })

  it('remaps html/body/:root to the page element', () => {
    const { css } = scopeCss('body{margin:0} html{background:#000} :root{--x:1} body .slide{inset:0} body.dark{c:1}', 'p0')
    expect(css).toContain('#p0{margin:0}')
    expect(css).toContain('#p0{background:#000}')
    expect(css).toContain('#p0{--x:1}')
    expect(css).toContain('#p0 .slide{inset:0}')
    expect(css).toContain('#p0.dark{c:1}')
  })

  it('recurses into @media and passes @keyframes / @font-face through', () => {
    const { css } = scopeCss(
      '@media (max-width:900px){.a{x:1}} @keyframes spin{from{r:0}to{r:1}} @font-face{font-family:F;src:url(f.woff2)}',
      'p1',
    )
    expect(css).toContain('@media (max-width:900px){#p1 .a{x:1}}')
    expect(css).toContain('@keyframes spin{from{r:0}to{r:1}}')
    expect(css).toContain('@font-face{font-family:F;src:url(f.woff2)}')
  })

  it('lifts @import out so it can be hoisted to the top of the sheet', () => {
    const { css, imports } = scopeCss("@import url('https://fonts.googleapis.com/x'); .a{b:1}", 'p2')
    expect(imports).toEqual(["@import url('https://fonts.googleapis.com/x');"])
    expect(css).not.toContain('@import')
    expect(css).toContain('#p2 .a{b:1}')
  })
})

describe('buildCanvaImportHtml', () => {
  it('emits one data-document-role page per slide, labelled by type, in order', () => {
    const { html, pages } = buildCanvaImportHtml({
      htmlSlides: [slide({ body: '<h1>שער</h1>' }), slide({ body: '<h1>בריף</h1>' })],
      slideTypes: ['cover', 'brief'],
    })
    expect(pages).toBe(2)
    expect(html.match(/data-document-role="page"/g)).toHaveLength(2)
    expect(html.indexOf('data-label="cover"')).toBeLessThan(html.indexOf('data-label="brief"'))
    expect(html).toContain('<h1>שער</h1>')
  })

  it('scopes each slide\'s CSS so identical class names cannot bleed between pages', () => {
    // Every slide defines `.eyebrow`; slide 0 makes it red, slide 1 makes it blue.
    const { html } = buildCanvaImportHtml({
      htmlSlides: [
        slide({ css: '.eyebrow{color:red}', body: '<div class="eyebrow">A</div>' }),
        slide({ css: '.eyebrow{color:blue}', body: '<div class="eyebrow">B</div>' }),
      ],
    })
    expect(html).toContain('#p0 .eyebrow{color:red}')
    expect(html).toContain('#p1 .eyebrow{color:blue}')
    // Exactly one copy of each rule, and none that starts a rule unprefixed.
    expect(html.match(/\.eyebrow\{color:red\}/g)).toHaveLength(1)
    expect(html).not.toMatch(/[\n>}]\s*\.eyebrow\{/)
  })

  it('sets the page canvas and carries the body background onto the page', () => {
    const { html } = buildCanvaImportHtml({
      htmlSlides: [slide({ body: '<p>x</p>', bodyStyle: 'background:#0C0C10' })],
    })
    expect(html).toMatch(/<section id="p0"[^>]*style="position:relative;width:1920px;height:1080px;overflow:hidden;background:#0C0C10"/)
  })

  it('is RTL Hebrew by default, on the document and on every page', () => {
    const { html } = buildCanvaImportHtml({ htmlSlides: [slide({ body: '<p>x</p>' })] })
    expect(html).toMatch(/^<!DOCTYPE html><html lang="he" dir="rtl">/)
    expect(html).toMatch(/<section id="p0"[^>]*dir="rtl" lang="he"/)
  })

  it('hoists font links once and strips scripts, titles and metas from the pages', () => {
    const { html, fontLinks } = buildCanvaImportHtml({
      htmlSlides: [slide({ body: '<p>a</p>', font: true }), slide({ body: '<p>b</p>', font: true })],
    })
    expect(fontLinks).toBe(1)
    expect(html.match(/fonts\.googleapis/g)).toHaveLength(1)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<title')
    // the head's own charset meta is the only meta left
    expect(html.match(/<meta/g)).toHaveLength(1)
  })

  it('falls back to a brand-based label when a slide has no type', () => {
    const { html } = buildCanvaImportHtml({ htmlSlides: [slide({ body: '<p>x</p>' })], brandName: 'SEACRET' })
    expect(html).toContain('data-label="SEACRET 1"')
  })

  it('escapes labels so a type can never break the markup', () => {
    const { html } = buildCanvaImportHtml({ htmlSlides: [slide({ body: '<p>x</p>' })], slideTypes: ['a"b<c'] })
    expect(html).toContain('data-label="a&quot;b&lt;c"')
  })
})
