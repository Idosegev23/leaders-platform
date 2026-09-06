/**
 * Deterministic deck-structure normalization.
 *
 * The agent decides slide ORDER itself: the blueprint carries the story's
 * three pillars, not a slide sequence, and 20+ slides are generated in one long
 * conversation. Measured across three decks built from identical input, order
 * was correct once, once put three influencer slides AFTER the closing, and
 * once opened with brief → insight → strategy → pillars → timeline and placed
 * the COVER at slide 8. The content critic judges words per slide and passed
 * every one of those decks' arcs — it has no notion of sequence.
 *
 * Sequence is not a judgement call, so it does not need a model. Decks in this
 * system follow one narrative grammar (the generation prompt spells it out:
 * cover → brief → audience → insight → pillars → bigIdea → creative → closing,
 * with card slides slotted between). This module stable-sorts slides into that
 * grammar, keeping the relative order within a type (pillar-1..3, the three
 * creative executions, the three influencer profiles) and leaving unknown types
 * where they were relative to their neighbours.
 *
 * Pure functions over index-aligned arrays; no I/O.
 */

export interface DeckArrays {
  htmlSlides: string[]
  slideTypes: string[]
}

export interface StructureReport {
  changed: boolean
  /** Human-readable account of what moved, for the critique record. */
  moves: string[]
}

/** Canonical narrative order. Lower rank comes first. `pillar-*` shares a rank. */
export const SLIDE_TYPE_ORDER: readonly string[] = [
  'cover',
  'brief',
  'goals',
  'audience',
  'insight',
  'strategy',
  'pillar',
  'bigIdea',
  'creative',
  'influencers',
  'competitive',
  'deliverables',
  'timeline',
  'metrics',
  'results',
  'closing',
]

/** Slides that must never be removed by the repair loop. */
export const PROTECTED_TYPES: ReadonlySet<string> = new Set(['cover', 'closing'])

function rankOf(type: string): number | null {
  const t = (type || '').trim()
  if (!t) return null
  if (/^pillar(-\d+)?$/i.test(t)) return SLIDE_TYPE_ORDER.indexOf('pillar')
  const i = SLIDE_TYPE_ORDER.indexOf(t)
  return i === -1 ? null : i
}

/**
 * Reorder a deck into the canonical grammar.
 *
 * Unknown types inherit the rank of the nearest preceding known slide, so a
 * custom section stays attached to the part of the story it was generated in
 * rather than being flung to one end. The sort is stable, so same-rank slides
 * keep their generated order.
 */
export function normalizeDeckStructure(deck: DeckArrays): { deck: DeckArrays; report: StructureReport } {
  const n = deck.htmlSlides.length
  if (n !== deck.slideTypes.length) {
    // Misaligned arrays are a caller bug; refuse to reorder blind.
    return { deck, report: { changed: false, moves: [`skipped: ${n} slides vs ${deck.slideTypes.length} types`] } }
  }
  if (n < 2) return { deck, report: { changed: false, moves: [] } }

  // Resolve a rank for every slide, carrying the last known rank forward.
  const ranks: number[] = []
  let carry = 0
  for (let i = 0; i < n; i++) {
    const r = rankOf(deck.slideTypes[i])
    if (r !== null) carry = r
    ranks.push(r ?? carry)
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ranks[a] - ranks[b] || a - b)
  const changed = order.some((from, to) => from !== to)
  if (!changed) return { deck, report: { changed: false, moves: [] } }

  const moves: string[] = []
  order.forEach((from, to) => {
    if (from !== to) moves.push(`${deck.slideTypes[from] || 'unknown'}: ${from} → ${to}`)
  })

  return {
    deck: {
      htmlSlides: order.map((i) => deck.htmlSlides[i]),
      slideTypes: order.map((i) => deck.slideTypes[i]),
    },
    report: { changed: true, moves },
  }
}

/**
 * Drop slides by index, keeping the arrays aligned. Indexes may arrive in any
 * order and may repeat; out-of-range values are ignored.
 */
export function removeSlides(deck: DeckArrays, indexes: number[]): DeckArrays {
  const drop = new Set(indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < deck.htmlSlides.length))
  if (!drop.size) return deck
  return {
    htmlSlides: deck.htmlSlides.filter((_, i) => !drop.has(i)),
    slideTypes: deck.slideTypes.filter((_, i) => !drop.has(i)),
  }
}

export interface RemovalPolicy {
  /** Never let the deck shrink below this. */
  minSlides: number
  /** Cap per round — a critic on a bad day must not gut the deck. */
  maxPerRound: number
}

export const DEFAULT_REMOVAL_POLICY: RemovalPolicy = { minSlides: 12, maxPerRound: 2 }

/**
 * Filter requested removals down to the ones the policy allows, in the order
 * requested. Protected types are refused; the floor and the per-round cap are
 * enforced together so the result can be applied as-is.
 */
export function allowedRemovals(
  deck: DeckArrays,
  requested: number[],
  policy: RemovalPolicy = DEFAULT_REMOVAL_POLICY,
): { allowed: number[]; refused: Array<{ index: number; reason: string }> } {
  const allowed: number[] = []
  const refused: Array<{ index: number; reason: string }> = []
  const seen = new Set<number>()
  for (const i of requested) {
    if (seen.has(i)) continue
    seen.add(i)
    if (!Number.isInteger(i) || i < 0 || i >= deck.htmlSlides.length) {
      refused.push({ index: i, reason: 'out of range' })
      continue
    }
    if (PROTECTED_TYPES.has(deck.slideTypes[i])) {
      refused.push({ index: i, reason: `protected type ${deck.slideTypes[i]}` })
      continue
    }
    if (allowed.length >= policy.maxPerRound) {
      refused.push({ index: i, reason: `per-round cap ${policy.maxPerRound}` })
      continue
    }
    if (deck.htmlSlides.length - allowed.length - 1 < policy.minSlides) {
      refused.push({ index: i, reason: `deck floor ${policy.minSlides}` })
      continue
    }
    allowed.push(i)
  }
  return { allowed, refused }
}
