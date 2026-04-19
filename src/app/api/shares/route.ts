import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30
import { createClient } from '@/lib/supabase/server'

import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import { nanoid } from 'nanoid'
import type { CreateSharePayload, ViewerConfig } from '@/types/share'
import { DEFAULT_VIEWER_CONFIG } from '@/types/share'

// POST — Create a share link for a document
export async function POST(request: NextRequest) {
  const requestId = `share-create-${Date.now()}`
  console.log(`[${requestId}] 🔗 CREATE SHARE`)

  try {
    const supabase = await createClient()

    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const body: CreateSharePayload = await request.json()
    const { documentId, viewerConfig: partialConfig } = body

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
    }

    // Verify ownership
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (doc.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if a share already exists for this document
    const { data: existing } = await supabase
      .from('presentation_shares')
      .select('id, share_token, is_active, viewer_config')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      // Reactivate and update if exists
      const mergedConfig: ViewerConfig = { ...DEFAULT_VIEWER_CONFIG, ...(existing.viewer_config as Partial<ViewerConfig>), ...partialConfig }
      const { error: updateError } = await supabase
        .from('presentation_shares')
        .update({ is_active: true, viewer_config: mergedConfig as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (updateError) {
        console.error(`[${requestId}] Error reactivating share:`, updateError)
        return NextResponse.json({ error: 'Failed to update share' }, { status: 500 })
      }

      console.log(`[${requestId}] ♻️ Reactivated existing share: ${existing.share_token}`)
      return NextResponse.json({
        shareToken: existing.share_token,
        shareUrl: `/s/${existing.share_token}`,
        shareId: existing.id,
        isNew: false,
      })
    }

    // Create new share
    const shareToken = nanoid(12)
    const viewerConfig: ViewerConfig = { ...DEFAULT_VIEWER_CONFIG, ...partialConfig }

    const { data: share, error: insertError } = await supabase
      .from('presentation_shares')
      .insert({
        document_id: documentId,
        user_id: userId,
        share_token: shareToken,
        viewer_config: viewerConfig as unknown as Record<string, unknown>,
      })
      .select('id, share_token')
      .single()

    if (insertError) {
      console.error(`[${requestId}] Error creating share:`, insertError)
      return NextResponse.json({ error: 'Failed to create share' }, { status: 500 })
    }

    console.log(`[${requestId}] ✅ Share created: ${shareToken}`)
    return NextResponse.json({
      shareToken: share.share_token,
      shareUrl: `/s/${share.share_token}`,
      shareId: share.id,
      isNew: true,
    })
  } catch (err) {
    console.error(`[${requestId}] Unexpected error:`, err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
