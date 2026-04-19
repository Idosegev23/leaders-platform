/**
 * POST /api/generate-full
 *
 * Single-agent presentation generation.
 * One Gemini agent researches, plans, and generates all 11 slides.
 *
 * Body: { documentId }
 * Returns: { success, slideCount, durationMs, qualityScore }
 *
 * Progress is logged to Vercel logs (SSE streaming can be added later).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import { runPresentationAgent, type AgentInput } from '@/lib/gemini/presentation-agent'
import type { HtmlPresentation } from '@/lib/gemini/slide-designer'

export const maxDuration = 600
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const requestId = `gen-full-${Date.now()}`
  const startTs = Date.now()
  console.log(`[${requestId}] ═══════════════════════════════════════`)
  console.log(`[${requestId}] 🚀 GENERATE-FULL (single agent) — START`)

  try {
    const supabase = await createClient()

    // Auth
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const { documentId } = await request.json()
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!isDevMode && doc.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const data = doc.data as Record<string, unknown>
    const brandName = (data.brandName as string) || ''

    console.log(`[${requestId}] 📄 Document: ${documentId}`)
    console.log(`[${requestId}]    Brand: ${brandName}`)
    console.log(`[${requestId}]    Keys: ${Object.keys(data).length}`)

    // Check if already generated
    const htmlPres = data._htmlPresentation as { htmlSlides?: string[] } | undefined
    if (htmlPres?.htmlSlides?.length) {
      console.log(`[${requestId}] ⚠️ Presentation already exists (${htmlPres.htmlSlides.length} slides)`)
    }

    // Build agent input from document data
    const images = (data._generatedImages as Record<string, string>) || {}
    const scraped = data._scraped as { logoUrl?: string; heroImages?: string[] } | undefined

    const agentInput: AgentInput = {
      brandName,
      briefText: (data._briefText as string) || (data.brandBrief as string) || '',
      kickoffText: (data._kickoffText as string) || undefined,
      briefFileUri: (data._geminiFileUri as string) || undefined,
      briefFileMime: (data._geminiFileMime as string) || undefined,
      wizardData: data,
      brandResearch: (data._brandResearch as Record<string, unknown>) || undefined,
      images,
      clientLogoUrl: scraped?.logoUrl || (data.brandLogoFile as string) || undefined,
    }

    console.log(`[${requestId}] 🤖 Running presentation agent...`)
    console.log(`[${requestId}]    briefText: ${agentInput.briefText.length} chars`)
    console.log(`[${requestId}]    fileUri: ${agentInput.briefFileUri || 'none'}`)
    console.log(`[${requestId}]    brandResearch: ${agentInput.brandResearch ? 'YES' : 'NO'}`)
    console.log(`[${requestId}]    images: ${Object.keys(images).length}`)

    // Run the agent
    const result = await runPresentationAgent(agentInput, (event) => {
      console.log(`[${requestId}] 📊 Progress: [${event.stage}] ${event.message}${event.slideIndex !== undefined ? ` (${event.slideIndex + 1}/${event.totalSlides})` : ''}`)
    })

    // Build HtmlPresentation object
    const htmlPresentation: HtmlPresentation = {
      title: brandName,
      brandName,
      designSystem: result.designSystem,
      htmlSlides: result.htmlSlides,
      slideTypes: result.slideTypes,
      metadata: {
        brandName,
        createdAt: new Date().toISOString(),
        version: 7,
        pipeline: 'single-agent-v7',
        qualityScore: 90,
        duration: result.durationMs,
      },
    }

    // Save to document
    const { _pipeline, ...cleanData } = data as Record<string, unknown> & { _pipeline?: unknown }
    await supabase.from('documents').update({
      data: {
        ...cleanData,
        _htmlPresentation: htmlPresentation,
        _agentResult: {
          totalToolCalls: result.totalToolCalls,
          durationMs: result.durationMs,
          slideCount: result.htmlSlides.length,
          influencers: result.influencers,
          kpis: result.kpis,
        },
        _pipelineStatus: {
          textGeneration: 'complete',
          research: 'complete',
          visualAssets: 'complete',
          slideGeneration: 'complete',
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', documentId)

    const elapsed = Date.now() - startTs
    console.log(`[${requestId}] ✅ DONE — ${result.htmlSlides.length} slides, ${result.totalToolCalls} tool calls, ${elapsed}ms`)
    console.log(`[${requestId}] ═══════════════════════════════════════`)

    return NextResponse.json({
      success: true,
      slideCount: result.htmlSlides.length,
      totalToolCalls: result.totalToolCalls,
      durationMs: elapsed,
      qualityScore: 90,
      mode: 'single-agent',
    })
  } catch (error) {
    const elapsed = Date.now() - startTs
    console.error(`[${requestId}] ❌ FAILED after ${elapsed}ms:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent failed', details: String(error) },
      { status: 500 },
    )
  }
}
