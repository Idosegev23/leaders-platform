/**
 * QA: brand logo acquisition chain v2 (art-director engine, C1).
 *
 * Proves the HTTP chain (site scrape → Brandfetch → Logo.dev → og:image →
 * favicon) against a real brand from the local machine: prints each
 * candidate URL + HTTP status, then runs resolveBrandLogo.
 *
 * The Gemini API host is BLOCKED from this sandbox — pass --no-vlm to stub
 * the VLM model caller (auto-pass) so the run proves candidate discovery +
 * HTTP reachability only. Without the flag, real vlmVerify calls run (prod
 * or any machine with Gemini access).
 *
 * Also runs the product-images collector (C2) on the same scrape — skip it
 * with --logo-only. Optional: --context=<product description> refines the
 * VLM question; --ref=<url> (repeatable) simulates wizard reference images.
 *
 * Usage (from repo root):
 *   npx tsx scripts/verify-brand-assets.mts <domain> <brandName> [--no-vlm] [--logo-only] [--context=<text>] [--ref=<url>]...
 *   npx tsx scripts/verify-brand-assets.mts aroma-republic.co.il KUNI --no-vlm
 */
import fs from 'node:fs'
import path from 'node:path'

// ── Load .env.local before importing app modules ──
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}

const args = process.argv.slice(2)
const noVlm = args.includes('--no-vlm')
const [domainArg, brandArg] = args.filter((a) => !a.startsWith('--'))
if (!domainArg || !brandArg) {
  console.error('Usage: npx tsx scripts/verify-brand-assets.mts <domain> <brandName> [--no-vlm]')
  process.exit(1)
}

const { fetchScrape } = await import('@/lib/apify/fetch-scraper')
const { resolveBrandLogo, normalizeDomain, brandfetchUrl, logodevUrl, __setVlmVerifierForTests } =
  await import('@/lib/brand/logo-resolver')

const domain = normalizeDomain(domainArg)
if (!domain) {
  console.error(`Could not normalize domain from '${domainArg}'`)
  process.exit(1)
}

console.log(`Brand: ${brandArg} | Domain: ${domain} | VLM: ${noVlm ? 'STUBBED (--no-vlm)' : 'live'}`)

// ── 1. Scrape the site (same source the API route feeds the resolver) ──
console.log(`\n── Scrape https://${domain} ──`)
const scraped = await fetchScrape(`https://${domain}`)
console.log(`  logoUrl : ${scraped.logoUrl ?? '(none)'}`)
console.log(`  ogImage : ${scraped.ogImage ?? '(none)'}`)
console.log(`  favicon : ${scraped.favicon ?? '(none)'}`)

// ── 2. Probe every candidate source with plain HTTP ──
/** Hide credential query params in printed URLs. */
function redact(url: string): string {
  return url.replace(/([?&](?:token|c)=)[^&]+/g, '$1***')
}

async function httpStatus(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    const ct = res.headers.get('content-type') ?? '?'
    const len = res.headers.get('content-length') ?? '?'
    void res.body?.cancel().catch(() => {})
    return `HTTP ${res.status} | ${ct} | ${len} bytes`
  } catch (e) {
    return `FETCH ERROR: ${e instanceof Error ? e.message : e}`
  }
}

const rows: { source: string; url: string | null; skip?: string }[] = [
  { source: '1. site-scrape', url: scraped.logoUrl },
  {
    source: '2. brandfetch',
    url: brandfetchUrl(domain),
    skip: process.env.BRANDFETCH_CLIENT_ID ? undefined : 'BRANDFETCH_CLIENT_ID missing',
  },
  {
    source: '3. logodev',
    url: logodevUrl(domain),
    skip: process.env.LOGODEV_TOKEN ? undefined : 'LOGODEV_TOKEN missing',
  },
  { source: '4. og-image', url: scraped.ogImage },
  { source: '5. favicon', url: scraped.favicon },
]

console.log('\n── Candidate chain (HTTP probe) ──')
for (const row of rows) {
  if (row.skip) {
    console.log(`  ${row.source.padEnd(16)} SKIPPED (${row.skip})`)
    continue
  }
  if (!row.url) {
    console.log(`  ${row.source.padEnd(16)} (no candidate)`)
    continue
  }
  const status = await httpStatus(row.url)
  console.log(`  ${row.source.padEnd(16)} ${status}\n${' '.repeat(19)}${redact(row.url)}`)
}

