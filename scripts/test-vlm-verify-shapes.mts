/**
 * Mock-shape tests for src/lib/brand/vlm-verify.ts.
 *
 * Exercises parsing/validation/memoization with canned model outputs via the
 * injectable model caller — NO real Gemini calls (the API host is blocked
 * from this machine anyway).
 *
 * Run: npx tsx scripts/test-vlm-verify-shapes.mts
 */
import assert from 'node:assert/strict'

const {
  vlmVerify,
  vlmBinaryCheck,
  __setModelCallerForTests,
  clearVlmVerifyCache,
} = await import('../src/lib/brand/vlm-verify')
type ModelCallRequest = import('../src/lib/brand/vlm-verify').ModelCallRequest

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let calls: ModelCallRequest[] = []

/** Queue of canned outputs; each modelCaller invocation shifts one. */
function cannedCaller(outputs: string[]) {
  const queue = [...outputs]
  return async (req: ModelCallRequest): Promise<string> => {
    calls.push(req)
    const out = queue.shift()
    if (out === undefined) throw new Error('test: canned output queue exhausted')
    return out
  }
}

function reset(outputs: string[]) {
  calls = []
  clearVlmVerifyCache()
  __setModelCallerForTests(cannedCaller(outputs))
}

let passed = 0
async function test(name: string, fn: () => Promise<void>) {
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

// ─── vlmVerify: happy path ──────────────────────────────

await test('two-phase pass: valid identify + valid judge', async () => {
  reset([
    '{"identified":"The Nike swoosh logo, high-resolution vector-style image"}',
    '{"verdict":"pass","reasoning":"Answer names the Nike logo explicitly."}',
  ])
  const v = await vlmVerify({
    imageBase64: PNG_B64,
    identifyPrompt: 'What brand is this logo? Is this a real logo or a favicon/placeholder?',
    expectation: 'The official logo of Nike (nike.com)',
  })
  assert.equal(v.verdict, 'pass')
  assert.equal(v.identified, 'The Nike swoosh logo, high-resolution vector-style image')
  assert.equal(v.reasoning, 'Answer names the Nike logo explicitly.')
  assert.equal(calls.length, 2)
  // Phase 1 must carry the image; Phase 2 must be text-only.
  assert.ok(calls[0].parts.some((p) => 'inlineData' in p))
  assert.ok(calls[1].parts.every((p) => 'text' in p))
  // Phase 2 prompt must embed the phase-1 answer + expectation.
  const judgeText = (calls[1].parts[0] as { text: string }).text
  assert.ok(judgeText.includes('Nike swoosh'))
  assert.ok(judgeText.includes('nike.com'))
})

await test('two-phase fail verdict propagates', async () => {
  reset([
    '{"identified":"A 16x16 blurry favicon with a generic letter K"}',
    '{"verdict":"fail","reasoning":"Favicon, not a real logo."}',
  ])
  const v = await vlmVerify({
    imageBase64: PNG_B64,
    identifyPrompt: 'What is this?',
    expectation: 'KUNI brand logo',
  })
  assert.equal(v.verdict, 'fail')
  assert.equal(v.reasoning, 'Favicon, not a real logo.')
})

// ─── vlmVerify: content-level validation (schema-valid ≠ correct) ──

await test('judge enum outside pass/fail → fail + invalid model output', async () => {
  reset([
    '{"identified":"Some logo"}',
    '{"verdict":"maybe","reasoning":"not sure"}', // schema-shaped but bad enum value
  ])
  const v = await vlmVerify({
    imageBase64: PNG_B64,
    identifyPrompt: 'q',
    expectation: 'e',
  })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('invalid model output'))
  assert.equal(v.identified, 'Some logo')
})

await test('judge returns non-JSON garbage → fail + invalid model output', async () => {
  reset(['{"identified":"Some logo"}', 'PASS! definitely a match'])
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('invalid model output'))
})

await test('identify returns garbage → fail without calling judge', async () => {
  reset(['not json at all'])
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('invalid model output'))
  assert.equal(calls.length, 1)
})

await test('identify returns empty identified → fail', async () => {
  reset(['{"identified":"   "}'])
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('invalid model output'))
})

await test('code-fenced JSON is parsed', async () => {
  reset([
    '```json\n{"identified":"Adidas trefoil logo"}\n```',
    '```json\n{"verdict":"pass","reasoning":"match"}\n```',
  ])
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'adidas' })
  assert.equal(v.verdict, 'pass')
  assert.equal(v.identified, 'Adidas trefoil logo')
})

await test('JSON with surrounding prose is parsed', async () => {
  reset([
    'Here is my answer: {"identified":"Coca-Cola script logo"} hope this helps',
    '{"verdict":"pass","reasoning":"match"}',
  ])
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'coca-cola' })
  assert.equal(v.verdict, 'pass')
  assert.equal(v.identified, 'Coca-Cola script logo')
})

// ─── vlmVerify: failure policy ──────────────────────────

