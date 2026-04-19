import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateProposal } from '@/lib/gemini/proposal-agent'

export const maxDuration = 600

/**
 * POST /api/build-proposal
 * Generates full wizard step data from the stored brief texts.
 * Called after the user makes a choice in the research popup:
 *   - "No research": { documentId } only
 *   - "Yes research": { documentId, brandResearch, influencerStrategy }
 *
 * Reads _briefText and _kickoffText from the document, runs generateProposal,
 * and returns { extracted, stepData } for the caller to PATCH the document.
 */
export async function POST(request: NextRequest) {
  const requestId = `build-proposal-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${requestId}] 🏗️ BUILD PROPOSAL - START`)

  try {
    const body = await request.json()
    const { documentId, brandResearch, influencerStrategy } = body

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    // Load stored brief texts from document
    const supabase = await createClient()
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('data')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) {
      console.error(`[${requestId}] ❌ Document not found:`, docErr)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const briefText: string = doc.data?._briefText || ''
    const kickoffText: string | undefined = doc.data?._kickoffText || undefined

    if (!briefText || briefText.trim().length < 20) {
      console.error(`[${requestId}] ❌ No brief text in document`)
      return NextResponse.json({ error: 'No brief text found in document' }, { status: 400 })
    }

    console.log(`[${requestId}] 📄 Brief: ${briefText.length} chars, Kickoff: ${kickoffText ? kickoffText.length + ' chars' : 'none'}`)
    console.log(`[${requestId}] 🔬 With research: ${!!brandResearch}`)

    const result = await generateProposal(
      briefText,
      kickoffText,
      brandResearch ?? undefined,
      influencerStrategy ?? undefined
    )

    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] ✅ Proposal built in ${elapsed}ms — Brand: ${result.extracted.brand?.name || 'N/A'}`)

    return NextResponse.json({
      success: true,
      extracted: result.extracted,
      stepData: result.stepData,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'שגיאה בבניית ההצעה' },
      { status: 500 }
    )
  }
}
