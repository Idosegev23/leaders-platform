import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The repair path replaced isolated regeneration because that could not fix
 * redundancy, contradictions or Hebrew drift. But a context-aware repair can
 * still make a slide worse in ways the content critic would not catch — it
 * judges words, not imagery. These tests pin the two guards that reject such a
 * "repair" so the caller keeps the original slide.
 */

const callAI = vi.fn()
// vi.mock is hoisted above the imports by vitest, so the static import below
// still receives the mock.
vi.mock('@/lib/ai-provider', () => ({ callAI: (...a: unknown[]) => callAI(...a) }))

import { repairSlideInContext } from './slide-repair'

const IMG = 'https://fhgggqnaplshwbrzgima.supabase.co/storage/v1/object/public/assets/brand/x/logo.png'

function slide(body: string, img = IMG) {
  return `<!DOCTYPE html><html><body><h1>כותרת השקף</h1><p>${body}</p><img src="${img}"></body></html>`
}

// Deliberately over the guard's 200-char floor: below it, slides are not
// policed for shrinkage, because a cover slide is supposed to be short.
const ORIGINAL = slide(
  'טקסט מקורי באורך של שקף תוכן אמיתי: אסטרטגיית המדיה נשענת על שלוש שכבות תוכן — מקור החומר, ' +
    'הטקס היומי, והתוצאה על העור. כל נכס קריאייטיבי משתייך לאחת מהן, וכך השפה נשארת אחידה גם ' +
    'כשהיא עוברת דרך יוצרים שונים ופלטפורמות שונות לאורך כל הרבעון הראשון של הקמפיין.',
)

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    slideHtml: ORIGINAL,
    slideIndex: 3,
    slideType: 'strategy',
    allSlideTexts: ['שקף 0', 'שקף 1', 'שקף 2', 'שקף 3'],
    sourceMaterial: 'הבריף המקורי',
    brandName: 'SEACRET SPA',
    failedChecks: ['grounded'],
    issues: ['מספר שלא מופיע במקור'],
    rewrite: 'הסר את הנתון שאינו במקור',
    ...overrides,
  }
}

const reply = (html: unknown) => ({ text: JSON.stringify({ html }) })

