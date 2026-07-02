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
import { buildWizardContract, type WizardContract } from '@/lib/gemini/wizard-contract'
import { critiqueSlides } from '@/lib/qa/slide-critic'
import type { BrandAssets } from '@/lib/brand/types'
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
    // Documents are platform-shared: any authenticated Leaders user may
    // (re)generate any deck — ownership gating removed by request.

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
    const brandAssets = (data._brandAssets as BrandAssets) || undefined

    // Wizard contract — binding requirements injected into the agent prompt +
    // coverage-checked (with one targeted repair) after generation.
    let wizardContract: WizardContract | undefined
    try {
      wizardContract = buildWizardContract(data)
      console.log(`[${requestId}] 📋 Wizard contract: ${wizardContract.items.length} binding items`)
    } catch (contractErr) {
      console.warn(`[${requestId}] ⚠️ Wizard contract build failed (continuing without):`, contractErr)
    }

    const agentInput: AgentInput = {
      brandName,
      briefText: (data._briefText as string) || (data.brandBrief as string) || '',
      kickoffText: (data._kickoffText as string) || undefined,
      briefFileUri: (data._geminiFileUri as string) || undefined,
      briefFileMime: (data._geminiFileMime as string) || undefined,
      wizardData: data,
      wizardContract,
      brandResearch: (data._brandResearch as Record<string, unknown>) || undefined,
      images,
      brandAssets,
      clientLogoUrl: brandAssets?.logo?.url || scraped?.logoUrl || (data.brandLogoFile as string) || undefined,
    }

    console.log(`[${requestId}] 🤖 Running presentation agent...`)
    console.log(`[${requestId}]    briefText: ${agentInput.briefText.length} chars`)
    console.log(`[${requestId}]    fileUri: ${agentInput.briefFileUri || 'none'}`)
    console.log(`[${requestId}]    brandResearch: ${agentInput.brandResearch ? 'YES' : 'NO'}`)
    console.log(`[${requestId}]    images: ${Object.keys(images).length}`)

    // Hard wall-clock ceiling for the agent's OPTIONAL post-passes (wizard
    // repair). The route must have room left to persist the deck — QA stages
    // never get to spend the save's time budget.
    agentInput.deadlineTs = startTs + maxDuration * 1000 - 120_000

    // Run the agent
    const result = await runPresentationAgent(agentInput, (event) => {
      console.log(`[${requestId}] 📊 Progress: [${event.stage}] ${event.message}${event.slideIndex !== undefined ? ` (${event.slideIndex + 1}/${event.totalSlides})` : ''}`)
    })

    // Residual wizard-coverage misses → editor flags (lite CoverageResult).
    const wizardCoverage = result.wizardCoverage
      ? {
          checkedAt: new Date().toISOString(),
          report: result.wizardCoverage.report,
          coveredIds: result.wizardCoverage.covered.map((i) => i.id),
          missing: result.wizardCoverage.missing.map((i) => ({
            id: i.id,
            requirement: i.requirement,
            mustAppearIn: i.mustAppearIn,
            value: i.value,
          })),
        }
      : null

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

    // ── PERSIST FIRST ──
    // The deck is saved BEFORE any visual QA runs: if the critic overshoots
    // and the function is killed at maxDuration, the generation is never lost
    // (spec: budget guard aborts QA, not generation).
    const { _pipeline, ...cleanData } = data as Record<string, unknown> & { _pipeline?: unknown }
    const savedData: Record<string, unknown> = {
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
      ...(wizardCoverage ? { _wizardCoverage: wizardCoverage } : {}),
    }
    await supabase.from('documents').update({
      data: savedData,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId)
    console.log(`[${requestId}] 💾 Presentation persisted (${result.htmlSlides.length} slides)`)

    // ── Slide critic (C5) — visual QA over the saved deck, flags only ──
    // Runs strictly AFTER the save; its failure or timeout costs only the
    // critique itself. Auto-fixes are NOT applied here (applyAutoFixes stays
    // for the editor/QA flow).
    let slideCritique: Record<string, unknown> | null = null
    try {
      const remainingMs = maxDuration * 1000 - (Date.now() - startTs) - 30_000 // 30s reserve for update+response
      const budgetMs = Math.max(0, Math.min(120_000, remainingMs))
      if (budgetMs < 15_000) {
        console.log(`[${requestId}] 🔎 Slide critic skipped — only ${Math.round(remainingMs / 1000)}s left`)
      } else {
        console.log(`[${requestId}] 🔎 Slide critic: reviewing ${result.htmlSlides.length} slides (budget ${Math.round(budgetMs / 1000)}s)...`)
        const critiques = await critiqueSlides(result.htmlSlides, { budgetMs })
        const flagged: Record<number, { failedChecks: string[]; issues: string[] }> = {}
        for (const c of critiques) {
          const failedChecks = Object.entries(c.checks).filter(([, ok]) => !ok).map(([k]) => k)
          // 'unchecked: …' notes are degrade markers (render/model outage),
          // not real findings — an infra failure must not flag every slide.
          const realIssues = c.issues.filter((i) => !i.startsWith('unchecked:'))
          if (failedChecks.length || realIssues.length) {
            flagged[c.slideIndex] = { failedChecks, issues: realIssues }
          }
        }
        slideCritique = {
          checkedAt: new Date().toISOString(),
          slideCount: result.htmlSlides.length,
          flaggedCount: Object.keys(flagged).length,
          slides: flagged,
        }
        console.log(`[${requestId}] 🔎 Slide critic done: ${Object.keys(flagged).length}/${critiques.length} slides flagged`)
        await supabase.from('documents').update({
          data: { ...savedData, _slideCritique: slideCritique },
          updated_at: new Date().toISOString(),
        }).eq('id', documentId)
      }
    } catch (criticErr) {
      console.warn(`[${requestId}] ⚠️ Slide critic failed (deck already saved, continuing):`, criticErr)
    }

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
      wizardCoverage: wizardCoverage
        ? { covered: wizardCoverage.coveredIds.length, missing: wizardCoverage.missing.length, report: wizardCoverage.report }
        : null,
      slideCritique: slideCritique
        ? { flaggedCount: slideCritique.flaggedCount, slideCount: slideCritique.slideCount }
        : null,
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
