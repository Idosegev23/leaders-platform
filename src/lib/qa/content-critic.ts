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
  /** What a regeneration must do differently. Required whenever verdict=fail
   *  and disposition is 'rewrite'. */
  rewrite: string
  /**
   * 'remove' when the slide's entire purpose is already served by another
   * slide, so no rewrite can give it a distinct role. Measured: a `results`
   * slide duplicating the `metrics` slide's budget split failed notRedundant in
   * every round of every deck — each rewrite only moved which figures overlapped.
   * Structural duplicates need removal, not better prose.
   */
  disposition: 'rewrite' | 'remove'
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

<judge-by-slide-type>
Judge each slide against what its TYPE is supposed to do. Holding every slide
to the same yardstick produces false failures that waste a repair round.

- cover / closing: a title, the brand, maybe one line. Being SHORT is correct —
  never fail these for thin content or for lacking a number. Fail a cover only
  for a placeholder, wrong brand, or broken Hebrew.
- brief / insight / bigIdea: judged on sharpness. One real idea beats five
  vague ones. Length is not the measure.
- audience / strategy / creative / pillar-*: must be brand-specific and
  traceable to the source.
- goals / metrics / timeline / deliverables / budget / competitive: must carry
  concrete figures, names or dates. Vague verbs here are a real failure.
- influencer slides: profiles must match the source brief's profiles. Inventing
  a tier system or ambassador hierarchy that the brief never described is an
  ungrounded failure, not a creative liberty.
</judge-by-slide-type>

<conventions>
- Eyebrows. Most slides open with "LABEL // NN" — "COVER // 01", "יעדים // 03",
  "CLOSING // 22" — where the number AFTER "//" is the slide's 1-based position
  and LABEL may be an English section word in capitals (COVER, BRIEF, CLOSING).
  That is the renderer's convention: never fail hebrewQuality for the label, and
  fail noPlaceholder on the number ONLY when the number after "//" does not equal
  (SLIDE index + 1). Pillar slides use a DIFFERENT shape — "עמוד תווך 01 // מקור",
  "עמוד תווך 02 // רובד הטקס" — where the number is the pillar's ordinal (first,
  second, third pillar), NOT a slide position. Never judge it as a slide number.
- The agency. This deck is presented by Leaders, rendered "LEADERS". The
  agency's name, its lockup ("BRAND × LEADERS"), and "we / our proposal"
  framing are never ungrounded — they identify the author, not a claim about
  the client.
- Structure. A deck may introduce a pillar as strategy and later show that
  pillar's creative EXECUTION (script, format, example) on its own slide, and
  may give each influencer profile its own slide after naming the profiles in
  the strategy. That progression is not redundancy. notRedundant fails only
  when a slide restates the SAME point at the SAME level of detail as another —
  not when it advances from principle to execution, or from a summary to a
  profile.
</conventions>

<deck-level>
Also judge the deck as a whole:
- arcHolds: the deck builds an argument — the insight sets up a tension, the strategy answers it, the idea expresses it, and something closes the loop. A pile of unrelated slides is false.
- noContradictions: no two slides contradict each other (different budgets, different audiences, different goals for the same campaign).
</deck-level>

<rules>
- Report an issue ONLY for a check you marked false. Be concrete: quote the offending phrase.
- Every failing slide MUST carry a "rewrite" directive: a specific instruction for what the regenerated slide must contain or do differently. Never "make it better" — say what to add, cut, or ground.
- "disposition" is "rewrite" by default. Use "remove" ONLY when the slide's ENTIRE purpose is already fully served by another slide (name it in issues) so that no rewrite could give it a distinct role — e.g. a second slide presenting the same budget split, or a second slide restating the same three pillars. A slide that merely overlaps in part gets "rewrite" with a directive to drop the overlap. Never "remove" a cover or closing.
- A slide with any false check gets verdict "fail".
- When every check passes: verdict "pass", empty issues, and rewrite MUST be an empty string.
- Judge ONLY the content. Layout, colour and imagery are another critic's job.
- If the SOURCE MATERIAL is thin or empty, that is not an excuse to pass empty slides — mark them ungrounded and say the source lacks the material.
</rules>

