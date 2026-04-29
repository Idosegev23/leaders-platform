/**
 * Gamma-model prototype API route.
 *
 * POST { documentId } → pulls brief/research/influencers/images from document,
 * generates StructuredPresentation JSON via Gemini, renders to HTML via the
 * layout renderer, returns { presentation, htmlSlides }.
 *
 * Purpose: one-day prototype to compare structured-layout output vs current
 * Gemini-freeform HTML generation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAndRender } from '@/lib/gemini/layout-prototypes/generate'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const { documentId } = await request.json()
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    const { data: doc, error } = await supabase
      .from('documents').select('*').eq('id', documentId).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!isDevMode && doc.user_id !== userId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const data = doc.data as Record<string, unknown>

    // Hoist research object so self-healing fallbacks (influencer / images /
    // case-studies) can read it before the main pipeline call.
    const brandResearchObj = (data._brandResearch as Record<string, unknown> | undefined) || {}

    const brandName = (data.brandName as string) || (data.brand as string) || 'Brand'
    const brief = [
      data.briefText,
      data.businessOverview,
      data.campaignObjective,
      data.targetAudience,
      data.keyMessage,
    ].filter(Boolean).join('\n\n') || 'No brief provided.'

    const research = (() => {
      const r = data._brandResearch as Record<string, unknown> | undefined
      if (!r) return undefined
      return Object.entries(r)
        .map(([k, v]) => `### ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`)
        .join('\n\n')
    })()

    // Influencers — prefer the wizard's edited list (enhancedInfluencers,
    // already enriched with IMAI photos / engagement / Israeli audience %)
    // over the raw research output. Falls back to _influencerStrategy.influencers
    // for older documents that pre-date the wizard's per-row enrichment.
    type EnhancedInf = {
      name?: string
      username?: string
      profilePicUrl?: string
      followers?: number
      engagementRate?: number
      isVerified?: boolean
    }
    type RawResearchInf = {
      fullname?: string
      name?: string
      username?: string
      handle?: string
      picture?: string
      followers?: number
      engagement_rate?: number
      is_verified?: boolean
    }
    const enhancedRaw = (data.enhancedInfluencers as EnhancedInf[] | undefined) || []
    const researchRaw = (((data._influencerStrategy as { influencers?: RawResearchInf[] } | undefined)?.influencers) || [])
    const sourceList: Array<EnhancedInf | RawResearchInf> = enhancedRaw.length > 0 ? enhancedRaw : researchRaw
    const influencers = sourceList.slice(0, 8).map((inf): {
      name: string; handle: string; followers: string; engagement: string;
      profilePicUrl?: string; isVerified?: boolean
    } => {
      const enh = inf as EnhancedInf
      const raw = inf as RawResearchInf
      return {
        name: String(raw.fullname || enh.name || raw.name || enh.username || raw.username || ''),
        handle: String(enh.username || raw.username || raw.handle || ''),
        followers: formatFollowers(enh.followers ?? raw.followers),
        engagement: formatEngagement(enh.engagementRate ?? raw.engagement_rate),
        profilePicUrl: enh.profilePicUrl || raw.picture || undefined,
        isVerified: enh.isVerified ?? raw.is_verified ?? false,
      }
    }).filter((i) => i.name)
    console.log(`[gamma-proto] influencers: ${influencers.length} (${enhancedRaw.length} enhanced, ${researchRaw.length} research)`)

    // ─── Self-healing influencer fallback ────────────────────────
    // If the wizard didn't produce a list (or the list is too thin), call
    // the IMAI agent at deck-time using whatever we know about the brand.
    // The deck never goes out with an empty influencer-grid.
    if (influencers.length < 4 && brandName) {
      try {
        const brResearch = brandResearchObj as { industry?: string; targetDemographics?: { primaryAudience?: { gender?: string; ageRange?: string; lifestyle?: string } } }
        const targetAudience = [
          brResearch.targetDemographics?.primaryAudience?.gender,
          brResearch.targetDemographics?.primaryAudience?.ageRange,
          brResearch.targetDemographics?.primaryAudience?.lifestyle,
        ].filter(Boolean).join(', ')
        console.log(`[gamma-proto] 🔁 Self-healing: only ${influencers.length} influencers — running IMAI fallback`)
        const { runInfluencerAgent } = await import('@/lib/gemini/imai-agent')
        const fallback = await runInfluencerAgent({
          brandName,
          industry: brResearch.industry || '',
          targetAudience,
          goals: (data.goals as Array<{ title?: string }> | undefined)?.map((g) => g.title || '').filter(Boolean) || [],
          budget: typeof data.budget === 'number' ? data.budget : undefined,
          influencerCount: 8,
        })
        const augmented = fallback.influencers.map((i) => ({
          name: i.fullname || i.username,
          handle: i.username,
          followers: i.followers ? `${(i.followers / 1000).toFixed(0)}K` : '?',
          engagement: i.engagement_rate ? `${i.engagement_rate.toFixed(1)}%` : '?',
          profilePicUrl: undefined,
          isVerified: false,
        })).filter((i) => i.name && !influencers.some(existing => existing.handle === i.handle))
        const before = influencers.length
        for (const inf of augmented) {
          if (influencers.length >= 8) break
          influencers.push(inf)
        }
        console.log(`[gamma-proto] 🔁 IMAI fallback returned ${augmented.length}, now have ${influencers.length} (was ${before})`)
      } catch (imaiErr) {
        console.warn(`[gamma-proto] IMAI fallback failed (non-fatal):`, imaiErr instanceof Error ? imaiErr.message : imaiErr)
      }
    }

    const imgs = (data._generatedImages as Record<string, string>) || {}
    const images = {
      cover: imgs.coverImage,
      brand: imgs.brandImage,
      audience: imgs.audienceImage,
      // Prefer the Nano-Banana-merged "real product in scene" image over the
      // generic AI activity image for any slot depicting a product (bigIdea/
      // deliverables). The merged version contains the actual brand product
      // with the real logo on its packaging.
      activity: imgs.productInSceneImage || imgs.activityImage,
    }

    // Real brand assets from the website scraper. These are AUTHENTIC product
    // shots / lifestyle photos / actual logo from the brand's site, and they
    // should be preferred over AI-generated images for any slot that depicts
    // real products (deliverables, bigIdea, brief). Filter out junk like
    // empty-shopping-cart placeholders the scraper sometimes catches.
    const scrapedRaw = (data._scraped as Record<string, unknown>) || {}
    const isProductLike = (url: string) =>
      typeof url === 'string' &&
      url.startsWith('http') &&
      !/empty-(shopping|cart)|placeholder|spinner|loading|favicon/i.test(url) &&
      !/\.(svg)(\?|$)/i.test(url)
    const cleanList = (raw: unknown): string[] =>
      (Array.isArray(raw) ? raw : []).filter((u): u is string => isProductLike(String(u))).slice(0, 8)
    const scrapedAssets = {
      brandLogoUrl: typeof scrapedRaw.logoUrl === 'string' ? scrapedRaw.logoUrl : undefined,
      heroImages: cleanList(scrapedRaw.heroImages),
      productImages: cleanList(scrapedRaw.productImages),
      lifestyleImages: cleanList(scrapedRaw.lifestyleImages),
    }

    const brandColors = data._brandColors as
      | { primary?: string; secondary?: string; accent?: string } | undefined

    // Pull industry + brand voice for benchmarks / case-studies / voice enforcement.
    const industry =
      (brandResearchObj.industry as string | undefined) ||
      (data.industry as string | undefined)
    const brandVoice = brandResearchObj.brandVoiceGuide as
      | { personality?: string; toneSpectrum?: string; languageStyle?: string; avoid?: string }
      | undefined
    const visualDNA = brandResearchObj.visualDNA as
      | {
          photoStyle?: string
          productStyle?: string
          decorativeStyle?:
            | 'minimal' | 'maximalist' | 'organic-soft'
            | 'geometric-strict' | 'retro' | 'brutalist'
          lightingStyle?: string
          typographyMood?:
            | 'serif-editorial' | 'sans-tight' | 'sans-airy'
            | 'display-bold' | 'monospace-tech'
          recurringPattern?: { type: 'wave' | 'dots' | 'lines' | 'gradient' | 'grid' | 'none'; description?: string }
          moodDescription?: string
        }
      | undefined
    const competitors = brandResearchObj.competitors
    const hasCompetitors =
      Array.isArray(competitors) ? competitors.length > 0 :
      typeof competitors === 'string' ? competitors.trim().length > 0 : false
    const hasPlatformMix = !!brandResearchObj.platformMix || !!brandResearchObj.platforms
    const hasTimeline = !!brandResearchObj.timeline || !!data.campaignTimeline

    console.log('[gamma-proto] generating for', brandName, {
      hasBrief: !!brief,
      hasResearch: !!research,
      influencerCount: influencers.length,
      hasImages: Object.values(images).some(Boolean),
      industry,
      hasVoice: !!brandVoice?.personality,
      hasCompetitors,
      hasPlatformMix,
      hasTimeline,
    })

    const { presentation, htmlSlides } = await generateAndRender({
      brandName, brief, research, influencers, brandColors, images,
      industry, brandVoice, hasCompetitors, hasPlatformMix, hasTimeline,
      scrapedAssets,
      visualDNA: visualDNA
        ? {
            decorativeStyle: visualDNA.decorativeStyle,
            typographyMood: visualDNA.typographyMood,
            recurringPattern: visualDNA.recurringPattern,
            moodDescription: visualDNA.moodDescription,
          }
        : undefined,
    })

    return NextResponse.json({
      success: true,
      brandName: presentation.brandName,
      slideCount: presentation.slides.length,
      presentation,
      htmlSlides,
    })
  } catch (err) {
    console.error('[gamma-proto] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

function formatFollowers(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function formatEngagement(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  const pct = n < 1 ? n * 100 : n
  return `${pct.toFixed(1)}%`
}
