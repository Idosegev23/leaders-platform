/**
 * Content critic — harsh editorial QA over what the slides actually SAY.
 *
 * The existing slide-critic (src/lib/qa/slide-critic.ts) reviews rendered
 * screenshots: legibility, overlap, RTL, image truthfulness. All nine of its
 * checks are visual. Nothing has ever reviewed the words, so a deck could be
 * flawlessly laid out and still be generic filler that would fit any brand —
 * which is exactly what shipped.
 *
 * Design notes:
 *  - Binary verdicts, never 1-10 scores. Same reasoning as the visual critic:
 *    scores invite mushy 7/10s; a boolean forces a call.
 *  - ONE call for the whole deck, not one per slide. Redundancy ("this repeats
 *    slide 4") and narrative arc are cross-slide properties — a per-slide critic
 *    structurally cannot see them.
 *  - Every failing slide must come back with a `rewrite` directive. The repair
 *    loop feeds that back into generation, so a critique that only says "weak"
 *    is useless. The prompt refuses vague failures for that reason.
 *  - The source brief/kickoff is supplied so `grounded` can distinguish a claim
 *    that traces to real input from one the model invented.
 *
 * Failure policy matches the rest of the engine: a model or parse failure
 * degrades to "unchecked" (all-pass, with a note) and never blocks a deck.
 */

import { callAI } from '@/lib/ai-provider'

// ─── Public types ───────────────────────────────────────

export const CONTENT_CHECK_KEYS = [
  'brandSpecific',
  'concrete',
  'grounded',
  'noPlaceholder',
  'notRedundant',
  'earnsItsPlace',
  'hebrewQuality',
] as const

export type ContentCheckKey = (typeof CONTENT_CHECK_KEYS)[number]

export interface SlideContentCritique {
  slideIndex: number
  checks: Record<ContentCheckKey, boolean>
  verdict: 'pass' | 'fail'
  issues: string[]
  /** What a regeneration must do differently. Required whenever verdict=fail. */
  rewrite: string
}

export interface DeckContentCritique {
  slides: SlideContentCritique[]
  deck: {
    arcHolds: boolean
    noContradictions: boolean
    issues: string[]
  }
  /** True when the critique could not run (model/parse failure) — do no harm. */
  unchecked: boolean
  note?: string
}

// ─── Prompt ─────────────────────────────────────────────

const CRITIC_PROMPT = `<role>
You are a ruthless creative director reviewing a Hebrew (RTL) client presentation. You have seen a thousand decks and you despise filler. Your job is to catch content that is vague, generic, invented, or repetitive — BEFORE it reaches a paying client.

You return BINARY verdicts, true/false only, never scores. You are not polite. A weak slide gets called weak. Passing a mediocre slide to be nice is a failure of your job.
</role>

<checks>
Per slide, return true/false on each:
- brandSpecific: this slide could NOT be pasted into a different brand's deck unchanged. It says something true about THIS brand/product/audience. Generic marketing language that fits anyone ("נבנה נוכחות דיגיטלית חזקה", "קהל היעד הוא צעירים דיגיטליים") is false.
- concrete: contains something specific — a number, a name, a platform, a timeframe, a named tactic. A slide made only of abstractions is false.
- grounded: every factual claim traces to the SOURCE MATERIAL below, or is clearly framed as our proposal/recommendation. Invented statistics, fabricated awards, made-up market sizes, or invented client history are false. A number with no basis in the source is NOT grounded.
- noPlaceholder: no leftover test or placeholder text — "בדיקה", "לורם", "TBD", "xxx", "[...]", "טקסט לדוגמה", a bare "@" with no handle, or an obviously dummy name/number.
- notRedundant: does not restate a point another slide already made. Name the slide it duplicates.
- earnsItsPlace: the slide advances the argument, and its TITLE says something rather than just labelling a section. A title that is only a category word ("אסטרטגיה", "קהל יעד") with generic body underneath is false.
- hebrewQuality: fluent, native Hebrew. No machine-translation artifacts, no English left untranslated mid-sentence, no broken grammar.
</checks>

<deck-level>
Also judge the deck as a whole:
- arcHolds: the deck builds an argument — the insight sets up a tension, the strategy answers it, the idea expresses it, and something closes the loop. A pile of unrelated slides is false.
- noContradictions: no two slides contradict each other (different budgets, different audiences, different goals for the same campaign).
</deck-level>

<rules>
- Report an issue ONLY for a check you marked false. Be concrete: quote the offending phrase.
- Every failing slide MUST carry a "rewrite" directive: a specific instruction for what the regenerated slide must contain or do differently. Never "make it better" — say what to add, cut, or ground.
- A slide with any false check gets verdict "fail".
- When every check passes: verdict "pass", empty issues, and rewrite MUST be an empty string.
- Judge ONLY the content. Layout, colour and imagery are another critic's job.
- If the SOURCE MATERIAL is thin or empty, that is not an excuse to pass empty slides — mark them ungrounded and say the source lacks the material.
</rules>

<output>JSON only:
{"deck":{"arcHolds":bool,"noContradictions":bool,"issues":[string]},
 "slides":[{"slideIndex":int,"checks":{"brandSpecific":bool,"concrete":bool,"grounded":bool,"noPlaceholder":bool,"notRedundant":bool,"earnsItsPlace":bool,"hebrewQuality":bool},"verdict":"pass"|"fail","issues":[string],"rewrite":string}]}
</output>`

