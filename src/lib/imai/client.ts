/**
 * IMAI API Client — Influencer Marketing AI platform.
 *
 * Base URL: https://imai.co/api
 * Auth: authkey header
 * Rate limit: 10 req/sec
 *
 * Key endpoints used:
 * - /search/newv1/ — find influencers by criteria
 * - /reports/new/ — get audience demographics
 * - /raw/ig/user/info/ — Instagram user details
 * - /raw/tt/user/info/ — TikTok user details
 */

const BASE_URL = 'https://imai.co/api'

function getApiKey(): string {
  const key = process.env.IMAI_API_KEY
  if (!key) throw new Error('IMAI_API_KEY not configured')
  return key
}

/**
 * Process-wide circuit breaker. When IMAI returns "no_tokens_remaining"
 * (account credits exhausted), every subsequent call is short-circuited
 * with a clear error for the next 30 minutes. This prevents the research
 * agent from burning its 15-iteration budget on 7+ consecutive 400s, and
 * surfaces a clear quota-exhausted error to upstream callers so they can
 * fall back to alternative sources.
 *
 * The breaker is in-memory per Vercel function instance — when the
 * function recycles or 30 minutes pass, the next request retries IMAI.
 */
let imaiQuotaExhaustedUntil = 0
const QUOTA_BACKOFF_MS = 30 * 60 * 1000 // 30 min

export class ImaiQuotaExhaustedError extends Error {
  constructor() {
    super('IMAI account credits exhausted (no_tokens_remaining). Quota will be probed again in 30 minutes. Top up at https://imai.co or wait.')
    this.name = 'ImaiQuotaExhaustedError'
  }
}

export function isImaiQuotaExhausted(): boolean {
  return Date.now() < imaiQuotaExhaustedUntil
}

