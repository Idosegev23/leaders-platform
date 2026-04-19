/**
 * E2E Test — calls the REAL staged pipeline via direct function imports.
 * Creates a full HTML-native presentation and analyzes quality.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'

async function main() {
  const startTime = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  console.log('📦 Loading document...')
  const { data: doc, error } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
  if (error || !doc) { console.error('Doc not found:', error); process.exit(1) }

  const data = doc.data as Record<string, unknown>
  console.log(`✅ Brand: ${data.brandName}`)

  // ── Step 1: Foundation ──
  console.log('\n🏗️ Step 1: Foundation...')
  const t1 = Date.now()
  const { pipelineFoundation } = await import('../src/lib/gemini/slide-designer')
  
  const images = (data._generatedImages as Record<string, string>) || {}
  const brandColors = data._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
  const scraped = data._scraped as { logoUrl?: string } | undefined
  
  const config2 = {
    accentColor: brandColors?.primary,
    clientLogoUrl: scraped?.logoUrl || '',
    images: {
      coverImage: images.coverImage || '',
      brandImage: images.brandImage || '',
      audienceImage: images.audienceImage || '',
      activityImage: images.activityImage || '',
    },
    extraImages: (data._extraImages || []) as { id: string; url: string; placement: string }[],
  }

  const foundation = await pipelineFoundation(data, config2)
  console.log(`✅ Foundation: ${foundation.totalSlides} slides in ${foundation.batchCount} batches (${Date.now() - t1}ms)`)
  console.log(`   Design System: primary=${foundation.designSystem.colors.primary}, metaphor="${foundation.designSystem.creativeDirection?.visualMetaphor?.slice(0, 60)}"`)

  // ── Step 2: HTML Batches ──
  console.log('\n🎨 Step 2: HTML Batches...')
  const { pipelineBatchHtml } = await import('../src/lib/gemini/slide-designer')
  
  const allHtmlSlides: string[] = []
  const allSlideTypes: string[] = []
  
  for (let bi = 0; bi < foundation.batchCount; bi++) {
    const t2 = Date.now()
    console.log(`  Batch ${bi + 1}/${foundation.batchCount}...`)
    const result = await pipelineBatchHtml(foundation, bi)
    allHtmlSlides.push(...result.htmlSlides)
    allSlideTypes.push(...result.slideTypes)
    console.log(`  ✅ Batch ${bi + 1}: ${result.htmlSlides.length} slides (${Date.now() - t2}ms)`)
  }

  // ── Step 3: Finalize ──
  console.log('\n📋 Step 3: Finalize...')
  const t3 = Date.now()
  const { pipelineFinalizeHtml } = await import('../src/lib/gemini/slide-designer')
  const presentation = await pipelineFinalizeHtml(foundation, allHtmlSlides, allSlideTypes)
  console.log(`✅ Finalized: ${presentation.htmlSlides.length} slides, quality: ${presentation.metadata.qualityScore}/100 (${Date.now() - t3}ms)`)

  // ── Step 4: Save to Supabase ──
  console.log('\n💾 Saving to Supabase...')
  const { addVersion, createHtmlVersion } = await import('../src/lib/version-history')
  const versions = addVersion(
    (data._versions || []) as any[],
    createHtmlVersion(presentation.htmlSlides.length, presentation.metadata.qualityScore)
  )

  await supabase.from('documents').update({
    data: {
      ...data,
      _htmlPresentation: presentation,
      _pipeline: { status: 'complete', foundation, htmlBatchResults: [] },
      _versions: versions,
    },
  }).eq('id', DOC_ID)
  console.log('✅ Saved to Supabase')

  // ── Step 5: Analyze Quality ──
  console.log('\n🔍 Quality Analysis:')
  const totalDuration = Date.now() - startTime
  
  console.log(`  Total time: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`  Slides: ${presentation.htmlSlides.length}`)
  console.log(`  Types: ${allSlideTypes.join(', ')}`)
  
  // Check each slide
  let layerScore = 0
  for (let i = 0; i < presentation.htmlSlides.length; i++) {
    const html = presentation.htmlSlides[i]
    const type = allSlideTypes[i] || '?'
    const hasGlow = /radial-gradient/.test(html)
    const hasWatermark = /opacity:\s*0\.0[1-9]|opacity:\s*0\.1/.test(html)
    const hasShadow = /text-shadow/.test(html)
    const hasHebrew = /[\u0590-\u05FF]/.test(html)
    const hasRTL = /rtl|direction:\s*rtl/.test(html)
    const layers = [
      /background/.test(html),           // L0
      hasGlow,                             // L1
      /border-radius|clip-path/.test(html), // L2
      hasHebrew,                           // L3
      hasWatermark || /letter-spacing:\s*[4-9]|letter-spacing:\s*1[0-9]/.test(html), // L4
    ].filter(Boolean).length
    
    layerScore += layers
    const status = layers >= 4 ? '✅' : layers >= 3 ? '⚠️' : '❌'
    console.log(`  ${status} Slide ${i+1} (${type.padEnd(18)}): ${layers}/5 layers | shadow=${hasShadow?'Y':'N'} glow=${hasGlow?'Y':'N'} RTL=${hasRTL?'Y':'N'} ${html.length} chars`)
  }
  
  const avgLayers = (layerScore / presentation.htmlSlides.length).toFixed(1)
  console.log(`\n  📊 Average layers: ${avgLayers}/5`)
  console.log(`  📊 Quality score: ${presentation.metadata.qualityScore}/100`)
  console.log(`  📊 Total duration: ${(totalDuration / 1000).toFixed(1)}s`)
  
  // Save HTML for visual inspection
  const { writeFileSync, mkdirSync } = await import('fs')
  mkdirSync('/tmp/slide-debug', { recursive: true })
  for (let i = 0; i < presentation.htmlSlides.length; i++) {
    writeFileSync(`/tmp/slide-debug/slide-${i+1}-${allSlideTypes[i]}.html`, presentation.htmlSlides[i])
  }
  console.log(`\n  📁 HTML files saved to /tmp/slide-debug/`)
  console.log(`  Open: open /tmp/slide-debug/slide-1-cover.html`)
  
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  E2E TEST COMPLETE`)
  console.log(`  ${presentation.htmlSlides.length} slides | quality ${presentation.metadata.qualityScore}/100 | ${(totalDuration/1000).toFixed(1)}s`)
  console.log(`${'═'.repeat(50)}`)
}

main().catch(err => { console.error('❌ E2E FAILED:', err); process.exit(1) })
