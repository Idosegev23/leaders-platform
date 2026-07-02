/**
 * Mock-shape tests for src/lib/brand/scene-generator.ts.
 *
 * Exercises prompt construction, ref capping, retry/verify flow and error
 * paths with canned responses via the injectable image generator, uploader
 * and vlm-verify model caller — NO real Gemini calls (the API host is
 * blocked from this machine anyway). Reference fetching runs against a
 * local in-process HTTP server.
 *
 * Run: npx tsx scripts/test-scene-generator-shapes.mts
 */
import assert from 'node:assert/strict'
import http from 'node:http'

// IMPORT ORDER IS LOAD-BEARING under tsx: vlm-verify MUST be statically
// imported BEFORE scene-generator, and neither may use `await import` —
// otherwise tsx instantiates a second copy of vlm-verify and the model-caller
// seam injection misses the instance scene-generator actually calls.
import {
  __setModelCallerForTests,
  clearVlmVerifyCache,
  type ModelCallRequest,
} from '../src/lib/brand/vlm-verify'
import {
  generateBrandScene,
  __setImageGeneratorForTests,
  __setSceneUploaderForTests,
  type ImageGenRequest,
  type SceneRequest,
} from '../src/lib/brand/scene-generator'

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_B64, 'base64')

// ─── Local ref server (no external network needed) ──────

