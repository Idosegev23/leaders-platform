/**
 * POST /api/deep-research/start
 *
 * Kicks off a Gemini Deep Research interaction in the background and
 * persists the interaction id to the document so the client can poll
 * /api/deep-research/status without re-passing context. Returns
 * immediately — never blocks for the full research time (5-15 min).
 *
 * Body:
 *   {
 *     documentId: string
 *     mode: 'brand' | 'influencers' | 'competitors'
 *     agent?: 'fast' | 'max'        // default: fast
 *     extra?: Record<string, unknown>  // mode-specific overrides
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  startDeepResearch,
  buildInfluencerSearchPrompt,
  buildBrandResearchPrompt,
  buildCompetitorCampaignPrompt,
} from '@/lib/gemini/deep-research'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 60

type Mode = 'brand' | 'influencers' | 'competitors'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const body = await req.json() as {
      documentId?: string
      mode?: Mode
      agent?: 'fast' | 'max'
      extra?: Record<string, unknown>
    }
    if (!body.documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })
    const mode: Mode = body.mode || 'brand'

    const { data: doc, error } = await supabase
      .from('documents').select('*').eq('id', body.documentId).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!isDevMode && doc.user_id !== userId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const data = doc.data as Record<string, unknown>
    const brandName = (data.brandName as string) || 'Brand'
    const industry = ((data._brandResearch as Record<string, unknown> | undefined)?.industry as string) || ''
    const briefSnippet = (data._briefText as string) || (data.brandBrief as string) || ''
    const websiteUrl = ((data._brandResearch as Record<string, unknown> | undefined)?.website as string) ||
                       (data.website as string) || undefined

    let prompt: string
    if (mode === 'influencers') {
      const research = data._brandResearch as { targetDemographics?: { primaryAudience?: { gender?: string; ageRange?: string; lifestyle?: string } } } | undefined
      const audience = [
        research?.targetDemographics?.primaryAudience?.gender,
        research?.targetDemographics?.primaryAudience?.ageRange,
        research?.targetDemographics?.primaryAudience?.lifestyle,
      ].filter(Boolean).join(', ')
      prompt = buildInfluencerSearchPrompt({
        brandName,
        industry,
        targetAudience: audience,
        goals: ((data.goals as Array<{ title?: string }> | undefined) || []).map(g => g.title || '').filter(Boolean),
        budget: typeof data.budget === 'number' ? data.budget : undefined,
        count: 10,
      })
    } else if (mode === 'competitors') {
      const research = data._brandResearch as { competitors?: Array<{ name?: string }> } | undefined
      const compNames = (research?.competitors || []).map(c => c.name || '').filter(Boolean)
      if (!compNames.length) {
        return NextResponse.json({ error: 'No competitors known yet — run brand research first' }, { status: 400 })
      }
      prompt = buildCompetitorCampaignPrompt({ brandName, industry: industry || 'general', competitors: compNames })
    } else {
      prompt = buildBrandResearchPrompt({ brandName, websiteUrl, briefSnippet })
    }

    const interaction = await startDeepResearch({
      prompt,
      agent: body.agent === 'max' ? 'deep-research-max-preview-04-2026' : 'deep-research-preview-04-2026',
      tools: [{ type: 'google_search' }, { type: 'url_context' }],
    })

    // Persist the interaction id alongside the document so /status can
    // resolve it without the client passing it back.
    const deepResearchState = (data._deepResearch as Record<string, unknown> | undefined) || {}
    deepResearchState[mode] = {
      interactionId: interaction.id,
      status: interaction.status,
      startedAt: new Date().toISOString(),
      agent: body.agent || 'fast',
    }
    await supabase
      .from('documents')
      .update({ data: { ...data, _deepResearch: deepResearchState } })
      .eq('id', body.documentId)

    return NextResponse.json({
      ok: true,
      mode,
      interactionId: interaction.id,
      status: interaction.status,
    })
  } catch (err) {
    console.error('[deep-research/start] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
