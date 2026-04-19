import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30
import { createClient } from '@/lib/supabase/server'

import { createServiceClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import type { UpdateSharePayload, ViewerConfig } from '@/types/share'
import type { Presentation } from '@/types/presentation'

// UUID pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET — Public: fetch presentation data by share token (or by UUID for owner)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = `share-view-${Date.now()}`

  // If it's a UUID, the client is fetching share details (authed).
  // If it's a short token, it's a public viewer request.
  const isUuid = UUID_RE.test(id)

  if (isUuid) {
    // Authed owner requesting share info — not used by public viewer
    return NextResponse.json({ error: 'Use PATCH to update' }, { status: 405 })
  }

  // Public viewer: fetch by share_token
  const token = id
  console.log(`[${requestId}] VIEW SHARE: ${token}`)

  try {
    const supabase = await createServiceClient()

    const { data: share, error: shareError } = await supabase
      .from('presentation_shares')
      .select('id, document_id, is_active, viewer_config, view_count')
      .eq('share_token', token)
      .eq('is_active', true)
      .single()

    if (shareError || !share) {
      console.log(`[${requestId}] Share not found or inactive`)
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('data, title')
      .eq('id', share.document_id)
      .single()

    if (docError || !doc) {
      console.log(`[${requestId}] Document not found`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const docData = doc.data as Record<string, unknown>
    const presentation = docData._presentation as Presentation | undefined

    if (!presentation) {
      return NextResponse.json({ error: 'Presentation not generated yet' }, { status: 404 })
    }

    // Increment view count (fire and forget)
    supabase
      .from('presentation_shares')
      .update({
        view_count: (share.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', share.id)
      .then(() => {})

    const brandName = (docData.brandName as string) || doc.title || presentation.title || 'Presentation'

    const response = {
      presentation: {
        title: presentation.title,
        designSystem: presentation.designSystem,
        slides: presentation.slides,
      },
      viewerConfig: share.viewer_config as unknown as ViewerConfig,
      brandName,
      shareId: share.id,
    }

    console.log(`[${requestId}] Serving ${presentation.slides.length} slides for "${brandName}"`)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (err) {
    console.error(`[${requestId}] Unexpected error:`, err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — Update share settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = `share-update-${Date.now()}`

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
      .select('id, user_id, viewer_config')
      .eq('id', id)
      .single()

    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (share.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body: UpdateSharePayload = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.isActive !== undefined) updates.is_active = body.isActive
    if (body.viewerConfig) {
      const current = share.viewer_config as unknown as ViewerConfig
      updates.viewer_config = { ...current, ...body.viewerConfig }
    }

    const { error } = await supabase
      .from('presentation_shares')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error(`[${requestId}] Update error:`, error)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[${requestId}] Error:`, err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE — Deactivate share
export async function DELETE(
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

    const { data: share } = await supabase
      .from('presentation_shares')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (share.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await supabase
      .from('presentation_shares')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[share-delete] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
