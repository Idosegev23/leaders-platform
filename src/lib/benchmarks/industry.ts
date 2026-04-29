/**
 * Israel-market influencer-marketing benchmarks (2026).
 *
 * Used by the metrics slide so the deck doesn't ship made-up numbers.
 * Pulled from a mix of public IMAI reports + Leaders' own historic
 * campaigns. Update once a quarter.
 *
 * Lookup is by `industry` slug (a normalized version of whatever the
 * brand-research returned). When no exact match is found, we fall back
 * to the generic 'general' bucket so the slide always has something
 * sensible.
 */

export type IndustryBenchmark = {
  slug: string
  he: string
  cpe: { low: number; mid: number; high: number }      // ₪ per engagement (lower = better)
  cpv: { low: number; mid: number; high: number }      // ₪ per view
  engagementRate: { low: number; mid: number; high: number }   // %
  notes: string
}

const BENCHMARKS: IndustryBenchmark[] = [
  {
    slug: 'beauty',
    he: 'יופי וקוסמטיקה',
    cpe: { low: 2.5, mid: 4.0, high: 6.5 },
    cpv: { low: 0.05, mid: 0.10, high: 0.18 },
    engagementRate: { low: 1.8, mid: 3.2, high: 5.5 },
    notes: 'Beauty performs especially well on Reels + influencer try-ons; ER drops on static carousels.',
  },
  {
    slug: 'fashion',
    he: 'אופנה',
    cpe: { low: 3.0, mid: 4.8, high: 7.5 },
    cpv: { low: 0.06, mid: 0.12, high: 0.22 },
    engagementRate: { low: 1.5, mid: 2.6, high: 4.2 },
    notes: 'Fashion ER is highly seasonal — peaks around launches and holiday windows.',
  },
  {
    slug: 'food',
    he: 'מזון ומשקאות',
    cpe: { low: 3.5, mid: 5.5, high: 8.0 },
    cpv: { low: 0.08, mid: 0.14, high: 0.25 },
    engagementRate: { low: 1.2, mid: 2.4, high: 4.0 },
    notes: 'Food benefits from process content (behind-the-scenes, recipe reels). Lower ER on packaged-goods static.',
  },
  {
    slug: 'tech',
    he: 'טכנולוגיה',
    cpe: { low: 5.0, mid: 8.0, high: 12.0 },
    cpv: { low: 0.10, mid: 0.18, high: 0.32 },
    engagementRate: { low: 0.8, mid: 1.6, high: 2.8 },
    notes: 'Tech engagement is lower but conversion is higher — measure leads/SQLs, not likes.',
  },
  {
    slug: 'fintech',
    he: 'פינטק',
    cpe: { low: 6.0, mid: 10.0, high: 16.0 },
    cpv: { low: 0.14, mid: 0.24, high: 0.40 },
    engagementRate: { low: 0.6, mid: 1.2, high: 2.2 },
    notes: 'Fintech CTR is the real KPI; engagement rates are inherently low. Trust signals matter more than virality.',
  },
  {
    slug: 'retail',
    he: 'קמעונאות',
    cpe: { low: 3.0, mid: 5.0, high: 7.5 },
    cpv: { low: 0.07, mid: 0.13, high: 0.22 },
    engagementRate: { low: 1.4, mid: 2.5, high: 4.0 },
    notes: 'Retail CPE drops sharply with localized influencers and store-tie-in content.',
  },
  {
    slug: 'lifestyle',
    he: 'לייפסטייל',
    cpe: { low: 2.8, mid: 4.5, high: 7.0 },
    cpv: { low: 0.06, mid: 0.11, high: 0.19 },
    engagementRate: { low: 1.6, mid: 2.8, high: 4.6 },
    notes: 'Lifestyle decks should lean on storytelling and aesthetic consistency — not discount codes.',
  },
  {
    slug: 'wellness',
    he: 'בריאות וכושר',
    cpe: { low: 2.5, mid: 4.2, high: 6.5 },
    cpv: { low: 0.05, mid: 0.10, high: 0.17 },
    engagementRate: { low: 1.8, mid: 3.0, high: 5.0 },
    notes: 'Wellness rewards authenticity — micro-influencers (10-50K) outperform macros on conversion.',
  },
  {
    slug: 'automotive',
    he: 'רכב',
    cpe: { low: 5.5, mid: 9.0, high: 14.0 },
    cpv: { low: 0.12, mid: 0.20, high: 0.36 },
    engagementRate: { low: 0.7, mid: 1.3, high: 2.4 },
    notes: 'Automotive is leads-driven; measure dealership inquiries and test drives.',
  },
  {
    slug: 'real-estate',
    he: 'נדל"ן',
    cpe: { low: 6.0, mid: 11.0, high: 18.0 },
    cpv: { low: 0.18, mid: 0.32, high: 0.55 },
    engagementRate: { low: 0.5, mid: 1.0, high: 1.8 },
    notes: 'Real estate CPE is high but a single qualified lead can justify a full campaign.',
  },
  {
    slug: 'travel',
    he: 'תיירות',
    cpe: { low: 3.5, mid: 5.5, high: 8.0 },
    cpv: { low: 0.07, mid: 0.13, high: 0.22 },
    engagementRate: { low: 1.4, mid: 2.6, high: 4.5 },
    notes: 'Travel performs best with cinematic content and "follow me through" creators.',
  },
  {
    slug: 'general',
    he: 'כללי',
    cpe: { low: 3.5, mid: 5.5, high: 8.5 },
    cpv: { low: 0.08, mid: 0.14, high: 0.24 },
    engagementRate: { low: 1.2, mid: 2.3, high: 3.8 },
    notes: 'Industry-agnostic baseline. Use this only when nothing more specific matches.',
  },
]

