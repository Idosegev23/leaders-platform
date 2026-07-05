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

export const maxDuration = 800
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const requestId = `gen-full-${Date.now()}`
  const startTs = Date.now()
  console.log(`[${requestId}] ═══════════════════════════════════════`)
  console.log(`[${requestId}] 🚀 GENERATE-FULL (single agent) — START`)

  try {
    const supabase = await createClient()

    // Auth — logged-in Leaders user, dev-mode bypass, OR a server-to-server
    // trigger carrying the shared internal secret (for ops/QA generation).
    const internalSecret = request.headers.get('x-internal-secret')
    const isInternalTrigger =
      !!process.env.LEADS_TRIGGER_SECRET && internalSecret === process.env.LEADS_TRIGGER_SECRET
    let userId = DEV_AUTH_USER.id
    if (!isDevMode && !isInternalTrigger) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const { documentId, useBlueprint } = await request.json()
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
    let scraped = data._scraped as { logoUrl?: string; heroImages?: string[] } | undefined
    let brandAssets = (data._brandAssets as BrandAssets) || undefined

    // ── Brand-asset acquisition (art-director foundation) ──
    // The blueprint → generate-full path bypasses /api/generate-visual-assets,
    // so `_brandAssets` is unset and the agent would generate generic off-brand
    // imagery. Acquire real logo + verified product photos inline (fast subset,
    // no image-gen) so the agent can reference-condition its scenes on the real
    // product. Guarded: skips when assets already exist (older flow ran them).
    const hasUsableAssets = !!(brandAssets && (brandAssets.productImages?.length || brandAssets.logo))
    if (!hasUsableAssets) {
      try {
        const { acquireBrandAssets, extractBrandWebsite, extractProductContext } = await import('@/lib/brand/acquire')
        const website = extractBrandWebsite(data)
        console.log(`[${requestId}] 🎨 Acquiring brand assets (website: ${website || 'none'})...`)
        const wizardReferenceImages = [
          ...(((data.creative as Record<string, unknown> | undefined)?.referenceImages as Array<{ url?: string } | string>) || []),
          ...(((data.deliverables as Record<string, unknown> | undefined)?.referenceImages as Array<{ url?: string } | string>) || []),
        ]
          .map((r) => (typeof r === 'string' ? r : r?.url || ''))
          .filter(Boolean)
        const acq = await acquireBrandAssets({
          brandName,
          website,
          productContext: extractProductContext(data),
          wizardReferenceImages,
        })
        brandAssets = acq.brandAssets
        if (acq.scraped) scraped = { ...scraped, ...acq.scraped }
        const verified = brandAssets.productImages?.filter((p) => p.status === 'verified').length || 0
        console.log(`[${requestId}] 🎨 Assets acquired: logo=${brandAssets.logo?.status || 'none'}, ${verified} verified products`)
        // Persist so a re-run / the editor sees the assets and we never re-acquire.
        await supabase.from('documents').update({
          data: { ...data, _brandAssets: brandAssets, ...(acq.scraped ? { _scraped: scraped } : {}) },
          updated_at: new Date().toISOString(),
        }).eq('id', documentId)
        data._brandAssets = brandAssets
        if (acq.scraped) data._scraped = scraped
      } catch (acqErr) {
        console.warn(`[${requestId}] ⚠️ Brand-asset acquisition failed (continuing with generic imagery):`, acqErr instanceof Error ? acqErr.message : acqErr)
      }
    } else {
      console.log(`[${requestId}] 🎨 Brand assets already present (${brandAssets!.productImages?.length || 0} products) — skipping acquisition`)
    }

    // ── Normalize influencer data (clean raw IMAI names + re-host expiring IG
    // profile photos to Supabase) so profile slides render clean names + stable
    // faces regardless of which cached field the agent reads. Best-effort.
    try {
      const { cleanInfluencerName, rehostImage } = await import('@/lib/brand/rehost-image')
      const recSets = [data.influencerResearch, data._influencerStrategy]
        .map((r) => (r as { recommendations?: unknown })?.recommendations)
        .filter((r): r is Array<Record<string, unknown>> => Array.isArray(r))
      const stable = new Map<string, { name: string; photo?: string }>()
      for (const recs of recSets) {
        await Promise.all(recs.map(async (r) => {
          const user = String(r.username || r.handle || '')
          const name = cleanInfluencerName(r.name as string, user)
          let photo = stable.get(user)?.photo
          if (!photo && r.profilePicUrl) {
            photo = (await rehostImage(r.profilePicUrl as string, 'influencers', user || 'inf', supabase)) || undefined
          }
          r.name = name
          if (photo) r.profilePicUrl = photo
          stable.set(user, { name, photo })
        }))
      }
      const enhanced = data.enhancedInfluencers
      if (Array.isArray(enhanced)) {
        for (const e of enhanced as Array<Record<string, unknown>>) {
          const s = stable.get(String(e.username || e.handle || ''))
          e.name = s?.name || cleanInfluencerName(e.name as string, e.username as string)
          if (s?.photo) e.profilePicUrl = s.photo
        }
      }
      if (recSets.length || Array.isArray(enhanced)) {
        await supabase.from('documents').update({ data, updated_at: new Date().toISOString() }).eq('id', documentId)
        console.log(`[${requestId}] 🧑‍🎤 Normalized influencer names + re-hosted ${Array.from(stable.values()).filter(v => v.photo).length} photos`)
      }
    } catch (infErr) {
      console.warn(`[${requestId}] ⚠️ Influencer normalize failed (continuing):`, infErr instanceof Error ? infErr.message : infErr)
    }

    // Wizard contract — binding requirements injected into the agent prompt +
    // coverage-checked (with one targeted repair) after generation.
    let wizardContract: WizardContract | undefined
    try {
      wizardContract = buildWizardContract(data)
      console.log(`[${requestId}] 📋 Wizard contract: ${wizardContract.items.length} binding items`)
    } catch (contractErr) {
      console.warn(`[${requestId}] ⚠️ Wizard contract build failed (continuing without):`, contractErr)
    }

    // Approved blueprint ("הפיצוח") — when the user came through the /blueprint
    // gate, the agent renders the slides EXACTLY to that plan.
    let blueprintMandate: string | undefined
    if (useBlueprint) {
      const bp = data._deckBlueprint as import('@/lib/gemini/deck-blueprint').DeckBlueprint | undefined
      if (bp?.slidePlan?.length) {
        const { blueprintToMandate } = await import('@/lib/gemini/deck-blueprint')
        blueprintMandate = blueprintToMandate(bp)
        console.log(`[${requestId}] 🧠 Using approved blueprint: ${bp.slidePlan.length} planned slides`)
      } else {
        console.warn(`[${requestId}] ⚠️ useBlueprint set but no _deckBlueprint — planning freely`)
      }
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
      blueprintMandate,
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
      // Content args per slide — lets /edit derive its structured deck 1:1
      // from THIS deck (same order/copy) instead of regenerating from the brief.
      _agentSlides: result.slides.map(s => ({ slideType: s.slideType, title: s.title, content: s.content })),
      // A fresh generation invalidates any previously-derived structured deck.
      _structuredPresentation: null,
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
