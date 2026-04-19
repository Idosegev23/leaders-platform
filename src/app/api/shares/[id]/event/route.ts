import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { TrackEventPayload } from '@/types/share'

// POST — Public: track analytics event from viewer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: token } = await params

  try {
    const body: TrackEventPayload = await request.json()
    const { sessionId, slideIndex, eventType, durationMs } = body

    if (!sessionId || slideIndex === undefined || !eventType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Find the share by token
    const { data: share } = await supabase
      .from('presentation_shares')
      .select('id')
      .eq('share_token', token)
      .eq('is_active', true)
      .single()

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    // Upsert analytics session
    const { data: existing } = await supabase
      .from('share_analytics')
      .select('id, slides_viewed, total_duration_ms, cta_clicked')
      .eq('share_id', share.id)
      .eq('session_id', sessionId)
      .single()

    const now = new Date().toISOString()

    if (existing) {
      // Update existing session
      const slidesViewed = (existing.slides_viewed as unknown[]) || []
      const updates: Record<string, unknown> = { updated_at: now }

      if (eventType === 'view') {
        slidesViewed.push({ slideIndex, viewedAt: now, durationMs: 0 })
        updates.slides_viewed = slidesViewed
      } else if (eventType === 'duration' && durationMs) {
        updates.total_duration_ms = (existing.total_duration_ms || 0) + durationMs
        // Update duration for the last view of this slide
        for (let i = slidesViewed.length - 1; i >= 0; i--) {
          const sv = slidesViewed[i] as { slideIndex: number; durationMs: number }
          if (sv.slideIndex === slideIndex) {
            sv.durationMs = (sv.durationMs || 0) + durationMs
            break
          }
        }
        updates.slides_viewed = slidesViewed
      } else if (eventType === 'cta_click') {
        updates.cta_clicked = true
      }

      await supabase
        .from('share_analytics')
        .update(updates)
        .eq('id', existing.id)
    } else {
      // Create new session
      await supabase
        .from('share_analytics')
        .insert({
          share_id: share.id,
          session_id: sessionId,
          slides_viewed: eventType === 'view' ? [{ slideIndex, viewedAt: now, durationMs: 0 }] : [],
          total_duration_ms: durationMs || 0,
          cta_clicked: eventType === 'cta_click',
        })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[share-event] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
