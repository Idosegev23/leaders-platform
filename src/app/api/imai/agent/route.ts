/**
 * POST /api/imai/agent
 *
 * Run the Gemini-powered IMAI agent.
 * Body: { brandName, industry, targetAudience, goals[], budget?, influencerCount? }
 * Returns: { influencers[], strategy, toolCalls }
 */

import { NextResponse } from 'next/server'
import { runInfluencerAgent, type InfluencerAgentInput } from '@/lib/gemini/imai-agent'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const requestId = `imai-agent-route-${Date.now()}`
  try {
    const body = (await req.json()) as Partial<InfluencerAgentInput>

    if (!body.brandName) {
      return NextResponse.json({ error: 'brandName required' }, { status: 400 })
    }

    console.log(`[${requestId}] Starting IMAI agent for ${body.brandName}`)

    const result = await runInfluencerAgent({
      brandName: body.brandName,
      industry: body.industry || 'general',
      targetAudience: body.targetAudience || '',
      goals: body.goals || [],
      budget: body.budget,
      influencerCount: body.influencerCount,
    })

    console.log(`[${requestId}] Agent returned ${result.influencers.length} influencers via ${result.toolCalls} tool calls`)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${requestId}] Failed:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
