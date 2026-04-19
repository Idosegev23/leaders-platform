/**
 * IMAI Influencer Agent — Gemini Function Calling
 *
 * Wraps the real IMAI API as a Gemini function declaration.
 * The model decides which influencers to search for based on brand context,
 * calls the API, sees real results, and synthesizes a recommendation.
 *
 * Used by: step-influencers wizard step, /api/imai/agent route
 */

import { callGeminiAgent, type GeminiFunctionDeclaration } from '@/lib/ai-provider'
import {
  searchIsraeliInfluencers,
  searchInfluencers,
  getAudienceReport,
  type ImaiInfluencer,
} from '@/lib/imai/client'

// ─── Function Declarations ───────────────────────────────────────

const FUNCTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'search_israeli_influencers',
    description:
      'Search Israeli influencers (geo=Israel, language=Hebrew) by topic keywords. ' +
      'Use this FIRST to discover candidates. Returns up to 15 profiles with followers, ER, niche.',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Topic keywords/niches in English (e.g. ["beauty","skincare","lifestyle"])',
        },
        platform: {
          type: 'string',
          enum: ['instagram', 'tiktok'],
          description: 'Platform to search. Default: instagram',
        },
        minFollowers: { type: 'integer', description: 'Min followers (default 5000)' },
        maxFollowers: { type: 'integer', description: 'Max followers (default 500000)' },
        minEngagement: { type: 'number', description: 'Min ER % (default 1.5)' },
        limit: { type: 'integer', description: 'Max results (default 15)' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'search_influencers_advanced',
    description:
      'Advanced influencer search with full filter control (gender, contact details, geo IDs).',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'youtube'] },
        followers_from: { type: 'integer' },
        followers_to: { type: 'integer' },
        gender: { type: 'string', enum: ['MALE', 'FEMALE'] },
        relevance: { type: 'array', items: { type: 'string' } },
        has_contact_details: { type: 'boolean' },
        limit: { type: 'integer' },
      },
      required: ['platform'],
    },
  },
  {
    name: 'get_audience_report',
    description:
      'Fetch detailed audience demographics for a specific influencer (gender split, age, geo, credibility). ' +
      'Use SPARINGLY — only for top 3-5 final candidates. Costs 1 token per call.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Influencer handle without @' },
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'youtube'] },
      },
      required: ['username'],
    },
  },
]

// ─── Function Handlers (real IMAI API) ───────────────────────────

