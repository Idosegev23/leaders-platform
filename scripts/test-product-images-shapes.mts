/**
 * Mock-shape tests for src/lib/brand/product-images.ts (spec C2).
 *
 * Exercises pool building / filtering / priority / caps / status mapping /
 * fallback via the injectable binary checker — NO real Gemini calls.
 *
 * Run: npx tsx scripts/test-product-images-shapes.mts
 */
import assert from 'node:assert/strict'

const { collectProductImages, __setBinaryCheckerForTests } = await import(
  '../src/lib/brand/product-images'
)
type CheckerInput = { imageUrl?: string; imageBase64?: string; question: string }

let calls: CheckerInput[] = []

/** Checker answering from a url → verdict map (default: yes). */
function cannedChecker(
  map: Record<string, { verdict: 'yes' | 'no'; reasoning: string }> = {},
) {
  return async (input: CheckerInput) => {
    calls.push(input)
    return map[input.imageUrl ?? ''] ?? { verdict: 'yes' as const, reasoning: 'canned yes' }
  }
}

function reset(map?: Record<string, { verdict: 'yes' | 'no'; reasoning: string }>) {
  calls = []
  __setBinaryCheckerForTests(cannedChecker(map))
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

const W1 = 'https://cdn.example.com/wizard-1.jpg'
const W2 = 'https://cdn.example.com/wizard-2.png'
const P = (n: number) => `https://shop.example.com/product-${n}.jpg`

// ─── Pool priority + caps ───────────────────────────────

await test('wizard refs rank first; verified capped at 6', async () => {
  reset()
  const assets = await collectProductImages({
    brandName: 'KUNI',
    wizardReferenceImages: [W1, W2],
    scraped: { images: [1, 2, 3, 4, 5, 6, 7].map(P) },
  })
  assert.equal(assets.length, 6)
  assert.equal(assets[0].url, W1)
  assert.equal(assets[1].url, W2)
  assert.ok(assets.every((a) => a.status === 'verified' && a.checkedAt))
})

await test('candidate pool capped at 15 (checker called ≤15 times)', async () => {
  reset()
  await collectProductImages({
    brandName: 'B',
    scraped: { images: Array.from({ length: 40 }, (_, i) => P(i)) },
  })
  assert.equal(calls.length, 15)
})

await test('dedupe incl. &amp; entity normalization', async () => {
  reset()
  const assets = await collectProductImages({
    brandName: 'B',
    wizardReferenceImages: ['https://x.co/a.jpg?v=1&width=900'],
    scraped: {
      images: ['https://x.co/a.jpg?v=1&amp;width=900', 'https://x.co/a.jpg?v=1&width=900'],
      ogImage: 'https://x.co/a.jpg?v=1&amp;width=900',
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(assets.length, 1)
  assert.equal(assets[0].url, 'https://x.co/a.jpg?v=1&width=900')
})

// ─── Candidate filtering ────────────────────────────────

await test('non-image extensions / non-http schemes filtered out', async () => {
  reset()
  const assets = await collectProductImages({
    brandName: 'B',
    scraped: {
      images: [
        'https://x.co/logo.svg',
        'https://x.co/favicon.ico',
        'https://x.co/spec.pdf',
        'https://x.co/anim.gif',
        'data:image/png;base64,AAAA',
        '/relative/path.jpg',
        'https://x.co/real.jpg',
        'https://x.co/extensionless-cdn-asset', // kept — content-type checked downstream
      ],
    },
  })
  const urls = assets.map((a) => a.url)
  assert.deepEqual(urls, ['https://x.co/real.jpg', 'https://x.co/extensionless-cdn-asset'])
})

await test('empty pool → []', async () => {
  reset()
  const assets = await collectProductImages({ brandName: 'B' })
  assert.deepEqual(assets, [])
  assert.equal(calls.length, 0)
})

// ─── Status mapping + fallback ──────────────────────────

await test('no + transient reasoning → unverified; plain no → rejected; fallback tops up to 3', async () => {
  reset({
    [P(1)]: { verdict: 'yes', reasoning: 'the product' },
    [P(2)]: { verdict: 'no', reasoning: 'image fetch failed: HTTP 404' },
    [P(3)]: { verdict: 'no', reasoning: 'team photo, not a product' },
    [P(4)]: { verdict: 'no', reasoning: 'verification unavailable: 403' },
  })
  const assets = await collectProductImages({
    brandName: 'B',
    scraped: { images: [P(1), P(2), P(3), P(4)] },
  })
  // 1 verified < 2 → top up to 3 with transient-failure candidates first.
  assert.equal(assets.length, 3)
  assert.equal(assets[0].url, P(1))
  assert.equal(assets[0].status, 'verified')
  assert.deepEqual(assets.slice(1).map((a) => a.url), [P(2), P(4)]) // before rejected P(3)
  assert.ok(assets.slice(1).every((a) => a.status === 'unverified'))
})

await test('affirmatively rejected candidates are used as last-resort fallback', async () => {
  reset({
    [P(1)]: { verdict: 'no', reasoning: 'banner graphic' },
    [P(2)]: { verdict: 'no', reasoning: 'stock scene' },
  })
  const assets = await collectProductImages({ brandName: 'B', scraped: { images: [P(1), P(2)] } })
  assert.equal(assets.length, 2)
  assert.ok(assets.every((a) => a.status === 'unverified'))
  assert.equal(assets[1].reasoning, 'stock scene')
})

await test('enough verified → no fallback material appended', async () => {
  reset({ [P(3)]: { verdict: 'no', reasoning: 'people photo' } })
  const assets = await collectProductImages({
    brandName: 'B',
    scraped: { images: [P(1), P(2), P(3)] },
  })
  assert.equal(assets.length, 2)
  assert.ok(assets.every((a) => a.status === 'verified'))
})

await test('checker throwing never propagates → unverified', async () => {
  calls = []
  __setBinaryCheckerForTests(async () => {
    throw new Error('boom')
  })
  const assets = await collectProductImages({ brandName: 'B', scraped: { images: [P(1)] } })
  assert.equal(assets.length, 1)
  assert.equal(assets[0].status, 'unverified')
  assert.ok(assets[0].reasoning?.includes('verification unavailable: boom'))
})

// ─── Question construction ──────────────────────────────

await test('question carries brand name + productContext', async () => {
  reset()
  await collectProductImages({
    brandName: 'KUNI',
    productContext: 'reed diffusers',
    scraped: { images: [P(1)] },
  })
  assert.ok(calls[0].question.includes("KUNI's actual product (reed diffusers)"))
})

await test('question without productContext still well-formed', async () => {
  reset()
  await collectProductImages({ brandName: 'KUNI', scraped: { images: [P(1)] } })
  assert.ok(calls[0].question.includes("KUNI's actual product?"))
})

__setBinaryCheckerForTests(null)
console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
