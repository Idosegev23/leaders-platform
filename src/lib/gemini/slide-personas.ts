/**
 * Slide visual personas — per-brand visual language for the presentation agent.
 *
 * Replaces the single fixed dark template that made every deck look identical.
 * Each brand is deterministically assigned one of four personas (stable hash of
 * the brand name), which controls theme (light/dark), typography, image
 * treatment, card style and composition. The model supplies CONTENT + brand
 * colors; composition is code-driven so variety survives generation.
 *
 * All personas: 1920×1080, RTL Hebrew, Google-Fonts Hebrew families only.
 */

export type PersonaId = 'editorial-light' | 'cinematic-dark' | 'bold-flat' | 'soft-premium'

const PERSONAS: PersonaId[] = ['editorial-light', 'cinematic-dark', 'bold-flat', 'soft-premium']

export function pickPersona(brandName: string): PersonaId {
  let h = 0
  for (let i = 0; i < brandName.length; i++) h = (h * 31 + brandName.charCodeAt(i)) >>> 0
  return PERSONAS[h % PERSONAS.length]
}

// ─── Color utils ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return [12, 12, 16]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** mix(color, into, t) — t=0 → color, t=1 → into */
function mix(color: string, into: string, t: number): string {
  const c1 = hexToRgb(color); const c2 = hexToRgb(into)
  return rgbToHex([c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t])
}

/** Darken/lighten `color` until it reaches `ratio` against `bg`. */
function ensureContrast(color: string, bg: string, ratio: number): string {
  if (contrast(color, bg) >= ratio) return color
  const towards = luminance(bg) > 0.4 ? '#111111' : '#ffffff'
  let c = color
  for (let i = 0; i < 12 && contrast(c, bg) < ratio; i++) c = mix(c, towards, 0.18)
  return c
}

// ─── Theme resolution ───────────────────────────────────

interface Theme {
  bg: string
  surface: string      // card/panel background
  text: string
  muted: string
  primary: string      // display-safe brand primary (vs bg)
  accent: string
  headingFont: string
  bodyFont: string
  fontsQuery: string
  radius: number
  cardShadow: string
  cardBorder: string
}

function resolveTheme(persona: PersonaId, colors: Record<string, string>): Theme {
  const rawPrimary = colors.primary || '#E94560'
  const rawAccent = colors.accent || rawPrimary
  const rawBg = colors.background || '#0C0C10'

  switch (persona) {
    case 'editorial-light': {
      const bg = mix('#FAF8F4', rawPrimary, 0.035)
      const text = '#191A1E'
      return {
        bg, text, muted: '#6B6C72',
        surface: mix('#FFFFFF', rawPrimary, 0.02),
        primary: ensureContrast(rawPrimary, bg, 3),
        accent: ensureContrast(rawAccent, bg, 3),
        headingFont: "'Frank Ruhl Libre', 'Heebo', serif",
        bodyFont: "'Heebo', sans-serif",
        fontsQuery: 'family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;700',
        radius: 4,
        cardShadow: 'none',
        cardBorder: `1px solid ${mix(text, bg, 0.82)}`,
      }
    }
    case 'soft-premium': {
      const bg = mix('#F6F3EE', rawAccent, 0.06)
      const text = '#26231F'
      return {
        bg, text, muted: '#7A756D',
        surface: '#FFFFFF',
        primary: ensureContrast(rawPrimary, bg, 3),
        accent: ensureContrast(rawAccent, bg, 3),
        headingFont: "'Assistant', 'Heebo', sans-serif",
        bodyFont: "'Assistant', 'Heebo', sans-serif",
        fontsQuery: 'family=Assistant:wght@300;400;600;800&family=Heebo:wght@400;700',
        radius: 24,
        cardShadow: '0 18px 50px rgba(40,32,20,0.10)',
        cardBorder: 'none',
      }
    }
    case 'bold-flat': {
      // Vivid primary becomes a structural color on a paper background.
      const bg = '#F2F0EA'
      const text = '#141414'
      return {
        bg, text, muted: '#55554F',
        surface: '#FFFFFF',
        primary: ensureContrast(rawPrimary, bg, 2.5),
        accent: ensureContrast(rawAccent, bg, 2.5),
        headingFont: "'Rubik', 'Heebo', sans-serif",
        bodyFont: "'Heebo', sans-serif",
        fontsQuery: 'family=Rubik:wght@500;700;900&family=Heebo:wght@300;400;700',
        radius: 0,
        cardShadow: '10px 10px 0 rgba(20,20,20,0.9)',
        cardBorder: '3px solid #141414',
      }
    }
    case 'cinematic-dark':
    default: {
      const bg = luminance(rawBg) < 0.25 ? rawBg : '#0C0C10'
      const text = '#F5F5F7'
      return {
        bg, text, muted: mix(text, bg, 0.45),
        surface: 'rgba(255,255,255,0.05)',
        primary: ensureContrast(rawPrimary, bg, 2.2),
        accent: ensureContrast(rawAccent, bg, 2.2),
        headingFont: "'Heebo', sans-serif",
        bodyFont: "'Heebo', sans-serif",
        fontsQuery: 'family=Heebo:wght@200;300;400;700;900',
        radius: 16,
        cardShadow: 'none',
        cardBorder: '1px solid rgba(255,255,255,0.09)',
      }
    }
  }
}

