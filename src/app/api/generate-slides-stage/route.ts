import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import {
  pipelineFoundation,
  pipelineBatch,
  pipelineFinalize,
  pipelineBatchHtml,
  pipelineFinalizeHtml,
} from '@/lib/gemini/slide-designer'
import type { PipelineFoundation, BatchResult, HtmlBatchResult } from '@/lib/gemini/slide-designer'
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

    const { documentId, stage, batchIndex, templateId } = await request.json()

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

      // Template integration — if user selected a template, inject design hints
      let templateHints: Record<string, unknown> | undefined
      if (templateId) {
        try {
          const { getTemplateById } = await import('@/lib/templates/presentation-templates')
          const template = getTemplateById(templateId)
          if (template) {
            templateHints = template.designHints as Record<string, unknown>
            if (template.colorOverrides) {
              templateHints._colorOverrides = template.colorOverrides
            }
            console.log(`[${requestId}] 🎨 Template selected: ${template.name} (${template.id})`)
          }
        } catch { /* template non-critical */ }
      }

      console.log(`[${requestId}] Running foundation (stages 1-3)...`)

      const images = (documentData._generatedImages as Record<string, string>) || {}
      const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
      const scrapedAssets = documentData._scraped as {
        logoUrl?: string; heroImages?: string[]; lifestyleImages?: string[]
      } | undefined

      // Logo: check multiple locations where it might be stored
      const brandColorsRaw = documentData._brandColors as Record<string, unknown> | undefined
      const brandColorsNested = brandColorsRaw?.colors as Record<string, unknown> | undefined
      const clientLogoUrl = scrapedAssets?.logoUrl
        || (typeof brandColorsRaw?.logoUrl === 'string' ? brandColorsRaw.logoUrl : undefined)
        || (typeof brandColorsNested?.logoUrl === 'string' ? brandColorsNested.logoUrl : undefined)
        || (typeof brandColorsRaw?.websiteDomain === 'string' ? `https://logo.clearbit.com/${brandColorsRaw.websiteDomain}` : undefined)
        || (documentData.brandLogoFile as string | undefined)
      console.log(`[generate-slides-stage] 🏷️ Logo resolved: ${clientLogoUrl || 'NONE'}`)

      const config = {
        accentColor: brandColors?.primary || '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        clientLogoUrl,
        images: {
          coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || '',
          brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || scrapedAssets?.heroImages?.[0] || '',
          audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || '',
          activityImage: images.activityImage || scrapedAssets?.lifestyleImages?.[1] || scrapedAssets?.lifestyleImages?.[0] || '',
        },
        extraImages: documentData._extraImages as { id: string; url: string; placement: string }[] | undefined,
        imageStrategy: documentData._imageStrategy as { conceptSummary?: string; visualDirection?: string; styleGuide?: string } | undefined,
        templateHints,
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

    // ═══ STAGE: BATCH — HTML-Native (GPT → raw HTML per slide) ════
    if (stage === 'batch') {
      const idx = typeof batchIndex === 'number' ? batchIndex : 0
      console.log(`[${requestId}] Running batch ${idx + 1}...`)

      const pipeline = documentData._pipeline as {
        foundation: PipelineFoundation
        batchResults?: BatchResult[]
        htmlBatchResults?: HtmlBatchResult[]
        status: string
      } | undefined

      if (!pipeline?.foundation) {
        return NextResponse.json({ error: 'Foundation not found. Run foundation stage first.' }, { status: 400 })
      }

      // HTML-Native pipeline (v6)
      const htmlResult = await pipelineBatchHtml(pipeline.foundation, idx)

      // Also run AST pipeline as fallback (for editor compatibility)
      let astResult: BatchResult | null = null
      try {
        astResult = await pipelineBatch(pipeline.foundation, idx, null)
      } catch (e) {
        console.warn(`[${requestId}] AST fallback failed (non-critical):`, e)
      }

      // ── CRITICAL: Re-read document to avoid race condition ──
      // Batches run in PARALLEL. Each takes ~60s. If we use the stale
      // documentData from request start, the last batch to finish overwrites
      // the results of the other two. Re-read + merge avoids this.
      const { data: freshDoc } = await supabase
        .from('documents')
        .select('data')
        .eq('id', documentId)
        .single()

      const freshData = (freshDoc?.data || documentData) as Record<string, unknown>
      const freshPipeline = freshData._pipeline as {
        foundation: PipelineFoundation
        batchResults?: BatchResult[]
        htmlBatchResults?: HtmlBatchResult[]
        status: string
      }

      // Merge: only set OUR batch index, preserve other batches
      const mergedHtmlResults = [...(freshPipeline.htmlBatchResults || [])]
      mergedHtmlResults[idx] = htmlResult
      const mergedBatchResults = [...(freshPipeline.batchResults || [])]
      if (astResult) mergedBatchResults[idx] = astResult

      await supabase
        .from('documents')
        .update({
          data: {
            ...freshData,
            _pipeline: {
              ...freshPipeline,
              htmlBatchResults: mergedHtmlResults,
              batchResults: mergedBatchResults,
              status: `batch_${idx}_complete`,
            },
          },
        })
        .eq('id', documentId)

      const totalAccumulated = mergedHtmlResults.filter(Boolean).reduce((sum, r) => sum + r.htmlSlides.length, 0)
      console.log(`[${requestId}] Batch ${idx + 1} cached (${htmlResult.htmlSlides.length} HTML slides). Total accumulated: ${totalAccumulated}`)

      return NextResponse.json({
        success: true,
        stage: 'batch',
        batchIndex: idx,
        slidesGenerated: htmlResult.htmlSlides.length,
        totalSlidesAccumulated: totalAccumulated,
      })
    }

    // ═══ STAGE: FINALIZE ═════════════════════════════════
    if (stage === 'finalize') {
      console.log(`[${requestId}] Finalizing presentation...`)

      const pipeline = documentData._pipeline as {
        foundation: PipelineFoundation
        batchResults?: BatchResult[]
        htmlBatchResults?: HtmlBatchResult[]
        status: string
      } | undefined

      if (!pipeline?.foundation) {
        return NextResponse.json({ error: 'Pipeline incomplete. Run foundation and batch stages first.' }, { status: 400 })
      }

      const { _pipeline, ...cleanData } = documentData as Record<string, unknown> & { _pipeline?: unknown }

      // HTML-Native finalize
      if (pipeline.htmlBatchResults?.length) {
        const validHtmlBatches = pipeline.htmlBatchResults.filter(Boolean) // Skip null/undefined from out-of-order batches
        const allHtmlSlides = validHtmlBatches.flatMap(r => r.htmlSlides)
        const allSlideTypes = validHtmlBatches.flatMap(r => r.slideTypes)
        const htmlPresentation = await pipelineFinalizeHtml(pipeline.foundation, allHtmlSlides, allSlideTypes)

        // Also finalize AST if available (for editor)
        let astPresentation = null
        if (pipeline.batchResults?.length) {
          try {
            const allSlides: Slide[] = pipeline.batchResults.flatMap(r => r.slides)
            astPresentation = await pipelineFinalize(pipeline.foundation, allSlides)
          } catch { /* non-critical */ }
        }

        // Get audit log for this generation session
        let auditLog = null
        try {
          const { getAuditSummary } = await import('@/lib/audit/generation-log')
          auditLog = getAuditSummary()
          console.log(`[${requestId}] 📋 Audit: ${auditLog.entries.length} AI calls, ${auditLog.totalDurationMs}ms total, ${auditLog.fallbackCount} fallbacks, ${auditLog.errorCount} errors`)
        } catch { /* audit non-critical */ }

        // Version history
        let versions = (cleanData._versions || []) as import('@/lib/version-history').VersionEntry[]
        try {
          const { addVersion, createHtmlVersion } = await import('@/lib/version-history')
          versions = addVersion(versions, createHtmlVersion(
            htmlPresentation.htmlSlides.length,
            htmlPresentation.metadata.qualityScore,
          ))
          console.log(`[${requestId}] 📚 Version saved (${versions.length} total)`)
        } catch { /* version non-critical */ }

        await supabase
          .from('documents')
          .update({
            data: {
              ...cleanData,
              _htmlPresentation: htmlPresentation,
              ...(astPresentation ? { _presentation: astPresentation } : {}),
              ...(auditLog ? { _auditLog: auditLog } : {}),
              _versions: versions,
            },
          })
          .eq('id', documentId)

        console.log(`[${requestId}] Presentation finalized: ${htmlPresentation.htmlSlides.length} HTML slides`)
        return NextResponse.json({
          success: true,
          stage: 'finalize',
          slideCount: htmlPresentation.htmlSlides.length,
          qualityScore: htmlPresentation.metadata.qualityScore,
          mode: 'html',
        })
      }

      // Fallback: AST-only finalize
      if (pipeline.batchResults?.length) {
        const allSlides: Slide[] = pipeline.batchResults.flatMap(r => r.slides)
        const presentation = await pipelineFinalize(pipeline.foundation, allSlides)
        await supabase
          .from('documents')
          .update({ data: { ...cleanData, _presentation: presentation } })
          .eq('id', documentId)
        console.log(`[${requestId}] Presentation finalized (AST fallback): ${presentation.slides.length} slides`)
        return NextResponse.json({
          success: true, stage: 'finalize',
          slideCount: presentation.slides.length,
          qualityScore: presentation.metadata?.qualityScore,
          mode: 'ast',
        })
      }

      return NextResponse.json({ error: 'No batch results found' }, { status: 400 })
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