let refRequestCount = 0
const server = http.createServer((req, res) => {
  refRequestCount++
  if (req.url?.includes('missing')) {
    res.writeHead(404).end('not found')
    return
  }
  if (req.url?.includes('page.html')) {
    res.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>')
    return
  }
  res.writeHead(200, { 'content-type': 'image/png' }).end(PNG_BYTES)
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const addr = server.address()
if (!addr || typeof addr === 'string') throw new Error('test: server address unavailable')
const BASE = `http://127.0.0.1:${addr.port}`
const refUrls = (n: number, name = 'ref') =>
  Array.from({ length: n }, (_, i) => `${BASE}/${name}${i}.png`)

// ─── Injectable seams ───────────────────────────────────

let genCalls: ImageGenRequest[] = []
let genQueue: Array<{ base64: string; mimeType: string } | null | Error> = []
__setImageGeneratorForTests(async (req) => {
  genCalls.push(req)
  const next = genQueue.shift()
  if (next === undefined) throw new Error('test: gen queue exhausted')
  if (next instanceof Error) throw next
  return next
})

let uploadCalls: Array<{ path: string; bytes: number; contentType: string }> = []
let uploadQueue: Array<string | null> = []
__setSceneUploaderForTests(async (path, body, contentType) => {
  uploadCalls.push({ path, bytes: body.byteLength, contentType })
  const next = uploadQueue.shift()
  if (next === undefined) throw new Error('test: upload queue exhausted')
  return next
})

let vlmCalls: ModelCallRequest[] = []
let vlmQueue: Array<string | Error> = []
__setModelCallerForTests(async (req) => {
  vlmCalls.push(req)
  const next = vlmQueue.shift()
  if (next === undefined) throw new Error('test: vlm queue exhausted')
  if (next instanceof Error) throw next
  return next
})

const IDENTIFY_OK = '{"identified":"An orange KUNI cream tube on a marble bathroom shelf"}'
const JUDGE_PASS = '{"verdict":"pass","reasoning":"Same KUNI tube as the references."}'
const JUDGE_FAIL = '{"verdict":"fail","reasoning":"Label artwork differs from the references."}'

function reset(opts: {
  gen?: Array<{ base64: string; mimeType: string } | null | Error>
  upload?: Array<string | null>
  vlm?: Array<string | Error>
}) {
  genCalls = []
  genQueue = opts.gen ?? []
  uploadCalls = []
  uploadQueue = opts.upload ?? []
  vlmCalls = []
  vlmQueue = opts.vlm ?? []
  refRequestCount = 0
  clearVlmVerifyCache()
}

// Distinct base64 payloads so vlm-verify's cache never collides across attempts.
let genCounter = 0
function freshImage() {
  genCounter++
  return {
    base64: Buffer.from(`fake-image-bytes-${genCounter}`).toString('base64'),
    mimeType: 'image/png',
  }
}

function baseRequest(overrides: Partial<SceneRequest> = {}): SceneRequest {
  return {
    brandName: 'KUNI Care',
    forSlideType: 'hero-cover',
    artDirection: 'warm morning light, editorial minimalism, soft shadows',
    designSystem: { colors: { primary: '#FF6B00', accent: '#123456' } },
    productRefs: refUrls(3),
    documentId: 'doc-12345678-abcd',
    ...overrides,
  }
}

function promptText(call: ImageGenRequest): string {
  // The generation prompt is the LAST text part (after per-ref captions).
  const texts = call.parts.filter((p): p is { text: string } => 'text' in p)
  return texts[texts.length - 1]?.text ?? ''
}

function inlineParts(call: ImageGenRequest) {
  return call.parts.filter((p) => 'inlineData' in p)
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

// ─── Happy path + prompt construction ───────────────────

await test('happy path: verified asset, text-free prompt, palette + art direction present', async () => {
  reset({
    gen: [freshImage()],
    upload: ['https://cdn.example.com/assets/proposals/KUNICare/scenes/hero-cover-abc123.png'],
    vlm: [IDENTIFY_OK, JUDGE_PASS],
  })
  const asset = await generateBrandScene(baseRequest())
  assert.ok(asset)
  assert.equal(asset.status, 'verified')
  assert.equal(asset.url, 'https://cdn.example.com/assets/proposals/KUNICare/scenes/hero-cover-abc123.png')
  assert.equal(asset.forSlideType, 'hero-cover')
  assert.equal(asset.reasoning, 'Same KUNI tube as the references.')
  assert.ok(asset.checkedAt)
  assert.deepEqual(asset.referenceUrls, refUrls(3))

  assert.equal(genCalls.length, 1)
  const prompt = promptText(genCalls[0])
  assert.equal(asset.prompt, prompt)
  // Text-free mandate (Hebrew not supported in image gen → HTML layer owns copy).
  assert.ok(/no text/i.test(prompt))
  assert.ok(/no letters/i.test(prompt))
  assert.ok(/no logos overlaid/i.test(prompt))
  assert.ok(/no watermarks/i.test(prompt))
  // Brand + slide + art direction + palette + aspect.
  assert.ok(prompt.includes('KUNI Care'))
  assert.ok(prompt.includes('hero-cover'))
  assert.ok(prompt.includes('warm morning light, editorial minimalism'))
  assert.ok(prompt.includes('#FF6B00'))
  assert.ok(prompt.includes('#123456'))
  assert.ok(prompt.includes('16:9'))
  // Base attempt must NOT carry the strengthened retry clause.
  assert.ok(!prompt.includes('CRITICAL FIDELITY'))
  // Refs passed inline, request shape 16:9.
  assert.equal(inlineParts(genCalls[0]).length, 3)
  assert.equal(genCalls[0].aspectRatio, '16:9')
  // Upload path shape (ASCII brand prefix, scenes/ dir, sanitized slide type).
  assert.equal(uploadCalls.length, 1)
  assert.match(uploadCalls[0].path, /^proposals\/KUNICare\/scenes\/hero-cover-[a-z0-9]+\.png$/)
  assert.equal(uploadCalls[0].contentType, 'image/png')
})

await test('refs capped at 6 (of 9 supplied), fetch stops after 6 successes', async () => {
  reset({
    gen: [freshImage()],
    upload: ['https://cdn.example.com/scene.png'],
    vlm: [IDENTIFY_OK, JUDGE_PASS],
  })
  const asset = await generateBrandScene(baseRequest({ productRefs: refUrls(9) }))
  assert.ok(asset)
  assert.equal(inlineParts(genCalls[0]).length, 6)
  assert.equal(asset.referenceUrls?.length, 6)
  assert.deepEqual(asset.referenceUrls, refUrls(6))
  assert.equal(refRequestCount, 6) // stops fetching once capped
})

await test('unfetchable refs are skipped, fetchable ones still used', async () => {
  reset({
    gen: [freshImage()],
    upload: ['https://cdn.example.com/scene.png'],
    vlm: [IDENTIFY_OK, JUDGE_PASS],
  })
  const asset = await generateBrandScene(
    baseRequest({
      productRefs: [`${BASE}/missing1.png`, `${BASE}/page.html`, `${BASE}/good.png`],
    }),
  )
  assert.ok(asset)
  assert.equal(inlineParts(genCalls[0]).length, 1)
  assert.deepEqual(asset.referenceUrls, [`${BASE}/good.png`])
})

await test('model comes from GEMINI_IMAGE_MODEL env, docs-confirmed fallback otherwise', async () => {
  process.env.GEMINI_IMAGE_MODEL = 'test-image-model'
  reset({ gen: [freshImage()], upload: ['https://x/1.png'], vlm: [IDENTIFY_OK, JUDGE_PASS] })
  await generateBrandScene(baseRequest())
  assert.equal(genCalls[0].model, 'test-image-model')

  delete process.env.GEMINI_IMAGE_MODEL
  reset({ gen: [freshImage()], upload: ['https://x/2.png'], vlm: [IDENTIFY_OK, JUDGE_PASS] })
  await generateBrandScene(baseRequest())
  assert.equal(genCalls[0].model, 'gemini-3-pro-image-preview')
})

// ─── Verification retry flow ────────────────────────────

await test('fidelity fail → ONE retry with strengthened wording → verified', async () => {
  reset({
    gen: [freshImage(), freshImage()],
    upload: ['https://x/a.png', 'https://x/b.png'],
    vlm: [IDENTIFY_OK, JUDGE_FAIL, IDENTIFY_OK, JUDGE_PASS],
  })
  const asset = await generateBrandScene(baseRequest())
  assert.ok(asset)
  assert.equal(asset.status, 'verified')
  assert.equal(asset.url, 'https://x/b.png') // retry's upload
  assert.equal(genCalls.length, 2)
  assert.ok(!promptText(genCalls[0]).includes('CRITICAL FIDELITY'))
  assert.ok(promptText(genCalls[1]).includes('CRITICAL FIDELITY'))
  assert.ok(/no text/i.test(promptText(genCalls[1]))) // retry keeps text-free clause
  assert.equal(asset.prompt, promptText(genCalls[1]))
})

await test('fidelity fails twice → unverified asset (never null, never a 3rd attempt)', async () => {
  reset({
    gen: [freshImage(), freshImage()],
    upload: ['https://x/a.png', 'https://x/b.png'],
    vlm: [IDENTIFY_OK, JUDGE_FAIL, IDENTIFY_OK, JUDGE_FAIL],
  })
  const asset = await generateBrandScene(baseRequest())
  assert.ok(asset)
  assert.equal(asset.status, 'unverified')
  assert.equal(asset.url, 'https://x/b.png')
  assert.equal(asset.reasoning, 'Label artwork differs from the references.')
  assert.equal(genCalls.length, 2)
})

await test('verification unavailable (API down) → unverified WITHOUT regen retry', async () => {
  reset({
    gen: [freshImage()],
    upload: ['https://x/a.png'],
    vlm: [new Error('403 blocked host')],
  })
  const asset = await generateBrandScene(baseRequest())
  assert.ok(asset)
  assert.equal(asset.status, 'unverified')
  assert.ok(asset.reasoning?.includes('verification unavailable'))
  assert.equal(genCalls.length, 1) // transient check failure ≠ bad image
})

await test('retry generation fails → falls back to attempt-1 asset, unverified', async () => {
  reset({
    gen: [freshImage(), null],
    upload: ['https://x/a.png'],
    vlm: [IDENTIFY_OK, JUDGE_FAIL],
  })
  const asset = await generateBrandScene(baseRequest())
  assert.ok(asset)
  assert.equal(asset.status, 'unverified')
  assert.equal(asset.url, 'https://x/a.png')
  assert.equal(genCalls.length, 2)
})

// ─── Error paths → null (caller falls back to real photos) ──

await test('generator returns null → null, uploader never called', async () => {
  reset({ gen: [null], upload: [], vlm: [] })
  const asset = await generateBrandScene(baseRequest())
  assert.equal(asset, null)
  assert.equal(uploadCalls.length, 0)
})

await test('generator throws → null (error swallowed)', async () => {
  reset({ gen: [new Error('quota exceeded')], upload: [], vlm: [] })
  const asset = await generateBrandScene(baseRequest())
  assert.equal(asset, null)
})

await test('upload fails → null, no verification attempted', async () => {
  reset({ gen: [freshImage()], upload: [null], vlm: [] })
  const asset = await generateBrandScene(baseRequest())
  assert.equal(asset, null)
  assert.equal(vlmCalls.length, 0)
})

await test('empty productRefs → null, generator never called', async () => {
  reset({ gen: [], upload: [], vlm: [] })
  const asset = await generateBrandScene(baseRequest({ productRefs: [] }))
  assert.equal(asset, null)
  assert.equal(genCalls.length, 0)
})

await test('all refs unfetchable → null, generator never called', async () => {
  reset({ gen: [], upload: [], vlm: [] })
  const asset = await generateBrandScene(
    baseRequest({ productRefs: [`${BASE}/missing1.png`, `${BASE}/missing2.png`] }),
  )
  assert.equal(asset, null)
  assert.equal(genCalls.length, 0)
})

await test('missing brandName/forSlideType → null (no throw)', async () => {
  reset({ gen: [], upload: [], vlm: [] })
  assert.equal(await generateBrandScene(baseRequest({ brandName: '  ' })), null)
  assert.equal(await generateBrandScene(baseRequest({ forSlideType: '' })), null)
  assert.equal(genCalls.length, 0)
})

// ─── Path sanitization ──────────────────────────────────

await test('Hebrew brand + odd slide type → ASCII-safe storage path', async () => {
  reset({
    gen: [freshImage()],
    upload: ['https://x/heb.png'],
    vlm: [IDENTIFY_OK, JUDGE_PASS],
  })
  const asset = await generateBrandScene(
    baseRequest({ brandName: 'קוני קר', forSlideType: 'full bleed / hero' }),
  )
  assert.ok(asset)
  // Non-ASCII brand collapses to the 'brand' fallback; slide type sanitized.
  assert.match(uploadCalls[0].path, /^proposals\/brand\/scenes\/full-bleed-hero-[a-z0-9]+\.png$/)
})

// ─── Cleanup ────────────────────────────────────────────

__setImageGeneratorForTests(null)
__setSceneUploaderForTests(null)
__setModelCallerForTests(null)
server.close()
console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
