/**
 * Mock-shape tests for src/lib/qa/slide-critic.ts.
 *
 * Canned model outputs via the injectable model caller + a canned renderer —
 * NO real Gemini calls, NO Playwright (the API host is blocked from this
 * machine anyway).
 *
 * Run: npx tsx scripts/test-slide-critic-shapes.mts
 */
import assert from 'node:assert/strict'

const {
  critiqueSlides,
  applyAutoFixes,
  __setModelCallerForTests,
  __setSlideRendererForTests,
} = await import('../src/lib/qa/slide-critic')
type SlideCritique = import('../src/lib/qa/slide-critic').SlideCritique
type ModelCallRequest = import('../src/lib/brand/vlm-verify').ModelCallRequest
type StructuredSlide = import('../src/lib/gemini/layout-prototypes/types').StructuredSlide

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const ALL_TRUE: SlideCritique['checks'] = {
  legible: true,
  noOverlap: true,
  noOverflow: true,
  imageRelevant: true,
  rtlOk: true,
  hasFocalPoint: true,
}

let modelCalls: ModelCallRequest[] = []
let renderCalls: string[][] = []

function cannedCaller(outputs: string[]) {
  const queue = [...outputs]
  return async (req: ModelCallRequest): Promise<string> => {
    modelCalls.push(req)
    const out = queue.shift()
    if (out === undefined) throw new Error('test: canned output queue exhausted')
    return out
  }
}

function reset(outputs: string[]) {
  modelCalls = []
  renderCalls = []
  __setModelCallerForTests(cannedCaller(outputs))
  __setSlideRendererForTests(async (htmls) => {
    renderCalls.push(htmls)
    return htmls.map(() => PNG_B64)
  })
}

