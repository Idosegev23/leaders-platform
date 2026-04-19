/**
 * POST /api/research-agent
 *
 * Single research agent — replaces the old 4-agent + IMAI + build-proposal flow.
 * One Gemini call researches the brand, finds influencers, and drafts all wizard content.
 *
 * Body: { brandName, briefText, briefFileUri?, briefFileMime? }
 * Returns: { researchText, influencers, brandContent, strategyContent, executionContent,
 *            imagePrompts, brandColors, totalToolCalls, durationMs }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runResearchAgent } from '@/lib/gemini/research-agent'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `research-agent-route-${Date.now()}`

  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { brandName, briefText, briefFileUri, briefFileMime } = body

    if (!brandName || !briefText) {
      return NextResponse.json({ error: 'brandName and briefText required' }, { status: 400 })
    }

    console.log(`[${requestId}] 🚀 Research agent for "${brandName}" (${briefText.length} chars)`)

    const result = await runResearchAgent(
      { brandName, briefText, briefFileUri, briefFileMime },
      (event) => {
        console.log(`[${requestId}] 📊 [${event.stage}] ${event.message} (${event.progress || 0}%)`)
      },
    )

    console.log(`[${requestId}] ✅ Done: ${result.totalToolCalls} tools, ${result.durationMs}ms`)

    return NextResponse.json(result)
  } catch (err) {
    console.error(`[${requestId}] ❌ Failed:`, err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Research agent failed' },
      { status: 500 },
    )
  }
}
