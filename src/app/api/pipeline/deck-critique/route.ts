import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { critiqueDeckContent, contentGateVerdict, type ContentGate } from '@/lib/qa/content-critic'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * Content critique + repair loop — the quality gate of the auto pipeline.
 *
 * Sits between generate-full and deck-finalize as its OWN QStash hop, and that
 * placement is the whole point: generate-full already burns ~776s of its 800s
 * ceiling building the deck, and its existing visual critic is explicitly
 * skipped when under 15s remain. There is no room inside it for a critique
 * that also rebuilds slides, so this gets its own budget.
 *
 * Each round:
 *   1. critique the whole deck's CONTENT in one call (cross-slide checks like
 *      redundancy and narrative arc only work when the critic sees everything)
 *   2. rebuild every failing slide via /api/regenerate-slide, feeding that
 *      slide's `rewrite` directive in as the instruction
 *   3. re-critique the rebuilt deck
 *
 * The loop runs until the deck passes, and is bounded by BOTH a round cap and
 * a wall-clock reserve. An LLM critic can always find one more nit, so an
 * unbounded "until perfect" loop would run until the function is killed and
 * leave nothing behind. When the cap is hit we stop and record honestly that
 * the deck shipped un-passed, rather than reporting success.
 *
 * The deck is already persisted before this runs, so every failure mode here
 * costs only the critique — never the deck.
 *
 * Auth: x-internal-secret (LEADS_TRIGGER_SECRET); dev-mode bypass for local runs.
 */

const MAX_ROUNDS = 4
/** Stop starting new work with less than this left, so results can be saved. */
const RESERVE_MS = 90_000
/** Parallel slide rebuilds — enough to be quick, low enough to avoid 429s. */
const REPAIR_CONCURRENCY = 3

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

interface DocShape {
  brandName?: string
  _briefText?: string
  _kickoffText?: string
  _htmlPresentation?: { htmlSlides?: string[] }
}

async function loadSlides(
  sb: ReturnType<typeof service>,
  documentId: string,
): Promise<{ data: DocShape; slides: string[] } | null> {
  const { data: doc } = await sb.from('documents').select('data').eq('id', documentId).maybeSingle()
  if (!doc) return null
  const data = (doc.data ?? {}) as DocShape
  return { data, slides: data._htmlPresentation?.htmlSlides ?? [] }
}

/** Rebuild one slide with the critic's directive; resolves false on failure. */
async function repairSlide(
  base: string,
  secret: string,
  documentId: string,
  slideIndex: number,
  instruction: string,
  tag: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/regenerate-slide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ documentId, slideIndex, instruction }),
    })
    if (!res.ok) {
      console.warn(`${tag} slide ${slideIndex} repair → ${res.status}`)
      return false
    }
    return true
  } catch (e) {
    console.warn(`${tag} slide ${slideIndex} repair threw:`, e instanceof Error ? e.message : e)
    return false
  }
}