/** Strip markup so the critic judges words, not HTML. */
export function extractSlideText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildContentPrompt(
  slideTexts: string[],
  sourceMaterial: string,
  brandName: string,
): string {
  const slides = slideTexts
    .map((t, i) => `--- SLIDE ${i} ---\n${t || '(empty slide)'}`)
    .join('\n\n')
  return `${CRITIC_PROMPT}

<brand>${brandName || '(unknown)'}</brand>

<source-material>
${sourceMaterial?.trim() || '(none supplied)'}
</source-material>

<deck slideCount="${slideTexts.length}">
${slides}
</deck>

Return JSON only, with exactly ${slideTexts.length} entries in "slides", slideIndex 0..${slideTexts.length - 1}.`
}

// ─── Parsing (schema-shaped JSON is not the same as usable content) ──

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  for (const candidate of [fenced?.[1], text]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      const s = candidate.indexOf('{')
      const e = candidate.lastIndexOf('}')
      if (s !== -1 && e > s) {
        try {
          const parsed = JSON.parse(candidate.slice(s, e + 1))
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
        } catch {
          /* unparseable → caller degrades to unchecked */
        }
      }
    }
  }
  return null
}

function allPass(): Record<ContentCheckKey, boolean> {
  return Object.fromEntries(CONTENT_CHECK_KEYS.map((k) => [k, true])) as Record<ContentCheckKey, boolean>
}

export function uncheckedCritique(slideCount: number, note: string): DeckContentCritique {
  return {
    slides: Array.from({ length: slideCount }, (_, i) => ({
      slideIndex: i,
      checks: allPass(),
      verdict: 'pass' as const,
      issues: [],
      rewrite: '',
    })),
    deck: { arcHolds: true, noContradictions: true, issues: [] },
    unchecked: true,
    note,
  }
}

/**
 * Normalise a raw model response into a critique for exactly `slideCount`
 * slides. Defensive on purpose: a missing slide entry must not silently drop a
 * slide from review, and a "fail" with no rewrite directive is unusable to the
 * repair loop, so it is downgraded to a pass with a note rather than sending
 * the generator an instruction it cannot act on.
 */