let passed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  } catch (err) {
    console.error(`  FAIL  ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

const HTML_CLEAN = '<div class="slide"><h1 data-role="title">כותרת</h1><img data-role="hero" src="x.png"/></div>'
const HTML_BROKEN = '<div class="slide"><h1 data-role="title">כותרת</h1><p data-role="body">גוף</p><div data-role="stat-0">73%</div></div>'

const CLEAN_JSON = JSON.stringify({ checks: ALL_TRUE, issues: [], fixes: [] })
const BROKEN_JSON = JSON.stringify({
  checks: { ...ALL_TRUE, noOverlap: false },
  issues: ['title overlaps stat-0'],
  fixes: [
    { role: 'title', cssPatch: 'top: 120px; max-width: 900px;', reason: 'clear stat-0' },
    { action: 'shrink-text', target: 'body', reason: 'body too dense' },
    { action: 'swap-image', target: 'hero', reason: 'image is generic stock' },
    { role: 'title', cssPatch: 'no colon here', reason: 'bad patch' }, // dropped: no prop:value
    { action: 'delete-slide', target: 'title', reason: 'nope' }, // dropped: unknown action
    { role: '', cssPatch: 'top: 1px', reason: 'x' }, // dropped: empty role
    { role: 'body', cssPatch: 'top: 1px', reason: '' }, // dropped: empty reason
  ],
})

// ─── critiqueSlides ─────────────────────────────────────

await test('happy path: clean + broken slide parse correctly', async () => {
  reset([CLEAN_JSON, BROKEN_JSON])
  const critiques = await critiqueSlides([HTML_CLEAN, HTML_BROKEN])
  assert.equal(critiques.length, 2)

  assert.equal(critiques[0].slideIndex, 0)
  assert.deepEqual(critiques[0].checks, ALL_TRUE)
  assert.deepEqual(critiques[0].issues, [])
  assert.deepEqual(critiques[0].fixes, [])

  assert.equal(critiques[1].slideIndex, 1)
  assert.equal(critiques[1].checks.noOverlap, false)
  assert.deepEqual(critiques[1].issues, ['title overlaps stat-0'])
  // 3 valid fixes survive, 4 malformed dropped
  assert.equal(critiques[1].fixes.length, 3)
  assert.deepEqual(critiques[1].fixes[0], { role: 'title', cssPatch: 'top: 120px; max-width: 900px;', reason: 'clear stat-0' })
  assert.deepEqual(critiques[1].fixes[1], { action: 'shrink-text', target: 'body', reason: 'body too dense' })
  assert.deepEqual(critiques[1].fixes[2], { action: 'swap-image', target: 'hero', reason: 'image is generic stock' })

  // renderer got the full batch once
  assert.equal(renderCalls.length, 1)
  assert.deepEqual(renderCalls[0], [HTML_CLEAN, HTML_BROKEN])

  // each model call carries the PNG + the checklist prompt with exemplars + data-roles
  assert.equal(modelCalls.length, 2)
  for (const call of modelCalls) {
    assert.ok(call.parts.some((p) => 'inlineData' in p && p.inlineData.data === PNG_B64))
  }
  const prompt0 = (modelCalls[0].parts.find((p) => 'text' in p) as { text: string }).text
  assert.ok(prompt0.includes('EXAMPLE 1'))
  assert.ok(prompt0.includes('EXAMPLE 2'))
  assert.ok(prompt0.includes('true/false only'))
  assert.ok(prompt0.includes('title, hero')) // data-roles extracted from slide 0 html
  const prompt1 = (modelCalls[1].parts.find((p) => 'text' in p) as { text: string }).text
  assert.ok(prompt1.includes('title, body, stat-0'))
})

await test('model env override is used', async () => {
  process.env.GEMINI_REASONING_MODEL = 'test-critic-model'
  reset([CLEAN_JSON])
  await critiqueSlides([HTML_CLEAN])
  assert.equal(modelCalls[0].model, 'test-critic-model')
  delete process.env.GEMINI_REASONING_MODEL
})

await test('invalid model output → all-true, no fixes (do no harm)', async () => {
  reset(['total garbage, not json'])
  const [c] = await critiqueSlides([HTML_CLEAN])
  assert.deepEqual(c.checks, ALL_TRUE)
  assert.deepEqual(c.fixes, [])
  assert.ok(c.issues.some((s) => s.includes('unchecked: invalid critic output')))
})

await test('checks with non-boolean value → all-true (schema-valid ≠ correct)', async () => {
  reset([JSON.stringify({ checks: { ...ALL_TRUE, legible: 'yes' }, issues: [], fixes: [] })])
  const [c] = await critiqueSlides([HTML_CLEAN])
  assert.deepEqual(c.checks, ALL_TRUE)
  assert.ok(c.issues.some((s) => s.includes('invalid critic output')))
})

await test('fixes with all-true checks are dropped (no fail verdict → no action)', async () => {
  reset([JSON.stringify({
    checks: ALL_TRUE,
    issues: [],
    fixes: [{ role: 'title', cssPatch: 'top: 0px', reason: 'contradiction' }],
  })])
  const [c] = await critiqueSlides([HTML_CLEAN])
  assert.deepEqual(c.fixes, [])
})

await test('model caller throws → all-true + critic unavailable (no throw)', async () => {
  modelCalls = []
  renderCalls = []
  __setModelCallerForTests(async () => { throw new Error('403 blocked host') })
  __setSlideRendererForTests(async (htmls) => htmls.map(() => PNG_B64))
  const [c] = await critiqueSlides([HTML_CLEAN])
  assert.deepEqual(c.checks, ALL_TRUE)
  assert.ok(c.issues.some((s) => s.includes('unchecked: critic unavailable') && s.includes('403 blocked host')))
})

await test('budgetMs 0 → everything unchecked, renderer + model never called', async () => {
  reset([CLEAN_JSON])
  const critiques = await critiqueSlides([HTML_CLEAN, HTML_BROKEN], { budgetMs: 0 })
  assert.equal(critiques.length, 2)
  for (const c of critiques) {
    assert.deepEqual(c.checks, ALL_TRUE)
    assert.ok(c.issues.some((s) => s.startsWith('unchecked:')))
    assert.deepEqual(c.fixes, [])
  }
  assert.equal(renderCalls.length, 0)
  assert.equal(modelCalls.length, 0)
})

await test('maxSlides 1 of 3 → only first rendered/checked, rest marked unchecked', async () => {
  reset([CLEAN_JSON])
  const critiques = await critiqueSlides([HTML_CLEAN, HTML_BROKEN, HTML_CLEAN], { maxSlides: 1 })
  assert.equal(critiques.length, 3)
  assert.deepEqual(critiques[0].issues, [])
  assert.ok(critiques[1].issues.some((s) => s.includes('maxSlides limit')))
  assert.ok(critiques[2].issues.some((s) => s.includes('maxSlides limit')))
  assert.deepEqual(renderCalls[0], [HTML_CLEAN])
  assert.equal(modelCalls.length, 1)
})

await test('renderer throws → all slides unchecked with render-failed note', async () => {
  modelCalls = []
  __setModelCallerForTests(cannedCaller([]))
  __setSlideRendererForTests(async () => { throw new Error('chrome not found') })
  const critiques = await critiqueSlides([HTML_CLEAN, HTML_BROKEN])
  for (const c of critiques) {
    assert.deepEqual(c.checks, ALL_TRUE)
    assert.ok(c.issues.some((s) => s.includes('unchecked: render failed') && s.includes('chrome not found')))
  }
  assert.equal(modelCalls.length, 0)
})

await test('empty input → empty output', async () => {
  reset([])
  assert.deepEqual(await critiqueSlides([]), [])
})

// ─── applyAutoFixes ─────────────────────────────────────

function makeSlide(): StructuredSlide {
  return {
    slideType: 'insight',
    layout: 'split-image-text',
    slots: {
      image: 'https://example.com/product.png',
      imageSide: 'left',
      title: 'כותרת',
      bodyText: 'גוף הטקסט',
    },
    elementStyles: {
      title: 'left: 120px; font-size: 100px;',
      body: 'top: 600px;',
    },
  }
}

function critique(partial: Partial<SlideCritique>): SlideCritique {
  return { slideIndex: 0, checks: ALL_TRUE, issues: [], fixes: [], ...partial }
}

await test('cssPatch merges into existing elementStyles (patch wins on conflict)', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    checks: { ...ALL_TRUE, noOverlap: false },
    issues: ['title overlaps stat'],
    fixes: [{ role: 'title', cssPatch: 'top: 40px; font-size: 80px', reason: 'clear overlap' }],
  }))
  const title = slide.elementStyles!.title
  assert.ok(title.includes('left: 120px'))    // kept from base
  assert.ok(title.includes('top: 40px'))      // added by patch
  assert.ok(title.includes('font-size: 80px')) // patch wins
  assert.ok(!title.includes('100px'))
  assert.equal(applied.length, 1)
  assert.ok(applied[0].includes('title'))
  // untouched roles survive
  assert.equal(slide.elementStyles!.body, 'top: 600px;')
})

await test('cssPatch creates a new elementStyles entry for an unseen role', () => {
  const { slide } = applyAutoFixes(makeSlide(), critique({
    checks: { ...ALL_TRUE, noOverflow: false },
    fixes: [{ role: 'eyebrow', cssPatch: 'max-width: 400px;', reason: 'clip' }],
  }))
  assert.equal(slide.elementStyles!.eyebrow, 'max-width: 400px;')
})

await test('shrink-text reduces existing px font-size by ~15%', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    checks: { ...ALL_TRUE, noOverflow: false },
    fixes: [{ action: 'shrink-text', target: 'title', reason: 'overflows' }],
  }))
  assert.ok(slide.elementStyles!.title.includes('font-size: 85px')) // 100 * 0.85
  assert.equal(applied.length, 1)
  assert.ok(applied[0].includes('100px → 85px'))
})

await test('shrink-text without an explicit px font-size is NOT applied (surfaced instead)', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    checks: { ...ALL_TRUE, noOverflow: false },
    fixes: [{ action: 'shrink-text', target: 'body', reason: 'too dense' }],
  }))
  assert.equal(slide.elementStyles!.body, 'top: 600px;')
  assert.deepEqual(applied, [])
  assert.equal(slide.meta?.validation?.layout?.status, 'issues')
  assert.ok(slide.meta!.validation!.layout!.issues!.some((s) => s.includes('shrink-text → body')))
})

await test('swap-image is NEVER applied — surfaced in meta.validation.layout', () => {
  const original = makeSlide()
  const { slide, applied } = applyAutoFixes(original, critique({
    checks: { ...ALL_TRUE, imageRelevant: false },
    issues: ['image is a generic stock scene'],
    fixes: [{ action: 'swap-image', target: 'hero', reason: 'not the brand product' }],
  }))
  assert.deepEqual(applied, [])
  assert.deepEqual(slide.slots, original.slots) // image untouched
  assert.deepEqual(slide.elementStyles, original.elementStyles)
  assert.equal(slide.meta?.validation?.layout?.status, 'issues')
  const issues = slide.meta!.validation!.layout!.issues!
  assert.ok(issues.some((s) => s.includes('swap-image → hero') && s.includes('not the brand product')))
  assert.ok(issues.some((s) => s.includes('generic stock scene'))) // critique issues carried over
  assert.ok(slide.meta!.validation!.layout!.checkedAt)
})

await test('recolor is NEVER applied — surfaced in meta.validation.layout', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    checks: { ...ALL_TRUE, legible: false },
    fixes: [{ action: 'recolor', target: 'title', reason: 'low contrast on image' }],
  }))
  assert.deepEqual(applied, [])
  assert.equal(slide.elementStyles!.title, 'left: 120px; font-size: 100px;')
  assert.ok(slide.meta!.validation!.layout!.issues!.some((s) => s.includes('recolor → title')))
})

await test('clean critique → layout status ok, nothing applied', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({}))
  assert.deepEqual(applied, [])
  assert.equal(slide.meta?.validation?.layout?.status, 'ok')
  assert.equal(slide.meta?.validation?.layout?.issues, undefined)
  assert.ok(slide.meta?.validation?.layout?.checkedAt)
})

await test('fixes are ignored when all checks pass (no fail verdict → no action)', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    fixes: [{ role: 'title', cssPatch: 'top: 0px;', reason: 'contradiction' }],
  }))
  assert.deepEqual(applied, [])
  assert.equal(slide.elementStyles!.title, 'left: 120px; font-size: 100px;')
  assert.equal(slide.meta?.validation?.layout?.status, 'ok')
})

await test('unchecked critique leaves meta untouched (no false "ok")', () => {
  const { slide, applied } = applyAutoFixes(makeSlide(), critique({
    issues: ['unchecked: budget exhausted'],
  }))
  assert.deepEqual(applied, [])
  assert.equal(slide.meta, undefined)
})

await test('existing meta.validation entries are preserved on merge', () => {
  const base = makeSlide()
  base.meta = { validation: { source: { status: 'verified', reasoning: 'found', checkedAt: 'x' } } }
  const { slide } = applyAutoFixes(base, critique({
    checks: { ...ALL_TRUE, noOverlap: false },
    fixes: [{ action: 'swap-image', target: 'hero', reason: 'r' }],
  }))
  assert.equal(slide.meta?.validation?.source?.status, 'verified')
  assert.equal(slide.meta?.validation?.layout?.status, 'issues')
})

await test('input slide is not mutated', () => {
  const original = makeSlide()
  const snapshot = JSON.parse(JSON.stringify(original))
  applyAutoFixes(original, critique({
    checks: { ...ALL_TRUE, noOverlap: false },
    issues: ['x'],
    fixes: [
      { role: 'title', cssPatch: 'top: 0px;', reason: 'r' },
      { action: 'shrink-text', target: 'title', reason: 'r' },
      { action: 'swap-image', target: 'hero', reason: 'r' },
    ],
  }))
  assert.deepEqual(original, snapshot)
})

__setModelCallerForTests(null)
__setSlideRendererForTests(null)
console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