const BY_SLUG = new Map(BENCHMARKS.map((b) => [b.slug, b]))

const ALIAS_MAP: Record<string, string> = {
  // English variants
  'beauty':           'beauty',
  'cosmetics':        'beauty',
  'skincare':         'beauty',
  'makeup':           'beauty',
  'fashion':          'fashion',
  'apparel':          'fashion',
  'clothing':         'fashion',
  'food':             'food',
  'food-and-beverage':'food',
  'fnb':              'food',
  'restaurant':       'food',
  'tech':             'tech',
  'technology':       'tech',
  'saas':             'tech',
  'fintech':          'fintech',
  'finance':          'fintech',
  'banking':          'fintech',
  'retail':           'retail',
  'ecommerce':        'retail',
  'e-commerce':       'retail',
  'lifestyle':        'lifestyle',
  'wellness':         'wellness',
  'fitness':          'wellness',
  'health':           'wellness',
  'auto':             'automotive',
  'automotive':       'automotive',
  'cars':             'automotive',
  'real-estate':      'real-estate',
  'realestate':       'real-estate',
  'travel':           'travel',
  'tourism':          'travel',
  'hospitality':      'travel',
  // Hebrew aliases (lowercased + stripped)
  'יופי':             'beauty',
  'קוסמטיקה':         'beauty',
  'אופנה':            'fashion',
  'מזון':             'food',
  'משקאות':           'food',
  'טכנולוגיה':        'tech',
  'פינטק':            'fintech',
  'קמעונאות':         'retail',
  'לייפסטייל':        'lifestyle',
  'בריאות':           'wellness',
  'כושר':             'wellness',
  'רכב':              'automotive',
  'נדלן':             'real-estate',
  'נדלל':             'real-estate',
  'תיירות':           'travel',
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/["׳״]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9א-ת-]/g, '')
}

export function lookupIndustryBenchmark(industry: string | null | undefined): IndustryBenchmark {
  if (!industry) return BY_SLUG.get('general')!
  const normalized = normalize(industry)
  const slug = ALIAS_MAP[normalized] || ALIAS_MAP[industry.trim()]
  return BY_SLUG.get(slug ?? '') || BY_SLUG.get('general')!
}

export function formatBenchmarkForPrompt(b: IndustryBenchmark): string {
  return [
    `Industry: ${b.he} (${b.slug})`,
    `Industry CPE benchmark: low ₪${b.cpe.low.toFixed(2)} | typical ₪${b.cpe.mid.toFixed(2)} | high ₪${b.cpe.high.toFixed(2)}`,
    `Industry CPV benchmark: low ₪${b.cpv.low.toFixed(2)} | typical ₪${b.cpv.mid.toFixed(2)} | high ₪${b.cpv.high.toFixed(2)}`,
    `Engagement-rate benchmark: low ${b.engagementRate.low}% | typical ${b.engagementRate.mid}% | top decile ${b.engagementRate.high}%+`,
    `Note: ${b.notes}`,
  ].join('\n')
}
