/**
 * Influencer Profile Scraper
 * Uses ScrapeCreators API for Instagram profiles (no Apify dependency)
 */

import { getInstagramProfile, getMultipleProfiles } from './scrapecreators-scraper'

export interface ScrapedInfluencer {
  username: string
  fullName: string
  profileUrl: string
  profilePicUrl: string
  bio: string

  // Stats
  followers: number
  following: number
  posts: number

  // Engagement
  avgLikes: number
  avgComments: number
  engagementRate: number

  // Content samples
  recentPosts: {
    imageUrl: string
    caption: string
    likes: number
    comments: number
    timestamp: string
  }[]

  // Categories/tags
  categories: string[]
  hashtags: string[]

  // Contact
  email?: string
  website?: string

  // Verification
  isVerified: boolean
  isBusinessAccount: boolean
}

/**
 * Scrape a single Instagram profile via ScrapeCreators
 */
export async function scrapeInstagramProfile(username: string): Promise<ScrapedInfluencer | null> {
  console.log(`[Influencer Scrape] Scraping @${username}`)

  try {
    const profile = await getInstagramProfile(username)
    if (!profile) return null

    const categories = detectCategories(profile.biography || '', [])
    return {
      username: profile.username,
      fullName: profile.fullName,
      profileUrl: `https://instagram.com/${profile.username}`,
      profilePicUrl: profile.profilePicUrl,
      bio: profile.biography,
      followers: profile.followersCount,
      following: profile.followingCount,
      posts: profile.postsCount,
      avgLikes: 0,
      avgComments: 0,
      engagementRate: estimateEngagementRate(profile.followersCount),
      recentPosts: [],
      categories,
      hashtags: [],
      email: profile.businessEmail,
      website: profile.externalUrl,
      isVerified: profile.isVerified,
      isBusinessAccount: profile.isBusinessAccount,
    }
  } catch (err) {
    console.error(`[Influencer Scrape] Error for @${username}:`, err)
    return null
  }
}

/**
 * Scrape multiple influencer profiles via ScrapeCreators batch
 */
export async function scrapeMultipleInfluencers(
  usernames: string[]
): Promise<ScrapedInfluencer[]> {
  console.log(`[Influencer Scrape] Scraping ${usernames.length} profiles`)

  try {
    const profiles = await getMultipleProfiles(usernames)
    const results = profiles.map(p => {
      const categories = detectCategories(p.biography || '', [])
      return {
        username: p.username,
        fullName: p.fullName,
        profileUrl: `https://instagram.com/${p.username}`,
        profilePicUrl: p.profilePicUrl,
        bio: p.biography,
        followers: p.followersCount,
        following: p.followingCount,
        posts: p.postsCount,
        avgLikes: 0,
        avgComments: 0,
        engagementRate: estimateEngagementRate(p.followersCount),
        recentPosts: [],
        categories,
        hashtags: [],
        email: p.businessEmail,
        website: p.externalUrl,
        isVerified: p.isVerified,
        isBusinessAccount: p.isBusinessAccount,
      }
    })

    console.log(`[Influencer Scrape] Got ${results.length}/${usernames.length} profiles`)
    return results
  } catch (err) {
    console.error('[Influencer Scrape] Batch scrape failed:', err)
    return []
  }
}

/**
 * Discovery flow - scrape provided usernames
 * Note: Instagram search was removed with Apify. Discovery now relies on
 * Gemini AI recommendations (influencer-research.ts) which provide usernames.
 */
export async function discoverAndScrapeInfluencers(
  _industry: string,
  _targetAudience: { gender?: string; ageRange?: string; interests?: string[] },
  _budget: number,
  _count: number = 6
): Promise<ScrapedInfluencer[]> {
  // Without Apify, we can't search Instagram directly.
  // Discovery is now done by Gemini AI (influencer-research.ts).
  // This function is kept for backward compatibility but returns empty.
  console.log('[Influencer Discovery] Skipping - discovery handled by Gemini AI research')
  return []
}

// Helper functions

/**
 * Estimate engagement rate based on follower count (industry benchmarks).
 * ScrapeCreators profile API does not return post data, so we use standard
 * industry averages as a realistic proxy.
 */
function estimateEngagementRate(followers: number): number {
  if (followers < 10_000) return 5.6   // nano: ~5-8%
  if (followers < 100_000) return 3.8  // micro: ~3-5%
  if (followers < 500_000) return 2.1  // mid-tier: ~1.5-3%
  if (followers < 1_000_000) return 1.4 // macro
  return 1.1                           // mega
}

function detectCategories(bio: string, hashtags: string[]): string[] {
  const categories: string[] = []
  const text = (bio + ' ' + hashtags.join(' ')).toLowerCase()

  const categoryPatterns: Record<string, RegExp[]> = {
    'לייפסטייל': [/lifestyle/i, /לייפסטייל/],
    'אופנה': [/fashion/i, /אופנה/, /סטייל/],
    'יופי': [/beauty/i, /makeup/i, /יופי/, /איפור/],
    'כושר': [/fitness/i, /gym/i, /כושר/, /אימון/],
    'אוכל': [/food/i, /chef/i, /אוכל/, /מתכון/],
    'הורות': [/mom/i, /parent/i, /אמא/, /הור/],
    'טיולים': [/travel/i, /טיול/, /נסיעות/],
    'עסקים': [/business/i, /entrepreneur/i, /יזם/],
  }

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(p => p.test(text))) {
      categories.push(category)
    }
  }

  return categories.length > 0 ? categories : ['כללי']
}
