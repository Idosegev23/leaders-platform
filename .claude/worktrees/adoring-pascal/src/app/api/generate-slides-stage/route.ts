import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import {
  pipelineFoundation,
  pipelineBatch,
  pipelineFinalize,
} from '@/lib/gemini/slide-designer'
import type { PipelineFoundation, BatchResult } from '@/lib/gemini/slide-designer'
import type { Slide } from '@/types/presentation'

export const maxDuration = 600

/**
 * POST /api/generate-slides-stage
 *
 * Staged slide generation pipeline — each call runs one stage:
 *   - stage: 'foundation' → Design System + batch preparation
 *   - stage: 'batch' + batchIndex → One batch of AST slides
 *   - stage: 'finalize' → Validation + assembly
 *
 * Intermediate results are cached in the document's _pipeline field.
 */
export async function POST(request: NextRequest) {
  const requestId = `stage-${Date.now()}`

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

    const { documentId, stage, batchIndex } = await request.json()

    if (!documentId || !stage) {
      return NextResponse.json({ error: 'documentId and stage are required' }, { status: 400 })
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

    const documentData = document.data as Record<string, unknown>

    // ═══ STAGE: FOUNDATION ═══════════════════════════════
    if (stage === 'foundation') {
      // Prevent double-run: check if generation is already in progress
      const existingPipeline = documentData._pipeline as { status?: string; startedAt?: number } | undefined
      if (existingPipeline?.status === 'generating') {
        const elapsed = Date.now() - (existingPipeline.startedAt || 0)
        // Allow re-run if stuck for > 15 minutes
        if (elapsed < 15 * 60 * 1000) {
          return NextResponse.json({ error: 'Generation already in progress', status: 'already_running' }, { status: 409 })
        }
      }

      // Set lock immediately
      await supabase.from('documents').update({
        data: { ...documentData, _pipeline: { status: 'generating', startedAt: Date.now() } },
      }).eq('id', documentId)

      console.log(`[${requestId}] Running foundation (stages 1-3)...`)

      const images = (documentData._generatedImages as Record<string, string>) || {}
      const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
      const scrapedAssets = documentData._scraped as {
        logoUrl?: string; heroImages?: string[]; lifestyleImages?: string[]
      } | undefined

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

      // Cache foundation to document
      await supabase
        .from('documents')
        .update({
          data: {
            ...documentData,
            _pipeline: {
              foundation,
              batchResults: [],
              status: 'foundation_complete',
            },
          },
        })
        .eq('id', documentId)

      console.log(`[${requestId}] Foundation cached. ${foundation.batches.length} batches, ${foundation.totalSlides} total slides.`)

      return NextResponse.json({
        success: true,
        stage: 'foundation',
        batchCount: foundation.batches.length,
        totalSlides: foundation.totalSlides,
        batchSizes: foundation.batches.map(b => b.length),
      })
    }

    // ═══ STAGE: BATCH (sequential — 1 slide per call) ════
    if (stage === 'batch') {
      const idx = typeof batchIndex === 'number' ? batchIndex : 0
      console.log(`[${requestId}] Running sequential slide ${idx}...`)

      const pipeline = documentData._pipeline as {
        foundation: PipelineFoundation
        batchResults: BatchResult[]
        lastGeneratedSlides?: Slide[]
        status: string
      } | undefined

      if (!pipeline?.foundation) {
        return NextResponse.json({ error: 'Foundation not found. Run foundation stage first.' }, { status: 400 })
      }

      // Build previous context with last 2 slides for sequential memory
      const previousContext: BatchResult | null = pipeline.lastGeneratedSlides?.length
        ? {
            slides: [],
            visualSummary: '',
            slideIndex: idx,
            generatedSlides: pipeline.lastGeneratedSlides,
          }
        : null

      const result = await pipelineBatch(pipeline.foundation, idx, previousContext)

      // Accumulate slide results and keep last 2 slides for next call
      const updatedBatchResults = [...(pipeline.batchResults || []), result]

      await supabase
        .from('documents')
        .update({
          data: {
            ...documentData,
            _pipeline: {
              ...pipeline,
              batchResults: updatedBatchResults,
              lastGeneratedSlides: result.generatedSlides || [],
              status: `slide_${idx}_complete`,
            },
          },
        })
        .eq('id', documentId)

      const totalAccumulated = updatedBatchResults.reduce((sum, r) => sum + r.slides.length, 0)
      console.log(`[${requestId}] Slide ${idx + 1} cached. Total accumulated: ${totalAccumulated}`)

      return NextResponse.json({
        success: true,
        stage: 'batch',
        batchIndex: idx,
        slidesGenerated: result.slides.length,
        totalSlidesAccumulated: totalAccumulated,
      })
    }

    // ═══ STAGE: FINALIZE ═════════════════════════════════
    if (stage === 'finalize') {
      console.log(`[${requestId}] Finalizing presentation...`)

      const pipeline = documentData._pipeline as {
        foundation: PipelineFoundation
        batchResults: BatchResult[]
        status: string
      } | undefined

      if (!pipeline?.foundation || !pipeline.batchResults?.length) {
        return NextResponse.json({ error: 'Pipeline incomplete. Run foundation and batch stages first.' }, { status: 400 })
      }

      // Collect all slides from batch results
      const allSlides: Slide[] = pipeline.batchResults.flatMap(r => r.slides)

      const presentation = await pipelineFinalize(pipeline.foundation, allSlides)

      // Save final presentation + clean up pipeline data
      const { _pipeline, ...cleanData } = documentData as Record<string, unknown> & { _pipeline?: unknown }
      await supabase
        .from('documents')
        .update({
          data: {
            ...cleanData,
            _presentation: presentation,
          },
        })
        .eq('id', documentId)

      console.log(`[${requestId}] Presentation finalized: ${presentation.slides.length} slides, quality: ${presentation.metadata?.qualityScore}/100`)

      return NextResponse.json({
        success: true,
        stage: 'finalize',
        slideCount: presentation.slides.length,
        qualityScore: presentation.metadata?.qualityScore,
      })
    }

    return NextResponse.json({ error: `Unknown stage: ${stage}` }, { status: 400 })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: 'Stage failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
