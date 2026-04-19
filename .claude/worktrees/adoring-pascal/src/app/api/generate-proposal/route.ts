import { NextRequest, NextResponse } from 'next/server'
import { generateProposalContent } from '@/lib/openai/proposal-writer'

export const maxDuration = 600
import type { ProposalContent } from '@/lib/openai/proposal-writer'
import { researchInfluencers } from '@/lib/gemini/influencer-research'
import type { InfluencerStrategy } from '@/lib/gemini/influencer-research'
import { scrapeMultipleInfluencers } from '@/lib/apify/influencer-scraper'
import type { ScrapedInfluencer } from '@/lib/apify/influencer-scraper'
import { generateBrandAssetsFromLogo } from '@/lib/gemini/logo-designer'
import { generateSmartImages, generateIsraeliProposalImages } from '@/lib/gemini/israeli-image-generator'
import { createClient } from '@/lib/supabase/server'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import type { BrandColors } from '@/lib/gemini/color-extractor'

// ---------------------------------------------------------------------------
// Types for the new wizard-based flow
// ---------------------------------------------------------------------------

interface WizardData {
  brandName: string
  brandBrief?: string
  brandPainPoints?: string[]
  brandObjective?: string
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  keyInsight?: string
  insightSource?: string
  strategyHeadline?: string
  strategyPillars?: { title: string; description: string }[]
  strategyFlow?: { steps: { label: string; description: string }[] }
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  deliverables?: { type: string; quantity: number; description: string; purpose?: string }[]
  quantitiesSummary?: {
    influencerCount: number
    contentTypes: { type: string; quantityPerInfluencer: number; totalQuantity: number }[]
    campaignDurationMonths: number
    totalDeliverables: number
  }
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  creativeSlides?: { title: string; description: string; conceptType?: string }[]
  enhancedInfluencers?: Array<{
    name: string
    username: string
    profilePicUrl: string
    categories: string[]
    followers: number
    avgStoryViews?: number
    avgReelViews?: number
    engagementRate: number
    israeliAudiencePercent?: number
    genderSplit?: { male: number; female: number }
    ageSplit?: { range: string; percent: number }[]
  }>
}

// ---------------------------------------------------------------------------
// Wizard -> ProposalContent mapper
// ---------------------------------------------------------------------------

/**
 * Build a ProposalContent object directly from wizard step data,
 * completely bypassing the GPT content-generation step.
 */
