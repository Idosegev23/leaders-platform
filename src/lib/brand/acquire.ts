/**
 * Lean brand-asset acquisition (art-director engine — wiring layer).
 *
 * The heavy `/api/generate-visual-assets` route (scrape + logo + products +
 * scene pre-gen + smart images + product injection) is only reachable from the
 * older `/generate/[id]` polling flow. The wizard → blueprint → generate-full
 * path bypasses it, so decks built through the blueprint gate reach the agent
 * with `_brandAssets` unset and every image is generic AI (off-brand).
 *
 * This module is the FAST subset that generate-full can run inline before the
 * agent: scrape the site, resolve+verify the logo, collect+verify real product
 * photos. No image generation happens here — the agent reference-conditions its
 * own scenes on these verified products (see presentation-agent handleGenerateImage).
 *
 * Failure policy (matches the rest of the engine): nothing throws. A brand with
 * no scrapable site / no product photos degrades to whatever was found (logo
 * only, or nothing) and generation proceeds — never blocks.
 */

import { fetchScrape } from '@/lib/apify/fetch-scraper'
import { resolveBrandLogo } from '@/lib/brand/logo-resolver'
import { collectProductImages } from '@/lib/brand/product-images'
import { rehostImage } from '@/lib/brand/rehost-image'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type { BrandAssets } from '@/lib/brand/types'

export interface AcquireInput {
  brandName: string
  /** Brand website (url or bare domain). When absent, scrape+logo-domain are skipped. */
  website?: string
  /** Physical-product descriptor for the VLM check ("stainless steel cookware"). */
  productContext?: string
  /** Wizard-uploaded reference image URLs — highest-priority product ground truth. */
  wizardReferenceImages?: string[]
}

export interface ScrapedBrandData {
  logoUrl?: string
  ogImage?: string
  favicon?: string
  heroImages?: string[]
  images?: string[]
  colorPalette?: string[]
}

export interface AcquireResult {
  brandAssets: BrandAssets
  scraped: ScrapedBrandData | null
}

