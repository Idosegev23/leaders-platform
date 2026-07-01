import { describe, it, expect } from 'vitest'
import { deckArtifactPath } from './storage'

describe('deckArtifactPath', () => {
  it('builds a deterministic path with the kind extension', () => {
    expect(deckArtifactPath('doc-123', 'pdf', 1000)).toBe('decks/doc-123/1000.pdf')
    expect(deckArtifactPath('doc-123', 'pptx', 2000)).toBe('decks/doc-123/2000.pptx')
  })
})
