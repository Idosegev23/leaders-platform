import { NextRequest, NextResponse } from 'next/server'
import { enhanceCreativeWithResearch } from '@/lib/gemini/creative-enhancer'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const requestId = `enhance-creative-${Date.now()}`
  try {
    const { creative, brandResearch } = await request.json()

    if (!creative || !brandResearch) {
      return NextResponse.json({ error: 'creative and brandResearch are required' }, { status: 400 })
    }

    console.log(`[${requestId}] Enhancing creative for brand: ${brandResearch.brandName}`)

    const enhanced = await enhanceCreativeWithResearch(creative, brandResearch)

    return NextResponse.json({ creative: enhanced })
  } catch (err) {
    console.error(`[${requestId}] Error:`, err)
    return NextResponse.json(
      { error: 'Enhancement failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
