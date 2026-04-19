import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import type { ShareAnalyticsSummary } from '@/types/share'

// GET — Analytics for share owner
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createClient()

    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    // Verify ownership
    const { data: share } = await supabase
      .from('presentation_shares')
      .select('id, user_id, view_count, last_viewed_at')
      .eq('id', id)
      .single()

    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (share.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Fetch all sessions
    const { data: sessions } = await supabase
      .from('share_analytics')
      .select('*')
      .eq('share_id', id)
      .order('created_at', { ascending: false })
      .limit(100)

    const allSessions = sessions || []

    // Compute per-slide engagement
    const slideMap = new Map<number, { totalDuration: number; viewCount: number }>()
    let totalDuration = 0
    let ctaClicks = 0

    for (const session of allSessions) {
      totalDuration += session.total_duration_ms || 0
      if (session.cta_clicked) ctaClicks++

      const views = (session.slides_viewed as { slideIndex: number; durationMs: number }[]) || []
      for (const view of views) {
        const existing = slideMap.get(view.slideIndex) || { totalDuration: 0, viewCount: 0 }
        existing.totalDuration += view.durationMs || 0
        existing.viewCount++
        slideMap.set(view.slideIndex, existing)
      }
    }

    const slideEngagement = Array.from(slideMap.entries())
      .map(([slideIndex, data]) => ({
        slideIndex,
        avgDurationMs: data.viewCount > 0 ? Math.round(data.totalDuration / data.viewCount) : 0,
        viewCount: data.viewCount,
      }))
      .sort((a, b) => a.slideIndex - b.slideIndex)

    const summary: ShareAnalyticsSummary = {
      totalViews: share.view_count || 0,
      uniqueSessions: allSessions.length,
      avgDurationMs: allSessions.length > 0 ? Math.round(totalDuration / allSessions.length) : 0,
      ctaClickRate: allSessions.length > 0 ? ctaClicks / allSessions.length : 0,
      slideEngagement,
      lastViewedAt: share.last_viewed_at,
    }

    return NextResponse.json(summary)
  } catch (err) {
    console.error('[share-analytics] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
