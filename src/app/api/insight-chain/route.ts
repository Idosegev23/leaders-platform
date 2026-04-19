import { NextRequest, NextResponse } from 'next/server'
import { generateInsight } from '@/lib/content/insight-chain'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await generateInsight({
      brandName: body.brandName || '',
      industry: body.industry || '',
      targetAudience: body.targetAudience || '',
      brandBrief: body.brandBrief || '',
      painPoints: body.painPoints || [],
      researchData: body.researchData || '',
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[insight-chain] Error:', error)
    return NextResponse.json({ error: 'Insight generation failed' }, { status: 500 })
  }
}
