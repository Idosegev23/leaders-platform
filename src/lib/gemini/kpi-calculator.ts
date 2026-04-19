/**
 * KPI Calculator — Gemini Code Execution
 *
 * Instead of letting the model "guess" CPE / CPM / reach numbers (and hallucinate),
 * we give it Python code execution. The model writes Python, runs it, returns real numbers.
 *
 * Used by: KPI wizard step (media_targets), price quote generator
 */

import { callAI } from '@/lib/ai-provider'

export interface KpiInput {
  budget: number              // in ILS
  influencerCount: number
  campaignDurationMonths: number
  contentMix: Array<{
    type: string              // "reel" | "story" | "tiktok" | "post"
    quantityPerInfluencer: number
  }>
  // Optional industry benchmarks (otherwise model uses defaults)
  avgEngagementRate?: number  // % e.g. 3.5
  avgReachPerFollower?: number // ratio e.g. 0.15
}

export interface KpiResult {
  totalDeliverables: number
  potentialReach: number
  potentialEngagement: number
  estimatedImpressions: number
  cpe: number                  // cost per engagement (ILS)
  cpm: number                  // cost per 1k impressions (ILS)
  cpr: number                  // cost per reach
  pythonCode: string           // the actual code that ran
  notes: string                // human-readable explanation in Hebrew
}

/**
 * Calculate campaign KPIs using Gemini Code Execution.
 * Math is REAL — model writes Python, sandbox runs it, we get the result.
 */
export async function calculateKpis(input: KpiInput): Promise<KpiResult> {
  const requestId = `kpi-${Date.now()}`
  const startTs = Date.now()
  console.log(`[KpiCalc][${requestId}] ═══════════════════════════════════════`)
  console.log(`[KpiCalc][${requestId}] 🧮 START — budget=₪${input.budget.toLocaleString()}, ${input.influencerCount} influencers, ${input.campaignDurationMonths} months`)
  console.log(`[KpiCalc][${requestId}]    content mix: ${input.contentMix.map(c => `${c.quantityPerInfluencer}× ${c.type}`).join(', ')}`)
  if (input.avgEngagementRate) console.log(`[KpiCalc][${requestId}]    custom ER: ${input.avgEngagementRate}%`)
  if (input.avgReachPerFollower) console.log(`[KpiCalc][${requestId}]    custom reach ratio: ${input.avgReachPerFollower}`)
  console.log(`[KpiCalc][${requestId}]    GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ set' : '❌ MISSING'}`)

  const prompt = `You are a campaign analyst. Use Python code execution to calculate accurate campaign KPIs.

Inputs (Israeli market):
- Budget: ₪${input.budget}
- Influencers: ${input.influencerCount}
- Duration: ${input.campaignDurationMonths} months
- Content mix per influencer:
${input.contentMix.map(c => `  - ${c.quantityPerInfluencer}× ${c.type}`).join('\n')}
${input.avgEngagementRate ? `- Avg ER: ${input.avgEngagementRate}%` : '- Avg ER: use Israeli market benchmark for the content type'}
${input.avgReachPerFollower ? `- Reach/follower: ${input.avgReachPerFollower}` : '- Reach/follower: use industry standard'}

WRITE PYTHON CODE that:
1. Estimates avg followers per Israeli influencer in this tier (assume mid-tier 30-80k unless budget suggests otherwise)
2. Computes total deliverables = sum of quantityPerInfluencer × influencerCount
3. Estimates total reach (followers × reach_ratio × deliverables_per_post weight)
4. Estimates total engagement = reach × ER
5. Estimates impressions = reach × 1.4 (avg view repetition)
6. Computes CPE = budget / engagement
7. Computes CPM = budget / impressions × 1000
8. Computes CPR = budget / reach

Print all results clearly. Use realistic Israeli market benchmarks:
- Reels: ER ~4%, reach ratio 0.18
- Stories: ER ~2%, reach ratio 0.12
- Posts: ER ~3%, reach ratio 0.10
- TikTok: ER ~5%, reach ratio 0.20

After running the code, return ONLY this JSON (no markdown):
{
  "totalDeliverables": <int>,
  "potentialReach": <int>,
  "potentialEngagement": <int>,
  "estimatedImpressions": <int>,
  "cpe": <float, 2 decimals>,
  "cpm": <float, 2 decimals>,
  "cpr": <float, 4 decimals>,
  "pythonCode": "<the python code you ran>",
  "notes": "<2-3 משפטים בעברית — איך הגעת לתוצאות, מה ההנחות>"
}`

  const result = await callAI({
    model: 'gemini-3.1-pro-preview',
    prompt,
    useCodeExecution: true,
    geminiConfig: {
      thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
      maxOutputTokens: 8000,
    },
    thinkingLevel: 'MEDIUM',
    maxOutputTokens: 8000,
    callerId: requestId,
  })

  // Parse the trailing JSON
  const text = result.text || ''
  const elapsed = Date.now() - startTs
  console.log(`[KpiCalc][${requestId}] 📝 Gemini response in ${elapsed}ms — ${text.length} chars`)
  console.log(`[KpiCalc][${requestId}] First 300 chars: ${text.slice(0, 300)}`)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`[KpiCalc][${requestId}] ❌ No JSON in response`)
    return makeDefaultKpis(input, 'שגיאה בחישוב — נדרש חישוב ידני')
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as KpiResult
    console.log(`[KpiCalc][${requestId}] ✅ Parsed metrics:`)
    console.log(`[KpiCalc][${requestId}]    deliverables: ${parsed.totalDeliverables}`)
    console.log(`[KpiCalc][${requestId}]    reach: ${parsed.potentialReach?.toLocaleString()}`)
    console.log(`[KpiCalc][${requestId}]    engagement: ${parsed.potentialEngagement?.toLocaleString()}`)
    console.log(`[KpiCalc][${requestId}]    impressions: ${parsed.estimatedImpressions?.toLocaleString()}`)
    console.log(`[KpiCalc][${requestId}]    CPE: ₪${parsed.cpe} | CPM: ₪${parsed.cpm} | CPR: ₪${parsed.cpr}`)
    console.log(`[KpiCalc][${requestId}]    notes: ${parsed.notes?.slice(0, 150)}`)
    if (parsed.pythonCode) console.log(`[KpiCalc][${requestId}]    🐍 Python code (${parsed.pythonCode.length} chars):\n${parsed.pythonCode.slice(0, 500)}`)
    console.log(`[KpiCalc][${requestId}] ═══════════════════════════════════════`)
    return parsed
  } catch (err) {
    console.error(`[KpiCalc][${requestId}] ❌ Parse failed:`, err)
    return makeDefaultKpis(input, 'שגיאה בפרסור — נדרש חישוב ידני')
  }
}

function makeDefaultKpis(input: KpiInput, note: string): KpiResult {
  const totalDeliverables = input.contentMix.reduce(
    (sum, c) => sum + c.quantityPerInfluencer * input.influencerCount,
    0,
  )
  return {
    totalDeliverables,
    potentialReach: 0,
    potentialEngagement: 0,
    estimatedImpressions: 0,
    cpe: 0,
    cpm: 0,
    cpr: 0,
    pythonCode: '',
    notes: note,
  }
}