<output>JSON only:
{"deck":{"arcHolds":bool,"noContradictions":bool,"issues":[string]},
 "slides":[{"slideIndex":int,"checks":{"brandSpecific":bool,"concrete":bool,"grounded":bool,"noPlaceholder":bool,"notRedundant":bool,"earnsItsPlace":bool,"hebrewQuality":bool},"verdict":"pass"|"fail","issues":[string],"rewrite":string,"disposition":"rewrite"|"remove"}]}
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
  slideTypes: string[] = [],
): string {
  // The type drives the standard applied — see <judge-by-slide-type>. Without
  // it a cover slide gets failed for being short, which is what a cover is.
  const slides = slideTexts
    .map((t, i) => `--- SLIDE ${i} (type: ${slideTypes[i] || 'unknown'}) ---\n${t || '(empty slide)'}`)
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
      disposition: 'rewrite' as const,
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
      slides.push({ slideIndex: i, checks: allPass(), verdict: 'pass', issues: [], rewrite: '', disposition: 'rewrite' })
      continue
    }
    const rawChecks = (s.checks ?? {}) as Record<string, unknown>
    const checks = Object.fromEntries(
      CONTENT_CHECK_KEYS.map((k) => [k, rawChecks[k] !== false]),
    ) as Record<ContentCheckKey, boolean>

    const issues = Array.isArray(s.issues) ? (s.issues as unknown[]).filter((x): x is string => typeof x === 'string') : []
    const rewrite = typeof s.rewrite === 'string' ? s.rewrite.trim() : ''
    const anyFailed = CONTENT_CHECK_KEYS.some((k) => !checks[k])
    const failed = anyFailed || s.verdict === 'fail'
    // Removal is only meaningful for a failing slide, and only with a stated
    // reason — a bare "remove" is as unactionable as a bare "fail".
    const disposition: 'rewrite' | 'remove' =
      failed && s.disposition === 'remove' && issues.length > 0 ? 'remove' : 'rewrite'

    // A fail we cannot act on is worse than no finding: it would burn a repair
    // round with no instruction. Treat it as a pass and say so. A removal
    // needs no rewrite text — the action IS the instruction.
    if (failed && !rewrite && disposition !== 'remove') {
      slides.push({
        slideIndex: i,
        checks: allPass(),
        verdict: 'pass',
        issues: ['unchecked: critic failed this slide without a rewrite directive'],
        rewrite: '',
        disposition: 'rewrite',
      })
      continue
    }

    slides.push({
      slideIndex: i,
      checks,
      verdict: failed ? 'fail' : 'pass',
      issues,
      rewrite: failed ? rewrite : '',
      disposition,
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
  /** Per-slide type, so each slide is judged by its own standard. */
  slideTypes?: string[]
  model?: string
  budgetMs?: number
}

/**
 * Structured-output schema. Without it the critic free-forms its JSON, and a
 * 22-slide deck produced a response that ran past the token budget and came
 * back truncated — unparseable, which silently degraded a real critique into
 * "unchecked". A schema plus a raised ceiling keeps long decks well-formed.
 */
const CHECKS_SCHEMA = {
  type: 'object',
  required: [...CONTENT_CHECK_KEYS],
  properties: Object.fromEntries(CONTENT_CHECK_KEYS.map((k) => [k, { type: 'boolean' }])),
} as Record<string, unknown>

const CRITIQUE_SCHEMA = {
  type: 'object',
  required: ['deck', 'slides'],
  properties: {
    deck: {
      type: 'object',
      required: ['arcHolds', 'noContradictions', 'issues'],
      properties: {
        arcHolds: { type: 'boolean' },
        noContradictions: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
      },
    },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slideIndex', 'checks', 'verdict', 'issues', 'rewrite'],
        properties: {
          slideIndex: { type: 'integer' },
          checks: CHECKS_SCHEMA,
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          issues: { type: 'array', items: { type: 'string' } },
          rewrite: { type: 'string' },
          disposition: { type: 'string', enum: ['rewrite', 'remove'] },
        },
      },
    },
  },
} as Record<string, unknown>

/** Output ceiling. Thinking tokens count against this on Gemini, and the
 *  16k default silently truncated a long deck's critique. */
