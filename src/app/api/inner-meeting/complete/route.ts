/**
 * POST /api/inner-meeting/complete
 *
 * Body: { formId: string, payload: InnerMeetingFormData }
 *
 * Replaces the legacy Make.com webhook for kickoff (inner-meeting) forms.
 * Server-side cascade:
 *   1. Mail management with the formatted kickoff brief.
 *   2. Mark forms.status = 'completed'.
 *   3. Stamp activity_log so the dashboard ticker picks it up.
 *
 * Auth: requires a logged-in employee. The form itself is collaborative —
 * once any participant hits "complete", the cascade fires once.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Participant {
  name?: string
  email?: string
  hebrewName?: string
}
interface KickoffPayload {
  clientName: string
  meetingDate: string
  participants: Participant[]
  creativeWriter: Participant[]
  presenter: Participant[]
  presentationMaker: Participant[]
  accountManager: Participant[]
  mediaPerson?: Participant[]
  aboutBrand: string
  targetAudiences: string
  goals: string
  insight: string
  strategy: string
  mediaStrategy?: string
  creative: string
  creativePresentation?: string
  influencersExample?: string
  additionalNotes?: string
  budgetDistribution?: string
  creativeDeadline: string
  internalDeadline: string
  clientDeadline: string
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as {
    formId?: string
    payload?: KickoffPayload
    /** Existing ClickUp customer-list id (when picked from the dropdown).
     *  If null/missing, the cascade creates a new list under the
     *  "Leaders Customers" folder using payload.clientName. */
    clickupListId?: string | null
  } | null
  if (!body?.formId || !body.payload) {
    return NextResponse.json({ error: 'formId and payload required' }, { status: 400 })
  }

  const { formId, payload, clickupListId: existingListId } = body
  const tag = `[kickoff:${formId.slice(0, 8)}]`
  console.log(`${tag} complete — sender=${user.email} client="${payload.clientName}"`)

  // 1. Email management
  let mailSent = 0
  let mailFailed = 0
  try {
    const { sendToManagement } = await import('@/lib/gmail/management')
    const { getEventRecipients } = await import('@/lib/notifications/recipients')
    const html = buildKickoffHtml(payload, user.user_metadata?.full_name ?? user.email)
    const to = getEventRecipients('inner_meeting_completed')
    console.log(`${tag} mgmt mail recipients:`, to.join(', '))
    const result = await sendToManagement({
      senderEmail: user.email,
      senderName: user.user_metadata?.full_name ?? user.email,
      subject: `🚀 פגישת התנעה — ${payload.clientName}`,
      html,
      to,
    })
    mailSent = result.sent
    mailFailed = result.failed.length
    console.log(`${tag} mgmt mail: sent=${mailSent} failed=${mailFailed}`)
  } catch (e) {
    console.warn(`${tag} mgmt mail error:`, e instanceof Error ? e.message : e)
  }

  // 2. Mark form completed (using service client to bypass RLS)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { error: updateErr } = await service
    .from('forms')
    .update({ status: 'completed' })
    .eq('id', formId)
  if (updateErr) {
    console.error(`${tag} forms.update failed:`, updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 2.5 ClickUp cascade — find-or-create customer list, then create one
  // task per picked role (assignee = the picked user). All best-effort:
  // failures here don't fail the form completion.
  let clickup: {
    listId: string | null
    listName: string | null
    listCreated: boolean
    driveFolderUrl: string | null
    tasks: Array<{ role: string; status: string; taskUrl?: string; error?: string }>
  } = { listId: null, listName: null, listCreated: false, driveFolderUrl: null, tasks: [] }
  try {
    const {
      findOrCreateCustomerList,
      createKickoffTasks,
      type: _t1,
    } = await import('@/lib/clickup/customer-tasks').then((m) => ({
      findOrCreateCustomerList: m.findOrCreateCustomerList,
      createKickoffTasks: m.createKickoffTasks,
      type: undefined,
    }))
    void _t1

    // Resolve the customer list — picked from dropdown OR find-or-create.
    let listId: string
    let listName: string
    let listCreated = false
    if (existingListId) {
      listId = existingListId
      listName = payload.clientName
      console.log(`${tag} ClickUp: using existing list ${listId} ("${listName}")`)
    } else {
      const resolved = await findOrCreateCustomerList({ name: payload.clientName })
      listId = resolved.id
      listName = resolved.name
      listCreated = resolved.created
      console.log(
        `${tag} ClickUp: ${listCreated ? 'created' : 'matched'} list ${listId} ("${listName}")`,
      )
    }

    // Resolve the Drive workspace URL (set when the brief completed) —
    // we link every kickoff task back to the per-client folder.
    let driveFolderUrl: string | null = null
    try {
      const { data: link } = await service
        .from('document_links')
        .select('metadata')
        .eq('client_name', payload.clientName)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const meta = (link?.metadata as Record<string, unknown> | null) ?? {}
      driveFolderUrl =
        (meta.workspace_drive_folder_link as string | undefined) ||
        (meta.brief_drive_folder_link as string | undefined) ||
        null
    } catch { /* non-fatal */ }

    // Build picks from each role-array head (only roles with a real email).
    type RoleKey = 'creativeWriter' | 'presenter' | 'presentationMaker' | 'accountManager' | 'mediaPerson'
    const roleEntries: Array<[RoleKey, Participant[] | undefined]> = [
      ['creativeWriter', payload.creativeWriter],
      ['presenter', payload.presenter],
      ['presentationMaker', payload.presentationMaker],
      ['accountManager', payload.accountManager],
      ['mediaPerson', payload.mediaPerson],
    ]
    const picks = roleEntries
      .map(([key, arr]) => {
        const head = arr?.[0]
        if (!head?.email) return null
        return { key, email: head.email, name: head.name, hebrewName: head.hebrewName }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (picks.length === 0) {
      console.log(`${tag} ClickUp: no role-picks with emails — skipping task creation`)
    } else {
      const senderName = user.user_metadata?.full_name ?? user.email
      const briefHtml = buildKickoffHtml(payload, senderName)
      const tasks = await createKickoffTasks({
        listId,
        clientName: payload.clientName,
        meetingDate: payload.meetingDate,
        driveFolderUrl: driveFolderUrl || undefined,
        picks,
        briefDescriptionHtml: briefHtml,
        deadlines: {
          creative: payload.creativeDeadline ? new Date(payload.creativeDeadline).getTime() : undefined,
          internal: payload.internalDeadline ? new Date(payload.internalDeadline).getTime() : undefined,
          client:   payload.clientDeadline   ? new Date(payload.clientDeadline).getTime()   : undefined,
        },
        prefixWithDate: !!existingListId, // existing list → date-prefix tasks
      })
      const created = tasks.filter((t) => t.status === 'created').length
      const failed = tasks.filter((t) => t.status === 'failed').length
      const skipped = tasks.filter((t) => t.status === 'skipped_no_user').length
      console.log(`${tag} ClickUp tasks: created=${created} failed=${failed} skipped_no_user=${skipped}`)
      clickup = {
        listId,
        listName,
        listCreated,
        driveFolderUrl,
        tasks: tasks.map((t) => ({
          role: t.role,
          status: t.status,
          taskUrl: t.taskUrl,
          error: t.error,
        })),
      }
    }
  } catch (e) {
    console.warn(`${tag} ClickUp cascade error (non-fatal):`, e instanceof Error ? e.message : e)
  }

  // 3. activity_log
  try {
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: 'inner_meeting_completed',
      summary: `${user.user_metadata?.full_name ?? user.email} סיים טופס התנעה — ${payload.clientName}`,
      entity_type: 'form',
      entity_id: formId,
      actor_email: user.email,
      actor_name: user.user_metadata?.full_name ?? user.email,
      payload: {
        client_name: payload.clientName,
        meeting_date: payload.meetingDate,
      },
    })
  } catch (e) {
    console.warn(`${tag} activity_log error:`, e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    mail: { sent: mailSent, failed: mailFailed },
    clickup,
  })
}

function buildKickoffHtml(p: KickoffPayload, senderName: string): string {
  const role = (label: string, parts?: Participant[]) => {
    const v = parts?.[0]
    if (!v?.name) return ''
    return `<tr><td style="padding:4px 0;color:#666;font-size:13px;">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:13px;">${escapeHtml(v.hebrewName || v.name)}${v.email ? ` <span style="color:#999;">· ${escapeHtml(v.email)}</span>` : ''}</td></tr>`
  }
  const section = (label: string, value: string) => {
    if (!value?.trim()) return ''
    return `<div style="margin:18px 0;">
      <p style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin:0 0 6px;">${escapeHtml(label)}</p>
      <p style="font-size:14px;line-height:1.7;color:#1a1a2e;margin:0;white-space:pre-wrap;">${escapeHtml(value)}</p>
    </div>`
  }
  const dateFmt = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '-'
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS · פגישת התנעה</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">${escapeHtml(p.clientName)}</h1>
      <p style="font-size:13px;color:#888;margin:0 0 24px;">פגישה: ${dateFmt(p.meetingDate)} · נשלח ע״י ${escapeHtml(senderName)}</p>

      <p style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin:0 0 8px;">צוות</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        ${role('כותב/ת קריאייטיב', p.creativeWriter)}
        ${role('מציג/ה', p.presenter)}
        ${role('יוצר/ת מצגת', p.presentationMaker)}
        ${role('אקאונט מנג׳ר', p.accountManager)}
        ${role('מדיה', p.mediaPerson)}
      </table>

      ${section('על המותג', p.aboutBrand)}
      ${section('קהלי יעד', p.targetAudiences)}
      ${section('מטרות', p.goals)}
      ${section('תובנה', p.insight)}
      ${section('אסטרטגיה', p.strategy)}
      ${section('אסטרטגיית מדיה', p.mediaStrategy || '')}
      ${section('קריאייטיב', p.creative)}
      ${section('הצגת קריאייטיב', p.creativePresentation || '')}
      ${section('דוגמת משפיענים', p.influencersExample || '')}
      ${section('חלוקת תקציב', p.budgetDistribution || '')}
      ${section('הערות נוספות', p.additionalNotes || '')}

      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin:0 0 8px;">דדליינים</p>
      <p style="font-size:13px;line-height:1.8;margin:0;">קריאייטיב: ${dateFmt(p.creativeDeadline)} · פנימי: ${dateFmt(p.internalDeadline)} · ללקוח: ${dateFmt(p.clientDeadline)}</p>
    </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
