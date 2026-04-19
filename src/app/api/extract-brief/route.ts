import { NextRequest, NextResponse } from 'next/server'
import { extractFromDocuments } from '@/lib/gemini/document-extractor'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `extract-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${requestId}] 🧠 EXTRACT BRIEF - START`)
  console.log(`${'='.repeat(60)}`)

  try {
    const body = await request.json()
    const { clientBriefText, kickoffText } = body

    console.log(`[${requestId}] 📄 Client brief text: ${clientBriefText ? `${clientBriefText.length} chars` : 'MISSING'}`)
    console.log(`[${requestId}] 📄 Kickoff text: ${kickoffText ? `${kickoffText.length} chars` : 'not provided'}`)

    if (!clientBriefText) {
      console.log(`[${requestId}] ❌ Missing clientBriefText`)
      return NextResponse.json(
        { error: 'Missing clientBriefText - at least one document is required' },
        { status: 400 }
      )
    }

    // Log first 300 chars of each document for debugging
    console.log(`[${requestId}] 📝 Brief preview: ${clientBriefText.slice(0, 300).replace(/\n/g, ' ')}`)
    if (kickoffText) {
      console.log(`[${requestId}] 📝 Kickoff preview: ${kickoffText.slice(0, 300).replace(/\n/g, ' ')}`)
    }

    console.log(`[${requestId}] 🔄 Starting AI extraction via Gemini...`)
    const extractStart = Date.now()
    const extracted = await extractFromDocuments(clientBriefText, kickoffText || undefined)
    const extractTime = Date.now() - extractStart

    console.log(`[${requestId}] ✅ AI extraction completed in ${extractTime}ms`)
    console.log(`[${requestId}] 📊 Brand: ${extracted.brand?.name || 'NOT FOUND'}`)
    console.log(`[${requestId}] 📊 Brand official: ${extracted.brand?.officialName || 'N/A'}`)
    console.log(`[${requestId}] 📊 Industry: ${extracted.brand?.industry || 'N/A'}`)
    console.log(`[${requestId}] 📊 Budget: ${extracted.budget?.amount || 0} ${extracted.budget?.currency || '₪'}`)
    console.log(`[${requestId}] 📊 Goals: ${extracted.campaignGoals?.length || 0} goals - [${extracted.campaignGoals?.join(', ') || 'none'}]`)
    console.log(`[${requestId}] 📊 Target audience: ${extracted.targetAudience?.primary?.gender || 'N/A'}, ${extracted.targetAudience?.primary?.ageRange || 'N/A'}`)
    console.log(`[${requestId}] 📊 Key insight: ${extracted.keyInsight ? 'YES' : 'NO'}`)
    console.log(`[${requestId}] 📊 Strategy direction: ${extracted.strategyDirection ? 'YES' : 'NO'}`)
    console.log(`[${requestId}] 📊 Creative direction: ${extracted.creativeDirection ? 'YES' : 'NO'}`)
    console.log(`[${requestId}] 📊 Deliverables: ${extracted.deliverables?.length || 0} items`)
    console.log(`[${requestId}] 📊 Influencer prefs: types=[${extracted.influencerPreferences?.types?.join(', ') || 'none'}]`)
    console.log(`[${requestId}] 📊 Timeline: ${extracted.timeline?.duration || 'N/A'}`)
    console.log(`[${requestId}] 📊 Confidence: ${extracted._meta?.confidence || 'unknown'}`)
    console.log(`[${requestId}] 📊 Warnings: ${extracted._meta?.warnings?.length || 0} - [${extracted._meta?.warnings?.join(', ') || 'none'}]`)
    console.log(`[${requestId}] 📊 Notes: ${extracted._meta?.extractionNotes || 'none'}`)
    console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    console.log(`${'='.repeat(60)}\n`)

    return NextResponse.json({
      success: true,
      data: extracted,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')
    const message = error instanceof Error ? error.message : 'Failed to extract data from documents'

    // Return 400 for input validation errors, 500 for API/server errors
    const isInputError = message.includes('קצר מדי') || message.includes('Missing')
    const status = isInputError ? 400 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