await test('model caller throws → fail + verification unavailable (no throw)', async () => {
  calls = []
  clearVlmVerifyCache()
  __setModelCallerForTests(async () => {
    throw new Error('403 blocked host')
  })
  const v = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('verification unavailable'))
  assert.ok(v.reasoning.includes('403 blocked host'))
})

await test('unreachable imageUrl → fail + image fetch failed, model never called', async () => {
  reset([])
  const v = await vlmVerify({
    imageUrl: 'http://127.0.0.1:1/nope.png', // connection refused instantly
    identifyPrompt: 'q',
    expectation: 'e',
  })
  assert.equal(v.verdict, 'fail')
  assert.ok(v.reasoning.includes('image fetch failed'))
  assert.equal(calls.length, 0)
})

await test('missing image input → throws (programmer error)', async () => {
  reset([])
  await assert.rejects(
    () => vlmVerify({ identifyPrompt: 'q', expectation: 'e' }),
    /imageUrl or imageBase64/,
  )
})

await test('missing prompts → throws (programmer error)', async () => {
  reset([])
  await assert.rejects(
    () => vlmVerify({ imageBase64: PNG_B64, identifyPrompt: '', expectation: 'e' }),
    /identifyPrompt/,
  )
  await assert.rejects(
    () => vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: '  ' }),
    /expectation/,
  )
})

// ─── vlmVerify: memoization ─────────────────────────────

await test('identical verify calls are memoized (2 model calls total, not 4)', async () => {
  reset([
    '{"identified":"logo"}',
    '{"verdict":"pass","reasoning":"ok"}',
  ])
  const a = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  const b = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.deepEqual(a, b)
  assert.equal(calls.length, 2)
})

await test('different expectation is NOT served from cache', async () => {
  reset([
    '{"identified":"logo"}',
    '{"verdict":"pass","reasoning":"ok"}',
    '{"identified":"logo"}',
    '{"verdict":"fail","reasoning":"other brand"}',
  ])
  const a = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'brand A' })
  const b = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'brand B' })
  assert.equal(a.verdict, 'pass')
  assert.equal(b.verdict, 'fail')
  assert.equal(calls.length, 4)
})

await test('invalid-output results are not memoized (retry re-calls the model)', async () => {
  reset([
    'garbage',
    '{"identified":"logo"}',
    '{"verdict":"pass","reasoning":"ok"}',
  ])
  const a = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(a.verdict, 'fail')
  const b = await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(b.verdict, 'pass')
})

// ─── vlmBinaryCheck ─────────────────────────────────────

await test('binary yes', async () => {
  reset(['{"verdict":"yes","reasoning":"Product bottle clearly visible."}'])
  const r = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'Does this show the product?' })
  assert.equal(r.verdict, 'yes')
  assert.equal(r.reasoning, 'Product bottle clearly visible.')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].parts.some((p) => 'inlineData' in p))
})

await test('binary no', async () => {
  reset(['{"verdict":"no","reasoning":"Generic stock photo."}'])
  const r = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'Does this show the product?' })
  assert.equal(r.verdict, 'no')
})

await test('binary bad enum ("true") → no + invalid model output', async () => {
  reset(['{"verdict":"true","reasoning":"yes it does"}'])
  const r = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'q' })
  assert.equal(r.verdict, 'no')
  assert.ok(r.reasoning.includes('invalid model output'))
})

await test('binary garbage → no + invalid model output', async () => {
  reset(['[]'])
  const r = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'q' })
  assert.equal(r.verdict, 'no')
  assert.ok(r.reasoning.includes('invalid model output'))
})

await test('binary memoized by (image|question)', async () => {
  reset(['{"verdict":"yes","reasoning":"ok"}'])
  const a = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'same q' })
  const b = await vlmBinaryCheck({ imageBase64: PNG_B64, question: 'same q' })
  assert.deepEqual(a, b)
  assert.equal(calls.length, 1)
})

await test('binary missing question → throws (programmer error)', async () => {
  reset([])
  await assert.rejects(
    () => vlmBinaryCheck({ imageBase64: PNG_B64, question: '' }),
    /question/,
  )
})

// ─── Model routing ──────────────────────────────────────

await test('phase 1 uses reasoning model, phase 2 uses fast model', async () => {
  process.env.GEMINI_REASONING_MODEL = 'test-reasoning-model'
  process.env.GEMINI_FAST_MODEL = 'test-fast-model'
  reset([
    '{"identified":"logo"}',
    '{"verdict":"pass","reasoning":"ok"}',
  ])
  await vlmVerify({ imageBase64: PNG_B64, identifyPrompt: 'q', expectation: 'e' })
  assert.equal(calls[0].model, 'test-reasoning-model')
  assert.equal(calls[1].model, 'test-fast-model')
  delete process.env.GEMINI_REASONING_MODEL
  delete process.env.GEMINI_FAST_MODEL
})

__setModelCallerForTests(null)
console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