const handlers = {
  search_israeli_influencers: async (args: Record<string, unknown>) => {
    const keywords = (args.keywords as string[]) || []
    console.log(`[IMAI-Handler] 🔍 search_israeli_influencers — keywords=[${keywords.join(',')}], platform=${args.platform || 'instagram'}, followers=${args.minFollowers || 5000}-${args.maxFollowers || 500000}, ER>=${args.minEngagement || 1.5}`)
    const t0 = Date.now()
    const result = await searchIsraeliInfluencers(keywords, {
      platform: (args.platform as 'instagram' | 'tiktok') || 'instagram',
      minFollowers: (args.minFollowers as number) || 5000,
      maxFollowers: (args.maxFollowers as number) || 500000,
      minEngagement: (args.minEngagement as number) || 1.5,
      limit: (args.limit as number) || 15,
    })
    console.log(`[IMAI-Handler] ✅ search_israeli_influencers → ${result.length} hits in ${Date.now() - t0}ms`)
    // Trim payload — model only needs the highlights
    return result.slice(0, 15).map(i => ({
      username: i.username,
      fullname: i.fullname,
      followers: i.followers,
      engagement_rate: i.engagement_rate,
      avg_likes: i.avg_likes,
      avg_views: i.avg_views,
      is_verified: i.is_verified,
      picture: i.picture,
    }))
  },

  search_influencers_advanced: async (args: Record<string, unknown>) => {
    console.log(`[IMAI-Handler] 🔍 search_influencers_advanced — args=${JSON.stringify(args).slice(0, 200)}`)
    const t0 = Date.now()
    const result = await searchInfluencers(
      {
        platform: args.platform as 'instagram' | 'tiktok' | 'youtube',
        followers_from: args.followers_from as number | undefined,
        followers_to: args.followers_to as number | undefined,
        gender: args.gender as 'MALE' | 'FEMALE' | undefined,
        relevance: args.relevance as string[] | undefined,
        has_contact_details: args.has_contact_details as boolean | undefined,
      },
      (args.limit as number) || 15,
    )
    console.log(`[IMAI-Handler] ✅ search_influencers_advanced → ${result.data.length}/${result.total} hits in ${Date.now() - t0}ms`)
    return result.data.slice(0, 15)
  },

  get_audience_report: async (args: Record<string, unknown>) => {
    console.log(`[IMAI-Handler] 📊 get_audience_report — @${args.username} (${args.platform || 'instagram'})`)
    const t0 = Date.now()
    const report = await getAudienceReport(
      args.username as string,
      (args.platform as 'instagram' | 'tiktok' | 'youtube') || 'instagram',
    )
    console.log(`[IMAI-Handler] ✅ get_audience_report → @${report.user_profile.username} ${report.user_profile.followers} followers in ${Date.now() - t0}ms`)
    return {
      username: report.user_profile.username,
      followers: report.user_profile.followers,
      er: report.user_profile.engagement_rate,
      audience: {
        genders: report.audience_followers?.data?.audience_genders,
        ages: report.audience_followers?.data?.audience_ages,
        topCountries: report.audience_followers?.data?.audience_geo?.countries?.slice(0, 5),
        credibility: report.audience_followers?.data?.audience_credibility,
      },
    }
  },
}

// ─── Public Agent ─────────────────────────────────────────────────

export interface InfluencerAgentResult {
  influencers: Array<{
    username: string
    fullname: string
    followers: number
    engagement_rate: number
    rationale: string  // Why model picked them
    tier: string       // micro/mid/macro/mega
  }>
  strategy: string
  toolCalls: number
  rawText: string
}

export interface InfluencerAgentInput {
  brandName: string
  industry: string
  targetAudience: string
  goals: string[]
  budget?: number
  influencerCount?: number
}

/**
 * Run the IMAI agentic flow.
 * Gemini reads brand context → decides search strategy →
 * calls IMAI API (one or more times) → analyzes real results → returns recommendations.
 */
