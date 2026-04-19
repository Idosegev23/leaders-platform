/**
 * Full end-to-end test: Load document → generate presentation → render HTML → analyze quality
 * Run: npx tsx scripts/test-e2e.ts
 */

import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'
const DEBUG_DIR = '/tmp/slide-debug'

async function main() {
  mkdirSync(DEBUG_DIR, { recursive: true })

  console.log('📦 Loading document...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: doc, error } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
  if (error || !doc) { console.error('Doc not found:', error); process.exit(1) }

  const data = doc.data as Record<string, unknown>
  console.log(`Brand: ${data.brandName}`)
  console.log(`Keys: ${Object.keys(data).filter(k => !k.startsWith('_')).join(', ')}`)
  console.log(`Research keys: ${Object.keys(data).filter(k => k.startsWith('_')).join(', ')}`)

  const { generateAIPresentation } = await import('../src/lib/gemini/slide-designer')

  const brandColors = data._brandColors as { primary?: string } | undefined
  const scraped = data._scraped as { logoUrl?: string; heroImages?: string[]; lifestyleImages?: string[] } | undefined
  const images = data._generatedImages as Record<string, string> | undefined

  const config = {
    accentColor: brandColors?.primary || '#E94560',
    clientLogoUrl: scraped?.logoUrl,
    images: {
      coverImage: images?.coverImage || scraped?.heroImages?.[0] || '',
      brandImage: images?.brandImage || scraped?.heroImages?.[1] || '',
      audienceImage: images?.audienceImage || scraped?.lifestyleImages?.[0] || '',
      activityImage: images?.activityImage || scraped?.lifestyleImages?.[1] || '',
    },
    extraImages: data._extraImages as { id: string; url: string; placement: string }[] | undefined,
    imageStrategy: data._imageStrategy as { conceptSummary?: string; visualDirection?: string; styleGuide?: string } | undefined,
  }

  console.log(`\n🎨 Starting presentation generation...`)
  const startTime = Date.now()

  try {
    const presentation = await generateAIPresentation(data as any, config)
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    // Save full result
    writeFileSync(`${DEBUG_DIR}/e2e-result.json`, JSON.stringify(presentation, null, 2), 'utf8')
    console.log(`\n✅ Done in ${duration}s — ${presentation.slides.length} slides, quality: ${presentation.metadata?.qualityScore}/100`)

    // === Quality Analysis ===
    console.log('\n' + '═'.repeat(60))
    console.log('📊 QUALITY ANALYSIS')
    console.log('═'.repeat(60))

    let totalMissingColor = 0, totalMissingFill = 0, totalMissingRole = 0

    for (const slide of presentation.slides) {
      const texts = slide.elements.filter(e => e.type === 'text') as any[]
      const shapes = slide.elements.filter(e => e.type === 'shape') as any[]
      const imgs = slide.elements.filter(e => e.type === 'image') as any[]
      const noColor = texts.filter(t => !t.color).length
      const noFill = shapes.filter(s => !s.fill).length
      const noRole = texts.filter(t => !t.role).length
      totalMissingColor += noColor
      totalMissingFill += noFill
      totalMissingRole += noRole

      // Font ratio
      const contentTexts = texts.filter(t => t.role !== 'decorative')
      const fontSizes = contentTexts.map(t => t.fontSize || 20).sort((a: number, b: number) => b - a)
      const ratio = fontSizes.length >= 2 ? (fontSizes[0] / fontSizes[fontSizes.length - 1]).toFixed(1) : 'N/A'
      const ratioOk = fontSizes.length >= 2 && fontSizes[0] / fontSizes[fontSizes.length - 1] >= 4

      // Title info
      const titles = contentTexts.filter(t => t.role === 'title')
      const titleFs = titles[0]?.fontSize || 0
      const titleX = titles[0]?.x || 0
      const titleY = titles[0]?.y || 0
      const zone = titleX > 960 ? 'R' : titleX < 500 ? 'L' : 'C'
      const vzone = titleY < 400 ? 'T' : titleY > 600 ? 'B' : 'M'

      // Archetype
      const arch = (slide as any).archetype || 'NONE'

      // Content check
      const contentText = contentTexts.map(t => t.content || '').join(' ')
      const wordCount = contentText.split(/\s+/).filter(Boolean).length

      const issues: string[] = []
      if (noColor) issues.push(`${noColor}⚠color`)
      if (noFill) issues.push(`${noFill}⚠fill`)
      if (noRole) issues.push(`${noRole}⚠role`)
      if (!ratioOk) issues.push(`ratio:${ratio}`)
      if (wordCount < 5) issues.push(`thin-content(${wordCount}w)`)

      console.log(`  ${slide.slideType.padEnd(22)} | ${(slide.label || '').padEnd(20)} | ${slide.elements.length}el ${titleFs}px [${zone}${vzone}] | ratio ${ratio}:1 | ${arch.slice(0, 25).padEnd(25)} | ${issues.length ? issues.join(' ') : '✅'}`)
    }

    // Summary
    console.log('\n' + '─'.repeat(60))
    console.log(`  Missing color: ${totalMissingColor} | Missing fill: ${totalMissingFill} | Missing role: ${totalMissingRole}`)

    // Archetype distribution
    const archetypes = presentation.slides.map(s => (s as any).archetype || 'NONE')
    const archCounts: Record<string, number> = {}
    for (const a of archetypes) archCounts[a] = (archCounts[a] || 0) + 1
    console.log(`  Archetypes: ${Object.entries(archCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`)

    // Title position variety
    const titlePositions = presentation.slides.map(s => {
      const t = (s.elements.filter(e => e.type === 'text' && (e as any).role === 'title') as any[])[0]
      if (!t) return 'NONE'
      return `${t.x > 960 ? 'R' : t.x < 500 ? 'L' : 'C'}${t.y < 400 ? 'T' : t.y > 600 ? 'B' : 'M'}`
    })
    console.log(`  Title zones: ${titlePositions.join(' → ')}`)

    // Font ratio analysis
    const ratios = presentation.slides.map(s => {
      const ct = (s.elements.filter(e => e.type === 'text' && (e as any).role !== 'decorative') as any[])
      const fs = ct.map(t => t.fontSize || 20).sort((a: number, b: number) => b - a)
      return fs.length >= 2 ? fs[0] / fs[fs.length - 1] : 0
    })
    const goodRatios = ratios.filter(r => r >= 4).length
    console.log(`  Font ratio ≥ 4:1: ${goodRatios}/${presentation.slides.length}`)

    // Canvas bleed
    const bleedSlides = presentation.slides.filter(s =>
      s.elements.some(e => e.type === 'shape' && (e.x < 0 || e.y < 0 || e.x + e.width > 1920 || e.y + e.height > 1080))
    ).length
    console.log(`  Canvas bleed: ${bleedSlides}/${presentation.slides.length}`)

    // Content images (not logo)
    const contentImgSlides = presentation.slides.filter(s =>
      s.elements.some(e => e.type === 'image' && (e as any).src && !(e as any).src.includes('logo') && e.width > 200)
    ).length
    console.log(`  Content images: ${contentImgSlides}/${presentation.slides.length}`)

    // === Depth & Effects Analysis ===
    console.log('\n' + '─'.repeat(60))
    console.log('🌊 DEPTH & EFFECTS ANALYSIS')
    const boxShadowSlides = presentation.slides.filter(s =>
      s.elements.some(e => (e as any).boxShadow)
    ).length
    const textShadowSlides = presentation.slides.filter(s =>
      s.elements.some(e => (e as any).textShadow)
    ).length
    const filterSlides = presentation.slides.filter(s =>
      s.elements.some(e => (e as any).filter)
    ).length
    const backdropSlides = presentation.slides.filter(s =>
      s.elements.some(e => (e as any).backdropFilter)
    ).length
    const decorativeCount = presentation.slides.map(s => {
      const deco = s.elements.filter(e =>
        (e.type === 'shape' && ((e as any).shapeType === 'decorative' || (e as any).shapeType === 'divider')) ||
        (e.type === 'text' && (e as any).role === 'decorative')
      )
      return deco.length
    })
    const lowDecoSlides = decorativeCount.filter(c => c < 2).length
    const gradientBgSlides = presentation.slides.filter(s => s.background.type === 'gradient').length

    console.log(`  boxShadow: ${boxShadowSlides}/${presentation.slides.length} slides`)
    console.log(`  textShadow: ${textShadowSlides}/${presentation.slides.length} slides`)
    console.log(`  filter (images): ${filterSlides}/${presentation.slides.length} slides`)
    console.log(`  backdropFilter (glass): ${backdropSlides}/${presentation.slides.length} slides`)
    console.log(`  Low decoration (<2): ${lowDecoSlides}/${presentation.slides.length} slides`)
    console.log(`  Gradient backgrounds: ${gradientBgSlides}/${presentation.slides.length} slides`)

    // === Render HTML ===
    console.log('\n🖼️  Rendering HTML...')
    renderHTML(presentation)

    // Save to Supabase
    console.log(`\n💾 Saving to Supabase...`)
    const { data: freshDoc } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
    const freshData = freshDoc?.data as Record<string, unknown> || data
    const { _pipeline, ...cleanData } = freshData as Record<string, unknown> & { _pipeline?: unknown }

    await supabase.from('documents').update({
      data: {
        ...cleanData,
        _presentation: presentation,
        _pipelineStatus: {
          textGeneration: 'complete',
          research: 'complete',
          visualAssets: 'complete',
          slideGeneration: 'complete',
        },
      },
    }).eq('id', DOC_ID)

    console.log('💾 Saved!')
    console.log(`\n📂 Files:\n  ${DEBUG_DIR}/e2e-result.json\n  ${DEBUG_DIR}/presentation.html`)

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`\n❌ Failed after ${duration}s:`, err)
    process.exit(1)
  }
}

