/**
 * ScrapeCreators Instagram Profile Scraper
 * Uses the ScrapeCreators API for real-time Instagram profile data.
 * Replaces Apify-based Instagram scraping when SCRAPE_CREATORS_TOKEN is available.
 * API docs: https://docs.scrapecreators.com
 */

const API_BASE = 'https://api.scrapecreators.com/v1'

export interface ScrapeCreatorsProfile {
  username: string
  fullName: string
  biography: string
  profilePicUrl: string
  followersCount: number
  followingCount: number
  postsCount: number
  isVerified: boolean
  isBusinessAccount: boolean
  externalUrl?: string
  businessEmail?: string
  category?: string
}

/**
 * Get Instagram profile data via ScrapeCreators API
 */
export async function getInstagramProfile(handle: string): Promise<ScrapeCreatorsProfile | null> {
  const token = process.env.SCRAPE_CREATORS_TOKEN
  if (!token) {
    console.warn('[ScrapeCreators] WARNING: SCRAPE_CREATORS_TOKEN not set - influencer scraping disabled')
    return null
  }

  // Clean the handle
  handle = handle.replace(/^@/, '').replace(/\/$/, '').trim()
  if (!handle) return null

  console.log(`[ScrapeCreators] Fetching profile: @${handle}`)

  try {
    const url = `${API_BASE}/instagram/profile?handle=${encodeURIComponent(handle)}`
    const response = await fetch(url, {
      headers: {
        'x-api-key': token,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[ScrapeCreators] API error for @${handle}: HTTP ${response.status}, body: ${errorText.slice(0, 200)}`)
      return null
    }

    const data = await response.json()

    if (!data?.data?.user) {
      console.log(`[ScrapeCreators] No user data for @${handle}`)
      return null
    }

    const user = data.data.user
    const profile: ScrapeCreatorsProfile = {
      username: user.username || handle,
      fullName: user.full_name || user.fullName || '',
      biography: user.biography || user.bio || '',
      profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || user.profilePicUrl || '',
      followersCount: user.edge_followed_by?.count ?? user.followers_count ?? user.followersCount ?? 0,
      followingCount: user.edge_follow?.count ?? user.following_count ?? user.followingCount ?? 0,
      postsCount: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? user.postsCount ?? 0,
      isVerified: user.is_verified ?? user.isVerified ?? false,
      isBusinessAccount: user.is_business_account ?? user.isBusinessAccount ?? false,
      externalUrl: user.external_url || user.externalUrl || undefined,
      businessEmail: user.business_email || user.businessEmail || undefined,
      category: user.category_name || user.category || undefined,
    }

    console.log(`[ScrapeCreators] @${handle}: ${profile.followersCount} followers, verified=${profile.isVerified}`)
    return profile
  } catch (error) {
    console.error(`[ScrapeCreators] Error fetching @${handle}:`, error)
    return null
  }
}

/**
 * Get multiple Instagram profiles
 */
export async function getMultipleProfiles(
  handles: string[]
): Promise<ScrapeCreatorsProfile[]> {
  const token = process.env.SCRAPE_CREATORS_TOKEN
  if (!token) {
    console.warn('[ScrapeCreators] WARNING: SCRAPE_CREATORS_TOKEN not set - influencer scraping disabled')
    return []
  }

  console.log(`[ScrapeCreators] Fetching ${handles.length} profiles`)

  const results: ScrapeCreatorsProfile[] = []

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < handles.length; i += 3) {
    const batch = handles.slice(i, i + 3)
    const batchResults = await Promise.all(
      batch.map(handle => getInstagramProfile(handle))
    )

    for (const result of batchResults) {
      if (result) results.push(result)
    }

    // Small delay between batches
    if (i + 3 < handles.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`[ScrapeCreators] Fetched ${results.length}/${handles.length} profiles`)
  return results
}

/**
 * Check if ScrapeCreators is available
 */
export function isScrapeCreatorsAvailable(): boolean {
  return !!process.env.SCRAPE_CREATORS_TOKEN
}