function mapWizardDataToContent(wizard: WizardData): ProposalContent {
  const budgetNum = wizard.budget || 0
  const cpe = wizard.cpe || 2.5
  const reach = wizard.potentialReach || Math.round(budgetNum * 5)
  const engagement = wizard.potentialEngagement || Math.round(budgetNum / cpe)

  // Build goals array – prefer goalsDetailed, fall back to plain goals list
  const goals: { title: string; description: string }[] =
    wizard.goalsDetailed && wizard.goalsDetailed.length > 0
      ? wizard.goalsDetailed
      : (wizard.goals || []).map(g => ({
          title: g,
          description: `השגת ${g} באמצעות תוכן אותנטי ומשכנע`,
        }))

  // Build deliverables with fallback for optional purpose field
  const deliverables = (wizard.deliverables || []).map(d => ({
    type: d.type,
    quantity: d.quantity,
    description: d.description,
    purpose: d.purpose || d.description,
  }))

  // Build influencer criteria from enhanced influencers if available
  const influencerCriteria: string[] = []
  if (wizard.enhancedInfluencers && wizard.enhancedInfluencers.length > 0) {
    const categories = Array.from(new Set(wizard.enhancedInfluencers.flatMap(i => i.categories)))
    if (categories.length > 0) influencerCriteria.push(`קטגוריות: ${categories.join(', ')}`)
    influencerCriteria.push('התאמה לקהל היעד')
    influencerCriteria.push('איכות תוכן גבוהה')
    influencerCriteria.push('אותנטיות ומעורבות')
  }

  return {
    // Cover
    campaignName: `קמפיין ${wizard.brandName}`,
    campaignSubtitle: wizard.strategyHeadline || 'שיתוף פעולה עם משפיענים',

    // Brief
    brandBrief: wizard.brandBrief || undefined,
    brandPainPoints: wizard.brandPainPoints || undefined,
    brandObjective: wizard.brandObjective || undefined,

    // Goals & Target Audience
    goals,
    targetAudience: {
      primary: {
        gender: wizard.targetGender || 'נשים וגברים',
        ageRange: wizard.targetAgeRange || '25-45',
        description: wizard.targetDescription || 'קהל יעד מגוון המתעניין במוצרי המותג',
      },
      behavior: wizard.targetBehavior || 'צרכנים פעילים ברשתות החברתיות',
      insights: wizard.targetInsights || ['מושפעים מתוכן אותנטי', 'מחפשים המלצות אמיתיות'],
    },

    // Key Insight
    keyInsight: wizard.keyInsight || undefined,
    insightSource: wizard.insightSource || undefined,

    // Strategy
    strategyHeadline: wizard.strategyHeadline || undefined,
    strategyPillars: wizard.strategyPillars || undefined,
    strategyFlow: wizard.strategyFlow || undefined,

    // Brand (wizard flow does not include brand research paragraphs – use brief)
    brandDescription: wizard.brandBrief || `${wizard.brandName} הוא מותג הפועל בישראל.`,
    brandHighlights: wizard.brandPainPoints || [],
    brandOpportunity: wizard.brandObjective || 'שיווק משפיענים יאפשר למותג להגיע לקהלים חדשים בצורה אותנטית',

    // Activity / Creative
    activityTitle: wizard.activityTitle || 'פעילות משפיענים',
    activityConcept: wizard.activityConcept || 'שיתוף פעולה עם משפיענים להגברת המודעות למותג',
    activityDescription: wizard.activityDescription || 'משפיענים יציגו את המותג בסיטואציות אותנטיות',
    activityApproach: wizard.activityApproach || [
      { title: 'תוכן אותנטי', description: 'הצגת המוצר בשגרה אמיתית' },
      { title: 'סיפור אישי', description: 'שיתוף חוויה אישית' },
    ],
    activityDifferentiator: wizard.activityConcept || 'דגש על אותנטיות ותוכן איכותי',

    // Creative Slides (wizard-specific)
    creativeSlides: wizard.creativeSlides || undefined,

    // Deliverables
    deliverables,
    deliverablesSummary: deliverables.length > 0
      ? `חבילה של ${deliverables.reduce((sum, d) => sum + d.quantity, 0)} תוצרים מ-${deliverables.length} סוגים`
      : 'חבילה מאוזנת של תוכן',

    // Quantities (wizard-specific)
    quantitiesSummary: wizard.quantitiesSummary || undefined,

    // Metrics / Targets
    metrics: {
      budget: budgetNum,
      currency: wizard.currency || '₪',
      potentialReach: reach,
      potentialEngagement: engagement,
      cpe,
      cpm: budgetNum > 0 && reach > 0 ? Math.round((budgetNum / reach) * 1000) : 15,
    },
    metricsExplanation: 'המספרים מבוססים על נתוני המדיה והתקציב שהוזנו בשלבי התכנון',

    // Influencers context
    influencerStrategy: wizard.enhancedInfluencers && wizard.enhancedInfluencers.length > 0
      ? `${wizard.enhancedInfluencers.length} משפיענים נבחרו לקמפיין, עם דגש על התאמה לקהל היעד ואיכות תוכן`
      : 'בחירת משפיענים רלוונטיים לקהל היעד',
    influencerCriteria: influencerCriteria.length > 0
      ? influencerCriteria
      : ['התאמה לקהל', 'איכות תוכן', 'אותנטיות'],
    contentGuidelines: ['תוכן טבעי', 'שיתוף חוויה אישית', 'שמירה על אותנטיות המשפיען'],

    // Closing
    closingStatement: "LET'S GET STARTED",
    nextSteps: ['אישור הצעה', 'בחירת משפיענים', 'תחילת עבודה'],

    // Metadata
    toneUsed: 'מקצועי',
    confidence: 'high',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upload image buffer directly to Supabase Storage
 * Returns public URL
 */
async function uploadImageToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/png'
): Promise<string | null> {
  try {
    console.log(`[Upload] Starting upload: ${fileName}, size: ${buffer.length} bytes`)

    const supabase = await createClient()

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[Upload] Failed ${fileName}:`, uploadError)
      return null
    }

    console.log(`[Upload] Upload success: ${fileName}, path: ${uploadData?.path}`)

    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)

    const publicUrl = urlData?.publicUrl
    console.log(`[Upload] Public URL: ${publicUrl?.slice(0, 80)}...`)

    return publicUrl || null
  } catch (error) {
    console.error(`[Upload] Error ${fileName}:`, error)
    return null
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ------------------------------------------------------------------
    // Parse inputs – support BOTH the old chat flow and the new wizard flow
    // ------------------------------------------------------------------
    const {
      brandResearch,
      brandColors,
      budget,
      goals,
      scrapedData,
      wizardData,
    } = body as {
      brandResearch?: BrandResearch
      brandColors?: BrandColors
      budget?: number
      goals?: string[]
      scrapedData?: {
        logoUrl?: string
        screenshot?: string
        heroImages?: string[]
        productImages?: string[]
        lifestyleImages?: string[]
      }
      wizardData?: WizardData
    }

    // ------------------------------------------------------------------
    // Validation – require at least one of the two flows
    // ------------------------------------------------------------------
    if (!brandResearch && !wizardData) {
      return NextResponse.json(
        { error: 'Either brandResearch (chat flow) or wizardData (wizard flow) is required' },
        { status: 400 }
      )
    }

    // Resolve the effective budget – wizard may carry its own
    const effectiveBudget = wizardData?.budget ?? budget ?? 0
    if (effectiveBudget === 0 && !wizardData) {
      return NextResponse.json(
        { error: 'Budget is required for the chat flow' },
        { status: 400 }
      )
    }

    // Resolve effective goals
    const effectiveGoals: string[] = wizardData?.goals ?? goals ?? []

    // Resolve brand name for logging / file prefixes
    const brandName = wizardData?.brandName ?? brandResearch?.brandName ?? 'Unknown'

    console.log(`[API Generate] Flow: ${wizardData ? 'WIZARD' : 'CHAT'}`)
    console.log(`[API Generate] Generating proposal for: ${brandName}`)
    console.log(`[API Generate] Budget: ${effectiveBudget}, Goals: ${effectiveGoals.join(', ') || '(none)'}`)

    // ===================================================================
    //  WIZARD FLOW – skip GPT content generation & influencer discovery
    // ===================================================================
    if (wizardData) {
      console.log('[API Generate] Using wizard data – skipping GPT content generation')

      // 1. Map wizard data directly to ProposalContent
      const content = mapWizardDataToContent(wizardData)

      // 2. Build influencer data from wizardData.enhancedInfluencers
      let scrapedInfluencers: ScrapedInfluencer[] = []
      let influencerStrategy: InfluencerStrategy | undefined

      if (wizardData.enhancedInfluencers && wizardData.enhancedInfluencers.length > 0) {
        // Extract usernames and try to enrich with real scraped data
        const usernames = wizardData.enhancedInfluencers
          .map(i => i.username?.replace('@', '').trim())
          .filter(Boolean) as string[]

        if (usernames.length > 0) {
          console.log(`[API Generate][Wizard] Scraping ${usernames.length} influencer profiles: ${usernames.join(', ')}`)
          try {
            scrapedInfluencers = await scrapeMultipleInfluencers(usernames)
            console.log(`[API Generate][Wizard] Scraped ${scrapedInfluencers.length} real profiles`)
          } catch (err) {
            console.error('[API Generate][Wizard] Influencer scraping failed:', err)
          }
        }

        // Build an influencer strategy object from wizard data
        influencerStrategy = {
          strategyTitle: `אסטרטגיית משפיענים עבור ${wizardData.brandName}`,
          strategySummary: content.influencerStrategy,
          tiers: [],
          recommendations: wizardData.enhancedInfluencers.map(inf => {
            // Try to find matching scraped profile for richer data
            const scraped = scrapedInfluencers.find(
              s => s.username.toLowerCase() === inf.username?.replace('@', '').toLowerCase()
            )
            return {
              name: inf.name,
              handle: `@${inf.username?.replace('@', '')}`,
              platform: 'instagram' as const,
              category: inf.categories?.[0] || 'lifestyle',
              followers: inf.followers >= 1_000_000
                ? `${(inf.followers / 1_000_000).toFixed(1)}M`
                : inf.followers >= 1_000
                  ? `${Math.round(inf.followers / 1_000)}K`
                  : `${inf.followers}`,
              engagement: `${inf.engagementRate?.toFixed(1) || '0'}%`,
              avgStoryViews: inf.avgStoryViews
                ? `${Math.round(inf.avgStoryViews / 1_000)}K`
                : undefined,
              whyRelevant: inf.categories?.length
                ? `משפיען בתחום ${inf.categories.join(', ')}`
                : 'מתאים לקהל היעד',
              contentStyle: inf.categories?.join(', ') || 'lifestyle',
              estimatedCost: '',
              profileUrl: `https://instagram.com/${inf.username?.replace('@', '')}`,
              profilePicUrl: scraped?.profilePicUrl || inf.profilePicUrl,
            }
          }),
          contentThemes: [],
          expectedKPIs: [],
          suggestedTimeline: [],
          potentialRisks: [],
        }
      }

      // 3. Optionally generate images if brandResearch is also provided
      let imageUrls: Record<string, string | undefined> = {}
      let extraImageUrls: { id: string; url: string; placement: string }[] = []
      let imageStrategy: {
        conceptSummary: string
        visualDirection: string
        totalPlanned: number
        totalGenerated: number
        styleGuide: string
      } | undefined
      let brandDesigns: Record<string, string> = {}

      if (brandResearch && brandColors) {
        console.log('[API Generate][Wizard] brandResearch provided – generating images')
        try {
          const smartImageSet = await generateSmartImages(brandResearch, brandColors, content).catch(async err => {
            console.error('[API Generate][Wizard] Smart image generation failed, falling back:', err)
            const legacyImages = await generateIsraeliProposalImages(brandResearch, brandColors)
            return {
              strategy: { totalImages: 4, conceptSummary: 'Fallback', visualDirection: '', images: [] as never[] },
              promptsData: { prompts: [] as never[], styleGuide: '' },
              images: [] as never[],
              legacyMapping: {
                cover: legacyImages.cover ? { id: 'cover', placement: 'cover' as const, imageData: legacyImages.cover.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
                brand: legacyImages.lifestyle ? { id: 'brand', placement: 'brand' as const, imageData: legacyImages.lifestyle.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
                audience: legacyImages.audience ? { id: 'audience', placement: 'audience' as const, imageData: legacyImages.audience.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
                activity: legacyImages.activity ? { id: 'activity', placement: 'activity' as const, imageData: legacyImages.activity.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
              }
            }
          })

          // Upload images to storage
          const timestamp = Date.now()
          const brandPrefix = brandName
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 20) || `brand_${timestamp}`

          const { legacyMapping, images: allSmartImages } = smartImageSet
          const uploadPromises: Promise<void>[] = []

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

          const legacyIds = [
            legacyMapping.cover?.id, legacyMapping.brand?.id,
            legacyMapping.audience?.id, legacyMapping.activity?.id,
          ].filter(Boolean)
          const extraImages = allSmartImages.filter(img => !legacyIds.includes(img.id))
          for (const img of extraImages) {
            uploadPromises.push(
              uploadImageToStorage(img.imageData, `proposals/${brandPrefix}/${img.id}_${timestamp}.png`)
                .then(url => {
                  if (url) extraImageUrls.push({ id: img.id, url, placement: img.placement })
                })
            )
          }

          await Promise.all(uploadPromises).catch(err => {
            console.error('[API Generate][Wizard] Image upload error:', err)
          })

          imageStrategy = {
            conceptSummary: smartImageSet.strategy.conceptSummary,
            visualDirection: smartImageSet.strategy.visualDirection,
            totalPlanned: smartImageSet.strategy.images.length,
            totalGenerated: smartImageSet.images.length,
            styleGuide: smartImageSet.promptsData.styleGuide,
          }
        } catch (imgErr) {
          console.error('[API Generate][Wizard] Image generation failed entirely:', imgErr)
        }

        // Brand assets from logo
        const logoUrl = scrapedData?.logoUrl
        if (logoUrl) {
          try {
            const brandAssets = await generateBrandAssetsFromLogo(
              logoUrl, brandName, brandResearch.industry || 'lifestyle'
            )
            if (brandAssets?.designs) {
              brandDesigns = brandAssets.designs.reduce((acc, design) => {
                acc[design.type] = `data:image/png;base64,${design.imageData}`
                return acc
              }, {} as Record<string, string>)
            }
          } catch (err) {
            console.error('[API Generate][Wizard] Brand assets generation failed:', err)
          }
        }
      }

      // 4. Build the response – same shape as the chat flow
      const mappedScrapedInfluencers = scrapedInfluencers
        .filter(inf => inf.followers >= 10000)
        .map(inf => ({
          name: inf.fullName || inf.username,
          username: inf.username,
          profileUrl: inf.profileUrl,
          profilePicUrl: inf.profilePicUrl,
          followers: inf.followers,
          engagementRate: inf.engagementRate,
          avgLikes: inf.avgLikes,
          avgComments: inf.avgComments,
          bio: inf.bio,
          categories: inf.categories,
          recentPosts: inf.recentPosts.slice(0, 3),
          isVerified: inf.isVerified,
        }))

      // If we didn't get scraped data but have wizard influencers, pass them through
      const wizardInfluencers = (wizardData.enhancedInfluencers || []).map(inf => ({
        name: inf.name,
        username: inf.username,
        profileUrl: `https://instagram.com/${inf.username?.replace('@', '')}`,
        profilePicUrl: inf.profilePicUrl,
        followers: inf.followers,
        engagementRate: inf.engagementRate,
        avgLikes: 0,
        avgComments: 0,
        bio: '',
        categories: inf.categories,
        recentPosts: [] as { imageUrl: string; caption: string; likes: number; comments: number; timestamp: string }[],
        isVerified: false,
        // Wizard-specific extra fields
        avgStoryViews: inf.avgStoryViews,
        avgReelViews: inf.avgReelViews,
        israeliAudiencePercent: inf.israeliAudiencePercent,
        genderSplit: inf.genderSplit,
        ageSplit: inf.ageSplit,
      }))

      const finalInfluencers = mappedScrapedInfluencers.length > 0
        ? mappedScrapedInfluencers
        : wizardInfluencers

      console.log(`[API Generate][Wizard] Returning proposal with ${finalInfluencers.length} influencers`)

      return NextResponse.json({
        success: true,
        content,
        imageUrls,
        extraImages: extraImageUrls,
        imageStrategy: imageStrategy || undefined,
        brandDesigns,
        influencerStrategy: influencerStrategy || undefined,
        scrapedInfluencers: finalInfluencers,
        brandAssets: undefined,
        scrapedAssets: scrapedData ? {
          logoUrl: scrapedData.logoUrl,
          screenshot: scrapedData.screenshot,
          heroImages: scrapedData.heroImages,
          productImages: scrapedData.productImages,
          lifestyleImages: scrapedData.lifestyleImages,
        } : undefined,
      })
    }

    // ===================================================================
    //  CHAT FLOW – original code path (unchanged)
    // ===================================================================
    console.log('[API Generate] Using chat flow – full GPT + influencer pipeline')

    // Get logo URL for brand assets
    const logoUrl = scrapedData?.logoUrl

    // Run content, influencer, and brand tasks in parallel
    const [content, influencerStrategy, scrapedInfluencers, brandAssets] = await Promise.all([
      // 1. Generate proposal content
      generateProposalContent(brandResearch!, { budget: effectiveBudget, goals: effectiveGoals }, brandColors),

      // 2. AI influencer research
      researchInfluencers(brandResearch!, effectiveBudget, effectiveGoals),

      // 3. Influencer scraping handled after AI research provides usernames
      Promise.resolve([] as ScrapedInfluencer[]),

      // 4. Generate brand assets from logo
      logoUrl ? generateBrandAssetsFromLogo(logoUrl, brandResearch!.brandName, brandResearch!.industry || 'lifestyle').catch(err => {
        console.error('[API Generate] Brand assets generation failed:', err)
        return null
      }) : Promise.resolve(null),
    ])

    // 5. Generate SMART images - needs content for context, so run after
    const smartImageSet = await generateSmartImages(brandResearch!, brandColors!, content).catch(async err => {
      console.error('[API Generate] Smart image generation failed, falling back to legacy:', err)
      // Fallback to legacy system
      const legacyImages = await generateIsraeliProposalImages(brandResearch!, brandColors!)
      return {
        strategy: { totalImages: 4, conceptSummary: 'Fallback', visualDirection: '', images: [] as never[] },
        promptsData: { prompts: [] as never[], styleGuide: '' },
        images: [] as never[],
        legacyMapping: {
          cover: legacyImages.cover ? { id: 'cover', placement: 'cover' as const, imageData: legacyImages.cover.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
          brand: legacyImages.lifestyle ? { id: 'brand', placement: 'brand' as const, imageData: legacyImages.lifestyle.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
          audience: legacyImages.audience ? { id: 'audience', placement: 'audience' as const, imageData: legacyImages.audience.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
          activity: legacyImages.activity ? { id: 'activity', placement: 'activity' as const, imageData: legacyImages.activity.imageData, mimeType: 'image/png', prompt: {} as never, aspectRatio: '16:9' } : undefined,
        }
      }
    })

    console.log(`[API Generate] Content generated, tone: ${content.toneUsed}`)
    console.log(`[API Generate] Influencer strategy: ${influencerStrategy.recommendations?.length || 0} AI recommendations`)
    console.log(`[API Generate] Scraped influencers: ${scrapedInfluencers.length} real profiles`)
    console.log(`[API Generate] Brand assets: ${brandAssets?.designs?.length || 0} designs generated`)
    console.log(`[API Generate] Smart images: ${smartImageSet.images.length} generated (strategy: ${smartImageSet.strategy.conceptSummary})`)

    // Try to enrich AI recommendations with profile pictures
    let enrichedInfluencers = scrapedInfluencers
    let enrichedAIRecommendations = influencerStrategy.recommendations || []

    if (influencerStrategy.recommendations?.length > 0) {
      console.log('[API Generate] Enriching AI recommendations with profile pictures...')

      // Extract handles from AI recommendations (remove @ prefix if present)
      const handles = influencerStrategy.recommendations
        .slice(0, 6)
        .map(rec => rec.handle?.replace('@', '').trim())
        .filter(Boolean) as string[]

      if (handles.length > 0) {
        console.log(`[API Generate] Scraping ${handles.length} influencer profiles: ${handles.join(', ')}`)

        try {
          const scrapedProfiles = await scrapeMultipleInfluencers(handles)
          console.log(`[API Generate] Got ${scrapedProfiles.length} profile pictures from scraper`)

          // Merge scraped profile pics back into AI recommendations
          enrichedAIRecommendations = influencerStrategy.recommendations.map(aiRec => {
            const handle = aiRec.handle?.replace('@', '').trim()
            const scrapedProfile = scrapedProfiles.find(p =>
              p.username.toLowerCase() === handle?.toLowerCase()
            )

            if (scrapedProfile) {
              console.log(`[API Generate] Found profile pic for @${handle}`)
              return {
                ...aiRec,
                profilePicUrl: scrapedProfile.profilePicUrl,
                // Also update engagement if we have real data
                engagement: scrapedProfile.engagementRate
                  ? `${scrapedProfile.engagementRate.toFixed(1)}%`
                  : aiRec.engagement,
              }
            }
            return aiRec
          })

          // Also keep full scraped data for template
          if (scrapedInfluencers.length === 0) {
            enrichedInfluencers = scrapedProfiles
          }
        } catch (scrapeError) {
          console.error('[API Generate] Failed to scrape influencer profiles:', scrapeError)
        }
      }
    }

    // Update influencerStrategy with enriched recommendations
    influencerStrategy.recommendations = enrichedAIRecommendations

    // Upload images directly to Supabase Storage (avoid sending huge base64 to client)
    const timestamp = Date.now()
    // Use only ASCII characters for file names (Supabase doesn't support Hebrew in keys)
    const brandPrefix = brandResearch!.brandName
      .replace(/[^a-zA-Z0-9]/g, '') // Remove all non-ASCII
      .slice(0, 20) || `brand_${timestamp}` // Fallback if empty after cleanup

    console.log('[API Generate] ========== UPLOADING SMART IMAGES TO STORAGE ==========')

    const imageUrls: Record<string, string | undefined> = {}
    const extraImageUrls: { id: string; url: string; placement: string }[] = []

    // Use legacy mapping for backward compatibility + upload all smart images
    const { legacyMapping, images: allSmartImages } = smartImageSet

    // Upload each image in parallel
    const uploadPromises: Promise<void>[] = []

    // Upload legacy-mapped images (cover, brand, audience, activity)
    if (legacyMapping.cover) {
      uploadPromises.push(
        uploadImageToStorage(
          legacyMapping.cover.imageData,
          `proposals/${brandPrefix}/cover_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.coverImage = url
            console.log(`[API Generate] coverImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }

    if (legacyMapping.brand) {
      uploadPromises.push(
        uploadImageToStorage(
          legacyMapping.brand.imageData,
          `proposals/${brandPrefix}/brand_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.brandImage = url
            console.log(`[API Generate] brandImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }

    if (legacyMapping.audience) {
      uploadPromises.push(
        uploadImageToStorage(
          legacyMapping.audience.imageData,
          `proposals/${brandPrefix}/audience_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.audienceImage = url
            console.log(`[API Generate] audienceImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }

    if (legacyMapping.activity) {
      uploadPromises.push(
        uploadImageToStorage(
          legacyMapping.activity.imageData,
          `proposals/${brandPrefix}/activity_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.activityImage = url
            console.log(`[API Generate] activityImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }

    // Upload additional smart images (not in legacy mapping)
    const legacyIds = [
      legacyMapping.cover?.id,
      legacyMapping.brand?.id,
      legacyMapping.audience?.id,
      legacyMapping.activity?.id,
    ].filter(Boolean)

    const extraImages = allSmartImages.filter(img => !legacyIds.includes(img.id))

    for (const img of extraImages) {
      uploadPromises.push(
        uploadImageToStorage(
          img.imageData,
          `proposals/${brandPrefix}/${img.id}_${timestamp}.png`
        ).then(url => {
          if (url) {
            extraImageUrls.push({ id: img.id, url, placement: img.placement })
            console.log(`[API Generate] Extra image ${img.id} uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }

    // Wait for all uploads
    try {
      await Promise.all(uploadPromises)
      console.log(`[API Generate] All uploads completed`)
    } catch (uploadAllError) {
      console.error('[API Generate] Promise.all failed:', uploadAllError)
    }

    console.log(`[API Generate] Uploaded ${Object.values(imageUrls).filter(Boolean).length + extraImageUrls.length} images to Storage`)
    console.log('[API Generate] Image URLs to return:', JSON.stringify(imageUrls, null, 2))
    if (extraImageUrls.length > 0) {
      console.log('[API Generate] Extra images:', JSON.stringify(extraImageUrls, null, 2))
    }
    console.log('[API Generate] ========== END IMAGE UPLOAD ==========')

    // Brand designs - keep as data URLs (they're smaller and used differently)
    const brandDesigns = brandAssets?.designs?.reduce((acc, design) => {
      acc[design.type] = `data:image/png;base64,${design.imageData}`
      return acc
    }, {} as Record<string, string>) || {}

    return NextResponse.json({
      success: true,
      content,
      // URLs to uploaded images (not base64!)
      imageUrls: imageUrls,
      // Extra images from smart generation
      extraImages: extraImageUrls,
      // Smart image strategy info
      imageStrategy: {
        conceptSummary: smartImageSet.strategy.conceptSummary,
        visualDirection: smartImageSet.strategy.visualDirection,
        totalPlanned: smartImageSet.strategy.images.length,
        totalGenerated: smartImageSet.images.length,
        styleGuide: smartImageSet.promptsData.styleGuide,
      },
      // Brand designs as base64 (small, for decorative use)
      brandDesigns: brandDesigns,
      influencerStrategy,
      // Filter to only include influencers with 10K+ followers
      scrapedInfluencers: enrichedInfluencers
        .filter(inf => inf.followers >= 10000)
        .map(inf => ({
          name: inf.fullName || inf.username,
          username: inf.username,
          profileUrl: inf.profileUrl,
          profilePicUrl: inf.profilePicUrl,
          followers: inf.followers,
          engagementRate: inf.engagementRate,
          avgLikes: inf.avgLikes,
          avgComments: inf.avgComments,
          bio: inf.bio,
          categories: inf.categories,
          recentPosts: inf.recentPosts.slice(0, 3),
          isVerified: inf.isVerified,
        })),
      brandAssets: brandAssets ? {
        analysis: brandAssets.analysis,
        designTypes: brandAssets.designs.map(d => d.type),
      } : undefined,
      scrapedAssets: scrapedData ? {
        logoUrl: scrapedData.logoUrl,
        screenshot: scrapedData.screenshot,
        heroImages: scrapedData.heroImages,
        productImages: scrapedData.productImages,
        lifestyleImages: scrapedData.lifestyleImages,
      } : undefined,
    })
  } catch (error) {
    console.error('[API Generate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate proposal', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
