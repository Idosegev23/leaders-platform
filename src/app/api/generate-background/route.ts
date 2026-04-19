import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import {
  pipelineFoundation,
  pipelineBatch,
  pipelineFinalize,
} from '@/lib/gemini/slide-designer'
import type { PipelineFoundation, BatchResult } from '@/lib/gemini/slide-designer'
export const maxDuration = 600

/**
 * POST /api/generate-background
 *
 * Fire-and-forget slide generation. The client can navigate away
 * and the function keeps running (Vercel Pro: up to 800s).
 * Progress is saved to DB and visible in the dashboard.
 */
export async function POST(request: NextRequest) {
  const requestId = `bg-${Date.now()}`

  try {
    const supabase = await createClient()

    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const { documentId } = await request.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId required' }, { status: 400 })
    }

    // Fetch document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let documentData = document.data as Record<string, unknown>
    const brandName = (documentData.brandName as string) || 'Unknown'

    // Check if already running
    const existingPipeline = documentData._pipeline as { status?: string; startedAt?: number } | undefined
    if (existingPipeline?.status === 'generating') {
      const elapsed = Date.now() - (existingPipeline.startedAt || 0)
      if (elapsed < 15 * 60 * 1000) {
        return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })
      }
    }

    // Immediately return 200 to client, then continue processing
    // (Vercel keeps the function alive until it returns or hits maxDuration)
    console.log(`[${requestId}] Background generation starting for "${brandName}" (${documentId})`)

    // Mark as generating
    await supabase.from('documents').update({
      data: {
        ...documentData,
        _pipeline: { status: 'generating', startedAt: Date.now(), mode: 'background', progress: 0 },
      },
    }).eq('id', documentId)

    try {
      // ── Step 1: Research (if pending) ──
      const pipelineStatus = (documentData._pipelineStatus as Record<string, string>) || {}

      if (pipelineStatus.research === 'pending') {
        console.log(`[${requestId}] Running deferred research...`)
        try {
          const baseUrl = getBaseUrl()
          const researchRes = await fetch(`${baseUrl}/api/research`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName }),
          })
          if (researchRes.ok) {
            const researchData = await researchRes.json()
            const patch: Record<string, unknown> = {
              _pipelineStatus: { ...pipelineStatus, research: 'complete' },
            }
            if (researchData.research) patch._brandResearch = researchData.research
            if (researchData.colors) patch._brandColors = researchData.colors
            await supabase.from('documents').update({
              data: { ...documentData, ...patch },
            }).eq('id', documentId)
            documentData = { ...documentData, ...patch }
          }
        } catch (err) {
          console.warn(`[${requestId}] Research failed (continuing):`, err)
        }
      }

      // ── Step 2: Visual assets (if pending) ──
      if (pipelineStatus.visualAssets !== 'complete') {
        console.log(`[${requestId}] Generating visual assets...`)
        try {
          const baseUrl = getBaseUrl()
          const visualRes = await fetch(`${baseUrl}/api/generate-visual-assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandName: documentData.brandName || '',
              brandResearch: documentData._brandResearch,
              stepData: documentData._stepData,
            }),
          })
          if (visualRes.ok) {
            const visualAssets = await visualRes.json()
            const patch: Record<string, unknown> = {
              _pipelineStatus: { ...documentData._pipelineStatus as Record<string, string>, visualAssets: 'complete' },
            }
            if (visualAssets.scraped) patch._scraped = visualAssets.scraped
            if (visualAssets.brandColors?.primary) patch._brandColors = visualAssets.brandColors
            if (visualAssets.generatedImages) patch._generatedImages = visualAssets.generatedImages
            if (visualAssets.extraImages?.length) patch._extraImages = visualAssets.extraImages
            if (visualAssets.imageStrategy) patch._imageStrategy = visualAssets.imageStrategy
            await supabase.from('documents').update({
              data: { ...documentData, ...patch },
            }).eq('id', documentId)
            documentData = { ...documentData, ...patch }
          }
        } catch (err) {
          console.warn(`[${requestId}] Visual assets failed (continuing):`, err)
        }
      }

      // ── Step 3: Foundation ──
      console.log(`[${requestId}] Running foundation...`)
      // Re-fetch document to get latest data
      const { data: freshDoc } = await supabase.from('documents').select('data').eq('id', documentId).single()
      if (freshDoc) documentData = freshDoc.data as Record<string, unknown>

      const images = (documentData._generatedImages as Record<string, string>) || {}
      const brandColors = documentData._brandColors as { primary?: string } | undefined
      const scrapedAssets = documentData._scraped as { logoUrl?: string; heroImages?: string[]; lifestyleImages?: string[] } | undefined

      const config = {
        accentColor: brandColors?.primary || '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        clientLogoUrl: scrapedAssets?.logoUrl,
        images: {
          coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || '',
          brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || scrapedAssets?.heroImages?.[0] || '',
          audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || '',
          activityImage: images.activityImage || scrapedAssets?.lifestyleImages?.[1] || scrapedAssets?.lifestyleImages?.[0] || '',
        },
        extraImages: documentData._extraImages as { id: string; url: string; placement: string }[] | undefined,
        imageStrategy: documentData._imageStrategy as { conceptSummary?: string; visualDirection?: string; styleGuide?: string } | undefined,
      }

      const foundation = await pipelineFoundation(documentData, config)

      // Save foundation
      await supabase.from('documents').update({
        data: {
          ...documentData,
          _pipeline: {
            foundation,
            batchResults: [],
            status: 'generating',
            startedAt: Date.now(),
            mode: 'background',
            progress: 15,
          },
        },
      }).eq('id', documentId)

      // ── Step 4: Parallel batch generation (3 batches) ──
      const batchCount = foundation.batches.length
      console.log(`[${requestId}] Generating ${foundation.totalSlides} slides in ${batchCount} batches...`)
      const batchResults: BatchResult[] = []

      for (let i = 0; i < batchCount; i++) {
        console.log(`[${requestId}] Batch ${i + 1}/${batchCount} (${foundation.batches[i].length} slides)...`)
        const result = await pipelineBatch(foundation, i, null)
        batchResults.push(result)

        const progress = 15 + Math.round((i + 1) / batchCount * 75)

        // Save progress after each batch
        await supabase.from('documents').update({
          data: {
            ...documentData,
            _pipeline: {
              foundation,
              batchResults,
              status: 'generating',
              mode: 'background',
              progress,
              currentBatch: i + 1,
              totalBatches: batchCount,
              totalSlides: foundation.totalSlides,
            },
          },
        }).eq('id', documentId)
      }

      // ── Step 5: Finalize ──
      console.log(`[${requestId}] Finalizing...`)
      const allSlides = batchResults.flatMap(r => r.slides)
      const presentation = await pipelineFinalize(foundation, allSlides)

      // Save final presentation
      const { _pipeline, ...cleanData } = documentData as Record<string, unknown> & { _pipeline?: unknown }
      await supabase.from('documents').update({
        data: {
          ...cleanData,
          _presentation: presentation,
          _pipelineStatus: {
            textGeneration: 'complete',
            research: 'complete',
            visualAssets: 'complete',
            slideGeneration: 'complete',
          },
        },
      }).eq('id', documentId)

      console.log(`[${requestId}] Background generation complete: ${presentation.slides.length} slides`)

      return NextResponse.json({
        success: true,
        slideCount: presentation.slides.length,
        qualityScore: presentation.metadata?.qualityScore,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[${requestId}] Background generation failed:`, errorMessage)

      // Save error state
      await supabase.from('documents').update({
        data: {
          ...documentData,
          _pipeline: { status: 'error', error: errorMessage, mode: 'background' },
        },
      }).eq('id', documentId)

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
  } catch (error) {
    console.error(`[${requestId}] Fatal error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
