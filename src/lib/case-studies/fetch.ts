import { createClient } from '@supabase/supabase-js'

export type CaseStudy = {
  id: string
  brand_name: string
  industry: string
  year: number
  brief_summary: string
  approach: string | null
  deliverables: string | null
  results: Record<string, number | string>
  thumbnail_url: string | null
  hero_image_url: string | null
  is_featured: boolean
}

/**
 * Pull 2-3 relevant case studies for the deck. Industry match wins;
 * featured campaigns serve as a fallback so the deck always has proof.
 */
export async function fetchRelevantCaseStudies(industrySlug: string | null | undefined, limit = 3): Promise<CaseStudy[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const tryQuery = async (filter: 'industry' | 'featured') => {
    let q = supabase
      .from('case_studies')
      .select('*')
      .eq('is_public', true)
      .order('year', { ascending: false })
      .limit(limit)
    if (filter === 'industry' && industrySlug) q = q.eq('industry', industrySlug)
    if (filter === 'featured') q = q.eq('is_featured', true)
    const { data } = await q
    return (data ?? []) as CaseStudy[]
  }

  let rows = industrySlug ? await tryQuery('industry') : []
  if (rows.length < 2) {
    const featured = await tryQuery('featured')
    const seen = new Set(rows.map((r) => r.id))
    for (const f of featured) {
      if (rows.length >= limit) break
      if (!seen.has(f.id)) rows.push(f)
    }
  }
  return rows
}

export function formatCaseStudiesForPrompt(rows: CaseStudy[]): string {
  if (rows.length === 0) return ''
  return rows
    .map((r, i) => {
      const resultsLine = Object.entries(r.results)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toLocaleString('en-US') : v}`)
        .join(', ')
      return [
        `Case ${i + 1}: ${r.brand_name} (${r.industry}, ${r.year})`,
        `  Brief: ${r.brief_summary}`,
        r.approach ? `  Approach: ${r.approach}` : null,
        r.deliverables ? `  Deliverables: ${r.deliverables}` : null,
        resultsLine ? `  Results: ${resultsLine}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}
