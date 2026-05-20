import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const publicClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

/**
 * GET /api/links/{token}
 * Public — used by the client-facing form to fetch sender info and mark the
 * link as "opened". Returns null for client_email/name if not set.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase = publicClient()

  const { data, error } = await supabase
    .from('document_links')
    .select(`
      id, token, created_by_email, created_by_name, client_email, client_name,
      status, metadata, created_at, opened_at, completed_at,
      document_types (slug, name)
    `)
    .eq('token', token)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Bump status to opened on first view.
  if (data.status === 'pending') {
    await supabase
      .from('document_links')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('token', token)
  }

  return NextResponse.json({
    ...data,
    document_type: data.document_types,
  })
}

/**
 * PATCH /api/links/{token}
 * Body:
 *   - { status: 'opened' | 'completed' | 'archived' }
 *   - { progress: { step: number, total: number } }  // brief fill progress
 * 'archived' requires the creator's session. Other mutations are public
 * (the client-facing form doesn't have a Supabase session).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await request.json().catch(() => null) as {
    status?: 'opened' | 'completed' | 'archived' | 'failed'
    progress?: { step: number; total: number }
    submission_data?: Record<string, unknown>
  } | null

  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { status, progress, submission_data } = body

  if (status && !['opened', 'completed', 'archived', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  if (status === 'archived') {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('document_links')
      .update({ status })
      .eq('token', token)
      .eq('created_by_email', user.email)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const supabase = publicClient()
  const patch: Record<string, unknown> = {}

  // Always read the existing row first — we need its current metadata,
  // sender info, and Drive folder id for the side-effect cascade below.
  const { data: existingLink } = await supabase
    .from('document_links')
    .select('id, token, status, client_email, client_name, created_by_email, created_by_name, lead_id, metadata, document_types(slug, name)')
    .eq('token', token)
    .maybeSingle()
  if (!existingLink) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }
  const currentMeta = (existingLink.metadata as Record<string, unknown> | null) ?? {}

  if (status) {
    patch.status = status
    if (status === 'opened')    patch.opened_at    = new Date().toISOString()
    if (status === 'completed') patch.completed_at = new Date().toISOString()
  }

  // Merge progress + submission_data into metadata without clobbering other keys.
  const nextMeta: Record<string, unknown> = { ...currentMeta }
  let metaChanged = false
  if (progress && typeof progress.step === 'number' && typeof progress.total === 'number') {
    nextMeta.progress = {
      step: progress.step,
      total: progress.total,
      updated_at: new Date().toISOString(),
    }
    metaChanged = true
  }
  if (submission_data && typeof submission_data === 'object') {
    nextMeta.submission_data = submission_data
    nextMeta.submitted_at = new Date().toISOString()
    metaChanged = true
  }
  if (metaChanged) patch.metadata = nextMeta

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No-op' }, { status: 400 })
  }

  const { error } = await supabase.from('document_links').update(patch).eq('token', token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ─── Native side effects on completion / failure (replaces Make.com) ───
  // For client-brief links specifically, run the Drive + Gmail + ClickUp
  // cascade. We MUST await — Vercel kills the function as soon as the
  // PATCH returns 200, which leaves a fire-and-forget cascade dead in the
  // water (mgmt mail never goes out, Drive doc never written). Same fix
  // pattern as the ClickUp send-brief webhook (commit c1e3063).
  // The cascade never throws to the caller; failures are logged inside.
  const docType = (existingLink.document_types as { slug?: string; name?: string } | null) ?? {}
  if (docType.slug === 'client-brief' && (status === 'completed' || status === 'failed')) {
    try {
      await runClientBriefCascade({
        linkId: existingLink.id,
        token: existingLink.token,
        clientName: existingLink.client_name || 'לקוח',
        clientEmail: existingLink.client_email || null,
        senderEmail: existingLink.created_by_email || null,
        senderName: existingLink.created_by_name || null,
        leadId: existingLink.lead_id || null,
        driveFolderId: (currentMeta.brief_drive_folder_id as string | undefined) || null,
        submissionData: submission_data || (currentMeta.submission_data as Record<string, unknown> | undefined) || null,
        language: (currentMeta.language as 'he' | 'en' | undefined) || 'he',
        transition: status,
      })
    } catch (e) {
      console.error('[brief-cascade] unexpected error:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Run the post-submission cascade for a client-brief link. Fires
 * fire-and-forget from the PATCH handler; never throws to the caller.
 *
 * IMPORTANT — manual gating (per user spec, 2026-04-30):
 *   The Drive folder is NOT auto-moved to "נסגר", and the per-client
 *   workspace under "ניהול לקוח" is NOT auto-created here. Both happen
 *   ONLY when a human physically moves the brief folder into "נסגר" in
 *   Drive. The /api/drive/sync-closed-briefs cron picks that up and runs
 *   ensureClientWorkspace() at that point. This keeps the agency in
 *   control of what counts as a "real" closed brief vs a half-finished
 *   submission that still needs review.
 *
 * Steps (all best-effort, logged on failure):
 *   1. Email management: "client X submitted brief" (still fires here).
 *   2. Push a status update to the ClickUp task linked to this lead.
 *   3. Stamp activity_log so the dashboard ticker picks up the event.
 */