// ─── Rendering ──────────────────────────────────────────

export interface SlideRenderCtx {
  persona: PersonaId
  slideIndex: number
  brandName: string
}

function esc(s: string): string {
  return s.replace(/"/g, '&quot;')
}

export function renderAgentSlide(args: Record<string, unknown>, ctx: SlideRenderCtx): string {
  const colors = (args.designColors || {}) as Record<string, string>
  const T = resolveTheme(ctx.persona, colors)
  const slideType = (args.slideType as string) || 'content'
  const title = (args.title as string) || ''
  const subtitle = (args.subtitle as string) || ''
  const body = (args.bodyText as string) || ''
  const imageUrl = ((args.imageUrl as string) || '').trim()
  const keyNum = (args.keyNumber as string) || ''
  const keyLabel = (args.keyNumberLabel as string) || ''
  const bullets = ((args.bulletPoints as string[]) || []).filter(Boolean)
  const cards = ((args.cards as Array<{ title: string; body: string }>) || []).filter(c => c?.title)

  const isCover = slideType === 'cover'
  const isClosing = slideType === 'closing'
  const hasContent = !!(subtitle || body || bullets.length || cards.length || keyNum)
  const isDivider = !isCover && !isClosing && !hasContent
  const imageSide: 'left' | 'right' = ctx.slideIndex % 2 === 0 ? 'left' : 'right'

  const eyebrow = `${slideType.toUpperCase()} // ${String(ctx.slideIndex + 1).padStart(2, '0')}`

  const head = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?${T.fontsQuery}&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;font-family:${T.bodyFont};direction:rtl;background:${T.bg};color:${T.text};}
h1,h2,h3{font-family:${T.headingFont};}
h1,h2,h3{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;word-break:break-word;text-wrap:balance;}
p{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;word-break:break-word;}
li{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.eyebrow{position:absolute;top:56px;right:100px;z-index:9;font-family:'Heebo',sans-serif;font-size:14px;font-weight:500;letter-spacing:7px;color:${T.muted};direction:ltr;}
</style></head><body><div class="slide">`
  const foot = `</div></body></html>`

  // ── Full-bleed slides (cover / closing) ──
  if (isCover || isClosing) {
    const scrim = ctx.persona === 'cinematic-dark'
      ? `linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.72) 100%)`
      : `linear-gradient(180deg, rgba(10,10,12,0.55) 0%, rgba(10,10,12,0.18) 45%, rgba(10,10,12,0.62) 100%)`
    const bleed = imageUrl
      ? `<img src="${esc(imageUrl)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/><div style="position:absolute;inset:0;background:${scrim};"></div>`
      : `<div style="position:absolute;inset:0;background:${ctx.persona === 'bold-flat' ? T.primary : `linear-gradient(150deg, ${mix(T.bg, T.primary, 0.5)}, ${T.bg} 70%)`};"></div>`
    const onImage = imageUrl || ctx.persona !== 'bold-flat' || luminance(T.primary) < 0.4
    const heroText = imageUrl ? '#FFFFFF' : (onImage ? '#FFFFFF' : '#141414')
    const titleSize = title.length > 22 ? 120 : 168
    return `${head}${bleed}
<div class="eyebrow" style="color:rgba(255,255,255,0.75);">${esc(eyebrow)}</div>
<div style="position:absolute;right:100px;left:100px;bottom:${isClosing ? '380px' : '140px'};z-index:5;${isClosing ? 'text-align:center;' : ''}">
  <div style="width:64px;height:5px;background:${T.accent};margin-bottom:36px;${isClosing ? 'margin-left:auto;margin-right:auto;' : ''}"></div>
  <h1 style="font-size:${isClosing ? 140 : titleSize}px;font-weight:900;line-height:0.98;letter-spacing:-3px;color:${heroText};max-width:1500px;${isClosing ? 'margin:0 auto;' : ''}">${title}</h1>
  ${subtitle ? `<h2 style="font-size:30px;font-weight:300;color:rgba(255,255,255,0.82);margin-top:28px;letter-spacing:1px;">${subtitle}</h2>` : ''}
  ${isClosing ? `<div style="font-family:'Heebo',sans-serif;font-size:19px;letter-spacing:6px;color:rgba(255,255,255,0.7);margin-top:44px;direction:ltr;">${esc(ctx.brandName)} × LEADERS</div>` : ''}
</div>${foot}`
  }

  // ── Section divider (title-only slide) — intentional, not broken ──
  if (isDivider) {
    const block = ctx.persona === 'bold-flat'
      ? `<div style="position:absolute;top:0;bottom:0;right:0;width:38%;background:${T.primary};"></div>`
      : `<div style="position:absolute;top:50%;right:100px;transform:translateY(-50%);width:8px;height:280px;background:${T.accent};"></div>`
    return `${head}${block}
<div class="eyebrow">${esc(eyebrow)}</div>
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:4;">
  <h1 style="font-size:150px;font-weight:900;letter-spacing:-4px;color:${T.text};">${title}</h1>
</div>${foot}`
  }

  // ── Shared content blocks ──
  const titleBlock = `
  <div style="width:52px;height:4px;background:${T.accent};margin-bottom:26px;"></div>
  <h1 style="font-size:${title.length > 24 ? 60 : 76}px;font-weight:${ctx.persona === 'editorial-light' ? 700 : 900};line-height:1.04;letter-spacing:-1px;margin-bottom:22px;">${title}</h1>
  ${subtitle ? `<h2 style="font-size:26px;font-weight:400;color:${T.muted};margin-bottom:24px;line-height:1.35;">${subtitle}</h2>` : ''}
  ${body ? `<p style="font-size:22px;line-height:1.65;color:${mix(T.text, T.bg, 0.15)};max-width:760px;">${body}</p>` : ''}`

  const bulletsBlock = bullets.length ? `
  <ul style="list-style:none;margin-top:30px;">${bullets.map(b => `
    <li style="margin-bottom:18px;font-size:21px;line-height:1.5;padding-right:30px;position:relative;">
      <span style="position:absolute;right:0;top:9px;width:14px;height:14px;background:${T.accent};${T.radius ? `border-radius:${Math.min(T.radius, 7)}px;` : ''}"></span>${b}
    </li>`).join('')}
  </ul>` : ''

  const statNums = keyNum
    ? [{ value: keyNum, label: keyLabel }]
    : []

  const cardsBlock = cards.length ? `
  <div style="display:flex;gap:${ctx.persona === 'bold-flat' ? 32 : 24}px;margin-top:36px;flex-wrap:wrap;">
    ${cards.slice(0, 4).map((card, i) => `
    <div style="flex:1;min-width:260px;background:${T.surface};border-radius:${T.radius}px;padding:34px 30px;border:${T.cardBorder};box-shadow:${T.cardShadow};">
      <div style="font-family:${T.headingFont};font-size:44px;font-weight:900;color:${T.accent};margin-bottom:10px;">0${i + 1}</div>
      <h3 style="font-size:23px;font-weight:700;margin-bottom:10px;">${card.title}</h3>
      <p style="font-size:17px;color:${T.muted};line-height:1.55;">${card.body || ''}</p>
    </div>`).join('')}
  </div>` : ''

  const statBlock = statNums.length ? `
  <div style="margin-top:44px;">
    <div style="font-family:${T.headingFont};font-size:150px;font-weight:900;line-height:1;letter-spacing:-4px;color:${T.primary};">${statNums[0].value}</div>
    ${statNums[0].label ? `<div style="font-size:20px;color:${T.muted};margin-top:12px;">${statNums[0].label}</div>` : ''}
  </div>` : ''

  // ── Image panel (framed, alternating side) ──
  let imagePanel = ''
  let contentInset = 'right:100px;left:100px;'
  if (imageUrl) {
    const w = 42 // percent
    const panelStyle = ctx.persona === 'bold-flat'
      ? `border:4px solid #141414;box-shadow:18px 18px 0 ${T.primary};`
      : ctx.persona === 'cinematic-dark'
        ? `border-radius:${T.radius}px;box-shadow:0 30px 80px rgba(0,0,0,0.55);`
        : `border-radius:${T.radius}px;box-shadow:0 24px 60px rgba(30,25,15,0.18);`
    imagePanel = `
  <div style="position:absolute;top:100px;bottom:100px;${imageSide}:100px;width:${w}%;overflow:hidden;${panelStyle}z-index:3;">
    <img src="${esc(imageUrl)}" style="width:100%;height:100%;object-fit:cover;"/>
    ${ctx.persona === 'cinematic-dark' ? `<div style="position:absolute;inset:0;background:linear-gradient(${imageSide === 'left' ? '90deg' : '270deg'}, transparent 55%, rgba(0,0,0,0.35));"></div>` : ''}
  </div>`
    contentInset = imageSide === 'left'
      ? `right:100px;left:calc(${w}% + 170px);`
      : `left:100px;right:calc(${w}% + 170px);`
  }

  // cinematic-dark keeps a soft aurora; light personas stay clean
  const atmosphere = ctx.persona === 'cinematic-dark'
    ? `<div style="position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 110% 80% at 12% 45%, ${T.primary}22, transparent 60%), radial-gradient(ellipse 80% 110% at 88% 25%, ${T.accent}16, transparent 55%);"></div>`
    : ctx.persona === 'editorial-light'
      ? `<div style="position:absolute;top:0;bottom:0;right:56.5%;width:1px;background:${mix(T.text, T.bg, 0.85)};z-index:1;"></div>`
      : ''

  return `${head}${atmosphere}${imagePanel}
<div class="eyebrow">${esc(eyebrow)}</div>
<div style="position:absolute;top:0;bottom:0;${contentInset}display:flex;flex-direction:column;justify-content:center;z-index:4;">
${titleBlock}
${bulletsBlock}
${statBlock}
${cardsBlock}
</div>${foot}`
}
