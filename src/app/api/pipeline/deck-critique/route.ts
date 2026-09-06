import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { critiqueDeckContent, contentGateVerdict, extractSlideText } from '@/lib/qa/content-critic'
import { repairSlideInContext } from '@/lib/qa/slide-repair'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * Content critique + repair — the quality gate of the auto pipeline.
 *
 * ONE ROUND PER INVOCATION. Each call critiques the deck, and then either
 * finalizes (passed, or round cap reached) or repairs the failing slides and
 * publishes the NEXT round as a fresh QStash hop with its own 800s budget.
 *
 * Why per-hop: every earlier run of this gate ended the same way — "time budget
 * exhausted" — with the deck left in whatever state the last partial round
 * produced. Twice that final state was unverified, and once it was the WORST
 * round. Running all rounds inside one function meant the loop never finished
 * on its own terms. Now each round has the full budget, and the chain has one
 * structural guarantee: a repair is only ever followed by a critique in the
 * next hop, so the deck the pipeline hands to Canva is always a deck that was
 * actually reviewed.
 *
 * State between hops lives on the document (`_contentCritique`): the round
 * history, and a snapshot of the best VERIFIED slides, restored at the end if
 * the final verified round is worse. Repair is not monotonic — a rewrite can
 * satisfy its own note and break something else — measured 3 → 2 → 3 → 4 under
 * the old isolated repair.
 *
 * The deck is persisted before this runs, so every failure mode here costs
 * only the critique, never the deck.
 *
 * Auth: x-internal-secret (LEADS_TRIGGER_SECRET); dev-mode bypass for local runs.
 */

const MAX_ROUNDS = 4
/** Keep this much for persisting state + publishing the next hop. */
const RESERVE_MS = 60_000
/** Critique can take a while on a long deck; repairs get what is left. */
const CRITIQUE_BUDGET_MS = 240_000
const REPAIR_BUDGET_MS = 120_000

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

interface RoundRecord {
  round: number
  summary: string
  repaired: number[]
  findings: Array<{ slide: number; failed: string[]; issues: string[]; rewrite: string }>
}

/** Persisted between hops on documents.data._contentCritique. */
interface CritiqueState {
  inProgress?: boolean
  rounds?: RoundRecord[]
  bestFailures?: number | null
  /** Snapshot of the best VERIFIED slides — transient, stripped at finalize. */
  bestSlides?: string[] | null
  // final fields
  checkedAt?: string
  passed?: boolean
  reviewed?: boolean
  stoppedBecause?: string
  restoredBest?: boolean
  failingSlides?: number[]
  failedChecks?: Record<string, number>
  summary?: string
}

interface DocShape {
  brandName?: string
  _briefText?: string
  _kickoffText?: string
  _htmlPresentation?: { htmlSlides?: string[]; slideTypes?: string[] }
  _contentCritique?: CritiqueState
}

type Sb = ReturnType<typeof service>

async function loadDoc(sb: Sb, documentId: string): Promise<DocShape | null> {
  const { data: doc } = await sb.from('documents').select('data').eq('id', documentId).maybeSingle()
  return doc ? ((doc.data ?? {}) as DocShape) : null
}

/** Read-modify-write on documents.data, so slides and state land together. */
async function patchDoc(sb: Sb, documentId: string, mutate: (data: DocShape) => void): Promise<void> {
  const fresh = (await loadDoc(sb, documentId)) ?? {}
  mutate(fresh)
  await sb
    .from('documents')
    .update({ data: fresh, updated_at: new Date().toISOString() })
    .eq('id', documentId)
}

async function publishNextRound(base: string, secret: string, documentId: string, round: number, tag: string) {
  const { Client: QStashClient } = await import('@upstash/qstash')
  const q = new QStashClient({ token: process.env.QSTASH_TOKEN! })
  await q.publishJSON({
    url: `${base}/api/pipeline/deck-critique`,
    body: { documentId, round },
    headers: { 'x-internal-secret': secret },
    timeout: '900s',
    retries: 1,
    // QStash rejects ':' in a deduplicationId — dashes only.
    deduplicationId: `deck-critique-${documentId}-r${round}`,
  })
  console.log(`${tag} round ${round} published as next hop`)
}

async function finalize(base: string, secret: string, documentId: string, tag: string) {
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
}