// ── 3. Run the resolver ──
if (noVlm) {
  // Gemini blocked locally — stub the verifier through the logo-resolver
  // test seam. The stub still fetches the image over real HTTP (dead
  // candidates keep failing with the 'image fetch failed' prefix); only the
  // Gemini vision/judge calls are replaced with an auto-pass.
  __setVlmVerifierForTests(async ({ imageUrl }) => {
    try {
      const res = await fetch(imageUrl!, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
      const ct = res.headers.get('content-type') ?? '?'
      void res.body?.cancel().catch(() => {})
      if (res.ok && ct.startsWith('image/')) {
        return {
          verdict: 'pass',
          identified: '[stub --no-vlm] vision skipped',
          reasoning: `[stub --no-vlm] image reachable (HTTP ${res.status}, ${ct}) — Gemini blocked locally`,
        }
      }
      return { verdict: 'fail', identified: '', reasoning: `image fetch failed: HTTP ${res.status} (${ct})` }
    } catch (e) {
      return { verdict: 'fail', identified: '', reasoning: `image fetch failed: ${e instanceof Error ? e.message : e}` }
    }
  })
}

console.log('\n── resolveBrandLogo ──')
const result = await resolveBrandLogo({
  brandName: brandArg,
  domain,
  scraped: {
    logoUrl: scraped.logoUrl ?? undefined,
    ogImage: scraped.ogImage ?? undefined,
    favicon: scraped.favicon ?? undefined,
  },
})

if (!result) {
  console.log('  Result: null (no candidates at all)')
} else {
  console.log(JSON.stringify({ ...result, url: redact(result.url) }, null, 2))
}

__setVlmVerifierForTests(null)

// ── 4. Product images (art-director engine, C2) — appended section ──
// Guarded so the logo chain above runs standalone with --logo-only. Uses
// product-images' OWN checker seam: stubbing vlm-verify's model caller from
// here does not reach it (tsx loads vlm-verify twice — entry graph vs the
// module's transitive graph).
if (!args.includes('--logo-only')) {
  const { collectProductImages, __setBinaryCheckerForTests } = await import(
    '@/lib/brand/product-images'
  )

  if (noVlm) {
    // Same policy as the logo stub: real HTTP fetch per candidate, only the
    // Gemini call is replaced — "yes" for every reachable image/* URL.
    __setBinaryCheckerForTests(async ({ imageUrl }) => {
      try {
        const res = await fetch(imageUrl!, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
        const ct = res.headers.get('content-type') ?? '?'
        void res.body?.cancel().catch(() => {})
        if (res.ok && ct.startsWith('image/') && !ct.includes('svg')) {
          return { verdict: 'yes', reasoning: `[stub --no-vlm] image reachable (HTTP ${res.status}, ${ct})` }
        }
        return { verdict: 'no', reasoning: `image fetch failed: HTTP ${res.status} (${ct})` }
      } catch (e) {
        return { verdict: 'no', reasoning: `image fetch failed: ${e instanceof Error ? e.message : e}` }
      }
    })
  }

  const wizardRefs = args.filter((a) => a.startsWith('--ref=')).map((a) => a.slice('--ref='.length))
  const productContext = args.find((a) => a.startsWith('--context='))?.slice('--context='.length)

  console.log('\n── collectProductImages ──')
  console.log(`  scraped candidates: product=${scraped.productImages.length} lifestyle=${scraped.lifestyleImages.length} hero=${scraped.heroImages.length} og=${scraped.ogImage ? 1 : 0} | wizardRefs=${wizardRefs.length}`)

  const productAssets = await collectProductImages({
    brandName: brandArg,
    productContext,
    scraped: {
      heroImages: scraped.heroImages,
      ogImage: scraped.ogImage ?? undefined,
      images: [...scraped.productImages, ...scraped.lifestyleImages],
    },
    wizardReferenceImages: wizardRefs,
  })

  const counts = { verified: 0, unverified: 0, rejected: 0 }
  for (const a of productAssets) counts[a.status]++
  console.log(`  ${productAssets.length} assets — verified=${counts.verified} unverified=${counts.unverified} rejected=${counts.rejected}`)
  console.log(JSON.stringify(productAssets, null, 2))

  __setBinaryCheckerForTests(null)
}
