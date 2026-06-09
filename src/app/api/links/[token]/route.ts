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

  // 1. Email management + the BD-person who originally sent the brief.
  try {
    const { sendToManagement, getManagementRecipients } = await import('@/lib/gmail/management')
    // AI summary of the brief (Gemini 3.1 Pro). Best-effort — if it fails the
    // mail still goes out with the legacy hand-picked field preview as fallback.
    let aiSummary: import('@/lib/brief/ai-summary').BriefMgmtSummary | null = null
    if (params.transition === 'completed' && params.submissionData) {
      try {
        const { summariseBriefForMgmt } = await import('@/lib/brief/ai-summary')
        aiSummary = await summariseBriefForMgmt(params.submissionData, params.language || 'he')
        console.log(`${tag} ai-summary: ${aiSummary ? `${aiSummary.bullets.length} bullets, ${aiSummary.attention.length} attention items` : 'null (fallback)'}`)
      } catch (e) {
        console.warn(`${tag} ai-summary error (non-fatal):`, e instanceof Error ? e.message : e)
      }
    }
    const html = params.transition === 'completed'
      ? buildMgmtBriefCompletedHtml({
          clientName: params.clientName,
          clientEmail: params.clientEmail,
          senderName: params.senderName,
          workspaceLink,
          briefDocLink,
          aiSummary,
          fallbackPreview: summariseSubmission(params.submissionData),
        })
      : buildMgmtBriefFailedHtml({
          clientName: params.clientName,
          clientEmail: params.clientEmail,
          senderName: params.senderName,
        })
    const subject = params.transition === 'completed'
      ? `✅ בריף התקבל מ-${params.clientName}`
      : `⚠ בריף נטוש — ${params.clientName}`
    // Include the BD-person who sent the brief so they know their client filled
    // it out. Dedupe + blocklist applied inside getManagementRecipients.
    const recipients = getManagementRecipients([params.senderEmail])
    const result = await sendToManagement({
      senderEmail: params.senderEmail || undefined,
      senderName: params.senderName || undefined,
      subject,
      html,
      to: recipients,
    })
    console.log(`${tag} mgmt+sender mail: recipients=${recipients.length} sent=${result.sent} failed=${result.failed.length}`)
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

  // 4. Salesforce push (Hub → Salesforce). Best-effort, awaited so Vercel
  //    doesn't kill the function mid-POST. No-ops when SALESFORCE_BRIEF_WEBHOOK_URL
  //    is unset. The brief doc link was just persisted to metadata above, so
  //    the envelope this builds carries it. (ADR: see salesforce-hub-integration.md)
  try {
    const { notifySalesforceBriefCompleted } = await import('@/lib/salesforce/outbound')
    const result = await notifySalesforceBriefCompleted(
      params.token,
      params.transition === 'failed' ? 'brief.failed' : 'brief.completed',
    )
    if (result.delivered) console.log(`${tag} salesforce push delivered`)
    else if (result.reason !== 'no_url') console.warn(`${tag} salesforce push not delivered: ${result.reason}`)
  } catch (e) {
    console.warn(`${tag} salesforce push error:`, e instanceof Error ? e.message : e)
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
  aiSummary: import('@/lib/brief/ai-summary').BriefMgmtSummary | null
  fallbackPreview: string
}): string {
  const summaryBlock = renderSummaryBlock(opts.aiSummary, opts.fallbackPreview)
  const attentionBlock = opts.aiSummary && opts.aiSummary.attention.length > 0
    ? `<div dir="rtl" style="background:#fef2f2;border-right:3px solid #dc2626;padding:14px 16px;border-radius:6px;margin:0 0 18px;font-size:14px;line-height:1.7;color:#1a1a2e;text-align:right;">
        <strong style="display:block;margin-bottom:6px;color:#991b1b;">לתשומת לב</strong>
        <ul style="margin:0;padding:0;list-style-position:inside;">
          ${opts.aiSummary.attention.map((a) => `<li style="margin-bottom:4px;">${escapeHtml(a)}</li>`).join('')}
        </ul>
      </div>`
    : ''
  // Gmail strips <html> tags — every container needs dir="rtl" + text-align:right
  // explicitly to render correctly.
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body dir="rtl" style="font-family:'Heebo',Arial,sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;direction:rtl;text-align:right;">
    <div dir="rtl" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;direction:rtl;text-align:right;">
      <p dir="rtl" style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;text-align:right;direction:ltr;unicode-bidi:plaintext;">Leaders × OS</p>
      <h1 dir="rtl" style="font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.3;text-align:right;">בריף התקבל — ${escapeHtml(opts.clientName)}</h1>
      <p dir="rtl" style="font-size:14px;line-height:1.6;margin:0 0 22px;color:#555;text-align:right;">${opts.clientEmail ? `<span dir="ltr">${escapeHtml(opts.clientEmail)}</span> · ` : ''}${opts.senderName ? `הופנה ע״י ${escapeHtml(opts.senderName)}` : ''}</p>
      ${summaryBlock}
      ${attentionBlock}
      ${opts.briefDocLink ? `<p dir="rtl" style="margin:22px 0 8px;text-align:right;"><a href="${opts.briefDocLink}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9999px;font-weight:600;display:inline-block;font-size:14px;">פתח את הבריף המלא ב-Google Doc ↗</a></p>` : ''}
      <p dir="rtl" style="font-size:12px;color:#888;line-height:1.6;margin:20px 0 0;border-top:1px solid #e8e5dc;padding-top:14px;text-align:right;">הצעד הבא: לקרוא את הבריף ב-Drive. אם הוא תקין — להעביר את התיקייה ל-"נסגר" ידנית. זה פותח workspace ללקוח ומאפשר טופס התנעה.</p>
    </div></body></html>`
}

function renderSummaryBlock(
  s: import('@/lib/brief/ai-summary').BriefMgmtSummary | null,
  fallback: string,
): string {
  if (!s) {
    return fallback
      ? `<div dir="rtl" style="background:#f9f7f2;border:1px solid #e8e5dc;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.8;margin:0 0 18px;text-align:right;">${fallback}</div>`
      : ''
  }
  const headlineHtml = s.headline
    ? `<p dir="rtl" style="font-size:16px;font-weight:600;line-height:1.55;margin:0 0 16px;color:#1a1a2e;text-align:right;">${escapeHtml(s.headline)}</p>`
    : ''
  // div-based key/value rows render reliably RTL in every email client.
  // Each row: bold label on the right, value below on a new line. Cleaner than
  // a side-by-side table on mobile and bulletproof on Gmail.
  const bulletsHtml = s.bullets.length === 0
    ? ''
    : s.bullets
        .map(
          (b) => `<div dir="rtl" style="margin:0 0 12px;text-align:right;">
            <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">${escapeHtml(b.label)}</div>
            <div style="font-size:14px;line-height:1.6;color:#1a1a2e;">${escapeHtml(b.value)}</div>
          </div>`,
        )
        .join('')
  return `<div dir="rtl" style="background:#f9f7f2;border:1px solid #e8e5dc;border-radius:8px;padding:20px 22px;margin:0 0 18px;text-align:right;direction:rtl;">${headlineHtml}${bulletsHtml}</div>`
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
