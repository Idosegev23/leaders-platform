import { describe, it, expect } from 'vitest'
import { normalizeDeckStructure, removeSlides, allowedRemovals } from './deck-structure'

/** Build a deck whose HTML is just a marker for its original position. */
function deck(types: string[]) {
  return { htmlSlides: types.map((t, i) => `<html>${i}:${t}</html>`), slideTypes: [...types] }
}

describe('normalizeDeckStructure', () => {
  it('leaves a correctly ordered deck untouched', () => {
    // be568a07 — the one deck of three that came out in a sane order.
    const d = deck(['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'pillar-1', 'pillar-2', 'pillar-3',
      'bigIdea', 'creative', 'creative', 'influencers', 'influencers', 'competitive', 'deliverables', 'timeline',
      'metrics', 'results', 'closing'])
    const { deck: out, report } = normalizeDeckStructure(d)
    expect(report.changed).toBe(false)
    expect(out.slideTypes).toEqual(d.slideTypes)
  })

  it('moves a mid-deck cover to the front (192039b3: cover was slide 8)', () => {
    const d = deck(['brief', 'insight', 'strategy', 'pillar-1', 'pillar-2', 'pillar-3', 'timeline', 'cover', 'goals',
      'audience', 'bigIdea', 'creative', 'closing'])
    const { deck: out, report } = normalizeDeckStructure(d)
    expect(report.changed).toBe(true)
    expect(out.slideTypes[0]).toBe('cover')
    expect(out.slideTypes.at(-1)).toBe('closing')
    // The HTML travelled with its type.
    expect(out.htmlSlides[0]).toBe('<html>7:cover</html>')
  })

  it('pulls slides that landed after the closing back in front of it (80f9657c)', () => {
    const d = deck(['cover', 'brief', 'metrics', 'closing', 'influencers', 'influencers', 'influencers'])
    const { deck: out } = normalizeDeckStructure(d)
    expect(out.slideTypes.at(-1)).toBe('closing')
    expect(out.slideTypes.filter((t) => t === 'influencers')).toHaveLength(3)
    expect(out.slideTypes.indexOf('influencers')).toBeLessThan(out.slideTypes.indexOf('closing'))
  })

  it('restores the narrative grammar, not just the ends', () => {
    const d = deck(['cover', 'strategy', 'pillar-1', 'goals', 'audience', 'closing'])
    const { deck: out } = normalizeDeckStructure(d)
    expect(out.slideTypes).toEqual(['cover', 'goals', 'audience', 'strategy', 'pillar-1', 'closing'])
  })

  it('keeps same-type slides in their generated order (stable)', () => {
    const d = deck(['cover', 'creative', 'pillar-3', 'pillar-1', 'pillar-2', 'closing'])
    const { deck: out } = normalizeDeckStructure(d)
    // pillars share a rank, so their internal order is preserved as generated.
    expect(out.slideTypes).toEqual(['cover', 'pillar-3', 'pillar-1', 'pillar-2', 'creative', 'closing'])
    expect(out.htmlSlides[1]).toBe('<html>2:pillar-3</html>')
  })

  it('keeps an unknown type attached to the section it was generated in', () => {
    const d = deck(['cover', 'insight', 'custom-section', 'brief', 'closing'])
    const { deck: out } = normalizeDeckStructure(d)
    // 'custom-section' inherits insight's rank, so it stays right after insight
    // and brief moves ahead of both.
    expect(out.slideTypes).toEqual(['cover', 'brief', 'insight', 'custom-section', 'closing'])
  })

  it('reports every move in human terms, in destination order', () => {
    const d = deck(['brief', 'cover'])
    const { report } = normalizeDeckStructure(d)
    expect(report.moves).toEqual(['cover: 1 → 0', 'brief: 0 → 1'])
  })

  it('refuses to reorder misaligned arrays rather than scramble them', () => {
    const { report } = normalizeDeckStructure({ htmlSlides: ['a', 'b'], slideTypes: ['cover'] })
    expect(report.changed).toBe(false)
    expect(report.moves[0]).toMatch(/^skipped/)
  })
})

describe('removeSlides', () => {
  it('drops the requested indexes and keeps arrays aligned', () => {
    const d = deck(['cover', 'metrics', 'results', 'closing'])
    const out = removeSlides(d, [2])
    expect(out.slideTypes).toEqual(['cover', 'metrics', 'closing'])
    expect(out.htmlSlides).toEqual(['<html>0:cover</html>', '<html>1:metrics</html>', '<html>3:closing</html>'])
  })

  it('tolerates duplicates and out-of-range indexes', () => {
    const d = deck(['cover', 'a', 'closing'])
    expect(removeSlides(d, [1, 1, 9, -1]).slideTypes).toEqual(['cover', 'closing'])
    expect(removeSlides(d, [42])).toEqual(d)
  })
})

describe('allowedRemovals', () => {
  const twenty = deck(['cover', ...Array(18).fill('creative'), 'closing'])

  it('never removes the cover or the closing', () => {
    const { allowed, refused } = allowedRemovals(twenty, [0, 19, 5])
    expect(allowed).toEqual([5])
    expect(refused.map((r) => r.reason)).toEqual(['protected type cover', 'protected type closing'])
  })

  it('caps removals per round', () => {
    const { allowed, refused } = allowedRemovals(twenty, [3, 4, 5, 6])
    expect(allowed).toEqual([3, 4])
    expect(refused.every((r) => r.reason.startsWith('per-round cap'))).toBe(true)
  })

  it('holds the deck at the floor', () => {
    const thirteen = deck(['cover', ...Array(11).fill('creative'), 'closing'])
    const { allowed, refused } = allowedRemovals(thirteen, [3, 4])
    expect(allowed).toEqual([3]) // 13 → 12 is fine, 12 → 11 is not
    expect(refused[0].reason).toMatch(/floor/)
  })

  it('ignores repeats and out-of-range requests', () => {
    const { allowed, refused } = allowedRemovals(twenty, [7, 7, 99])
    expect(allowed).toEqual([7])
    expect(refused).toEqual([{ index: 99, reason: 'out of range' }])
  })
})
