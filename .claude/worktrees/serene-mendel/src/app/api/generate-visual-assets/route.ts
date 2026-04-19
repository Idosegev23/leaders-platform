import { NextRequest, NextResponse } from 'next/server'
import { extractColorsFromLogo, analyzeColorPalette, extractColorsByBrandName } from '@/lib/gemini/color-extractor'

export const maxDuration = 600
import type { BrandColors } from '@/lib/gemini/color-extractor'
import { generateSmartImages } from '@/lib/gemini/israeli-image-generator'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/generate-visual-assets
 *
 * Generates visual assets for a proposal:
 * 1. Gemini AI analyzes brand colors (PRIMARY - runs in parallel)
 * 2. Scrapes brand website for logo & images (SECONDARY - runs in parallel)
 * 3. Merges: Gemini colors + scraped logo/images
 * 4. Generates smart AI images using brand data
 * 5. Uploads everything to Supabase Storage
 *
 * Returns: { scraped, brandColors, generatedImages, imageStrategy }
 */

async function uploadImageToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/png'
): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[Visual Assets][Upload] Failed ${fileName}:`, uploadError)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)

    return urlData?.publicUrl || null
  } catch (error) {
    console.error(`[Visual Assets][Upload] Error ${fileName}:`, error)
    return null
  }
}

export async function POST(request: NextRequest) {
  const requestId = `va-${Date.now()}`
  console.log(`[Visual Assets][${requestId}] Starting visual assets generation`)

  try {
    const body = await request.json()
    const {
      brandName,
      brandResearch,
      stepData,
      websiteUrl,
    } = body

    if (!brandName) {
      return NextResponse.json({ error: 'brandName is required' }, { status: 400 })
    }

    const startTime = Date.now()

    // ─── Step 1: Gemini AI brand analysis + Website scrape (IN PARALLEL) ───
    console.log(`[Visual Assets][${requestId}] Step 1: Gemini brand analysis + scrape (parallel)`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scrapedData: any = null
    let logoUrl: string | null = null

    const siteUrl = websiteUrl
      || brandResearch?.website
      || null

    // Run BOTH in parallel - Gemini is primary, scrape is for images/logo only
    const [geminiResult, scrapeResult] = await Promise.allSettled([
      // PRIMARY: Gemini brand analysis with Google Search
      (async () => {
        console.log(`[Visual Assets][${requestId}] [Gemini PRIMARY] Analyzing brand: ${brandName}`)
        const colors = await extractColorsByBrandName(brandName)
        console.log(`[Visual Assets][${requestId}] [Gemini PRIMARY] Done: primary=${colors.primary}, accent=${colors.accent}`)
        return colors
      })(),
      // SECONDARY: Website scrape for images/logo
      (async () => {
        if (!siteUrl) {
          console.log(`[Visual Assets][${requestId}] [Scrape] No website URL - skipping`)
          return null
        }
        console.log(`[Visual Assets][${requestId}] [Scrape] Fetching: ${siteUrl}`)
        const scrapeRes = await fetch(new URL('/api/scrape', request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: siteUrl, enhanced: true }),
        })
        const scrapeJson = await scrapeRes.json()
        if (scrapeJson.success && scrapeJson.data) {
          console.log(`[Visual Assets][${requestId}] [Scrape] Done: logo=${!!scrapeJson.data.logoUrl}, images=${scrapeJson.data.allImages?.length || 0}`)
          return scrapeJson.data
        }
        return null
      })(),
    ])

    // ─── Step 2: Merge results - Gemini colors + scraped images ───
    console.log(`[Visual Assets][${requestId}] Step 2: Merging results`)

    // Extract Gemini colors (PRIMARY source)
    let brandColors: BrandColors | null = null
    let geminiLogoUrl: string | null = null

    if (geminiResult.status === 'fulfilled' && geminiResult.value) {
      const gc = geminiResult.value
      // Accept if not default placeholder colors
      if (gc.primary !== '#111111' || gc.accent !== '#E94560') {
        brandColors = gc
        geminiLogoUrl = gc.logoUrl || null
        console.log(`[Visual Assets][${requestId}] Colors from Gemini (PRIMARY): primary=${brandColors.primary}, accent=${brandColors.accent}`)
      } else {
        console.log(`[Visual Assets][${requestId}] Gemini returned defaults - will try logo vision`)
      }
    } else {
      console.error(`[Visual Assets][${requestId}] Gemini brand analysis failed:`, geminiResult.status === 'rejected' ? geminiResult.reason : 'empty')
    }

    // Extract scraped data (for images/logo only)
    if (scrapeResult.status === 'fulfilled' && scrapeResult.value) {
      scrapedData = scrapeResult.value
      logoUrl = scrapedData.logoUrl || scrapedData.ogImage || scrapedData.favicon || null
    }

    // Use Gemini's logo URL if scraping didn't find one
    if (!logoUrl && geminiLogoUrl) {
      logoUrl = geminiLogoUrl
      console.log(`[Visual Assets][${requestId}] Using Gemini logo URL: ${logoUrl}`)
    }

    // Clearbit Logo API — fast, free, reliable fallback
    if (!logoUrl && siteUrl) {
      try {
        const domain = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname
        const clearbitUrl = `https://logo.clearbit.com/${domain}`
        console.log(`[Visual Assets][${requestId}] [Clearbit] Trying: ${clearbitUrl}`)
        const clearbitRes = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        if (clearbitRes.ok && clearbitRes.headers.get('content-type')?.startsWith('image/')) {
          logoUrl = clearbitUrl
          console.log(`[Visual Assets][${requestId}] [Clearbit] Found logo via domain`)
        }
      } catch (clearbitErr) {
        console.log(`[Visual Assets][${requestId}] [Clearbit] Domain attempt failed:`, clearbitErr)
      }
    }

    // Clearbit with Gemini's websiteDomain (if Gemini returned one)
    if (!logoUrl && geminiResult.status === 'fulfilled' && geminiResult.value) {
      const websiteDomain = geminiResult.value.websiteDomain
      if (websiteDomain) {
        try {
          const clearbitUrl = `https://logo.clearbit.com/${websiteDomain}`
          console.log(`[Visual Assets][${requestId}] [Clearbit] Trying Gemini domain: ${clearbitUrl}`)
          const res = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
          if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
            logoUrl = clearbitUrl
            console.log(`[Visual Assets][${requestId}] [Clearbit] Found logo via Gemini domain`)
          }
        } catch { /* skip */ }
      }
    }

    // Clearbit with brand name domain guess (last resort)
    if (!logoUrl && brandName) {
      const cleanBrand = brandName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      if (cleanBrand.length >= 2) {
        for (const suffix of ['.com', '.co.il', '.co']) {
          try {
            const clearbitUrl = `https://logo.clearbit.com/${cleanBrand}${suffix}`
            const res = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
            if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
              logoUrl = clearbitUrl
              console.log(`[Visual Assets][${requestId}] [Clearbit] Found logo via brand guess: ${cleanBrand}${suffix}`)
              break
            }
          } catch { /* try next */ }
        }
      }
    }

    // ENHANCE: If Gemini failed but we have a logo, use vision to extract colors
    if (!brandColors && logoUrl) {
      try {
        console.log(`[Visual Assets][${requestId}] Gemini failed → trying logo vision: ${logoUrl}`)
        brandColors = await extractColorsFromLogo(logoUrl)
        console.log(`[Visual Assets][${requestId}] Colors from logo vision: primary=${brandColors.primary}`)
      } catch (logoErr) {
        console.error(`[Visual Assets][${requestId}] Logo vision failed:`, logoErr)
      }
    }

    // ENHANCE: If Gemini failed and logo failed, try CSS colors from scrape
    if (!brandColors) {
      const cssColors = scrapedData?.colorPalette || scrapedData?.dominantColors || scrapedData?.cssColors
      if (cssColors?.length > 0) {
        try {
          brandColors = await analyzeColorPalette(cssColors)
          console.log(`[Visual Assets][${requestId}] Colors from CSS fallback: primary=${brandColors.primary}`)
        } catch {
          // continue to defaults
        }
      }
    }

    // Default colors if absolutely everything failed
    if (!brandColors) {
      brandColors = {
        primary: '#111111',
        secondary: '#666666',
        accent: '#2563EB',
        background: '#FFFFFF',
        text: '#111111',
        palette: ['#111111', '#666666', '#2563EB'],
        style: 'minimal' as const,
        mood: 'מודרני ומינימליסטי',
      }
      console.log(`[Visual Assets][${requestId}] Using default colors (all methods failed)`)
    }

    // ─── Step 3: Generate AI images ───
    console.log(`[Visual Assets][${requestId}] Step 3: Generating AI images`)

    const imageUrls: Record<string, string | undefined> = {}
    const extraImageUrls: { id: string; url: string; placement: string }[] = []
    let imageStrategyMeta: {
      conceptSummary: string
      visualDirection: string
      totalPlanned: number
      totalGenerated: number
      styleGuide: string
    } | undefined

    // Build a minimal BrandResearch object for image generation
    const researchForImages: BrandResearch = brandResearch || {
      brandName,
      industry: stepData?.brief?.brandBrief?.match(/תעשיי[הת]\s+(\S+)/)?.[1] || '',
      marketPosition: '',
      brandPersonality: [],
      targetDemographics: {
        primaryAudience: {
          gender: stepData?.target_audience?.targetGender || '',
          ageRange: stepData?.target_audience?.targetAgeRange || '25-45',
          interests: [],
        },
      },
      confidence: 0.5,
    } as unknown as BrandResearch

    // Build proposal content context from stepData for better prompts
    const proposalContext = stepData ? {
      goals: stepData.goals?.goals || [],
      strategyHeadline: stepData.strategy?.strategyHeadline || '',
      activityTitle: stepData.creative?.activityTitle || '',
      activityDescription: stepData.creative?.activityDescription || '',
      targetDescription: stepData.target_audience?.targetDescription || '',
    } : undefined

    try {
      console.log(`[Visual Assets][${requestId}] Calling generateSmartImages | Model: gemini-3-pro-image-preview | brand=${brandName}, hasLogo=${!!logoUrl}, hasBrandColors=${!!brandColors}`)
      // Pass logoUrl so Gemini integrates client logo natively into generated images
      const smartImageSet = await generateSmartImages(
        researchForImages,
        brandColors,
        proposalContext,
        logoUrl,
      )

      const { legacyMapping, images: allSmartImages } = smartImageSet

      // Upload images to Supabase Storage
      const timestamp = Date.now()
      // Supabase storage keys must be ASCII-only
      const brandPrefix = brandName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 20) || `brand_${timestamp}`

      const uploadPromises: Promise<void>[] = []

      // Upload legacy-mapped images (cover, brand, audience, activity)
      if (legacyMapping.cover) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.cover.imageData, `proposals/${brandPrefix}/cover_${timestamp}.png`)
            .then(url => { if (url) imageUrls.coverImage = url })
        )
      }
      if (legacyMapping.brand) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.brand.imageData, `proposals/${brandPrefix}/brand_${timestamp}.png`)
            .then(url => { if (url) imageUrls.brandImage = url })
        )
      }
      if (legacyMapping.audience) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.audience.imageData, `proposals/${brandPrefix}/audience_${timestamp}.png`)
            .then(url => { if (url) imageUrls.audienceImage = url })
        )
      }
      if (legacyMapping.activity) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.activity.imageData, `proposals/${brandPrefix}/activity_${timestamp}.png`)
            .then(url => { if (url) imageUrls.activityImage = url })
        )
      }

      // Upload extra images beyond the 4 legacy slots
      const legacyIds = [
        legacyMapping.cover?.id, legacyMapping.brand?.id,
        legacyMapping.audience?.id, legacyMapping.activity?.id,
      ].filter(Boolean)
      const extras = allSmartImages.filter(img => !legacyIds.includes(img.id))
      for (const img of extras) {
        uploadPromises.push(
          uploadImageToStorage(img.imageData, `proposals/${brandPrefix}/${img.id}_${timestamp}.png`)
            .then(url => {
              if (url) extraImageUrls.push({ id: img.id, url, placement: img.placement })
            })
        )
      }

      await Promise.all(uploadPromises).catch(err => {
        console.error(`[Visual Assets][${requestId}] Image upload error:`, err)
      })

      imageStrategyMeta = {
        conceptSummary: smartImageSet.strategy.conceptSummary,
        visualDirection: smartImageSet.strategy.visualDirection,
        totalPlanned: smartImageSet.strategy.images.length,
        totalGenerated: smartImageSet.images.length,
        styleGuide: smartImageSet.promptsData.styleGuide,
      }

      console.log(`[Visual Assets][${requestId}] Images generated: ${smartImageSet.images.length}/${smartImageSet.strategy.images.length}`)
      console.log(`[Visual Assets][${requestId}] Uploaded: cover=${!!imageUrls.coverImage}, brand=${!!imageUrls.brandImage}, audience=${!!imageUrls.audienceImage}, activity=${!!imageUrls.activityImage}, extras=${extraImageUrls.length}`)
    } catch (imgErr) {
      console.error(`[Visual Assets][${requestId}] Image generation failed entirely:`, imgErr)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[Visual Assets][${requestId}] Complete in ${elapsed}s`)

    return NextResponse.json({
      success: true,
      scraped: scrapedData ? {
        logoUrl: scrapedData.logoUrl || logoUrl || null,
        logoAlternatives: scrapedData.logoAlternatives || [],
        heroImages: scrapedData.heroImages || [],
        productImages: scrapedData.productImages || [],
        lifestyleImages: scrapedData.lifestyleImages || [],
      } : logoUrl ? {
        logoUrl,
        logoAlternatives: [],
        heroImages: [],
        productImages: [],
        lifestyleImages: [],
      } : null,
      brandColors,
      generatedImages: imageUrls,
      extraImages: extraImageUrls,
      imageStrategy: imageStrategyMeta || null,
      elapsed,
    })
  } catch (error) {
    console.error(`[Visual Assets][${requestId}] Error:`, error)
    return NextResponse.json(
      { error: 'Failed to generate visual assets', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