export async function runInfluencerAgent(
  input: InfluencerAgentInput,
): Promise<InfluencerAgentResult> {
  const requestId = `imai-agent-${Date.now()}`
  const startTs = Date.now()
  console.log(`[InfluencerAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[InfluencerAgent][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[InfluencerAgent][${requestId}]    industry: ${input.industry || '(none)'}`)
  console.log(`[InfluencerAgent][${requestId}]    audience: ${(input.targetAudience || '').slice(0, 100)}`)
  console.log(`[InfluencerAgent][${requestId}]    goals: [${input.goals.join(', ')}]`)
  console.log(`[InfluencerAgent][${requestId}]    budget: ${input.budget ? '₪' + input.budget.toLocaleString() : '(none)'}`)
  console.log(`[InfluencerAgent][${requestId}]    target count: ${input.influencerCount || 'auto (5-8)'}`)
  console.log(`[InfluencerAgent][${requestId}]    IMAI_API_KEY: ${process.env.IMAI_API_KEY ? '✅ set' : '❌ MISSING'}`)
  console.log(`[InfluencerAgent][${requestId}]    GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ MISSING'}`)

  const systemPrompt = `You are an Israeli influencer marketing strategist for the agency Leaders.
You have access to the IMAI API (Israel's leading influencer database) via function calls.

Your job:
1. Analyze the brand brief.
2. Call search_israeli_influencers with the right Hebrew/English keyword mix to find candidates.
3. If results aren't great, REFINE your search with different keywords or filter ranges.
4. Optionally call get_audience_report on the top 3 candidates to verify their audience.
5. Return a final recommendation in Hebrew with concrete rationale per influencer.

Rules:
- ALL output to the user must be in Hebrew.
- NEVER invent influencer data — only use what the API returns.
- Match influencer tier to brand size (premium → mid/macro, indie → micro).
- Diversify: mix of tiers, content styles, and aesthetics.
- Final answer must be JSON: { "strategy": "...", "influencers": [{...}] }`

  const userPrompt = `Brand: ${input.brandName}
Industry: ${input.industry}
Target audience: ${input.targetAudience}
Campaign goals: ${input.goals.join(', ')}
${input.budget ? `Budget: ₪${input.budget.toLocaleString()}` : ''}
${input.influencerCount ? `Recommend ~${input.influencerCount} influencers` : 'Recommend 5-8 influencers'}

Use the IMAI tools to find real Israeli influencers that fit. Don't guess — search.

Return JSON in this exact shape:
{
  "strategy": "פסקה אחת בעברית — האסטרטגיה המומלצת לליהוק",
  "influencers": [
    {
      "username": "<from API>",
      "fullname": "<from API>",
      "followers": <number from API>,
      "engagement_rate": <number from API>,
      "tier": "micro|mid|macro|mega",
      "rationale": "משפט בעברית — למה דווקא הם"
    }
  ]
}`

  const result = await callGeminiAgent({
    model: 'gemini-3.1-pro-preview',
    prompt: userPrompt,
    systemPrompt,
    functionDeclarations: FUNCTION_DECLARATIONS,
    functionHandlers: handlers,
    maxIterations: 6,
    maxOutputTokens: 8000,
    callerId: requestId,
  })

  const elapsed = Date.now() - startTs
  console.log(`[InfluencerAgent][${requestId}] 📊 Agent loop done in ${elapsed}ms — ${result.toolCalls.length} tool calls`)

  // Log every tool call summary
  result.toolCalls.forEach((tc, i) => {
    const argsStr = JSON.stringify(tc.args).slice(0, 150)
    const resultStr = Array.isArray(tc.result)
      ? `array(${tc.result.length})`
      : typeof tc.result === 'object' && tc.result !== null
        ? `object{${Object.keys(tc.result as object).slice(0, 5).join(',')}}`
        : String(tc.result).slice(0, 100)
    console.log(`[InfluencerAgent][${requestId}]   #${i + 1} ${tc.name}(${argsStr}) → ${resultStr}`)
  })

  console.log(`[InfluencerAgent][${requestId}] 📝 Raw model output (${result.text.length} chars): ${result.text.slice(0, 200)}...`)

  // Parse the model's final JSON answer
  let parsed: { strategy: string; influencers: InfluencerAgentResult['influencers'] }
  try {
    const cleanText = result.text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] || cleanText)
  } catch (err) {
    console.error(`[InfluencerAgent][${requestId}] ❌ Failed to parse final answer:`, err)
    console.error(`[InfluencerAgent][${requestId}] Raw text was: ${result.text}`)
    parsed = { strategy: 'שגיאה בניתוח התוצאות', influencers: [] }
  }

  console.log(`[InfluencerAgent][${requestId}] ✅ Returning ${parsed.influencers?.length || 0} influencers, strategy: "${(parsed.strategy || '').slice(0, 80)}..."`)
  parsed.influencers?.forEach((inf, i) => {
    console.log(`[InfluencerAgent][${requestId}]   ${i + 1}. @${inf.username} (${inf.followers?.toLocaleString()} followers, ER ${inf.engagement_rate}%, tier=${inf.tier})`)
  })
  console.log(`[InfluencerAgent][${requestId}] ═══════════════════════════════════════`)

  return {
    influencers: parsed.influencers || [],
    strategy: parsed.strategy || '',
    toolCalls: result.toolCalls.length,
    rawText: result.text,
  }
}