async function runClientBriefCascade(params: {
  linkId: string
  token: string
  clientName: string
  clientEmail: string | null
  senderEmail: string | null
  senderName: string | null
  leadId: string | null
  driveFolderId: string | null
  submissionData: Record<string, unknown> | null
  language?: 'he' | 'en'
  transition: 'completed' | 'failed'
}): Promise<void> {
  const tag = `[brief-cascade:${params.token.slice(0, 8)}]`
  console.log(`${tag} start — transition=${params.transition} client="${params.clientName}"`)

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Workspace is now gated on the manual Drive move. The completion mail
  // doesn't promise a workspace link yet.
  const workspaceLink: string | null = null

  // 0. Write the brief content as a Google Doc directly into the main
  //    "בריפים ראשוניים" folder. We no longer pre-create a per-client
  //    sub-folder at send time, so the Doc lands at BRIEFS_SENT root and
  //    is named "בריף — {client} — {YYYY-MM-DD}" (unique per client/day).
  //    Legacy links still carry a per-client folder_id in metadata — for
  //    those we write into the original folder to preserve continuity.
  //    Best-effort; mgmt mail still goes out if this fails. Only fires on
  //    completion — failed/abandoned briefs have no useful payload to write.
  let briefDocLink: string | null = null
  if (
    params.transition === 'completed' &&
    params.submissionData &&
    Object.keys(params.submissionData).length > 0
  ) {
    try {
      const { uploadBriefDocToFolder } = await import('@/lib/brief/upload-doc')
      const { DRIVE_ANCHORS } = await import('@/lib/google-drive/client-folders')
      const targetFolderId = params.driveFolderId || DRIVE_ANCHORS.BRIEFS_SENT
      const result = await uploadBriefDocToFolder({
        folderId: targetFolderId,
        clientName: params.clientName,
        senderName: params.senderName,
        senderEmail: params.senderEmail,
        submission: params.submissionData as Parameters<typeof uploadBriefDocToFolder>[0]['submission'],
        language: params.language,
        submittedAt: new Date().toISOString(),
      })
      briefDocLink = result.viewLink
      // Persist the doc id+link on the link's metadata so /briefs/[token],
      // the dashboard, and the outcome handler can find the file.
      const meta = await readLinkMeta(service, params.linkId)
      await service
        .from('document_links')
        .update({ metadata: { ...meta, brief_drive_doc_id: result.fileId, brief_drive_doc_link: result.viewLink } })
        .eq('id', params.linkId)
      console.log(`${tag} brief doc ${result.reused ? 'reused' : 'created'} in ${targetFolderId === DRIVE_ANCHORS.BRIEFS_SENT ? 'BRIEFS_SENT' : 'legacy-folder'}: ${result.viewLink}`)
    } catch (e) {
      console.warn(`${tag} brief doc upload failed (non-fatal):`, e instanceof Error ? e.message : e)
    }
  }

  // 1. Email management.
  try {
    const { sendToManagement } = await import('@/lib/gmail/management')
    const html = params.transition === 'completed'
      ? buildMgmtBriefCompletedHtml({
          clientName: params.clientName,
          clientEmail: params.clientEmail,
          senderName: params.senderName,
          workspaceLink,
          briefDocLink,
          submissionPreview: summariseSubmission(params.submissionData),
        })
      : buildMgmtBriefFailedHtml({
          clientName: params.clientName,
          clientEmail: params.clientEmail,
          senderName: params.senderName,
        })
    const subject = params.transition === 'completed'
      ? `✅ בריף התקבל מ-${params.clientName}`
      : `⚠ בריף נטוש — ${params.clientName}`
    const result = await sendToManagement({
      senderEmail: params.senderEmail || undefined,
      senderName: params.senderName || undefined,
      subject,
      html,
    })
    console.log(`${tag} mgmt mail: sent=${result.sent} failed=${result.failed.length}`)
  } catch (e) {
    console.warn(`${tag} mgmt mail error:`, e instanceof Error ? e.message : e)
  }

  // 2. ClickUp status (only when the link is tied to a lead).
  if (params.leadId) {
    try {
      const { data: lead } = await service
        .from('leads')
        .select('metadata')
        .eq('id', params.leadId)
        .maybeSingle()
      const taskId = (lead?.metadata as { task_id?: string } | undefined)?.task_id
      if (taskId) {
        const { updateClickUpTaskStatus, LEAD_STATUS_TO_CLICKUP } = await import('@/lib/clickup/client')
        const newStatus = params.transition === 'completed' ? 'qualified' : 'rejected'
        await updateClickUpTaskStatus(taskId, LEAD_STATUS_TO_CLICKUP[newStatus])
        // Mirror status on the lead row.
        await service.from('leads').update({ status: newStatus }).eq('id', params.leadId)
        console.log(`${tag} clickup task ${taskId} → ${newStatus}`)
      } else {
        console.log(`${tag} lead has no clickup task_id — skipping ClickUp sync`)
      }
    } catch (e) {
      console.warn(`${tag} clickup sync error:`, e instanceof Error ? e.message : e)
    }
  }

  // 3. activity_log
  try {
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: params.transition === 'completed' ? 'client_brief_completed' : 'client_brief_failed',
      summary: params.transition === 'completed'
        ? `${params.clientName} השלים את הבריף`
        : `${params.clientName} נטש את הבריף`,
      entity_type: params.leadId ? 'lead' : 'document_link',
      entity_id: params.leadId || params.linkId,
      actor_email: params.clientEmail || null,
      actor_name: params.clientName,
      payload: {
        document_link_id: params.linkId,
        token: params.token,
        workspace_drive_folder_link: workspaceLink,
        brief_drive_doc_link: briefDocLink,
      },
    })
  } catch (e) {
    console.warn(`${tag} activity_log error:`, e instanceof Error ? e.message : e)
  }

  console.log(`${tag} done`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readLinkMeta(service: any, linkId: string): Promise<Record<string, unknown>> {
  const { data } = await service
    .from('document_links')
    .select('metadata')
    .eq('id', linkId)
    .maybeSingle()
  return (data?.metadata as Record<string, unknown> | null) ?? {}
}

function summariseSubmission(d: Record<string, unknown> | null): string {
  if (!d) return ''
  // Pull the most useful fields for a 1-screen email preview. The form has
  // dozens of fields; we surface a hand-picked subset and link out for the
  // rest via the Drive workspace.
  const pick = (k: string): string => {
    const v = d[k]
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    if (Array.isArray(v)) return v.filter(Boolean).join(', ')
    return ''
  }
  const lines: string[] = []
  const brand = pick('brand_name') || pick('brandName') || pick('clientName')
  if (brand) lines.push(`<strong>מותג:</strong> ${escapeHtml(brand)}`)
  const goal = pick('campaign_goal') || pick('campaignGoal') || pick('mainGoal') || pick('goal')
  if (goal) lines.push(`<strong>מטרה:</strong> ${escapeHtml(goal)}`)
  const budget = pick('budget') || pick('estimatedBudget')
  if (budget) lines.push(`<strong>תקציב:</strong> ${escapeHtml(budget)}`)
  const audience = pick('target_audience') || pick('targetAudience') || pick('audience')
  if (audience) lines.push(`<strong>קהל:</strong> ${escapeHtml(audience)}`)
  return lines.join('<br>')
}

function buildMgmtBriefCompletedHtml(opts: {
  clientName: string
  clientEmail: string | null
  senderName: string | null
  workspaceLink: string | null
  briefDocLink: string | null
  submissionPreview: string
}): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;">בריף חדש התקבל</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;"><strong>${escapeHtml(opts.clientName)}</strong>${opts.clientEmail ? ` (${escapeHtml(opts.clientEmail)})` : ''} השלים את הבריף.${opts.senderName ? ` הופנה ע״י ${escapeHtml(opts.senderName)}.` : ''}</p>
      ${opts.submissionPreview ? `<div style="background:#f9f7f2;border:1px solid #e8e5dc;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.8;margin-bottom:16px;">${opts.submissionPreview}</div>` : ''}
      ${opts.briefDocLink ? `<p style="margin:18px 0;"><a href="${opts.briefDocLink}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9999px;font-weight:600;display:inline-block;">פתח את הבריף ב-Google Doc ↗</a></p>` : ''}
      <div style="background:#fff8e1;border-right:3px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:20px 0;font-size:13px;line-height:1.7;">
        <strong>הצעד הבא:</strong> לעבור לתיקיית "בריפים ראשוניים" ב-Drive,
        לקרוא את הבריף, ואם הוא תקין — להעביר ידנית את התיקייה ל-"נסגר".
        ברגע שזה קורה, נפתח אוטומטית workspace מלא ללקוח עם 7 תת-תיקיות
        תחת "ניהול לקוח", ויהיה אפשר לפתוח טופס התנעה.
      </div>
    </div></body></html>`
}

function buildMgmtBriefFailedHtml(opts: {
  clientName: string
  clientEmail: string | null
  senderName: string | null
}): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;">בריף נטוש</h1>
      <p style="font-size:15px;line-height:1.7;margin:0;"><strong>${escapeHtml(opts.clientName)}</strong>${opts.clientEmail ? ` (${escapeHtml(opts.clientEmail)})` : ''} לא השלים את הבריף.${opts.senderName ? ` הופנה ע״י ${escapeHtml(opts.senderName)}.` : ''}</p>
      <p style="font-size:13px;color:#666;line-height:1.7;margin:12px 0 0;">תיקיית הבריף עברה לתיקיית "נפל" ב-Drive. אפשר למחוק או לשמור לתיעוד לפי הצורך.</p>
    </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
