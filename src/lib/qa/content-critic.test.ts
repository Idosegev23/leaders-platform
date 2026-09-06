import { describe, it, expect } from 'vitest'
import {
  extractSlideText,
  parseContentCritique,
  contentGateVerdict,
  uncheckedCritique,
  buildContentPrompt,
  CONTENT_CHECK_KEYS,
} from './content-critic'

const pass = () => Object.fromEntries(CONTENT_CHECK_KEYS.map((k) => [k, true]))

function critiqueJson(slides: unknown[], deck?: Record<string, unknown>) {
  return JSON.stringify({
    deck: deck ?? { arcHolds: true, noContradictions: true, issues: [] },
    slides,
  })
}

describe('extractSlideText', () => {
  it('reduces a slide to its words', () => {
    const html = '<section><h1>כותרת</h1><p>גוף&nbsp;הטקסט</p><img src="x.png"></section>'
    expect(extractSlideText(html)).toBe('כותרת גוף הטקסט')
  })

  it('drops script and style content rather than judging code as copy', () => {
    const html = '<style>.a{color:red}</style><script>var x=1</script><p>אמיתי</p>'
    expect(extractSlideText(html)).toBe('אמיתי')
  })
})

describe('parseContentCritique', () => {
  it('reads a clean pass', () => {
    const raw = critiqueJson([{ slideIndex: 0, checks: pass(), verdict: 'pass', issues: [], rewrite: '' }])
    const c = parseContentCritique(raw, 1)!
    expect(c.unchecked).toBe(false)
    expect(c.slides[0].verdict).toBe('pass')
  })

  it('reads a fail and keeps its rewrite directive', () => {
    const raw = critiqueJson([
      {
        slideIndex: 0,
        checks: { ...pass(), brandSpecific: false },
        verdict: 'fail',
        issues: ['"נוכחות דיגיטלית חזקה" מתאים לכל מותג'],
        rewrite: 'החלף במסר שנגזר מהמוצר האמיתי של הלקוח',
      },
    ])
    const c = parseContentCritique(raw, 1)!
    expect(c.slides[0].verdict).toBe('fail')
    expect(c.slides[0].rewrite).toContain('המוצר האמיתי')
  })

  it('fails a slide whenever any check is false, even if the model said pass', () => {
    const raw = critiqueJson([
      { slideIndex: 0, checks: { ...pass(), grounded: false }, verdict: 'pass', issues: ['מספר מומצא'], rewrite: 'הסר את הנתון' },
    ])
    expect(parseContentCritique(raw, 1)!.slides[0].verdict).toBe('fail')
  })

  it('downgrades an unactionable fail instead of burning a repair round', () => {
    // A fail with no rewrite gives the generator nothing to act on.
    const raw = critiqueJson([
      { slideIndex: 0, checks: { ...pass(), concrete: false }, verdict: 'fail', issues: ['חלש'], rewrite: '   ' },
    ])
    const s = parseContentCritique(raw, 1)!.slides[0]
    expect(s.verdict).toBe('pass')
    expect(s.issues[0]).toMatch(/^unchecked:/)
  })

  it('covers every slide even when the critic skips one', () => {
    const raw = critiqueJson([{ slideIndex: 2, checks: pass(), verdict: 'pass', issues: [], rewrite: '' }])
    const c = parseContentCritique(raw, 3)!
    expect(c.slides).toHaveLength(3)
    expect(c.slides.map((s) => s.slideIndex)).toEqual([0, 1, 2])
  })

  it('ignores out-of-range slide indexes', () => {
    const raw = critiqueJson([
      { slideIndex: 9, checks: { ...pass(), concrete: false }, verdict: 'fail', issues: ['x'], rewrite: 'y' },
    ])
    expect(parseContentCritique(raw, 1)!.slides[0].verdict).toBe('pass')
  })

  it('reads JSON out of a fenced block', () => {
    const raw = '```json\n' + critiqueJson([{ slideIndex: 0, checks: pass(), verdict: 'pass', issues: [], rewrite: '' }]) + '\n```'
    expect(parseContentCritique(raw, 1)).not.toBeNull()
  })

  it('returns null on unusable output so the caller degrades honestly', () => {
    expect(parseContentCritique('not json', 1)).toBeNull()
    expect(parseContentCritique('{"deck":{}}', 1)).toBeNull()
  })
})

