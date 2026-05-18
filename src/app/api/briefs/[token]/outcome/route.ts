/**
 * POST /api/briefs/[token]/outcome
 * Mark a client-brief as won (נסגר) or lost (נפל).
 *
 * Body: { outcome: 'won' | 'lost' }
 *
 * Side effects:
 *   - 'lost' → move the brief's Drive folder into BRIEFS_FAILED. Done.
 *   - 'won'  → move the brief's Drive folder into BRIEFS_COMPLETED *and*
 *              eagerly create the per-client workspace under "ניהול לקוח"
 *              so the UI can hand back the link immediately. The existing
 *              /api/drive/sync-closed-briefs cron will pick up any briefs
 *              moved manually in Drive — calling ensureClientWorkspace()
 *              here is just to avoid a 30-min wait when the move was
 *              triggered from inside the platform.
 *
 * Idempotent: re-running the same outcome is a no-op (the move + workspace
 * helpers already handle "already there").
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'
import {
  moveClientBriefFolder,
  ensureClientWorkspace,
} from '@/lib/google-drive/client-folders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Outcome = 'won' | 'lost'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Auth — same pattern as the rest of the platform: dev-mode bypass,
  // otherwise require a real session.
  let actorEmail: string | null = null
  let actorName: string | null = null
  if (isDevMode) {
    actorEmail = DEV_USER.email
    actorName = DEV_USER.full_name
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    actorEmail = user.email
    actorName = (user.user_metadata?.full_name as string | undefined) || user.email
  }

  const body = await request.json().catch(() => ({}))
  const outcome = (body as { outcome?: string }).outcome
  if (outcome !== 'won' && outcome !== 'lost') {
    return NextResponse.json({ error: 'outcome must be "won" or "lost"' }, { status: 400 })
  }
  const typedOutcome = outcome as Outcome

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: link, error: linkErr } = await service
    .from('document_links')
    .select(`
      id, token, status, client_name, client_email, lead_id, metadata,
      document_types (slug, name)
    `)
    .eq('token', token)
    .maybeSingle()

  if (linkErr || !link) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }
  const docType = link.document_types as { slug?: string; name?: string } | null
  if (docType?.slug !== 'client-brief') {
    return NextResponse.json({ error: 'Not a client-brief link' }, { status: 400 })
  }

  const meta = (link.metadata as Record<string, unknown> | null) ?? {}
  const driveFolderId = (meta.brief_drive_folder_id as string | undefined) || null
  const clientName = (link.client_name as string | null) || 'לקוח'

  // 1. Move the per-client brief folder in Drive. Best-effort: even if Drive
  //    fails (folder was deleted, permissions, etc.) we still record the
  //    outcome in Supabase so the operator's intent isn't lost.
  let folderMoved = false
  if (driveFolderId) {
    try {
      folderMoved = await moveClientBriefFolder({
        folderId: driveFolderId,
        to: typedOutcome === 'won' ? 'completed' : 'failed',
      })
    } catch (e) {
      console.warn('[/api/briefs/outcome] move failed:', e instanceof Error ? e.message : e)
    }
  }

  // 2. For 'won': eagerly create the workspace under "ניהול לקוח" so the
  //    user gets the link instantly (instead of waiting for the cron).
  //    Idempotent — re-runs reuse the existing folder.
  let workspaceLink: string | null = null
  let workspaceCreated = false
  if (typedOutcome === 'won') {
    try {
      const ws = await ensureClientWorkspace({ clientName })
      workspaceLink = ws.webViewLink
      workspaceCreated = ws.created
    } catch (e) {
      console.warn('[/api/briefs/outcome] ensureClientWorkspace failed:', e instanceof Error ? e.message : e)
    }
  }

  // 3. Persist the outcome on the link metadata.
  const newMeta: Record<string, unknown> = {
    ...meta,
    outcome: typedOutcome,
    outcome_at: new Date().toISOString(),
    outcome_by_email: actorEmail,
    outcome_by_name: actorName,
    folder_moved: folderMoved,
    ...(workspaceLink ? { workspace_drive_folder_link: workspaceLink } : {}),
  }
  await service
    .from('document_links')
    .update({ metadata: newMeta })
    .eq('id', link.id)

  // 4. Stamp activity_log for the dashboard ticker.
  try {
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: typedOutcome === 'won' ? 'brief_outcome_won' : 'brief_outcome_lost',
      summary: typedOutcome === 'won'
        ? `${clientName} סומן כנסגר`
        : `${clientName} סומן כנפל`,
      entity_type: link.lead_id ? 'lead' : 'document_link',
      entity_id: link.lead_id || link.id,
      actor_email: actorEmail,
      actor_name: actorName,
      payload: {
        document_link_id: link.id,
        token: link.token,
        workspace_drive_folder_link: workspaceLink,
        workspace_created: workspaceCreated,
      },
    })
  } catch (e) {
    console.warn('[/api/briefs/outcome] activity_log failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    outcome: typedOutcome,
    folder_moved: folderMoved,
    workspace_link: workspaceLink,
    workspace_created: workspaceCreated,
  })
}