async function imaiRequest<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<T> {
  // Circuit breaker: don't even hit the network when the breaker is open.
  if (isImaiQuotaExhausted()) {
    throw new ImaiQuotaExhaustedError()
  }

  const url = new URL(`${BASE_URL}${endpoint}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'authkey': getApiKey(),
      'Content-Type': 'application/json',
    },
    ...(body && method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'unknown' }))
    const errMsg = errBody.error || errBody.error_message || errBody.detail || errBody.message || JSON.stringify(errBody).slice(0, 200)
    // Trip the breaker on any "no_tokens_remaining" response — once IMAI
    // says the account is dry, every subsequent call this session will
    // also fail. Spamming the API just wastes time and produces noise.
    if (typeof errMsg === 'string' && /no_tokens_remaining/i.test(errMsg)) {
      imaiQuotaExhaustedUntil = Date.now() + QUOTA_BACKOFF_MS
      console.error(`[IMAI] 🚨 Quota exhausted — circuit breaker tripped for 30 min. Endpoint: ${endpoint}`)
      throw new ImaiQuotaExhaustedError()
    }
    throw new Error(`IMAI ${res.status} (${endpoint}): ${errMsg}`)
  }

  return res.json() as Promise<T>
}

// ─── Types ──────────────────────────────────────────

export interface ImaiInfluencer {
  user_id: string
  username: string
  fullname: string
  picture: string
  followers: number
  engagements: number
  engagement_rate: number
  avg_likes: number
  avg_comments: number
  avg_views: number
  is_verified: boolean
  platform: 'instagram' | 'tiktok' | 'youtube'
  geo?: { country?: { name: string; code: string } }
  language?: { code: string; name: string }
}

export interface ImaiSearchResult {
  success: boolean
  data: ImaiInfluencer[]
  total?: number
}

export interface ImaiAudienceReport {
  success: boolean
  user_profile: {
    username: string
    fullname: string
    followers: number
    engagement_rate: number
    avg_likes: number
    avg_comments: number
    avg_views: number
    picture: string
    description: string
    geo?: { country?: { name: string } }
  }
  audience_followers?: {
    data?: {
      audience_genders?: { code: string; weight: number }[]
      audience_ages?: { code: string; weight: number }[]
      audience_geo?: { countries?: { name: string; weight: number }[] }
      audience_credibility?: number
    }
  }
}

// ─── Search ──────────────────────────────────────────

export interface ImaiSearchFilters {
  platform?: 'instagram' | 'tiktok' | 'youtube'
  followers_from?: number
  followers_to?: number
  engagement_rate_from?: number
  geo?: number[]           // geo IDs from /geos/ endpoint
  language?: string[]       // language codes
  gender?: 'MALE' | 'FEMALE'
  keywords?: string[]
  relevance?: string[]     // topic tags
  has_contact_details?: boolean
}

/**
 * Search for influencers matching criteria.
 * Uses POST /search/newv1/
 * Cost: tokens charged for unindexed results only.
 */
export async function searchInfluencers(
  filters: ImaiSearchFilters,
  limit: number = 20,
  offset: number = 0,
): Promise<ImaiSearchResult> {
  const requestId = `imai-search-${Date.now()}`
  const platform = filters.platform || 'instagram'

  console.log(`[IMAI][${requestId}] Searching ${platform} influencers...`)

  // Build IMAI v1 filter format — minimal working subset
  // Verified working: followers range, audience_geo. Other fields cause 400s.
  const filter: Record<string, unknown> = {}
  if (filters.followers_from || filters.followers_to) {
    filter.followers = {
      left_number: filters.followers_from || 1000,
      right_number: filters.followers_to || 10000000,
    }
  }
  if (filters.geo?.length) filter.audience_geo = filters.geo.map(id => ({ id }))
  if (filters.gender) filter.gender = filters.gender
  // Merge relevance + keywords into single 'keywords' array of single words (IMAI-safe)
  const allTerms: string[] = []
  if (filters.relevance?.length) {
    allTerms.push(...filters.relevance.flatMap(r => r.split(/\s+/)))
  }
  if (filters.keywords?.length) {
    allTerms.push(...filters.keywords.flatMap(k => k.split(/\s+/)))
  }
  const cleanTerms = allTerms.filter(Boolean).map(t => t.toLowerCase())
  if (cleanTerms.length) {
    filter.keywords = Array.from(new Set(cleanTerms)).slice(0, 5)
  }
  if (filters.has_contact_details) filter.with_contact = [{ type: 'email' }]

  const requestBody = {
    filter,
    sort: { field: 'followers', direction: 'desc' },
    paging: { skip: offset, limit },
  }
  console.log(`[IMAI][${requestId}] POST /search/newv1/ body: ${JSON.stringify(requestBody).slice(0, 300)}`)

  const rawResult = await imaiRequest<{
    total: number
    accounts: Array<{
      account: { user_profile: ImaiInfluencer }
      match?: Record<string, unknown>
    }>
  }>('POST', '/search/newv1/', requestBody, { platform })

  // Normalize to our ImaiSearchResult format
  const data = (rawResult.accounts || []).map(a => ({
    ...a.account.user_profile,
    platform: platform as 'instagram' | 'tiktok' | 'youtube',
  }))

  console.log(`[IMAI][${requestId}] Found ${data.length}/${rawResult.total} influencers`)
  return { success: true, data, total: rawResult.total }
}

/**
 * Get detailed audience report for a specific influencer.
 * Uses POST /reports/new/
 * Cost: 1 token per report. Free with dry_run=true.
 */
export async function getAudienceReport(
  username: string,
  platform: 'instagram' | 'tiktok' | 'youtube' = 'instagram',
  dryRun: boolean = false,
): Promise<ImaiAudienceReport> {
  const requestId = `imai-report-${Date.now()}`
  console.log(`[IMAI][${requestId}] Getting audience report for @${username} (${platform})${dryRun ? ' [DRY RUN]' : ''}`)

  const result = await imaiRequest<ImaiAudienceReport>(
    'POST',
    '/reports/new/',
    { filter: {} },
    { url: username, platform, dry_run: String(dryRun) },
  )

  console.log(`[IMAI][${requestId}] Report: ${result.user_profile?.followers || 0} followers, ${result.user_profile?.engagement_rate || 0} ER`)
  return result
}

/**
 * Get basic user info from Instagram Raw API.
 * Cost: 0.02 tokens. Rate limit: 1 req/sec.
 * IMAI endpoint expects `url` param with the username (not `username`).
 */
export async function getInstagramUserInfo(username: string): Promise<Record<string, unknown>> {
  const clean = username.replace('@', '').trim()
  // IMAI /raw/ig/user/info/ expects GET with 'url' param
  const response = await imaiRequest<Record<string, unknown>>('GET', '/raw/ig/user/info/', undefined, { url: clean })
  // Log the response shape once so we know what IMAI returns
  console.log(`[IMAI] getInstagramUserInfo(${clean}) response keys: [${Object.keys(response || {}).join(', ')}]`)
  return response
}

/**
 * Search Israeli influencers by niche keywords.
 * Convenience wrapper with Israel geo filter.
 */
export async function searchIsraeliInfluencers(
  keywords: string[],
  opts: {
    platform?: 'instagram' | 'tiktok'
    minFollowers?: number
    maxFollowers?: number
    minEngagement?: number
    limit?: number
  } = {},
): Promise<ImaiInfluencer[]> {
  // Israel geo ID in IMAI (verified via /geos/?q=Israel)
  const ISRAEL_GEO_ID = 1473946
  const HEBREW_LANG = 'he'

  const result = await searchInfluencers({
    platform: opts.platform || 'instagram',
    followers_from: opts.minFollowers || 5000,
    followers_to: opts.maxFollowers || 500000,
    engagement_rate_from: opts.minEngagement || 1.5,
    geo: [ISRAEL_GEO_ID],
    language: [HEBREW_LANG],
    relevance: keywords,
  }, opts.limit || 15)

  return result.data || []
}