beforeEach(() => callAI.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('repairSlideInContext', () => {
  it('returns the rewritten slide when the repair is sound', async () => {
    const fixed = slide(
    'טקסט מתוקן שנשען על המקור בלבד: אסטרטגיית המדיה נשענת על שלוש שכבות — מקור החומר, הטקס היומי ' +
    'והתוצאה על העור. הוסרו הנתונים שלא הופיעו בבריף, והניסוח נשאר עברי לכל אורכו כולל הכותרות ' +
    'והתוויות, בלי לחזור על נקודה שכבר נאמרה בשקף אחר במצגת.',
    )
    callAI.mockResolvedValue(reply(fixed))
    expect(await repairSlideInContext(baseInput())).toBe(fixed)
  })

  it('shows the repair the whole deck, not just its own slide', async () => {
    callAI.mockResolvedValue(reply(slide(
    'טקסט מתוקן שנשען על המקור בלבד: אסטרטגיית המדיה נשענת על שלוש שכבות — מקור החומר, הטקס היומי ' +
    'והתוצאה על העור. הוסרו הנתונים שלא הופיעו בבריף, והניסוח נשאר עברי לכל אורכו כולל הכותרות ' +
    'והתוויות, בלי לחזור על נקודה שכבר נאמרה בשקף אחר במצגת.',
    )))
    await repairSlideInContext(baseInput())
    const prompt = callAI.mock.calls[0][0].prompt as string
    // Isolation was the root cause — every other slide must be visible.
    expect(prompt).toContain('שקף 0')
    expect(prompt).toContain('שקף 2')
    expect(prompt).toContain('SLIDE 3 (this is the one being rewritten)')
    expect(prompt).toContain('הבריף המקורי')
    expect(prompt).toContain('הסר את הנתון שאינו במקור')
  })

  it('passes deck-level problems through so repair does not recreate them', async () => {
    callAI.mockResolvedValue(reply(slide(
    'טקסט מתוקן שנשען על המקור בלבד: אסטרטגיית המדיה נשענת על שלוש שכבות — מקור החומר, הטקס היומי ' +
    'והתוצאה על העור. הוסרו הנתונים שלא הופיעו בבריף, והניסוח נשאר עברי לכל אורכו כולל הכותרות ' +
    'והתוויות, בלי לחזור על נקודה שכבר נאמרה בשקף אחר במצגת.',
    )))
    await repairSlideInContext(baseInput({ deckIssues: ['שקף 4 ושקף 9 נוקבים בתקציב שונה'] }))
    expect(callAI.mock.calls[0][0].prompt).toContain('תקציב שונה')
  })

  it('rejects a repair that swaps the imagery', async () => {
    // The provenance gate does not run on this path, so a swapped src is how a
    // stock photo could sneak back into a deck.
    callAI.mockResolvedValue(reply(slide(
    'טקסט מתוקן שנשען על המקור בלבד: אסטרטגיית המדיה נשענת על שלוש שכבות — מקור החומר, הטקס היומי ' +
    'והתוצאה על העור. הוסרו הנתונים שלא הופיעו בבריף, והניסוח נשאר עברי לכל אורכו כולל הכותרות ' +
    'והתוויות, בלי לחזור על נקודה שכבר נאמרה בשקף אחר במצגת.',
    'https://images.unsplash.com/photo-1.jpg')))
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  it('rejects a repair that drops the imagery entirely', async () => {
    callAI.mockResolvedValue(reply(
      '<!DOCTYPE html><html><body><h1>כותרת</h1><p>' +
        'טקסט מתוקן שנשען על המקור בלבד: שלוש שכבות תוכן — מקור החומר, הטקס היומי והתוצאה על העור, ' +
        'בלי נתונים מומצאים, בעברית מלאה לכל אורך השקף כולל הכותרות והתוויות שבו.' +
        '</p></body></html>',
    ))
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  it('rejects a repair that guts the slide down to a stub', async () => {
    callAI.mockResolvedValue(reply(slide('קצר')))
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  it('rejects output that is not a full document', async () => {
    callAI.mockResolvedValue(reply('<p>fragment only</p>'))
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  it('returns null rather than throwing when the model fails', async () => {
    callAI.mockRejectedValue(new Error('upstream 503'))
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  it('returns null on unparseable output', async () => {
    callAI.mockResolvedValue({ text: 'not json at all' })
    expect(await repairSlideInContext(baseInput())).toBeNull()
  })

  describe('eyebrow preservation', () => {
    const LONG =
      'טקסט מתוקן שנשען על המקור בלבד: אסטרטגיית המדיה נשענת על שלוש שכבות — מקור החומר, הטקס היומי ' +
      'והתוצאה על העור. הוסרו הנתונים שלא הופיעו בבריף, והניסוח נשאר עברי לכל אורכו כולל הכותרות ' +
      'והתוויות, בלי לחזור על נקודה שכבר נאמרה בשקף אחר במצגת.'
    const withEyebrow = (eyebrow: string, body: string) =>
      `<!DOCTYPE html><html><body><div class="eyebrow" style="opacity:.7">${eyebrow}</div><h1>כותרת</h1><p>${body}</p><img src="${IMG}"></body></html>`
    const original = withEyebrow('משפיענים // 14', LONG)

    it('restores an eyebrow the repair blanked — the observed regression', async () => {
      callAI.mockResolvedValue(reply(withEyebrow('', LONG)))
      const out = await repairSlideInContext(baseInput({ slideHtml: original }))
      expect(out).toContain('<div class="eyebrow" style="opacity:.7">משפיענים // 14</div>')
    })

    it('re-inserts an eyebrow the repair dropped entirely', async () => {
      callAI.mockResolvedValue(reply(`<!DOCTYPE html><html><body><h1>כותרת</h1><p>${LONG}</p><img src="${IMG}"></body></html>`))
      const out = await repairSlideInContext(baseInput({ slideHtml: original }))
      expect(out).toMatch(/<body><div class="eyebrow" style="opacity:\.7">משפיענים \/\/ 14<\/div>/)
    })

    it('leaves a repair that kept a non-empty eyebrow alone', async () => {
      callAI.mockResolvedValue(reply(withEyebrow('משפיענים // 99', LONG)))
      const out = await repairSlideInContext(baseInput({ slideHtml: original }))
      // Not this guard's job to fix the number — renumbering does that.
      expect(out).toContain('משפיענים // 99')
    })
  })
})