function renderHTML(presentation: any) {
  const slides = presentation.slides || []
  const ds = presentation.designSystem || {}

  const slideHtml = slides.map((slide: any, si: number) => {
    const bg = slide.background || { type: 'solid', value: '#1a1a1a' }
    let bgStyle = ''
    if (bg.type === 'gradient') bgStyle = `background: ${bg.value};`
    else if (bg.type === 'image') bgStyle = `background: url(${bg.value}) center/cover;`
    else bgStyle = `background: ${bg.value};`

    const els = (slide.elements || []).map((el: any) => {
      const base = `position:absolute; left:${el.x || 0}px; top:${el.y || 0}px; width:${el.width || 100}px; height:${el.height || 50}px; z-index:${el.zIndex || 0}; opacity:${el.opacity ?? 1}; ${el.rotation ? `transform:rotate(${el.rotation}deg);` : ''}`

      if (el.type === 'shape') {
        const fill = el.fill || 'transparent'
        const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        const border = el.border ? `border:${el.border};` : ''
        const clip = el.clipPath ? `clip-path:${el.clipPath};` : ''
        const bgProp = fill.includes('gradient') || fill.includes('url') ? `background:${fill};` : `background-color:${fill};`
        const shadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        const bdFilter = el.backdropFilter ? `backdrop-filter:${el.backdropFilter}; -webkit-backdrop-filter:${el.backdropFilter};` : ''
        return `<div style="${base} ${bgProp} ${br} ${border} ${clip} ${shadow} ${bdFilter}"></div>`
      }

      if (el.type === 'text') {
        const color = el.color || '#ffffff'
        const fontSize = el.fontSize || 20
        const fontWeight = el.fontWeight || 400
        const textAlign = el.textAlign || 'right'
        const lineHeight = el.lineHeight || 1.2
        const letterSpacing = el.letterSpacing ? `letter-spacing:${el.letterSpacing}px;` : ''
        const stroke = el.textStroke ? `-webkit-text-stroke:${el.textStroke.width}px ${el.textStroke.color};` : ''
        const tShadow = el.textShadow ? `text-shadow:${el.textShadow};` : ''
        const bShadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        return `<div style="${base} color:${color}; font-size:${fontSize}px; font-weight:${fontWeight}; text-align:${textAlign}; line-height:${lineHeight}; font-family:'Heebo',sans-serif; direction:rtl; overflow:hidden; ${letterSpacing} ${stroke} ${tShadow} ${bShadow}">${el.content || ''}</div>`
      }

      if (el.type === 'image') {
        const fit = el.objectFit || 'cover'
        const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        const shadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        const imgFilter = el.filter ? `filter:${el.filter};` : ''
        return `<div style="${base} ${br} ${shadow} overflow:hidden;"><img src="${el.src || ''}" alt="${el.alt || ''}" style="width:100%; height:100%; object-fit:${fit}; ${imgFilter}" onerror="this.style.display='none'" /></div>`
      }

      return ''
    }).join('\n    ')

    return `
  <div class="slide-wrapper">
    <div class="slide-label">${si + 1}. ${slide.slideType} — ${slide.label || ''} ${(slide as any).archetype ? `[${(slide as any).archetype.slice(0, 30)}]` : ''}</div>
    <div class="slide" style="${bgStyle}">
      ${els}
    </div>
  </div>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${presentation.title || 'Presentation'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; font-family: 'Heebo', sans-serif; padding: 40px; }
    h1 { color: #fff; text-align: center; margin-bottom: 10px; font-size: 24px; }
    .meta { color: #888; text-align: center; margin-bottom: 40px; font-size: 14px; }
    .slide-wrapper { margin: 0 auto 40px; max-width: 960px; }
    .slide-label { color: #666; font-size: 13px; margin-bottom: 8px; font-family: monospace; direction: ltr; text-align: left; }
    .slide { position: relative; width: 960px; height: 540px; overflow: hidden; border-radius: 8px; transform-origin: top left; }
    .slide > div { transform: scale(0.5); transform-origin: top left; }
    .slide > div > * { position: absolute; }
    /* Override: slide elements need their own positioning from the 1920x1080 coordinate system */
    .slide { position: relative; }
    .slide > div {  }
  </style>
  <style>
    /* Proper scaling: render at 1920x1080 then scale down to 960x540 */
    .slide {
      position: relative;
      width: 960px;
      height: 540px;
      overflow: hidden;
      border-radius: 8px;
    }
    .slide-inner {
      position: absolute;
      top: 0; left: 0;
      width: 1920px;
      height: 1080px;
      transform: scale(0.5);
      transform-origin: top left;
    }
  </style>
</head>
<body>
  <h1>${presentation.title || 'Presentation'}</h1>
  <div class="meta">Quality: ${presentation.metadata?.qualityScore || 'N/A'}/100 | ${slides.length} slides | v${presentation.metadata?.version || '?'}</div>
  ${slides.map((slide: any, si: number) => {
    const bg = slide.background || { type: 'solid', value: '#1a1a1a' }
    let bgStyle = ''
    if (bg.type === 'gradient') bgStyle = `background: ${bg.value};`
    else if (bg.type === 'image') bgStyle = `background: url(${bg.value}) center/cover;`
    else bgStyle = `background: ${bg.value};`

    const els = (slide.elements || []).map((el: any) => {
      const base = `position:absolute; left:${el.x || 0}px; top:${el.y || 0}px; width:${el.width || 100}px; height:${el.height || 50}px; z-index:${el.zIndex || 0}; opacity:${el.opacity ?? 1}; ${el.rotation ? `transform:rotate(${el.rotation}deg);` : ''}`

      if (el.type === 'shape') {
        const fill = el.fill || 'transparent'
        const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        const border = el.border ? `border:${el.border};` : ''
        const clip = el.clipPath ? `clip-path:${el.clipPath};` : ''
        const bgProp = fill.includes('gradient') || fill.includes('url') ? `background:${fill};` : `background-color:${fill};`
        const shadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        const bdFilter = el.backdropFilter ? `backdrop-filter:${el.backdropFilter}; -webkit-backdrop-filter:${el.backdropFilter};` : ''
        return `<div style="${base} ${bgProp} ${br} ${border} ${clip} ${shadow} ${bdFilter}"></div>`
      }

      if (el.type === 'text') {
        const color = el.color || '#ffffff'
        const fontSize = el.fontSize || 20
        const fontWeight = el.fontWeight || 400
        const textAlign = el.textAlign || 'right'
        const lineHeight = el.lineHeight || 1.2
        const letterSpacing = el.letterSpacing ? `letter-spacing:${el.letterSpacing}px;` : ''
        const stroke = el.textStroke ? `-webkit-text-stroke:${el.textStroke.width}px ${el.textStroke.color};` : ''
        const tShadow = el.textShadow ? `text-shadow:${el.textShadow};` : ''
        const bShadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        return `<div style="${base} color:${color}; font-size:${fontSize}px; font-weight:${fontWeight}; text-align:${textAlign}; line-height:${lineHeight}; font-family:'Heebo',sans-serif; direction:rtl; overflow:hidden; ${letterSpacing} ${stroke} ${tShadow} ${bShadow}">${el.content || ''}</div>`
      }

      if (el.type === 'image') {
        const fit = el.objectFit || 'cover'
        const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        const shadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        const imgFilter = el.filter ? `filter:${el.filter};` : ''
        return `<div style="${base} ${br} ${shadow} overflow:hidden;"><img src="${el.src || ''}" alt="${el.alt || ''}" style="width:100%; height:100%; object-fit:${fit}; ${imgFilter}" onerror="this.style.display='none'" /></div>`
      }
      return ''
    }).join('\n      ')

    return `
  <div class="slide-wrapper">
    <div class="slide-label">${si + 1}. ${slide.slideType} — ${slide.label || ''} ${(slide as any).archetype ? `[${(slide as any).archetype.slice(0, 40)}]` : ''}</div>
    <div class="slide" style="${bgStyle}">
      <div class="slide-inner">
        ${els}
      </div>
    </div>
  </div>`
  }).join('\n')}
</body>
</html>`

  writeFileSync(`${DEBUG_DIR}/presentation.html`, html, 'utf8')
  console.log(`  ✅ Saved to ${DEBUG_DIR}/presentation.html`)
}

main()
