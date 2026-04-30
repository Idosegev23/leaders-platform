/**
 * POST /api/influencers
 *
 * REWRITTEN (April 2026): Now powered by Gemini IMAI Agent — calls real IMAI API
 * via Gemini function calling. The model decides which keywords to search,
 * refines results, and returns Hebrew rationale per influencer.
 *
 * Backwards compatible: returns the same shape that the wizard expects
 * ({ success, strategy, recommendations, scrapedInfluencers }).
 *
 * Modes:
 * - 'discover' / 'research' → IMAI agent (default)
 * - 'scrape' → legacy Apify scraper for explicit usernames
 */

import { NextRequest, NextResponse } from 'next/server'
import { runInfluencerAgent } from '@/lib/gemini/imai-agent'
import { scrapeMultipleInfluencers } from '@/lib/apify/influencer-scraper'
import type { BrandResearch } from '@/lib/gemini/brand-research'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `infl-${Date.now()}`
  const startTs = Date.now()

  try {
    const body = await request.json()
    const {
      brandResearch,
      brandName: explicitBrandName,
      budget,
      goals,
      usernames,
      mode = 'discover',
      influencerCount,
    } = body as {
      brandResearch?: BrandResearch
      brandName?: string
      budget?: number
      goals?: string[]
      usernames?: string[]
      mode?: 'discover' | 'scrape' | 'research'
      influencerCount?: number
    }

    console.log(`[API Influencers][${requestId}] ═══════════════════════════════════════`)
    console.log(`[API Influencers][${requestId}] 🚀 Mode: ${mode}`)

    // ── Mode: Scrape specific usernames (legacy path, kept for manual entry) ──
    if (mode === 'scrape' && usernames && usernames.length > 0) {
      console.log(`[API Influencers][${requestId}] 🔧 Legacy scrape mode — ${usernames.length} profiles`)
      const scraped = await scrapeMultipleInfluencers(usernames)
      const filteredScraped = scraped.filter(inf => inf.followers >= 10000)
      console.log(`[API Influencers][${requestId}] ✅ Scraped ${filteredScraped.length}/${scraped.length} (>=10K)`)
      return NextResponse.json({
        success: true,
        influencers: filteredScraped,
        count: filteredScraped.length,
      })
    }

    // ── Mode: discover / research → Gemini IMAI Agent (NEW DEFAULT PATH) ──
    const brandName =
      explicitBrandName || brandResearch?.brandName || brandResearch?.officialName || ''
    if (!brandName) {
      console.error(`[API Influencers][${requestId}] ❌ Missing brandName / brandResearch`)
      return NextResponse.json(
        { error: 'brandName or brandResearch required' },
        { status: 400 },
      )
    }

    // Build agent input from whatever the caller gave us
    const industry = brandResearch?.industry || ''
    const targetAudience = [
      brandResearch?.targetDemographics?.primaryAudience?.gender,
      brandResearch?.targetDemographics?.primaryAudience?.ageRange,
      brandResearch?.targetDemographics?.primaryAudience?.lifestyle,
    ]
      .filter(Boolean)
      .join(', ')

    console.log(`[API Influencers][${requestId}] 🤖 Calling Gemini IMAI Agent`)
    console.log(`[API Influencers][${requestId}]    brand: "${brandName}"`)
    console.log(`[API Influencers][${requestId}]    industry: ${industry}`)
    console.log(`[API Influencers][${requestId}]    audience: ${targetAudience}`)
    console.log(`[API Influencers][${requestId}]    goals: [${(goals || []).join(', ')}]`)
    console.log(`[API Influencers][${requestId}]    budget: ${budget ? '₪' + budget.toLocaleString() : '(none)'}`)

    let agentResult = await runInfluencerAgent({
      brandName,
      industry,
      targetAudience,
      goals: goals || [],
      budget,
      influencerCount: influencerCount || 8,
    })

    // ─── Tier 2 fallback: Deep Research when IMAI exhausted ──────
    // The IMAI agent returns 0 influencers when every tool call hit
    // no_tokens_remaining. Rather than ship an empty list, escalate to
    // Gemini Deep Research with Google Search grounding to find real
    // Israeli influencers in the niche. Bounded inline poll: 90s max,
    // never breaches the route's 600s budget.
    if (!agentResult.influencers.length) {
      const { isImaiQuotaExhausted } = await import('@/lib/imai/client')
      if (isImaiQuotaExhausted()) {
        console.log(`[API Influencers][${requestId}] 🔁 Tier 2: IMAI exhausted — running Deep Research fallback`)
        try {
          const { startDeepResearch, pollUntilComplete, extractText, buildInfluencerSearchPrompt } =
            await import('@/lib/gemini/deep-research')
          const interaction = await startDeepResearch({
            prompt: buildInfluencerSearchPrompt({
              brandName, industry, targetAudience, goals, budget,
              count: influencerCount || 8,
            }),
            agent: 'deep-research-preview-04-2026',
            tools: [{ type: 'google_search' }, { type: 'url_context' }],
          })
          const completed = await pollUntilComplete(interaction.id, { timeoutMs: 90_000, pollIntervalMs: 5000 })
          if (completed.status === 'completed') {
            const text = extractText(completed)
            // Try to parse the JSON block out of the response.
            const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"influencers"[\s\S]*\}/)
            const raw = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
            try {
              const parsed = JSON.parse(raw) as {
                influencers?: Array<{ name?: string; handle?: string; estimatedFollowers?: number; tier?: string; rationale?: string }>
                strategySummary?: string
              }
              const dr = parsed.influencers || []
              if (dr.length) {
                agentResult = {
                  influencers: dr.map((i) => ({
                    username: (i.handle || '').replace(/^@/, ''),
                    fullname: i.name || '',
                    followers: typeof i.estimatedFollowers === 'number' ? i.estimatedFollowers : 0,
                    engagement_rate: 0,
                    tier: i.tier || '',
                    rationale: i.rationale || '',
                    is_verified: false,
                  })),
                  strategy: parsed.strategySummary || 'אסטרטגיית ליהוק מבוססת Deep Research',
                  toolCalls: agentResult.toolCalls,
                  rawText: text,
                }
                console.log(`[API Influencers][${requestId}] ✅ Deep Research fallback returned ${dr.length} influencers`)
              }
            } catch (parseErr) {
              console.warn(`[API Influencers][${requestId}] Deep Research returned text that didn't parse as JSON:`, parseErr instanceof Error ? parseErr.message : parseErr)
            }
          } else {
            console.log(`[API Influencers][${requestId}] Deep Research not done in 90s (status=${completed.status}) — returning what we have. Interaction ${interaction.id} continues server-side.`)
          }
        } catch (drErr) {
          console.warn(`[API Influencers][${requestId}] Deep Research fallback failed (non-fatal):`, drErr instanceof Error ? drErr.message : drErr)
        }
      }
    }

    // Map agent results to the legacy "strategy.recommendations" shape
    // so the existing wizard step can consume them without changes.
    const recommendations = agentResult.influencers.map(i => ({
      name: i.fullname || i.username,
      handle: i.username,
      category: i.tier || '',
      followers: i.followers ? `${(i.followers / 1000).toFixed(1)}K` : '?',
      engagement: i.engagement_rate ? `${i.engagement_rate.toFixed(1)}%` : '?',
      whyRelevant: i.rationale,
      contentStyle: i.tier || '',
    }))

    // Also expose them as "scrapedInfluencers" with full numbers for cards
    const scrapedInfluencers = agentResult.influencers.map(i => ({
      username: i.username,
      fullname: i.fullname,
      followers: i.followers,
      engagementRate: i.engagement_rate,
      profileUrl: `https://instagram.com/${i.username}`,
      profilePicUrl: '',
      categories: [i.tier || ''],
      bio: i.rationale,
    }))

    const elapsed = Date.now() - startTs
    console.log(`[API Influencers][${requestId}] ✅ Done in ${elapsed}ms — ${recommendations.length} influencers, ${agentResult.toolCalls} tool calls`)
    console.log(`[API Influencers][${requestId}] ═══════════════════════════════════════`)

    return NextResponse.json({
      success: true,
      strategy: {
        strategyTitle: 'אסטרטגיית ליהוק (Gemini + IMAI)',
        strategySummary: agentResult.strategy,
        recommendations,
        // Empty placeholders to keep legacy consumers happy
        tiers: [],
        contentThemes: [],
        expectedKPIs: [],
      },
      recommendations,
      scrapedInfluencers,
      combinedCount: scrapedInfluencers.length,
      _source: 'gemini-imai-agent',
      _toolCalls: agentResult.toolCalls,
    })
  } catch (error) {
    const elapsed = Date.now() - startTs
    console.error(`[API Influencers][${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    return NextResponse.json(
      {
        error: 'Failed to process influencer request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
