import { NextRequest, NextResponse } from 'next/server'
import { searchIsraeliInfluencers, getAudienceReport } from '@/lib/imai/client'

export const maxDuration = 30

/**
 * POST /api/imai
 * Search IMAI for real influencers or get audience report.
 *
 * Body: { action: 'search' | 'report', ...params }
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.IMAI_API_KEY) {
      return NextResponse.json({ error: 'IMAI not configured', influencers: [] })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'search') {
      const { keywords = [], platform, minFollowers, maxFollowers, minEngagement, limit } = body
      const influencers = await searchIsraeliInfluencers(keywords, {
        platform, minFollowers, maxFollowers, minEngagement, limit,
      })
      return NextResponse.json({
        success: true,
        influencers: influencers.map(inf => ({
          name: inf.fullname || inf.username,
          handle: `@${inf.username}`,
          platform: inf.platform,
          followers: inf.followers,
          engagementRate: inf.engagement_rate,
          avgLikes: inf.avg_likes,
          avgComments: inf.avg_comments,
          avgViews: inf.avg_views,
          picture: inf.picture,
          verified: inf.is_verified,
          country: inf.geo?.country?.name,
          userId: inf.user_id,
          _source: 'imai',
          _verified: true,
        })),
      })
    }

    if (action === 'report') {
      const { username, platform = 'instagram' } = body
      const report = await getAudienceReport(username, platform)
      return NextResponse.json({ success: true, report })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[IMAI Route] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'IMAI request failed',
      influencers: [],
    }, { status: 500 })
  }
}