export async function POST(request: Request) {
  const startTs = Date.now()
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const authorized = (secret && request.headers.get('x-internal-secret') === secret) || isDevMode
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string; round?: number } | null
  if (!body?.documentId) {
    return NextResponse.json({ ok: false, error: 'documentId required' }, { status: 400 })
  }
  const documentId = body.documentId
  const round = Math.max(1, Math.min(MAX_ROUNDS, Number(body.round) || 1))
  const tag = `[deck-critique:${documentId.slice(0, 8)}:r${round}]`
  const sb = service()
  const base = appBaseUrl()
  const deadline = startTs + maxDuration * 1000 - RESERVE_MS

  const doc = await loadDoc(sb, documentId)
  if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })
  const slides = doc._htmlPresentation?.htmlSlides ?? []
  if (!slides.length) return NextResponse.json({ ok: false, error: 'deck has no slides to review' }, { status: 400 })

  // Round 1 starts fresh; later rounds continue the state the previous hop left.
  const prior: CritiqueState = round === 1 ? {} : (doc._contentCritique ?? {})
  const rounds: RoundRecord[] = [...(prior.rounds ?? [])]
  let best: { failures: number; slides: string[] } | null =
    prior.bestSlides && typeof prior.bestFailures === 'number'
      ? { failures: prior.bestFailures, slides: prior.bestSlides }
      : null

  // ── 1. Critique ──
  const sourceMaterial = [doc._briefText, doc._kickoffText].filter(Boolean).join('\n\n')
  const critique = await critiqueDeckContent(slides, {
    brandName: doc.brandName || '',
    sourceMaterial,
    slideTypes: doc._htmlPresentation?.slideTypes ?? [],
    budgetMs: Math.min(CRITIQUE_BUDGET_MS, deadline - Date.now()),
  })
  const gate = contentGateVerdict(critique)
  console.log(`${tag} ${gate.summary}`)

  if (!critique.unchecked && (!best || gate.failingIndexes.length < best.failures)) {
    best = { failures: gate.failingIndexes.length, slides: [...slides] }
  }

  const findings = critique.slides
    .filter((sl) => sl.verdict === 'fail')
    .map((sl) => ({
      slide: sl.slideIndex,
      failed: Object.entries(sl.checks).filter(([, ok]) => !ok).map(([k]) => k),
      issues: sl.issues,
      rewrite: sl.rewrite,
    }))

  // ── 2. Decide: finish here, or repair and hand to the next hop ──
  const verifiedPass = gate.passed && !critique.unchecked
  let stoppedBecause: string | null = null
  if (verifiedPass) stoppedBecause = 'passed'
  else if (critique.unchecked) stoppedBecause = `critique unavailable (${critique.note ?? 'unknown'})`
  else if (round >= MAX_ROUNDS) stoppedBecause = `round cap (${MAX_ROUNDS}) reached without passing`

  if (stoppedBecause) {
    rounds.push({ round, summary: gate.summary, repaired: [], findings })

    // The deck we hand over must be the best VERIFIED one. If this final
    // critique never ran, the current state is unverified and the best known
    // state wins; if it ran and scored worse than an earlier round, likewise.
    let restoredBest = false
    const finalWorse = !!best && !critique.unchecked && gate.failingIndexes.length > best.failures
    if (best && (critique.unchecked || finalWorse)) {
      restoredBest = true
      console.log(`${tag} restoring best verified round (${best.failures} failures)`)
    }
    const bestSlides = best?.slides

    await patchDoc(sb, documentId, (d) => {
      if (restoredBest && bestSlides) {
        d._htmlPresentation = { ...(d._htmlPresentation ?? {}), htmlSlides: bestSlides }
      }
      d._contentCritique = {
        checkedAt: new Date().toISOString(),
        passed: verifiedPass,
        reviewed: !critique.unchecked,
        stoppedBecause: stoppedBecause!,
        restoredBest,
        bestFailures: best?.failures ?? null,
        rounds,
        failingSlides: restoredBest ? [] : gate.failingIndexes,
        failedChecks: restoredBest ? {} : gate.failedChecks,
        summary: gate.summary,
        inProgress: false,
        bestSlides: null,
      }
    })

    await finalize(base, secret, documentId, tag)
    console.log(`${tag} done — passed=${verifiedPass} (${stoppedBecause}) in ${Math.round((Date.now() - startTs) / 1000)}s`)
    return NextResponse.json({ ok: true, documentId, round, passed: verifiedPass, restoredBest, stoppedBecause, summary: gate.summary })
  }

  // ── 3. Repair in full-deck context, sequentially ──
  // Each repair sees the previous ones, so a contradiction resolved on one
  // slide stays resolved on the next. Anything not repaired within budget is
  // simply picked up by the next round's critique.
  const targets = critique.slides.filter((s) => s.verdict === 'fail' && s.rewrite)
  const working = [...slides]
  const types = doc._htmlPresentation?.slideTypes ?? []
  const repaired: number[] = []
  for (const target of targets) {
    const left = deadline - Date.now()
    if (left < 30_000) {
      console.log(`${tag} repair budget exhausted after ${repaired.length}/${targets.length} — next round continues`)
      break
    }
    const html = await repairSlideInContext({
      slideHtml: working[target.slideIndex],
      slideIndex: target.slideIndex,
      slideType: types[target.slideIndex],
      allSlideTexts: working.map(extractSlideText),
      sourceMaterial,
      brandName: doc.brandName || '',
      failedChecks: Object.entries(target.checks).filter(([, ok]) => !ok).map(([k]) => k),
      issues: target.issues,
      rewrite: target.rewrite,
      deckIssues: critique.deck.issues,
      budgetMs: Math.min(REPAIR_BUDGET_MS, left),
    })
    if (html) {
      working[target.slideIndex] = html
      repaired.push(target.slideIndex)
    }
  }
  console.log(`${tag} repaired ${repaired.length}/${targets.length} slides`)
  rounds.push({ round, summary: gate.summary, repaired, findings })

  // Nothing could be repaired: the next round would critique the same deck and
  // reach the same verdict. Stop on this verified state instead.
  if (repaired.length === 0) {
    const bestSlides = best?.slides
    const restoredBest = !!best && gate.failingIndexes.length > best.failures
    await patchDoc(sb, documentId, (d) => {
      if (restoredBest && bestSlides) {
        d._htmlPresentation = { ...(d._htmlPresentation ?? {}), htmlSlides: bestSlides }
      }
      d._contentCritique = {
        checkedAt: new Date().toISOString(),
        passed: false,
        reviewed: true,
        stoppedBecause: 'no slide could be repaired',
        restoredBest,
        bestFailures: best?.failures ?? null,
        rounds,
        failingSlides: restoredBest ? [] : gate.failingIndexes,
        failedChecks: restoredBest ? {} : gate.failedChecks,
        summary: gate.summary,
        inProgress: false,
        bestSlides: null,
      }
    })
    await finalize(base, secret, documentId, tag)
    return NextResponse.json({ ok: true, documentId, round, passed: false, stoppedBecause: 'no slide could be repaired' })
  }

  // ── 4. Persist repaired slides + in-progress state, then hand off ──
  const bestSnapshot = best
  await patchDoc(sb, documentId, (d) => {
    d._htmlPresentation = { ...(d._htmlPresentation ?? {}), htmlSlides: working }
    d._contentCritique = {
      inProgress: true,
      rounds,
      bestFailures: bestSnapshot?.failures ?? null,
      bestSlides: bestSnapshot?.slides ?? null,
      summary: gate.summary,
      checkedAt: new Date().toISOString(),
      passed: false,
      reviewed: true,
      stoppedBecause: `round ${round} repaired, awaiting round ${round + 1}`,
    }
  })

  try {
    await publishNextRound(base, secret, documentId, round + 1, tag)
  } catch (e) {
    // If the next hop cannot be scheduled, do not leave the deck in limbo:
    // the current slides are the last repaired state, and the best verified
    // snapshot is recorded — hand it to Canva with the truth attached.
    console.error(`${tag} could not publish next round — finalizing as-is:`, e instanceof Error ? e.message : e)
    await patchDoc(sb, documentId, (d) => {
      d._contentCritique = {
        ...(d._contentCritique ?? {}),
        inProgress: false,
        bestSlides: null,
        reviewed: false,
        stoppedBecause: 'next round could not be scheduled — last repair unverified',
      }
    })
    await finalize(base, secret, documentId, tag)
  }

  console.log(`${tag} done in ${Math.round((Date.now() - startTs) / 1000)}s — ${repaired.length} repaired, round ${round + 1} queued`)
  return NextResponse.json({ ok: true, documentId, round, repaired, nextRound: round + 1, summary: gate.summary })
}
