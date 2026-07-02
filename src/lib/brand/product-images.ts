/**
 * Product-image collection + verification (art-director engine, C2).
 *
 * Builds a candidate pool from wizard-uploaded reference images (highest
 * priority, user-provided ground truth) + scraped site imagery, then runs a
 * binary VLM check per candidate ("does this actually show the brand's
 * product?"). Verified photos feed `_brandAssets.productImages` and seed
 * scene generation (C3).
 *
 * Failure policy: individual candidate failures never throw. A candidate
 * whose check could not run (image fetch / model error — see the reasoning
 * prefixes in ./vlm-verify) stays 'unverified'; a candidate the VLM
 * affirmatively said is NOT the product is 'rejected'. If fewer than 2
 * candidates verify, the top non-verified candidates are returned with
 * status 'unverified' so downstream still has material (flag-in-editor,
 * never block).
 */

import type { VerifiedAsset } from '@/lib/brand/types'
import { vlmBinaryCheck } from '@/lib/brand/vlm-verify'

// ─── Types ──────────────────────────────────────────────

export interface ProductImagesInput {
  brandName: string
  /** What the product actually is ("moisturizing skin cream"…), from wizard/brief. */
  productContext?: string
  scraped?: { heroImages?: string[]; ogImage?: string; images?: string[] }
  /** Wizard creative/deliverables referenceImages URLs — top pool priority. */
  wizardReferenceImages?: string[]
}

// ─── Tuning ─────────────────────────────────────────────

const MAX_CANDIDATES = 15
const MAX_VERIFIED = 6
/** Below this many verified, top up with unverified fallback material. */
const MIN_VERIFIED = 2
/** Total assets to aim for when falling back. */
const FALLBACK_TARGET_TOTAL = 3
const CONCURRENCY = 4

// ─── Candidate filtering ────────────────────────────────

// Extension-level pre-filter only; content-type is enforced downstream by
// vlm-verify's resolveImage (rejects non-image/* and SVG payloads).
const NON_IMAGE_EXT_RE =
  /\.(svg|gif|ico|pdf|json|xml|txt|html?|css|m?js|mp3|mp4|wav|webm|mov|avi|woff2?|ttf|otf|eot|zip)$/i

function isLikelyImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false // data:/blob:/relative
  try {
    return !NON_IMAGE_EXT_RE.test(new URL(url).pathname)
  } catch {
    return false
  }
}

// ─── Small concurrency pool ─────────────────────────────

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

// ─── Injectable checker (test seam) ─────────────────────
// NOTE: stubbing vlm-verify's model caller from a script does NOT reach this
// module under tsx (the entry-script ESM graph and this module's transitive
// CJS graph load vlm-verify twice) — so this module carries its own seam.

export type BinaryChecker = typeof vlmBinaryCheck

let binaryCheck: BinaryChecker = vlmBinaryCheck

/** Test seam: inject a canned checker; pass null to restore the real one. */
export function __setBinaryCheckerForTests(fn: BinaryChecker | null): void {
  binaryCheck = fn ?? vlmBinaryCheck
}

// ─── Verdict → status mapping ───────────────────────────

// vlm-verify reasoning prefixes that mean "check didn't run", not "VLM said no".
const TRANSIENT_PREFIXES = ['image fetch failed', 'verification unavailable', 'invalid model output']

function isTransientFailure(reasoning: string): boolean {
  return TRANSIENT_PREFIXES.some((p) => reasoning.startsWith(p))
}

// ─── Public API ─────────────────────────────────────────

/**
 * Collect + VLM-verify real product photos for a brand.
 * Never throws for candidate-level failures; returns [] when nothing usable.
 */
export async function collectProductImages(
  input: ProductImagesInput,
): Promise<VerifiedAsset[]> {
  const brandName = input.brandName?.trim() || 'the brand'

  // Pool: wizard refs first (user ground truth), then scraped product-ish
  // images, then the curated og:image, then hero/banner shots. Order matters
  // — it is both the verification priority and the fallback ranking.
  const seen = new Set<string>()
  const pool: string[] = []
  const add = (raw: string | undefined | null) => {
    // Regex-scraped URLs often carry HTML entities ("?v=1&amp;width=900").
    const url = raw?.trim().replace(/&amp;/g, '&')
    if (!url || seen.has(url) || !isLikelyImageUrl(url)) return
    seen.add(url)
    if (pool.length < MAX_CANDIDATES) pool.push(url)
  }
  for (const url of input.wizardReferenceImages ?? []) add(url)
  for (const url of input.scraped?.images ?? []) add(url)
  add(input.scraped?.ogImage)
  for (const url of input.scraped?.heroImages ?? []) add(url)

  if (pool.length === 0) return []

  const subject = input.productContext?.trim()
    ? `actual product (${input.productContext.trim()})`
    : 'actual product'
  const question =
    `Does this image clearly show ${brandName}'s ${subject}? ` +
    'Answer "yes" only if the physical product itself is clearly visible in the image — ' +
    'NOT a team/people photo, website banner, logo-only graphic, abstract illustration, or generic stock scene.'

  const checked = await mapPool(pool, CONCURRENCY, async (url) => {
    const checkedAt = new Date().toISOString()
    try {
      const { verdict, reasoning } = await binaryCheck({ imageUrl: url, question })
      const status: VerifiedAsset['status'] =
        verdict === 'yes'
          ? 'verified'
          : isTransientFailure(reasoning)
            ? 'unverified'
            : 'rejected'
      return { url, status, reasoning, checkedAt } satisfies VerifiedAsset
    } catch (err) {
      // Belt-and-braces: vlmBinaryCheck only throws on programmer errors.
      const msg = err instanceof Error ? err.message : String(err)
      return {
        url,
        status: 'unverified',
        reasoning: `verification unavailable: ${msg}`,
        checkedAt,
      } satisfies VerifiedAsset
    }
  })

  // Pool order is preserved → verified wizard refs naturally rank first.
  const verified = checked.filter((c) => c.status === 'verified').slice(0, MAX_VERIFIED)
  if (verified.length >= MIN_VERIFIED) return verified

  // Too few verified — top up with the best non-verified candidates so scene
  // generation still has material. Prefer checks that couldn't run over ones
  // the VLM affirmatively rejected; reasoning is kept for the editor flag.
  const fallbackPool = [
    ...checked.filter((c) => c.status === 'unverified'),
    ...checked.filter((c) => c.status === 'rejected'),
  ]
  const fallback = fallbackPool
    .slice(0, Math.max(0, FALLBACK_TARGET_TOTAL - verified.length))
    .map((c): VerifiedAsset => ({ ...c, status: 'unverified' }))

  return [...verified, ...fallback]
}