export async function POST(request: Request) {
  const startTs = Date.now()
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const authorized = (secret && request.headers.get('x-internal-secret') === secret) || isDevMode
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null
  if (!body?.documentId) {
    return NextResponse.json({ ok: false, error: 'documentId required' }, { status: 400 })
  }
  const documentId = body.documentId
  const tag = `[deck-critique:${documentId.slice(0, 8)}]`
  const sb = service()
  const base = appBaseUrl()

  const deadline = startTs + (maxDuration * 1000 - RESERVE_MS)
  const rounds: Array<{ round: number; summary: string; repaired: number[] }> = []
  let gate: ContentGate | null = null
  let stoppedBecause = 'passed'

  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const loaded = await loadSlides(sb, documentId)
      if (!loaded) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })
      if (!loaded.slides.length) {
        return NextResponse.json({ ok: false, error: 'deck has no slides to review' }, { status: 400 })
      }

      // The kickoff + brief the deck was built from — the critic needs it to
      // tell a claim that traces to real input from one the model invented.
      const sourceMaterial = [loaded.data._briefText, loaded.data._kickoffText].filter(Boolean).join('\n\n')

      const critique = await critiqueDeckContent(loaded.slides, {
        brandName: loaded.data.brandName || '',
        sourceMaterial,
        budgetMs: Math.max(30_000, Math.min(180_000, deadline - Date.now())),
      })
      gate = contentGateVerdict(critique)
      console.log(`${tag} round ${round}: ${gate.summary}`)

      if (gate.passed) {
        rounds.push({ round, summary: gate.summary, repaired: [] })
        stoppedBecause = critique.unchecked ? 'critique unavailable' : 'passed'
        break
      }

      if (round === MAX_ROUNDS) {
        rounds.push({ round, summary: gate.summary, repaired: [] })
        stoppedBecause = `round cap (${MAX_ROUNDS}) reached without passing`
        break
      }
      if (Date.now() > deadline) {
        rounds.push({ round, summary: gate.summary, repaired: [] })
        stoppedBecause = 'time budget exhausted'
        break
      }

      // ── Repair the failing slides ──
      const targets = critique.slides.filter((s) => s.verdict === 'fail' && s.rewrite)
      const repaired: number[] = []
      for (let i = 0; i < targets.length; i += REPAIR_CONCURRENCY) {
        if (Date.now() > deadline) {
          stoppedBecause = 'time budget exhausted mid-repair'
          break
        }
        const batch = targets.slice(i, i + REPAIR_CONCURRENCY)
        const results = await Promise.all(
          batch.map((s) =>
            repairSlide(
              base,
              secret,
              documentId,
              s.slideIndex,
              `תקן את התוכן של השקף. הביקורת: ${s.issues.join(' | ')}. הנחיה מחייבת: ${s.rewrite}`,
              tag,
            ),
          ),
        )
        results.forEach((ok, j) => { if (ok) repaired.push(batch[j].slideIndex) })
      }
      console.log(`${tag} round ${round}: repaired ${repaired.length}/${targets.length} slides`)
      rounds.push({ round, summary: gate.summary, repaired })

      // Nothing could be repaired — another round would critique the same deck
      // and reach the same verdict, so stop instead of burning the budget.
      if (repaired.length === 0) {
        stoppedBecause = 'no slide could be repaired'
        break
      }
    }
  } catch (e) {
    console.error(`${tag} failed:`, e)
    stoppedBecause = e instanceof Error ? e.message : 'critique loop failed'
  }

  // ── Persist the verdict alongside the deck ──
  const passed = !!gate?.passed
  try {
    const { data: fresh } = await sb.from('documents').select('data').eq('id', documentId).maybeSingle()
    await sb
      .from('documents')
      .update({
        data: {
          ...((fresh?.data ?? {}) as Record<string, unknown>),
          _contentCritique: {
            checkedAt: new Date().toISOString(),
            passed,
            stoppedBecause,
            rounds,
            failingSlides: gate?.failingIndexes ?? [],
            failedChecks: gate?.failedChecks ?? {},
            summary: gate?.summary ?? 'no critique ran',
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
  } catch (e) {
    console.warn(`${tag} could not persist critique:`, e instanceof Error ? e.message : e)
  }

  // ── Hand off to Canva ──
  // The deck ships either way: a deck held hostage by a critic that can always
  // find one more nit helps nobody. The verdict rides along on the document so
  // the team sees exactly what is still weak.
  try {
    if (process.env.QSTASH_TOKEN) {
      const { Client: QStashClient } = await import('@upstash/qstash')
      const q = new QStashClient({ token: process.env.QSTASH_TOKEN })
      await q.publishJSON({
        url: `${base}/api/pipeline/deck-finalize`,
        body: { documentId },
        headers: { 'x-internal-secret': secret },
        timeout: '300s',
        retries: 1,
      })
      console.log(`${tag} deck-finalize published`)
    } else {
      const { finalizeDeckToCanva } = await import('@/lib/pipeline/deck-finalize')
      await finalizeDeckToCanva(documentId, tag)
    }
  } catch (e) {
    console.warn(`${tag} finalize handoff failed (deck is saved):`, e instanceof Error ? e.message : e)
  }

  console.log(`${tag} done — passed=${passed} (${stoppedBecause}) after ${rounds.length} round(s), ${Math.round((Date.now() - startTs) / 1000)}s`)
  return NextResponse.json({
    ok: true,
    documentId,
    passed,
    stoppedBecause,
    rounds,
    summary: gate?.summary ?? null,
  })
}