async function withTimeout<T>(ms: number, label: string, p: Promise<T>): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ])
  } catch (err) {
    console.warn(`[acquireBrandAssets] ${label} failed (continuing):`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Acquire verified logo + product photos for a brand. Never throws; returns
 * whatever was found. `brandAssets.productImages` / `.logo` may be absent.
 */
export async function acquireBrandAssets(input: AcquireInput): Promise<AcquireResult> {
  const brandName = input.brandName?.trim()
  if (!brandName) return { brandAssets: { updatedAt: new Date().toISOString() }, scraped: null }

  // ── 0. Website — search for it when the payload didn't carry one ──
  // extractBrandWebsite() only pattern-matches the document, so a deck built
  // from a kickoff (no website field, no URL in the brief text) arrived here
  // with `website` undefined. That skipped the scrape AND the logo domain, and
  // the deck was generated with entirely generic imagery. We know the brand
  // name, so ask a grounded model instead of giving up.
  const website = input.website || (await withTimeout(30_000, 'website search', searchBrandWebsite(brandName)))

  // ── 1. Scrape the site (best-effort; images/logo/favicon only) ──
  let scraped: ScrapedBrandData | null = null
  if (website) {
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`
    const raw = await withTimeout(45_000, 'scrape', fetchScrape(url))
    if (raw) {
      scraped = {
        logoUrl: raw.logoUrl || undefined,
        ogImage: raw.ogImage || undefined,
        favicon: raw.favicon || undefined,
        heroImages: raw.heroImages || [],
        images: [...(raw.productImages || []), ...(raw.lifestyleImages || [])],
        colorPalette: raw.colorPalette || [],
      }
    }

    // Fallback for scrape-hostile sites: many brand sites (WordPress + Cloudflare)
    // return a bot-challenge to datacenter IPs, so the direct HTML fetch above
    // comes back empty. Gemini's URL-context reads the page from Google infra
    // (not IP-blocked) and returns real image URLs. Only invoked when the direct
    // scrape found nothing usable.
    const scrapeEmpty = !scraped?.logoUrl && !(scraped?.images?.length) && !(scraped?.heroImages?.length)
    if (scrapeEmpty) {
      const via = await withTimeout(45_000, 'gemini url-context images', geminiSiteImages(url, brandName, input.productContext))
      if (via && (via.logoUrl || via.productImages.length)) {
        scraped = {
          ...(scraped || {}),
          logoUrl: scraped?.logoUrl || via.logoUrl,
          images: [...(scraped?.images || []), ...via.productImages],
        }
        console.log(`[acquireBrandAssets] gemini url-context fallback: logo=${via.logoUrl ? 'yes' : 'no'}, ${via.productImages.length} product urls`)
      }
    }
  }

  // ── 2. Logo + 3. products in parallel (both only depend on the scrape) ──
  const [logo, products] = await Promise.all([
    withTimeout(
      90_000,
      'logo resolver',
      resolveBrandLogo({
        brandName,
        domain: website || undefined,
        scraped: {
          logoUrl: scraped?.logoUrl,
          ogImage: scraped?.ogImage,
          favicon: scraped?.favicon,
        },
      }),
    ),
    withTimeout(
      120_000,
      'product images',
      collectProductImages({
        brandName,
        productContext: input.productContext,
        scraped: scraped
          ? { heroImages: scraped.heroImages, ogImage: scraped.ogImage, images: scraped.images }
          : undefined,
        wizardReferenceImages: input.wizardReferenceImages,
      }),
    ),
  ])

  const brandAssets: BrandAssets = { updatedAt: new Date().toISOString() }
  if (logo) brandAssets.logo = logo
  if (products && products.length) brandAssets.productImages = products

  // ── Re-host to Supabase so downstream fetches (Nano Banana references, the
  // editor, PDF/PPTX export) always resolve — the source CDN may be signed,
  // rate-limited, or IP-block the render/generation environment. Best-effort:
  // an un-rehostable URL keeps its original (still better than nothing).
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const sb = await createClient()
    const slug = brandName.replace(/[^a-z0-9]/gi, '').slice(0, 24).toLowerCase() || 'brand'
    if (brandAssets.logo?.url) {
      const stable = await rehostImage(brandAssets.logo.url, `brand/${slug}`, 'logo', sb)
      if (stable) brandAssets.logo = { ...brandAssets.logo, url: stable }
    }
    if (brandAssets.productImages?.length) {
      brandAssets.productImages = await Promise.all(
        brandAssets.productImages.map(async (p, i) => {
          const stable = await rehostImage(p.url, `brand/${slug}`, `product-${i}`, sb)
          return stable ? { ...p, url: stable } : p
        }),
      )
    }
  } catch (rehostErr) {
    console.warn('[acquireBrandAssets] re-host step failed (keeping source URLs):', rehostErr instanceof Error ? rehostErr.message : rehostErr)
  }

  const verifiedCount = (products || []).filter((p) => p.status === 'verified').length
  console.log(
    `[acquireBrandAssets] "${brandName}": logo=${logo ? logo.status : 'none'} | products=${verifiedCount} verified / ${(products || []).length} collected`,
  )

  return { brandAssets, scraped }
}

/**
 * Find a brand's official site by grounded search, for payloads that never
 * carried one (kickoff-originated decks in particular).
 *
 * Returns a bare domain ("seacretspa.com") or null. Two guards keep a
 * hallucinated domain from poisoning the whole acquisition:
 *   1. the model must answer with a domain-shaped token, and
 *   2. that domain must actually answer over HTTPS.
 * A wrong-but-live domain is still possible; that degrades to off-brand
 * assets, exactly the behaviour we already have today with no website at all.
 */
async function searchBrandWebsite(brandName: string): Promise<string | null> {
  try {
    const { callAI } = await import('@/lib/ai-provider')
    const res = await callAI({
      model: 'gemini-3.7-flash',
      prompt: `What is the official website of the brand "${brandName}"?
Search the web to confirm it. Answer with ONLY the bare domain, lowercase, no scheme and no "www" (example: nike.com).
If you genuinely cannot find it, answer exactly: UNKNOWN`,
      useGoogleSearch: true,
      callerId: 'brand-website-search',
    })

    const text = (res?.text || '').trim().toLowerCase()
    if (!text || text.includes('unknown')) return null
    const match = text.match(/([a-z0-9-]+\.)+[a-z]{2,}/)
    const domain = match?.[0]?.replace(/^www\./, '')
    if (!domain) return null

    // Reject the socials/aggregators a search can land on — they are never the
    // brand's own site and would scrape into completely wrong assets.
    if (/^(instagram|facebook|tiktok|youtube|linkedin|x|twitter|wikipedia|amazon|google)\./.test(domain)) {
      console.warn(`[acquireBrandAssets] website search returned a non-brand host (${domain}) — ignoring`)
      return null
    }

    const live = await fetch(`https://${domain}`, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
      .then((r) => {
        if (r.body) void r.body.cancel().catch(() => {})
        return r.status < 500
      })
      .catch(() => false)

    if (!live) {
      console.warn(`[acquireBrandAssets] website search returned an unreachable domain (${domain}) — ignoring`)
      return null
    }

    console.log(`[acquireBrandAssets] website search resolved "${brandName}" → ${domain}`)
    return domain
  } catch (e) {
    console.warn('[acquireBrandAssets] website search failed (continuing without a site):', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Scrape-hostile-site fallback: ask Gemini (URL-context) to read the brand site
 * from Google's infrastructure and return real image URLs. Bypasses datacenter
 * IP blocks that defeat a direct fetch. Returns [] on any failure.
 */
async function geminiSiteImages(
  website: string,
  brandName: string,
  productContext?: string,
): Promise<{ logoUrl?: string; productImages: string[] }> {
  try {
    const { callAI } = await import('@/lib/ai-provider')
    const res = await callAI({
      model: 'gemini-3.7-flash',
      prompt:
        `Visit ${website} and its product/shop pages. Extract REAL image URLs from the HTML.\n` +
        `Return ONLY minified JSON, no markdown:\n` +
        `{"logoUrl":"<absolute URL of the official ${brandName} logo image, or empty>",` +
        `"productImages":["<up to 6 absolute https URLs of actual ${productContext || `${brandName} product`} photos — real product shots, NOT banners, icons, or people>"]}`,
      useUrlContext: true,
      callerId: 'acquire-gemini-images',
      maxOutputTokens: 1024,
    })
    const parsed = parseGeminiJson<{ logoUrl?: string; productImages?: string[] }>(res.text || '{}')
    const clean = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.trim() : '')
    return {
      logoUrl: clean(parsed.logoUrl) || undefined,
      productImages: Array.from(new Set((parsed.productImages || []).map(clean).filter(Boolean))).slice(0, 6),
    }
  } catch {
    return { productImages: [] }
  }
}

// ─── Doc-field extraction helpers (the wizard stores the site inside the
//     brandBrief JSON string, not a clean column) ────────────────────────────

/** Best-effort brand website from the messy document.data shape. */
export function extractBrandWebsite(data: Record<string, unknown>): string | undefined {
  const direct =
    (data.website as string) ||
    (data.brandWebsite as string) ||
    (data.siteUrl as string) ||
    ((data._brandResearch as Record<string, unknown> | undefined)?.website as string) ||
    ((data._brandResearch as Record<string, unknown> | undefined)?.websiteDomain as string)
  if (direct && /\./.test(direct)) return direct.trim()

  // brandBrief is often a JSON string carrying "website": "https://…"
  const brief = typeof data.brandBrief === 'string' ? data.brandBrief : ''
  const jsonHit = brief.match(/"website"\s*:\s*"([^"]+)"/)
  if (jsonHit?.[1] && /\./.test(jsonHit[1])) return jsonHit[1].trim()

  // Last resort: first real https URL in the brief text (skip common non-brand hosts).
  const urlHit = (brief + ' ' + ((data._briefText as string) || '')).match(
    /https?:\/\/(?!(?:www\.)?(?:instagram|facebook|tiktok|youtube|google)\.)[^\s"'<>]+/i,
  )
  return urlHit?.[0]?.trim()
}

/** Physical-product descriptor for the VLM product check ("סירי נירוסטה" / "cookware"). */
export function extractProductContext(data: Record<string, unknown>): string | undefined {
  const brief = typeof data.brandBrief === 'string' ? data.brandBrief : ''
  const mainProduct = brief.match(/"mainProducts"\s*:\s*\[\s*\{\s*"name"\s*:\s*"([^"]+)"/)
  if (mainProduct?.[1]) return mainProduct[1].trim()
  const subIndustry = brief.match(/"subIndustry"\s*:\s*"([^"]+)"/)
  if (subIndustry?.[1]) return subIndustry[1].trim()
  const research = data._brandResearch as Record<string, unknown> | undefined
  return (research?.subIndustry as string) || (research?.industry as string) || undefined
}
