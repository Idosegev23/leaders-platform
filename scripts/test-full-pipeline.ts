/**
 * Full Pipeline Test: Images → Design System → Planner → Slide Generation → HTML
 * Generates EVERYTHING from scratch including AI images.
 * Run: npx tsx scripts/test-full-pipeline.ts
 */

import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'
const DEBUG_DIR = '/tmp/slide-debug'

function elapsed(start: number): string {
  return ((Date.now() - start) / 1000).toFixed(1)
}

async function main() {
  mkdirSync(DEBUG_DIR, { recursive: true })

  const totalStart = Date.now()
  console.log('═'.repeat(60))
  console.log('🚀 FULL PIPELINE TEST — Images + Slides from scratch')
  console.log('═'.repeat(60))

  // ─── Load document ───
  console.log('\n📦 Loading document...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: doc, error } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
  if (error || !doc) { console.error('Doc not found:', error); process.exit(1) }

  const data = doc.data as Record<string, unknown>
  console.log(`Brand: ${data.brandName}`)

  // ─── Phase 1: Generate AI Images ───
  console.log('\n' + '═'.repeat(60))
  console.log('🎨 PHASE 1: Image Generation')
  console.log('═'.repeat(60))

  const imgStart = Date.now()

  // Import image generation dependencies
  const { extractColorsByBrandName } = await import('../src/lib/gemini/color-extractor')
  const { generateSmartImages } = await import('../src/lib/gemini/israeli-image-generator')

  // Step 1a: Extract brand colors via Gemini
  console.log('\n🎨 Step 1a: Extracting brand colors...')
  const brandName = data.brandName as string
  let brandColors
  try {
    brandColors = await extractColorsByBrandName(brandName)
    console.log(`  ✅ Colors: primary=${brandColors.primary}, accent=${brandColors.accent} (${elapsed(imgStart)}s)`)
  } catch (err) {
    console.warn(`  ⚠️ Color extraction failed, using existing:`, err)
    brandColors = (data._brandColors as any) || {
      primary: '#C41230', secondary: '#8E8E8E', accent: '#686868',
      background: '#0F0F11', text: '#F5F5F7', style: 'corporate', mood: 'פרימיום'
    }
  }

  // Step 1b: Find logo
  console.log('\n🔍 Step 1b: Finding logo...')
  let logoUrl: string | null = brandColors.logoUrl || null
  if (!logoUrl) {
    const cleanBrand = brandName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    for (const suffix of ['.com', '.co.il', '.co']) {
      try {
        const clearbitUrl = `https://logo.clearbit.com/${cleanBrand}${suffix}`
        const res = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
        if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
          logoUrl = clearbitUrl
          console.log(`  ✅ Logo: ${logoUrl}`)
          break
        }
      } catch { /* try next */ }
    }
  }
  if (!logoUrl) console.log('  ⚠️ No logo found')
  else console.log(`  ✅ Logo: ${logoUrl}`)

  // Step 1c: Generate AI images
  console.log('\n🖼️  Step 1c: Generating AI images...')
  const brandResearch = (data._brandResearch as any) || {
    brandName,
    industry: 'automotive',
    marketPosition: 'premium value',
    brandPersonality: ['innovative', 'premium', 'accessible'],
    targetDemographics: {
      primaryAudience: { gender: 'mixed', ageRange: '30-50', interests: ['cars', 'family'] }
    },
    confidence: 0.8,
  }

  const proposalContext = {
    goals: (data.goals as any)?.goals || [],
    strategyHeadline: (data.strategy as any)?.strategyHeadline || '',
    activityTitle: (data.creative as any)?.activityTitle || '',
    activityDescription: (data.creative as any)?.activityDescription || '',
    targetDescription: (data.target_audience as any)?.targetDescription || '',
  }

  let imageUrls: Record<string, string> = {}
  let extraImages: { id: string; url: string; placement: string }[] = []
  let imageStrategy: any = null

  try {
    const smartImageSet = await generateSmartImages(
      brandResearch,
      brandColors,
      proposalContext,
      logoUrl,
    )

    console.log(`  ✅ Generated ${smartImageSet.images.length} images (${elapsed(imgStart)}s)`)
    console.log(`  Strategy: ${smartImageSet.strategy.conceptSummary}`)

    // Upload to Supabase
    console.log('\n📤 Uploading images to Supabase...')
    const timestamp = Date.now()
    const brandPrefix = brandName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'brand'

    const uploadImage = async (buffer: Buffer, fileName: string): Promise<string | null> => {
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, buffer, { contentType: 'image/png', upsert: true })
      if (uploadError) {
        console.error(`  Upload failed ${fileName}:`, uploadError.message)
        return null
      }
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName)
      return urlData?.publicUrl || null
    }

    const { legacyMapping, images: allImages } = smartImageSet

    // Upload legacy slots
    if (legacyMapping.cover) {
      const url = await uploadImage(legacyMapping.cover.imageData, `proposals/${brandPrefix}/cover_${timestamp}.png`)
      if (url) imageUrls.coverImage = url
    }
    if (legacyMapping.brand) {
      const url = await uploadImage(legacyMapping.brand.imageData, `proposals/${brandPrefix}/brand_${timestamp}.png`)
      if (url) imageUrls.brandImage = url
    }
    if (legacyMapping.audience) {
      const url = await uploadImage(legacyMapping.audience.imageData, `proposals/${brandPrefix}/audience_${timestamp}.png`)
      if (url) imageUrls.audienceImage = url
    }
    if (legacyMapping.activity) {
      const url = await uploadImage(legacyMapping.activity.imageData, `proposals/${brandPrefix}/activity_${timestamp}.png`)
      if (url) imageUrls.activityImage = url
    }

    // Upload extras
    const legacyIds = [legacyMapping.cover?.id, legacyMapping.brand?.id, legacyMapping.audience?.id, legacyMapping.activity?.id].filter(Boolean)
    const extras = allImages.filter(img => !legacyIds.includes(img.id))
    for (const img of extras) {
      const url = await uploadImage(img.imageData, `proposals/${brandPrefix}/${img.id}_${timestamp}.png`)
      if (url) extraImages.push({ id: img.id, url, placement: img.placement })
    }

    imageStrategy = {
      conceptSummary: smartImageSet.strategy.conceptSummary,
      visualDirection: smartImageSet.strategy.visualDirection,
      totalPlanned: smartImageSet.strategy.images.length,
      totalGenerated: smartImageSet.images.length,
      styleGuide: smartImageSet.promptsData.styleGuide,
    }

    console.log(`  ✅ Uploaded: cover=${!!imageUrls.coverImage}, brand=${!!imageUrls.brandImage}, audience=${!!imageUrls.audienceImage}, activity=${!!imageUrls.activityImage}, extras=${extraImages.length}`)

  } catch (imgErr) {
    console.error(`  ❌ Image generation failed:`, imgErr)
    console.log('  Using existing images from document...')
    const existingImages = data._generatedImages as Record<string, string> | undefined
    const scraped = data._scraped as any
    imageUrls = {
      coverImage: existingImages?.coverImage || scraped?.heroImages?.[0] || '',
      brandImage: existingImages?.brandImage || scraped?.heroImages?.[1] || '',
      audienceImage: existingImages?.audienceImage || scraped?.lifestyleImages?.[0] || '',
      activityImage: existingImages?.activityImage || scraped?.lifestyleImages?.[1] || '',
    }
    extraImages = (data._extraImages as any[]) || []
    imageStrategy = data._imageStrategy
  }

  console.log(`\n⏱️  Phase 1 complete: ${elapsed(imgStart)}s`)

  // ─── Phase 2: Generate Slides ───
  console.log('\n' + '═'.repeat(60))
  console.log('🎨 PHASE 2: Slide Generation')
  console.log('═'.repeat(60))

  const slideStart = Date.now()

  const { generateAIPresentation } = await import('../src/lib/gemini/slide-designer')

  const config = {
    accentColor: brandColors?.primary || '#C41230',
    clientLogoUrl: logoUrl || undefined,
    images: {
      coverImage: imageUrls.coverImage || '',
      brandImage: imageUrls.brandImage || '',
      audienceImage: imageUrls.audienceImage || '',
      activityImage: imageUrls.activityImage || '',
    },
    extraImages,
    imageStrategy,
  }

  console.log(`\nImages available:`)
  console.log(`  cover: ${config.images.coverImage ? '✅' : '❌'}`)
  console.log(`  brand: ${config.images.brandImage ? '✅' : '❌'}`)
  console.log(`  audience: ${config.images.audienceImage ? '✅' : '❌'}`)
  console.log(`  activity: ${config.images.activityImage ? '✅' : '❌'}`)
  console.log(`  extras: ${extraImages.length}`)

  try {
    const presentation = await generateAIPresentation(data as any, config)
    console.log(`\n⏱️  Phase 2 complete: ${elapsed(slideStart)}s`)

    // Save full result
    writeFileSync(`${DEBUG_DIR}/e2e-result.json`, JSON.stringify(presentation, null, 2), 'utf8')

    // ─── Quality Analysis ───
    console.log('\n' + '═'.repeat(60))
    console.log('📊 QUALITY ANALYSIS')
    console.log('═'.repeat(60))

    for (const slide of presentation.slides) {
      const texts = slide.elements.filter(e => e.type === 'text') as any[]
      const shapes = slide.elements.filter(e => e.type === 'shape') as any[]
      const imgs = slide.elements.filter(e => e.type === 'image') as any[]

      // Font ratio (content text only)
      const contentTexts = texts.filter(t => t.role !== 'decorative')
      const fontSizes = contentTexts.map(t => t.fontSize || 20).sort((a: number, b: number) => b - a)
      const ratio = fontSizes.length >= 2 ? (fontSizes[0] / fontSizes[fontSizes.length - 1]).toFixed(1) : 'N/A'

      // Title
      const title = contentTexts.find(t => t.role === 'title')
      const titleY = title?.y || 0
      const titleFs = title?.fontSize || 0
      const zone = `${titleY < 350 ? 'T' : titleY < 600 ? 'M' : 'B'}`

      const dc = (slide as any).dramaticChoice || 'NONE'
      const arch = (slide as any).archetype || 'NONE'

      console.log(`  ${slide.slideType.padEnd(22)} | ${zone} y=${String(titleY).padEnd(4)} ${String(titleFs).padStart(3)}px | ratio ${String(ratio).padEnd(5)}:1 | ${arch.slice(0, 20).padEnd(20)} | DC: ${dc.slice(0, 50)}`)
    }

    // Summary stats
    console.log('\n' + '─'.repeat(60))

    // Title zones
    const titleZones = presentation.slides.map(s => {
      const t = (s.elements.find(e => e.type === 'text' && (e as any).role === 'title') as any)
      if (!t) return '?'
      return t.y < 350 ? 'T' : t.y < 600 ? 'M' : 'B'
    })
    const zoneCount = { T: titleZones.filter(z => z === 'T').length, M: titleZones.filter(z => z === 'M').length, B: titleZones.filter(z => z === 'B').length }
    console.log(`  Title zones: T=${zoneCount.T} M=${zoneCount.M} B=${zoneCount.B} (${titleZones.join('→')})`)

    // Background variety
    const bgTypes = presentation.slides.map(s => s.background.type)
    const gradBg = bgTypes.filter(t => t === 'gradient').length
    const uniqueBg = new Set(presentation.slides.map(s => s.background.value)).size
    console.log(`  Backgrounds: ${gradBg} gradient, ${uniqueBg} unique values`)

    // Font ratios
    const ratios = presentation.slides.map(s => {
      const ct = (s.elements.filter(e => e.type === 'text' && (e as any).role !== 'decorative') as any[])
      const fs = ct.map(t => t.fontSize || 20).sort((a: number, b: number) => b - a)
      return fs.length >= 2 ? fs[0] / fs[fs.length - 1] : 0
    })
    console.log(`  Font ratio ≥ 4:1: ${ratios.filter(r => r >= 4).length}/${presentation.slides.length}`)

    // Canvas bleed
    const bleedSlides = presentation.slides.filter(s =>
      s.elements.some(e => e.x < 0 || e.y < 0 || e.x + e.width > 1920 || e.y + e.height > 1080)
    ).length
    console.log(`  Canvas bleed: ${bleedSlides}/${presentation.slides.length}`)

    // Content images
    const imgSlides = presentation.slides.filter(s =>
      s.elements.some(e => e.type === 'image' && (e as any).src && !(e as any).src.includes('logo') && e.width > 200)
    ).length
    console.log(`  Content images: ${imgSlides}/${presentation.slides.length}`)

    // Dramatic choices
    const dcs = presentation.slides.map(s => (s as any).dramaticChoice || 'NONE')
    const filledDCs = dcs.filter(d => d !== 'NONE').length
    console.log(`  Dramatic choices: ${filledDCs}/${presentation.slides.length} filled`)

    // Archetypes
    const archetypes = presentation.slides.map(s => (s as any).archetype || 'NONE')
    const uniqueArch = new Set(archetypes).size
    let consecutiveRepeats = 0
    for (let i = 1; i < archetypes.length; i++) {
      if (archetypes[i] === archetypes[i - 1]) consecutiveRepeats++
    }
    console.log(`  Archetypes: ${uniqueArch} unique, ${consecutiveRepeats} consecutive repeats`)

    // Effects
    const shadowSlides = presentation.slides.filter(s => s.elements.some(e => (e as any).textShadow)).length
    const boxShadowSlides = presentation.slides.filter(s => s.elements.some(e => (e as any).boxShadow)).length
    console.log(`  textShadow: ${shadowSlides}/${presentation.slides.length} | boxShadow: ${boxShadowSlides}/${presentation.slides.length}`)

    console.log(`\n  Quality: ${presentation.metadata?.qualityScore}/100`)

    // ─── Render HTML ───
    console.log('\n🖼️  Rendering HTML...')
    renderHTML(presentation)

    // ─── Save to Supabase ───
    console.log(`\n💾 Saving to Supabase...`)
    const { data: freshDoc } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
    const freshData = freshDoc?.data as Record<string, unknown> || data
    const { _pipeline, ...cleanData } = freshData as Record<string, unknown> & { _pipeline?: unknown }

    await supabase.from('documents').update({
      data: {
        ...cleanData,
        _brandColors: brandColors,
        _generatedImages: imageUrls,
        _extraImages: extraImages,
        _imageStrategy: imageStrategy,
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

    // Final summary
    console.log('\n' + '═'.repeat(60))
    console.log(`✅ FULL PIPELINE COMPLETE`)
    console.log(`  Images: ${elapsed(imgStart)}s`)
    console.log(`  Slides: ${elapsed(slideStart)}s`)
    console.log(`  Total:  ${elapsed(totalStart)}s`)
    console.log(`  Slides: ${presentation.slides.length}`)
    console.log(`  Quality: ${presentation.metadata?.qualityScore}/100`)
    console.log(`\n📂 Files:\n  ${DEBUG_DIR}/e2e-result.json\n  ${DEBUG_DIR}/presentation.html`)
    console.log('═'.repeat(60))

  } catch (err) {
    console.error(`\n❌ Slide generation failed after ${elapsed(slideStart)}s:`, err)
    process.exit(1)
  }
}

function renderHTML(presentation: any) {
  const slides = presentation.slides || []

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
    .slide { position: relative; width: 960px; height: 540px; overflow: hidden; border-radius: 8px; }
    .slide-inner { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; transform: scale(0.5); transform-origin: top left; }
  </style>
</head>
<body>
  <h1>${presentation.title || 'Presentation'}</h1>
  <div class="meta">Quality: ${presentation.metadata?.qualityScore || 'N/A'}/100 | ${slides.length} slides</div>
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
        const bgColor = el.backgroundColor ? `background-color:${el.backgroundColor};` : ''
        const pad = el.padding ? `padding:${el.padding}px;` : ''
        const brd = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        return `<div style="${base} color:${color}; font-size:${fontSize}px; font-weight:${fontWeight}; text-align:${textAlign}; line-height:${lineHeight}; font-family:'Heebo',sans-serif; direction:rtl; overflow:hidden; white-space:pre-wrap; word-wrap:break-word; ${letterSpacing} ${stroke} ${tShadow} ${bShadow} ${bgColor} ${pad} ${brd}">${el.content || ''}</div>`
      }

      if (el.type === 'image') {
        const fit = el.objectFit || 'cover'
        const br = el.borderRadius ? `border-radius:${el.borderRadius}px;` : ''
        const shadow = el.boxShadow ? `box-shadow:${el.boxShadow};` : ''
        const imgFilter = el.filter ? `filter:${el.filter};` : ''
        const clip = el.clipPath ? `clip-path:${el.clipPath};` : ''
        return `<div style="${base} ${br} ${shadow} ${clip} overflow:hidden;"><img src="${el.src || ''}" alt="${el.alt || ''}" style="width:100%; height:100%; object-fit:${fit}; ${imgFilter}" onerror="this.style.display='none'" /></div>`
      }
      return ''
    }).join('\n      ')

    const dc = slide.dramaticChoice ? ` | DC: ${slide.dramaticChoice.slice(0, 60)}` : ''
    return `
  <div class="slide-wrapper">
    <div class="slide-label">${si + 1}. ${slide.slideType} — ${slide.label || ''} [${(slide.archetype || '').slice(0, 40)}]${dc}</div>
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
