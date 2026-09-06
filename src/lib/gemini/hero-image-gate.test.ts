import { describe, it, expect } from 'vitest'
import { isNarrativeSlideType, needsHeroImage } from './presentation-agent'

/**
 * The narrative-image gate exists because of a real deck: a resumed run
 * emitted all 20 slides text-only, cover and closing included. The prompt
 * required imagery on narrative slides all along; this is the check that was
 * missing.
 */

describe('isNarrativeSlideType', () => {
  it('treats story slides as narrative', () => {
    for (const t of ['cover', 'brief', 'audience', 'insight', 'bigIdea', 'creative', 'closing']) {
      expect(isNarrativeSlideType(t)).toBe(true)
    }
  })

  it('treats every pillar variant as narrative', () => {
    expect(isNarrativeSlideType('pillar')).toBe(true)
    expect(isNarrativeSlideType('pillar-1')).toBe(true)
    expect(isNarrativeSlideType('pillar-3')).toBe(true)
  })

  it('leaves card and data slides alone — a clean card layout needs no photo', () => {
    for (const t of ['goals', 'strategy', 'competitive', 'timeline', 'deliverables', 'metrics', 'results', 'influencers']) {
      expect(isNarrativeSlideType(t)).toBe(false)
    }
    expect(isNarrativeSlideType('')).toBe(false)
  })
})

describe('needsHeroImage', () => {
  it('flags a narrative slide with no image — the observed regression', () => {
    expect(needsHeroImage('cover', '')).toBe(true)
    expect(needsHeroImage('closing', undefined)).toBe(true)
    expect(needsHeroImage('pillar-2', '   ')).toBe(true)
  })

  it('is satisfied once the slide carries any image URL (provenance is checked elsewhere)', () => {
    expect(needsHeroImage('cover', 'https://fhgggqnaplshwbrzgima.supabase.co/storage/v1/object/public/assets/x.png')).toBe(false)
  })

  it('never demands an image from a card slide', () => {
    expect(needsHeroImage('metrics', '')).toBe(false)
    expect(needsHeroImage('goals', null)).toBe(false)
  })
})
