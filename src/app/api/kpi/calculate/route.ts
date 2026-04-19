/**
 * POST /api/kpi/calculate
 *
 * Compute campaign KPIs using Gemini Code Execution.
 * Real Python math, no hallucinated numbers.
 */

import { NextResponse } from 'next/server'
import { calculateKpis, type KpiInput } from '@/lib/gemini/kpi-calculator'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const requestId = `kpi-route-${Date.now()}`
  try {
    const body = (await req.json()) as Partial<KpiInput>

    if (!body.budget || !body.influencerCount || !body.contentMix) {
      return NextResponse.json(
        { error: 'budget, influencerCount, contentMix required' },
        { status: 400 },
      )
    }

    console.log(`[${requestId}] Calculating KPIs for budget ₪${body.budget}`)

    const result = await calculateKpis({
      budget: body.budget,
      influencerCount: body.influencerCount,
      campaignDurationMonths: body.campaignDurationMonths || 1,
      contentMix: body.contentMix,
      avgEngagementRate: body.avgEngagementRate,
      avgReachPerFollower: body.avgReachPerFollower,
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${requestId}] Failed:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