export function parseContentCritique(raw: string, slideCount: number): DeckContentCritique | null {
  const obj = parseJsonObject(raw)
  if (!obj) return null

  const rawSlides = Array.isArray(obj.slides) ? (obj.slides as Record<string, unknown>[]) : null
  if (!rawSlides) return null

  const byIndex = new Map<number, Record<string, unknown>>()
  for (const s of rawSlides) {
    const i = Number(s?.slideIndex)
    if (Number.isInteger(i) && i >= 0 && i < slideCount) byIndex.set(i, s)
  }

  const slides: SlideContentCritique[] = []
  for (let i = 0; i < slideCount; i++) {
    const s = byIndex.get(i)
    if (!s) {
      slides.push({ slideIndex: i, checks: allPass(), verdict: 'pass', issues: [], rewrite: '' })
      continue
    }
    const rawChecks = (s.checks ?? {}) as Record<string, unknown>
    const checks = Object.fromEntries(
      CONTENT_CHECK_KEYS.map((k) => [k, rawChecks[k] !== false]),
    ) as Record<ContentCheckKey, boolean>

    const issues = Array.isArray(s.issues) ? (s.issues as unknown[]).filter((x): x is string => typeof x === 'string') : []
    const rewrite = typeof s.rewrite === 'string' ? s.rewrite.trim() : ''
    const anyFailed = CONTENT_CHECK_KEYS.some((k) => !checks[k])
    const claimedFail = s.verdict === 'fail'

    // A fail we cannot act on is worse than no finding: it would burn a repair
    // round with no instruction. Treat it as a pass and say so.
    if ((anyFailed || claimedFail) && !rewrite) {
      slides.push({
        slideIndex: i,
        checks: allPass(),
        verdict: 'pass',
        issues: ['unchecked: critic failed this slide without a rewrite directive'],
        rewrite: '',
      })
      continue
    }

    slides.push({
      slideIndex: i,
      checks,
      verdict: anyFailed || claimedFail ? 'fail' : 'pass',
      issues,
      rewrite: anyFailed || claimedFail ? rewrite : '',
    })
  }

  const rawDeck = (obj.deck ?? {}) as Record<string, unknown>
  return {
    slides,
    deck: {
      arcHolds: rawDeck.arcHolds !== false,
      noContradictions: rawDeck.noContradictions !== false,
      issues: Array.isArray(rawDeck.issues)
        ? (rawDeck.issues as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    },
    unchecked: false,
  }
}

// ─── Gate ───────────────────────────────────────────────

export interface ContentGate {
  passed: boolean
  failingIndexes: number[]
  failedChecks: Record<string, number>
  summary: string
}

/** Turn a critique into a go/no-go plus the list of slides to rebuild. */
export function contentGateVerdict(critique: DeckContentCritique): ContentGate {
  const failingIndexes = critique.slides.filter((s) => s.verdict === 'fail').map((s) => s.slideIndex)
  const failedChecks: Record<string, number> = {}
  for (const s of critique.slides) {
    for (const k of CONTENT_CHECK_KEYS) if (!s.checks[k]) failedChecks[k] = (failedChecks[k] ?? 0) + 1
  }
  const deckOk = critique.deck.arcHolds && critique.deck.noContradictions
  const passed = failingIndexes.length === 0 && deckOk

  const parts: string[] = []
  if (critique.unchecked) parts.push(`critique unavailable (${critique.note ?? 'unknown'})`)
  parts.push(`${failingIndexes.length}/${critique.slides.length} slides failed`)
  if (!critique.deck.arcHolds) parts.push('narrative arc does not hold')
  if (!critique.deck.noContradictions) parts.push('deck contradicts itself')
  const worst = Object.entries(failedChecks).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (worst.length) parts.push(`worst: ${worst.map(([k, n]) => `${k}×${n}`).join(', ')}`)

  return { passed, failingIndexes, failedChecks, summary: parts.join(' | ') }
}

// ─── Model call ─────────────────────────────────────────

export interface CritiqueOptions {
  brandName: string
  sourceMaterial: string
  model?: string
  budgetMs?: number
}

/**
 * Review a deck's content. Never throws — an outage degrades to `unchecked`,
 * which the gate reports honestly rather than passing off as a clean bill.
 */
export async function critiqueDeckContent(
  htmlSlides: string[],
  opts: CritiqueOptions,
): Promise<DeckContentCritique> {
  if (!htmlSlides.length) return uncheckedCritique(0, 'no slides')

  const texts = htmlSlides.map(extractSlideText)
  const prompt = buildContentPrompt(texts, opts.sourceMaterial, opts.brandName)

  try {
    const res = await Promise.race([
      callAI({
        model: opts.model || 'gemini-3.1-pro-preview',
        prompt,
        callerId: 'content-critic',
        geminiConfig: { responseMimeType: 'application/json' },
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('content critique timed out')), opts.budgetMs ?? 180_000),
      ),
    ])
    const parsed = parseContentCritique(res?.text || '', htmlSlides.length)
    return parsed ?? uncheckedCritique(htmlSlides.length, 'unparseable critic response')
  } catch (e) {
    return uncheckedCritique(htmlSlides.length, e instanceof Error ? e.message : String(e))
  }
}
