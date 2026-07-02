import { NextRequest, NextResponse } from 'next/server'
import { extractColorsFromLogo, analyzeColorPalette, extractColorsByBrandName } from '@/lib/gemini/color-extractor'

export const maxDuration = 600
import type { BrandColors } from '@/lib/gemini/color-extractor'
import { generateSmartImages } from '@/lib/gemini/israeli-image-generator'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import { createClient } from '@/lib/supabase/server'
import { compositeLogo } from '@/lib/utils/image-compositor'
import { fetchScrape } from '@/lib/apify/fetch-scraper'
import { validateExternalUrl } from '@/lib/utils/url-validator'
import { resolveBrandLogo } from '@/lib/brand/logo-resolver'
import { collectProductImages } from '@/lib/brand/product-images'
import { generateBrandScene } from '@/lib/brand/scene-generator'
import type { BrandAssets, BrandLogoAsset, SceneImageAsset } from '@/lib/brand/types'

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

/** Reject after `ms` so a slow brand-asset stage falls into its catch-and-continue
 *  path instead of eating the route's maxDuration. The underlying promise keeps
 *  running detached — acceptable, the route just stops waiting for it. */
function withTimeout<T>(ms: number, label: string, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ])
}

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
      documentId,
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
      // SECONDARY: Website scrape for images/logo. Calls the lib directly
      // instead of round-tripping through /api/scrape so server-to-server
      // calls don't hit the 401 from /api/scrape's auth wrapper (the inner
      // fetch carries no cookies in production).
      (async () => {
        if (!siteUrl) {
          console.log(`[Visual Assets][${requestId}] [Scrape] No website URL - skipping`)
          return null
        }
        let safeUrl: string
        try {
          safeUrl = validateExternalUrl(siteUrl)
        } catch {
          console.log(`[Visual Assets][${requestId}] [Scrape] Invalid/blocked URL: ${siteUrl}`)
          return null
        }
        console.log(`[Visual Assets][${requestId}] [Scrape] Fetching: ${safeUrl}`)
        try {
          const data = await fetchScrape(safeUrl)
          console.log(`[Visual Assets][${requestId}] [Scrape] Done: logo=${!!data.logoUrl}, images=${data.allImages?.length || 0}`)
          return data
        } catch (e) {
          console.error(`[Visual Assets][${requestId}] [Scrape] Failed:`, e)
          return null
        }
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
    }

    // ── Logo resolver v2 (art-director engine C1) ──
    // Chain: scraped site logo → Brandfetch CDN → Logo.dev → og:image → favicon,
    // every accepted candidate VLM-verified. Replaces the dead Clearbit chain
    // (Clearbit Logo API DNS gone since Dec 2025). Missing env keys just skip
    // that source; a resolver failure falls back to the pre-resolver behavior.
    const geminiWebsiteDomain =
      geminiResult.status === 'fulfilled' ? geminiResult.value?.websiteDomain : undefined
    let brandLogo: BrandLogoAsset | null = null
    try {
      // Time-budgeted: the resolver's serial VLM chain must not eat the
      // route's maxDuration (the legacy imagery passes below were sized to it).
      brandLogo = await withTimeout(90_000, 'logo resolver', resolveBrandLogo({
        brandName,
        domain: siteUrl || geminiWebsiteDomain || undefined,
        scraped: {
          logoUrl: scrapedData?.logoUrl || geminiLogoUrl || undefined,
          ogImage: scrapedData?.ogImage || undefined,
          favicon: scrapedData?.favicon || undefined,
        },
      }))
      if (brandLogo) {
        logoUrl = brandLogo.url
        console.log(`[Visual Assets][${requestId}] [LogoResolver] ${brandLogo.status} via ${brandLogo.source}: ${brandLogo.url}`)
      } else {
        console.log(`[Visual Assets][${requestId}] [LogoResolver] No logo candidates found`)
      }
    } catch (logoErr) {
      console.warn(`[Visual Assets][${requestId}] [LogoResolver] Failed — falling back to legacy chain:`, logoErr instanceof Error ? logoErr.message : logoErr)
      logoUrl = scrapedData?.logoUrl || scrapedData?.ogImage || scrapedData?.favicon || null
    }

    // Use Gemini's logo URL if the resolver came up empty
    if (!logoUrl && geminiLogoUrl) {
      logoUrl = geminiLogoUrl
      console.log(`[Visual Assets][${requestId}] Using Gemini logo URL: ${logoUrl}`)
    }

    // ── Gemini URL Context: if all logo lookups failed, scrape the website for the logo ──
    if (!logoUrl && siteUrl) {
      console.log(`[Visual Assets][${requestId}] 🌐 All logo lookups failed — scraping website for logo tag...`)
      try {
        const { callAI: callAILogo } = await import('@/lib/ai-provider')
        const urlResult = await callAILogo({
          model: 'gemini-3.5-flash',
          prompt: `Visit ${siteUrl} and find the logo image URL. Look for:
1. <img> tags with alt containing "logo" or the brand name
2. <link rel="icon"> or <link rel="apple-touch-icon">
3. og:image meta tag
4. SVG logos inline or as <img src>
Return ONLY the absolute URL of the best quality logo image. No explanation, just the URL.`,
          useUrlContext: true,
          callerId: `${requestId}-logo-scrape`,
          maxOutputTokens: 512,
        })
        const foundUrl = (urlResult.text || '').trim()
        if (foundUrl.startsWith('http') && !foundUrl.includes(' ')) {
          logoUrl = foundUrl
          console.log(`[Visual Assets][${requestId}] ✅ Logo found via website scrape: ${logoUrl}`)
        }
      } catch (scrapeErr) {
        console.warn(`[Visual Assets][${requestId}] ⚠️ Website logo scrape failed:`, scrapeErr instanceof Error ? scrapeErr.message : scrapeErr)
      }
    }

    // ENHANCE: If Gemini failed but we have a logo, use vision to extract colors
    if (!brandColors && logoUrl) {
      console.log(`[Visual Assets][${requestId}] Gemini failed → trying logo vision: ${logoUrl}`)
      brandColors = await extractColorsFromLogo(logoUrl)
      if (brandColors) {
        console.log(`[Visual Assets][${requestId}] Colors from logo vision: primary=${brandColors.primary}`)
      } else {
        console.warn(`[Visual Assets][${requestId}] Logo vision failed, falling back`)
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
    let colorsFallback = false
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
      colorsFallback = true
      console.warn(`[Visual Assets][${requestId}] ⚠️ Using DEFAULT colors (all extraction methods failed) — brand identity may be inaccurate`)
    }

    // ─── Step 2.5: Brand assets — verified product photos + scene pre-pass (C2+C3) ───
    // Failures here never block the route: assets are simply absent and the
    // legacy imagery flow below behaves exactly as before.
    const brandAssets: BrandAssets = { updatedAt: new Date().toISOString() }
    if (brandLogo) brandAssets.logo = brandLogo

    try {
      const wizardReferenceImages = [
        ...(stepData?.creative?.referenceImages || []),
        ...(stepData?.deliverables?.referenceImages || []),
      ]
        .map((r: { url?: string } | string) => (typeof r === 'string' ? r : r?.url || ''))
        .filter(Boolean)

      const productImages = await withTimeout(120_000, 'product images', collectProductImages({
        brandName,
        productContext: brandResearch?.industry || undefined,
        scraped: scrapedData
          ? {
              heroImages: scrapedData.heroImages || [],
              ogImage: scrapedData.ogImage || undefined,
              images: [
                ...(scrapedData.productImages || []),
                ...(scrapedData.lifestyleImages || []),
              ],
            }
          : undefined,
        wizardReferenceImages,
      }))
      if (productImages.length) brandAssets.productImages = productImages
      console.log(`[Visual Assets][${requestId}] [ProductImages] ${productImages.filter(p => p.status === 'verified').length} verified / ${productImages.length} collected`)
    } catch (productErr) {
      console.warn(`[Visual Assets][${requestId}] [ProductImages] Failed (continuing without):`, productErr instanceof Error ? productErr.message : productErr)
    }

    // Scene pre-pass: up to 2 brand-faithful scenes (hero-cover + one content
    // scene) seeded with VERIFIED product photos only. Hard ~120s cap.
    try {
      const verifiedProducts = (brandAssets.productImages || []).filter(p => p.status === 'verified')
      if (verifiedProducts.length >= 1) {
        const artDirection =
          stepData?.creative?.visualDirection ||
          brandColors.mood ||
          'premium editorial lifestyle scene, cinematic lighting'
        const productRefs = verifiedProducts.map(p => p.url)
        const sceneDeadline = Date.now() + 120_000
        const scenes: SceneImageAsset[] = []
        for (const forSlideType of ['hero-cover', 'split-image-text']) {
          const remaining = sceneDeadline - Date.now()
          if (remaining <= 5_000) {
            console.log(`[Visual Assets][${requestId}] [ScenePrePass] Budget exhausted — stopping at ${scenes.length} scenes`)
            break
          }
          const scene = await Promise.race([
            generateBrandScene({
              brandName,
              forSlideType,
              artDirection,
              designSystem: {
                colors: {
                  primary: brandColors.primary,
                  secondary: brandColors.secondary,
                  accent: brandColors.accent,
                  background: brandColors.background,
                  text: brandColors.text,
                },
              },
              productRefs,
              documentId: (documentId as string) || '',
            }),
            new Promise<SceneImageAsset | null>(resolve => setTimeout(() => resolve(null), remaining)),
          ])
          if (scene) scenes.push(scene)
        }
        if (scenes.length) brandAssets.sceneImages = scenes
        console.log(`[Visual Assets][${requestId}] [ScenePrePass] ${scenes.length} scenes (${scenes.filter(s => s.status === 'verified').length} verified)`)
      } else {
        console.log(`[Visual Assets][${requestId}] [ScenePrePass] Skipped: no verified product images`)
      }
    } catch (sceneErr) {
      console.warn(`[Visual Assets][${requestId}] [ScenePrePass] Failed (continuing without):`, sceneErr instanceof Error ? sceneErr.message : sceneErr)
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
      console.log(`[Visual Assets][${requestId}] Calling generateSmartImages | Model: gemini-3-pro-image | brand=${brandName}, hasLogo=${!!logoUrl}, hasBrandColors=${!!brandColors}`)
      // Pass logoUrl so Gemini integrates client logo natively into generated images
      // Extract design hints from brand personality for image alignment
      const personality = researchForImages.brandPersonality || []
      const designHints = {
        visualMetaphor: personality.length ? `${personality.join(' + ')} brand aesthetic` : undefined,
        visualTension: researchForImages.marketPosition ? `${researchForImages.marketPosition} visual language` : undefined,
        imageTreatment: 'full-bleed or split-screen — dark moody backgrounds with brand color accents',
      }

      const smartImageSet = await generateSmartImages(
        researchForImages,
        brandColors,
        proposalContext,
        logoUrl,
        designHints,
      )

      const { legacyMapping, images: allSmartImages } = smartImageSet

      // ─── Fetch client logo buffer for compositing onto generated images ───
      let clientLogoBuffer: Buffer | null = null
      if (logoUrl) {
        // Clearbit fallback removed — the Logo API is dead (DNS gone Dec 2025).
        const logoFetchUrls = [logoUrl]

        for (const fetchUrl of logoFetchUrls) {
          try {
            console.log(`[Visual Assets][${requestId}] Fetching logo for compositing: ${fetchUrl}`)
            const logoRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000) })
            if (logoRes.ok) {
              clientLogoBuffer = Buffer.from(await logoRes.arrayBuffer())
              console.log(`[Visual Assets][${requestId}] Client logo buffer: ${clientLogoBuffer.length} bytes`)
              break
            }
          } catch (logoErr) {
            console.warn(`[Visual Assets][${requestId}] Logo fetch failed (${fetchUrl}):`, logoErr instanceof Error ? logoErr.message : logoErr)
          }
        }
      }

      // Helper: composite brand logo onto image, then upload
      const compositeAndUpload = async (imageBuffer: Buffer, fileName: string): Promise<string | null> => {
        let finalBuffer = imageBuffer
        if (clientLogoBuffer) {
          finalBuffer = await compositeLogo(imageBuffer, {
            logoBuffer: clientLogoBuffer,
            logoWidthRatio: 0.12,
            corner: 'bottom-right',
            padding: 40,
            opacity: 0.82,
          })
        }
        return uploadImageToStorage(finalBuffer, fileName)
      }

      // Upload images to Supabase Storage (with logo composited)
      const timestamp = Date.now()
      // Supabase storage keys must be ASCII-only
      const brandPrefix = brandName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 20) || `brand_${timestamp}`

      const uploadPromises: Promise<void>[] = []

      // Upload legacy-mapped images (cover, brand, audience, activity)
      if (legacyMapping.cover) {
        uploadPromises.push(
          compositeAndUpload(legacyMapping.cover.imageData, `proposals/${brandPrefix}/cover_${timestamp}.png`)
            .then(url => { if (url) imageUrls.coverImage = url })
        )
      }
      if (legacyMapping.brand) {
        uploadPromises.push(
          compositeAndUpload(legacyMapping.brand.imageData, `proposals/${brandPrefix}/brand_${timestamp}.png`)
            .then(url => { if (url) imageUrls.brandImage = url })
        )
      }
      if (legacyMapping.audience) {
        uploadPromises.push(
          compositeAndUpload(legacyMapping.audience.imageData, `proposals/${brandPrefix}/audience_${timestamp}.png`)
            .then(url => { if (url) imageUrls.audienceImage = url })
        )
      }
      if (legacyMapping.activity) {
        uploadPromises.push(
          compositeAndUpload(legacyMapping.activity.imageData, `proposals/${brandPrefix}/activity_${timestamp}.png`)
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
          compositeAndUpload(img.imageData, `proposals/${brandPrefix}/${img.id}_${timestamp}.png`)
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

      // ─── Real-Product Injection (Nano Banana Pro) ───
      // Generate up to 3 deck-styled product scenes by compositing real
      // scraped product photos into AI scene contexts. Each gets a DIFFERENT
      // scene description so bigIdea / deliverables / closing don't render
      // the same merged image. Stored as productSceneImages so the gamma
      // prompt can pick variety.
      const sceneTargets: Array<{ key: string; placement: string }> = [
        { key: 'productInSceneImage', placement: 'naturally held in the foreground of the existing scene, photorealistic and lit to match the original lighting' },
        { key: 'productInSceneImage2', placement: 'placed centered on a clean surface with the original scene as a soft background, hero-shot composition' },
        { key: 'productInSceneImage3', placement: 'integrated into the daily routine implied by the scene — bathroom shelf / dressing table / kitchen — naturalistic context' },
      ]
      const aiActivityBuffer = legacyMapping.activity?.imageData
      const realProductUrls = [
        ...(scrapedData?.productImages || []),
        ...(scrapedData?.heroImages || []),
      ].slice(0, sceneTargets.length)

      if (realProductUrls.length && aiActivityBuffer) {
        const { injectProductIntoScene } = await import('@/lib/gemini/nano-banana-pro')
        // Fetch all product images in parallel; sequence the Nano Banana
        // calls (it's slow, can rate-limit when called concurrently).
        const productBuffers = await Promise.all(
          realProductUrls.map(async (url) => {
            try {
              const res = await fetch(url, {
                signal: AbortSignal.timeout(15000),
                headers: { 'User-Agent': 'Mozilla/5.0 LeadersBot/1.0' },
              })
              if (!res.ok) {
                console.warn(`[Visual Assets][${requestId}] [Nano Banana] Product fetch ${res.status}: ${url.slice(0, 100)}`)
                return null
              }
              return {
                base64: Buffer.from(await res.arrayBuffer()).toString('base64'),
                mimeType: res.headers.get('content-type') || 'image/jpeg',
                sourceUrl: url,
              }
            } catch (e) {
              console.warn(`[Visual Assets][${requestId}] [Nano Banana] Product fetch threw: ${e instanceof Error ? e.message : e}`)
              return null
            }
          }),
        )
        for (let i = 0; i < productBuffers.length; i++) {
          const product = productBuffers[i]
          const target = sceneTargets[i]
          if (!product) continue
          try {
            console.log(`[Visual Assets][${requestId}] [Nano Banana] Generating ${target.key} from ${product.sourceUrl.slice(0, 80)}…`)
            const merged = await injectProductIntoScene({
              scene: { base64: aiActivityBuffer.toString('base64'), mimeType: 'image/png' },
              product: { base64: product.base64, mimeType: product.mimeType },
              brandName,
              productDescription: `the actual ${brandName} product as shown in the second reference image — preserve packaging, colors, typography, and the brand logo natively on the surface. Premium magazine-quality lighting, 1920×1080.`,
              scenePlacement: target.placement,
            })
            if (merged?.base64) {
              const mergedBuf = Buffer.from(merged.base64, 'base64')
              const productInSceneUrl = await uploadImageToStorage(
                mergedBuf,
                `proposals/${brandPrefix}/${target.key}_${timestamp}.png`,
              )
              if (productInSceneUrl) {
                imageUrls[target.key] = productInSceneUrl
                console.log(`[Visual Assets][${requestId}] [Nano Banana] ✅ ${target.key}: ${productInSceneUrl}`)
              } else {
                console.warn(`[Visual Assets][${requestId}] [Nano Banana] ${target.key}: upload failed`)
              }
            } else {
              console.warn(`[Visual Assets][${requestId}] [Nano Banana] ${target.key}: model returned null — likely safety block or token limit`)
            }
          } catch (nbErr) {
            console.error(`[Visual Assets][${requestId}] [Nano Banana] ${target.key} threw:`, nbErr instanceof Error ? nbErr.message : nbErr)
          }
        }
        const succeeded = sceneTargets.filter((t) => imageUrls[t.key]).length
        console.log(`[Visual Assets][${requestId}] [Nano Banana] Done: ${succeeded}/${sceneTargets.length} scenes generated`)
      } else if (realProductUrls.length === 0) {
        console.log(`[Visual Assets][${requestId}] [Nano Banana] Skipped: no scraped product images available`)
      } else if (!aiActivityBuffer) {
        console.log(`[Visual Assets][${requestId}] [Nano Banana] Skipped: no AI activity buffer to merge into`)
      }
    } catch (imgErr) {
      console.error(`[Visual Assets][${requestId}] Image generation failed entirely:`, imgErr)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[Visual Assets][${requestId}] Complete in ${elapsed}s`)

    const hasBrandAssets = !!(
      brandAssets.logo ||
      brandAssets.productImages?.length ||
      brandAssets.sceneImages?.length
    )

    return NextResponse.json({
      success: true,
      scraped: scrapedData ? {
        // Legacy field — kept for backward compat; now the VERIFIED logo url.
        logoUrl: logoUrl || scrapedData.logoUrl || null,
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
      brandAssets: hasBrandAssets ? brandAssets : null,
      brandColors,
      generatedImages: imageUrls,
      extraImages: extraImageUrls,
      imageStrategy: imageStrategyMeta || null,
      elapsed,
      _warnings: [
        ...(colorsFallback ? ['צבעי המותג לא זוהו — נעשה שימוש בצבעי ברירת מחדל'] : []),
      ].filter(Boolean),
    })
  } catch (error) {
    console.error(`[Visual Assets][${requestId}] Error:`, error)
    return NextResponse.json(
      { error: 'Failed to generate visual assets', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