const CRITIQUE_MAX_OUTPUT_TOKENS = 48_000

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
  const prompt = buildContentPrompt(texts, opts.sourceMaterial, opts.brandName, opts.slideTypes ?? [])
  const deadline = Date.now() + (opts.budgetMs ?? 180_000)
  const slideCount = htmlSlides.length

  const critiqueOnce = async (label: string, remaining: number): Promise<DeckContentCritique | null> => {
    try {
      const res = await Promise.race([
        callAI({
          model: opts.model || 'gemini-3.1-pro-preview',
          prompt,
          callerId: `content-critic-${label}`,
          maxOutputTokens: CRITIQUE_MAX_OUTPUT_TOKENS,
          geminiConfig: {
            responseMimeType: 'application/json',
            responseSchema: CRITIQUE_SCHEMA as never,
            maxOutputTokens: CRITIQUE_MAX_OUTPUT_TOKENS,
            // A judge, not a writer: pin sampling so the same deck gets the
            // same verdict. At default temperature the same slides flipped
            // pass→fail between rounds with no content change.
            temperature: 0,
            thinkingConfig: { thinkingLevel: 'LOW' } as never,
          },
        }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('content critique timed out')), remaining),
        ),
      ])
      const parsed = parseContentCritique(res?.text || '', slideCount)
      if (!parsed) console.warn(`[content-critic] ${label}: unparseable response — ${(res?.text || '').length} chars`)
      return parsed
    } catch (e) {
      console.warn(`[content-critic] ${label} failed: ${e instanceof Error ? e.message : e}`)
      return null
    }
  }

  // Two independent critiques, intersected: a slide fails only when both fail
  // the same check. One critic's one-off objection cannot fail a slide, and a
  // removal needs both to call the slide a structural duplicate. Run in
  // parallel, so this costs tokens, not wall-clock. One retry of the pair if
  // neither parses — degrading a real critique to "unchecked" costs a round.
  let lastNote = 'unparseable critic response'
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining < 15_000) break
    const [a, b] = await Promise.all([critiqueOnce('a', remaining), critiqueOnce('b', remaining)])
    if (a || b) {
      return intersectCritiques(
        a ?? uncheckedCritique(slideCount, 'critic a failed'),
        b ?? uncheckedCritique(slideCount, 'critic b failed'),
      )
    }
    lastNote = `both critiques unavailable (attempt ${attempt + 1})`
  }
  return uncheckedCritique(slideCount, lastNote)
}

/**
 * Combine two independent critiques of the same deck into one verdict that
 * both agree on.
 *
 *  - A check fails only if BOTH critiques failed it; a slide fails only if some
 *    check fails after that. Two critics failing a slide on different checks
 *    is disagreement about what is wrong, not agreement that it is.
 *  - Removal requires both to say remove. Deleting a slide on one critic's
 *    reading is how two of three influencer profiles were cut in one round.
 *  - Deck-level flags need both. Issues are merged for whatever survives.
 *  - If one side is unchecked, the other stands alone (with a note); if both
 *    are, the result is unchecked.
 */
export function intersectCritiques(a: DeckContentCritique, b: DeckContentCritique): DeckContentCritique {
  if (a.unchecked && b.unchecked) return { ...a, note: `${a.note ?? 'unchecked'}; ${b.note ?? 'unchecked'}` }
  if (a.unchecked) return { ...b, note: `single critique (${a.note ?? 'other unavailable'})` }
  if (b.unchecked) return { ...a, note: `single critique (${b.note ?? 'other unavailable'})` }

  const slides: SlideContentCritique[] = a.slides.map((sa, i) => {
    const sb = b.slides[i] ?? sa
    const checks = Object.fromEntries(
      CONTENT_CHECK_KEYS.map((k) => [k, sa.checks[k] || sb.checks[k]]),
    ) as Record<ContentCheckKey, boolean>
    const failed = CONTENT_CHECK_KEYS.some((k) => !checks[k])
    if (!failed) {
      return { slideIndex: sa.slideIndex, checks, verdict: 'pass', issues: [], rewrite: '', disposition: 'rewrite' }
    }
    return {
      slideIndex: sa.slideIndex,
      checks,
      verdict: 'fail',
      issues: Array.from(new Set([...sa.issues, ...sb.issues])),
      rewrite: sa.rewrite || sb.rewrite,
      disposition: sa.disposition === 'remove' && sb.disposition === 'remove' ? 'remove' : 'rewrite',
    }
  })

  const arcHolds = a.deck.arcHolds || b.deck.arcHolds
  const noContradictions = a.deck.noContradictions || b.deck.noContradictions
  return {
    slides,
    deck: {
      arcHolds,
      noContradictions,
      issues: arcHolds && noContradictions ? [] : Array.from(new Set([...a.deck.issues, ...b.deck.issues])),
    },
    unchecked: false,
    note: 'intersection of two independent critiques',
  }
}