describe('contentGateVerdict', () => {
  it('passes only when every slide and the deck pass', () => {
    const raw = critiqueJson([
      { slideIndex: 0, checks: pass(), verdict: 'pass', issues: [], rewrite: '' },
      { slideIndex: 1, checks: pass(), verdict: 'pass', issues: [], rewrite: '' },
    ])
    const g = contentGateVerdict(parseContentCritique(raw, 2)!)
    expect(g.passed).toBe(true)
    expect(g.failingIndexes).toEqual([])
  })

  it('lists exactly the slides that must be rebuilt', () => {
    const raw = critiqueJson([
      { slideIndex: 0, checks: pass(), verdict: 'pass', issues: [], rewrite: '' },
      { slideIndex: 1, checks: { ...pass(), brandSpecific: false }, verdict: 'fail', issues: ['גנרי'], rewrite: 'תקן' },
      { slideIndex: 2, checks: { ...pass(), notRedundant: false }, verdict: 'fail', issues: ['חוזר על 1'], rewrite: 'תקן' },
    ])
    const g = contentGateVerdict(parseContentCritique(raw, 3)!)
    expect(g.passed).toBe(false)
    expect(g.failingIndexes).toEqual([1, 2])
  })

  it('blocks on a deck-level failure even when every slide passes', () => {
    const raw = critiqueJson(
      [{ slideIndex: 0, checks: pass(), verdict: 'pass', issues: [], rewrite: '' }],
      { arcHolds: false, noContradictions: true, issues: ['אין קשת'] },
    )
    const g = contentGateVerdict(parseContentCritique(raw, 1)!)
    expect(g.passed).toBe(false)
    expect(g.summary).toContain('narrative arc')
  })

  it('counts which checks fail most, to steer the next round', () => {
    const raw = critiqueJson([
      { slideIndex: 0, checks: { ...pass(), brandSpecific: false }, verdict: 'fail', issues: ['x'], rewrite: 'a' },
      { slideIndex: 1, checks: { ...pass(), brandSpecific: false }, verdict: 'fail', issues: ['x'], rewrite: 'a' },
    ])
    const g = contentGateVerdict(parseContentCritique(raw, 2)!)
    expect(g.failedChecks.brandSpecific).toBe(2)
    expect(g.summary).toContain('brandSpecific×2')
  })

  it('says so when the critique never ran, instead of implying a clean deck', () => {
    const g = contentGateVerdict(uncheckedCritique(3, 'model timeout'))
    expect(g.passed).toBe(true) // do no harm — never block on our own outage
    expect(g.summary).toContain('critique unavailable')
    expect(g.summary).toContain('model timeout')
  })
})

describe('buildContentPrompt', () => {
  it('carries the source material so grounding can be judged', () => {
    const p = buildContentPrompt(['שקף'], 'הבריף המקורי', 'SEACRET SPA')
    expect(p).toContain('הבריף המקורי')
    expect(p).toContain('SEACRET SPA')
  })

  it('marks an empty slide rather than silently sending a blank', () => {
    expect(buildContentPrompt(['', 'טקסט'], 'src', 'B')).toContain('(empty slide)')
  })

  it('labels each slide with its type so a cover is not judged as a content slide', () => {
    // A cover failed earnsItsPlace for being short — which is what a cover is.
    const p = buildContentPrompt(['שער', 'גוף'], 'src', 'B', ['cover', 'strategy'])
    expect(p).toContain('SLIDE 0 (type: cover)')
    expect(p).toContain('SLIDE 1 (type: strategy)')
  })

  it('falls back to "unknown" when types are missing, without shifting them', () => {
    const p = buildContentPrompt(['a', 'b'], 'src', 'B', ['cover'])
    expect(p).toContain('SLIDE 0 (type: cover)')
    expect(p).toContain('SLIDE 1 (type: unknown)')
  })
})
