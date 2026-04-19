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

    const infStrategy = data._influencerStrategy as
      | { influencers?: Array<Record<string, unknown>> }
      | undefined
    const influencers = (infStrategy?.influencers || []).slice(0, 8).map((inf) => ({
      name: String(inf.fullname || inf.name || inf.username || ''),
      handle: String(inf.username || inf.handle || ''),
      followers: formatFollowers(inf.followers),
      engagement: formatEngagement(inf.engagement_rate),
      profilePicUrl: typeof inf.picture === 'string' ? inf.picture : undefined,
      isVerified: Boolean(inf.is_verified),
    })).filter((i) => i.name)

    const imgs = (data._generatedImages as Record<string, string>) || {}
    const images = {
      cover: imgs.coverImage,
      brand: imgs.brandImage,
      audience: imgs.audienceImage,
      activity: imgs.activityImage,
    }

    const brandColors = data._brandColors as
      | { primary?: string; secondary?: string; accent?: string } | undefined

    console.log('[gamma-proto] generating for', brandName, {
      hasBrief: !!brief,
      hasResearch: !!research,
      influencerCount: influencers.length,
      hasImages: Object.values(images).some(Boolean),
    })

    const { presentation, htmlSlides } = await generateAndRender({
      brandName, brief, research, influencers, brandColors, images,
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
