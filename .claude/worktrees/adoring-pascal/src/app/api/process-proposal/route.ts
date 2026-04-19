import { NextRequest, NextResponse } from 'next/server'
import { extractFromBrief } from '@/lib/gemini/proposal-agent'
import { resetToGemini, getProviderStatus } from '@/lib/ai-provider'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const requestId = `process-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${requestId}] 🔍 PROCESS PROPOSAL (extract only) - START`)

  // Reset provider to Gemini at the start of each new pipeline run
  resetToGemini()

  try {
    const { clientBriefText, kickoffText } = await request.json()

    if (!clientBriefText || typeof clientBriefText !== 'string') {
      return NextResponse.json({ error: 'clientBriefText is required' }, { status: 400 })
    }
    if (clientBriefText.trim().length < 20) {
      return NextResponse.json({ error: 'טקסט הבריף קצר מדי' }, { status: 400 })
    }

    console.log(`[${requestId}] 📄 Brief: ${clientBriefText.length} chars, Kickoff: ${kickoffText ? kickoffText.length + ' chars' : 'none'}`)

    const extracted = await extractFromBrief(clientBriefText, kickoffText || undefined)

    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] ✅ Extraction done in ${elapsed}ms — Brand: ${extracted?.brand?.name || 'N/A'}`)

    const providerInfo = getProviderStatus()
    return NextResponse.json({ success: true, extracted, provider: providerInfo })
  } catch (error) {
    const elapsed = Date.now() - startTime
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, errMsg)

    // Detect Gemini 503 overload
    const is503 = errMsg === 'SERVICE_OVERLOADED' ||
      (error instanceof Error && 'status' in error && (error as Error & { status: number }).status === 503)

    if (is503) {
      return NextResponse.json(
        { error: 'שרתי ה-AI עמוסים כרגע — נסה שוב בעוד מספר דקות', isOverloaded: true },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: errMsg || 'שגיאה בעיבוד המסמכים' },
      { status: 500 }
    )
  }
}
