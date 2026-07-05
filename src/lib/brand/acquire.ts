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

  // ── 1. Scrape the site (best-effort; images/logo/favicon only) ──
  let scraped: ScrapedBrandData | null = null
  if (input.website) {
    const url = /^https?:\/\//i.test(input.website) ? input.website : `https://${input.website}`
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
  }

  // ── 2. Logo + 3. products in parallel (both only depend on the scrape) ──
  const [logo, products] = await Promise.all([
    withTimeout(
      90_000,
      'logo resolver',
      resolveBrandLogo({
        brandName,
        domain: input.website || undefined,
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

  const verifiedCount = (products || []).filter((p) => p.status === 'verified').length
  console.log(
    `[acquireBrandAssets] "${brandName}": logo=${logo ? logo.status : 'none'} | products=${verifiedCount} verified / ${(products || []).length} collected`,
  )

  return { brandAssets, scraped }
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
