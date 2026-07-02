/**
 * Logo acquisition chain v2 (art-director engine, C1).
 *
 * Replaces the dead-Clearbit chain in generate-visual-assets (Clearbit Logo
 * API DNS is gone since Dec 2025 — the old chain silently degraded to
 * favicon). Chain order, research-verified 2026:
 *
 *   1. scraped site logo
 *   2. Brandfetch CDN   (skipped when BRANDFETCH_CLIENT_ID is missing)
 *   3. Logo.dev         (skipped when LOGODEV_TOKEN is missing)
 *   4. scraped og:image
 *   5. scraped favicon  — last resort, NEVER 'verified'
 *
 * Candidates 1-4 pass through the two-phase VLM check (vlm-verify); the
 * first 'pass' wins → status 'verified'. If none pass, the best candidate
 * (first in chain order) is returned 'unverified' with the verifier's
 * reasoning — verification failures flag, they never block. Returns null
 * only when there are no candidates at all.
 */

import type { BrandLogoAsset, LogoSource } from '@/lib/brand/types'
import { vlmVerify } from '@/lib/brand/vlm-verify'

// ─── Types ──────────────────────────────────────────────

export interface LogoResolverInput {
  brandName: string
  domain?: string
  scraped?: { logoUrl?: string; ogImage?: string; favicon?: string }
}

interface LogoCandidate {
  url: string
  source: LogoSource
}

// ─── Injectable verifier (test seam) ────────────────────
// Gemini is unreachable from the dev sandbox; scripts stub the verifier.
// Same convention as vlm-verify's __setModelCallerForTests.

type Verifier = typeof vlmVerify
let verifier: Verifier = vlmVerify

/** Test seam: inject a canned verifier; pass null to restore the real one. */
export function __setVlmVerifierForTests(fn: Verifier | null): void {
  verifier = fn ?? vlmVerify
}

// ─── Domain normalization ───────────────────────────────

/**
 * 'https://x.co.il/path' → 'x.co.il'. Strips only the 'www.' prefix so
 * multi-part TLDs (.co.il) stay intact. Returns undefined on garbage input.
 */
export function normalizeDomain(input?: string | null): string | undefined {
  const raw = input?.trim()
  if (!raw) return undefined
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    // Reject non-domains ('logo', 'a b') that URL still parses as hostnames.
    if (!host.includes('.')) return undefined
    return host
  } catch {
    return undefined
  }
}

// ─── CDN source URLs (null when the env key is missing) ─

export function brandfetchUrl(domain?: string): string | null {
  const clientId = process.env.BRANDFETCH_CLIENT_ID
  if (!clientId || !domain) return null
  return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}?c=${encodeURIComponent(clientId)}`
}

export function logodevUrl(domain?: string): string | null {
  const token = process.env.LOGODEV_TOKEN
  if (!token || !domain) return null
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}`
}

// ─── HTTP probe (CDN sources only) ──────────────────────

const PROBE_TIMEOUT_MS = 8_000

/** True when the URL answers 200 with an image/* content-type. */
async function probeIsImage(url: string): Promise<boolean> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      const isImage =
        res.ok && (res.headers.get('content-type') ?? '').trim().toLowerCase().startsWith('image/')
      if (res.body) void res.body.cancel().catch(() => {})
      if (isImage) return true
      // Definitive miss on HEAD — no point retrying with GET.
      if (method === 'HEAD' && (res.status === 404 || res.status === 410)) return false
      // Otherwise (405/403/no content-type on HEAD…) fall through to GET.
    } catch {
      /* timeout / network error → retry with GET, then give up */
    }
  }
  return false
}

// ─── Resolver ───────────────────────────────────────────

export async function resolveBrandLogo(input: LogoResolverInput): Promise<BrandLogoAsset | null> {
  const brandName = input.brandName?.trim()
  if (!brandName) throw new TypeError('logo-resolver: brandName is required')

  const domain = normalizeDomain(input.domain)
  const scraped = input.scraped ?? {}

  // ── Collect candidates 1-4 in chain order (favicon handled separately) ──
  const candidates: LogoCandidate[] = []
  const seen = new Set<string>()
  const push = (url: string | undefined | null, source: LogoSource) => {
    const u = url?.trim()
    if (!u || seen.has(u)) return
    seen.add(u)
    candidates.push({ url: u, source })
  }

  push(scraped.logoUrl, 'site-scrape')

  const bf = brandfetchUrl(domain)
  const ld = logodevUrl(domain)
  const [bfOk, ldOk] = await Promise.all([
    bf ? probeIsImage(bf) : Promise.resolve(false),
    ld ? probeIsImage(ld) : Promise.resolve(false),
  ])
  if (bf && bfOk) push(bf, 'brandfetch')
  if (ld && ldOk) push(ld, 'logodev')

  push(scraped.ogImage, 'og-image')

  // ── Verify candidates in order; first pass wins ──
  const identifyPrompt =
    'What brand is this logo? Is this an actual brand logo, or a favicon / placeholder / low-resolution image?'
  const expectation = `The official logo of the brand "${brandName}"${domain ? ` (website: ${domain})` : ''}`

  const verdicts: { candidate: LogoCandidate; reasoning: string }[] = []
  for (const candidate of candidates) {
    const verdict = await verifier({ imageUrl: candidate.url, identifyPrompt, expectation })
    if (verdict.verdict === 'pass') {
      return {
        url: candidate.url,
        source: candidate.source,
        status: 'verified',
        reasoning: verdict.reasoning,
        checkedAt: new Date().toISOString(),
      }
    }
    verdicts.push({ candidate, reasoning: verdict.reasoning })
  }

  // ── None passed: best candidate (first in chain order), flagged ──
  // Candidates whose image never fetched (dead URL — vlm-verify's
  // 'image fetch failed' prefix) are useless in a deck, so prefer the first
  // one that at least resolved to an image.
  const fetchable = verdicts.find((v) => !v.reasoning.startsWith('image fetch failed'))
  if (fetchable) {
    return {
      url: fetchable.candidate.url,
      source: fetchable.candidate.source,
      status: 'unverified',
      reasoning: fetchable.reasoning || 'אימות הלוגו נכשל — נדרשת בדיקה ידנית',
      checkedAt: new Date().toISOString(),
    }
  }

  // ── Last resort: favicon — NEVER 'verified', always flagged ──
  const favicon = scraped.favicon?.trim()
  if (favicon) {
    return {
      url: favicon,
      source: 'favicon',
      status: 'unverified',
      reasoning: 'לא נמצא לוגו אמיתי באף מקור — נעשה שימוש ב-favicon של האתר כמוצא אחרון. יש להחליף ידנית בלוגו רשמי.',
      checkedAt: new Date().toISOString(),
    }
  }

  // Candidates existed but all URLs were dead and there is no favicon —
  // still return the first (spec: null only when no candidates at all).
  if (verdicts.length > 0) {
    const first = verdicts[0]
    return {
      url: first.candidate.url,
      source: first.candidate.source,
      status: 'unverified',
      reasoning: first.reasoning,
      checkedAt: new Date().toISOString(),
    }
  }

  return null
}
