/**
 * Quick test script: generate slides for an existing document
 * Run: npx tsx scripts/test-slides.ts
 */

import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'

async function main() {
  console.log('📦 Loading document...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: doc, error } = await supabase.from('documents').select('data').eq('id', DOC_ID).single()
  if (error || !doc) { console.error('Doc not found:', error); process.exit(1) }

  const data = doc.data as Record<string, unknown>
  console.log(`Brand: ${data.brandName}`)
  console.log(`Keys: ${Object.keys(data).join(', ')}`)

  // Import slide designer
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

    console.log(`\n✅ Done in ${duration}s`)
    console.log(`📊 ${presentation.slides.length} slides, quality: ${presentation.metadata?.qualityScore}/100`)

    // Analyze quality
    let totalMissingColor = 0, totalMissingFill = 0, totalMissingRole = 0
    for (const slide of presentation.slides) {
      const texts = slide.elements.filter(e => e.type === 'text')
      const shapes = slide.elements.filter(e => e.type === 'shape')
      const noColor = texts.filter(t => !(t as any).color).length
      const noFill = shapes.filter(s => !(s as any).fill).length
      const noRole = texts.filter(t => !(t as any).role).length
      totalMissingColor += noColor
      totalMissingFill += noFill
      totalMissingRole += noRole

      const issues = []
      if (noColor) issues.push(`${noColor} no-color`)
      if (noFill) issues.push(`${noFill} no-fill`)
      if (noRole) issues.push(`${noRole} no-role`)

      console.log(`  ${slide.slideType.padEnd(20)} [${slide.label}] — ${texts.length}t/${shapes.length}s — ${issues.length ? issues.join(', ') : '✅ OK'}`)
    }

    console.log(`\n📋 Summary:`)
    console.log(`  Missing color: ${totalMissingColor}`)
    console.log(`  Missing fill: ${totalMissingFill}`)
    console.log(`  Missing role: ${totalMissingRole}`)

    // Save to document
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

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`\n❌ Failed after ${duration}s:`, err)
    process.exit(1)
  }
}

main()
