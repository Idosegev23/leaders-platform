import { NextRequest, NextResponse } from 'next/server'
import { runSingleAgent, getResearchAngles } from '@/lib/gemini/brand-research'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `agent-${Date.now()}`
  try {
    const body = await request.json()
    const { brandName, angleIndex } = body

    if (!brandName || angleIndex === undefined) {
      return NextResponse.json({ error: 'brandName and angleIndex are required' }, { status: 400 })
    }

    const angles = getResearchAngles(brandName)
    if (angleIndex < 0 || angleIndex >= angles.length) {
      return NextResponse.json({ error: 'Invalid angleIndex' }, { status: 400 })
    }

    const angle = angles[angleIndex]
    console.log(`[${requestId}] Running agent for: ${angle.name} (brand: ${brandName})`)

    const result = await runSingleAgent(brandName, angle.name, angle.description)

    console.log(`[${requestId}] Agent complete: ${angle.name}, data length: ${result.data.length}`)
    return NextResponse.json({ angle: result.angle, data: result.data, label: angle.label })
  } catch (error) {
    console.error(`[${requestId}] Agent error:`, error)
    return NextResponse.json(
      { error: 'Agent failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
