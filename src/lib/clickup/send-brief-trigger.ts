/**
 * ClickUp "📤 שלח בריף" status trigger.
 *
 * When a user changes a lead task's status to BRIEF_TRIGGER_STATUS in
 * ClickUp, the inbound webhook calls runClickUpSendBriefTrigger(). We
 * validate that the lead has the required fields, send the brief, and
 * either advance the status (success) or revert it to whatever it was
 * before the user clicked (failure).
 *
 * The user gets immediate feedback inside ClickUp:
 *   - Success → status moves to "ליד אחרי שיחה" + comment "✅ נשלח אל X"
 *   - Failure → status snaps back + comment listing what's missing
 *
 * No emails go out on failure. No Slack pings. Everything stays in
 * ClickUp because that's where the user just clicked.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  addClickUpTaskComment,
  updateClickUpTaskStatus,
} from './client'
import { sendClientBrief } from '@/lib/brief/send'

export const BRIEF_TRIGGER_STATUS = '📤 שלח בריף'
export const BRIEF_SUCCESS_STATUS = 'ליד אחרי שיחה'
const FALLBACK_PREVIOUS_STATUS = 'Open'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface RunInput {
  taskId: string
  leadId: string
  triggeredByEmail: string | null
  /** The status the task was on right before the trigger was clicked.
   *  If null, we revert to FALLBACK_PREVIOUS_STATUS. */
  previousStatus: string | null
}

interface RunResult {
  success: boolean
  reason?: string
}

/** Service-role Supabase client. */
function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Reset status to whatever the task was on before — or a safe fallback. */
async function revertStatus(taskId: string, previousStatus: string | null) {
  const target = previousStatus || FALLBACK_PREVIOUS_STATUS
  await updateClickUpTaskStatus(taskId, target).catch((e) => {
    console.warn(`[clickup-send-brief] revert to "${target}" failed:`, e)
  })
}

/** Best-effort comment + status revert pair. Used on every failure path. */
async function failWithComment(
  taskId: string,
  previousStatus: string | null,
  comment: string,
  reason: string,
): Promise<RunResult> {
  console.log(`[clickup-send-brief] task=${taskId} fail: ${reason}`)
  await addClickUpTaskComment(taskId, comment).catch((e) => {
    console.warn(`[clickup-send-brief] addComment failed:`, e)
  })
  await revertStatus(taskId, previousStatus)
  return { success: false, reason }
}

export async function runClickUpSendBriefTrigger(input: RunInput): Promise<RunResult> {
  const { taskId, leadId, triggeredByEmail, previousStatus } = input
  console.log(
    `[clickup-send-brief] trigger task=${taskId} lead=${leadId} by=${triggeredByEmail || '?'} prev=${previousStatus || '?'}`,
  )
  const sb = service()

  // 1. Load the lead row.
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('id, name, email, phone, metadata')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr || !lead) {
    return failWithComment(
      taskId,
      previousStatus,
      `❌ לא ניתן לשלוח בריף — הליד לא נמצא במערכת. פנה ל-CTO.`,
      'lead_not_found',
    )
  }

  // 2. Validate fields.
  const missing: string[] = []
  const hasValidEmail = !!(lead.email && EMAIL_RE.test(lead.email.trim()))
  const hasValidName = !!(lead.name && lead.name.trim().length >= 2)
  if (!hasValidName) missing.push('שם הלקוח')
  if (!hasValidEmail) missing.push('אימייל הלקוח')
  if (missing.length > 0) {
    const what = missing.join(' ו')
    return failWithComment(
      taskId,
      previousStatus,
      `❌ לא ניתן לשלוח בריף — חסר ${what}. עדכן ב-Leaders × OS (דף הליד) ונסה שוב.`,
      `missing:${missing.join(',')}`,
    )
  }

  // 3. Resolve the triggering user's Gmail refresh_token.
  if (!triggeredByEmail) {
    return failWithComment(
      taskId,
      previousStatus,
      `❌ לא הצלחנו לזהות מי שינה את הסטטוס. נסה שוב כשאתה מחובר ל-ClickUp.`,
      'no_actor_email',
    )
  }
  const { data: senderUser } = await sb
    .from('users')
    .select('id, email, full_name')
    .eq('email', triggeredByEmail.toLowerCase())
    .maybeSingle()
  if (!senderUser) {
    const firstName = triggeredByEmail.split('@')[0]
    return failWithComment(
      taskId,
      previousStatus,
      `❌ לא ניתן לשלוח — ${firstName} לא רשום במערכת Leaders × OS. עליו להיכנס פעם אחת ולאשר את ההרשאות.`,
      'sender_not_in_users',
    )
  }
  const { data: tokenRow } = await sb
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', senderUser.id)
    .maybeSingle()
  if (!tokenRow?.refresh_token) {
    const firstName = senderUser.full_name || (senderUser.email || '').split('@')[0]
    return failWithComment(
      taskId,
      previousStatus,
      `❌ לא ניתן לשלוח — ${firstName} לא חיבר Gmail במערכת. עליו להיכנס פעם אחת ל-Leaders × OS, לאשר את ההרשאות, ואז ניתן לנסות שוב.`,
      'no_refresh_token',
    )
  }

  // 4. Send the brief.
  let result: Awaited<ReturnType<typeof sendClientBrief>>
  try {
    result = await sendClientBrief({
      clientName: lead.name.trim(),
      clientEmail: (lead.email as string).trim(),
      senderEmail: senderUser.email as string,
      senderName: senderUser.full_name || (senderUser.email as string),
      senderRefreshToken: tokenRow.refresh_token,
      leadId: lead.id,
      language: 'he',
      callerTag: `[clickup-send-brief:${taskId.slice(0, 8)}]`,
    })
  } catch (e) {
    return failWithComment(
      taskId,
      previousStatus,
      `❌ שליחה נכשלה: ${e instanceof Error ? e.message : String(e)}. נסה שוב או פנה ל-CTO.`,
      'send_threw',
    )
  }

  if (result.mailDelivery !== 'sent') {
    return failWithComment(
      taskId,
      previousStatus,
      `❌ שליחת המייל נכשלה: ${result.mailError || 'unknown'}. בריף נשמר ב-Drive — אפשר לשלוח את הקישור ידנית: ${result.fullLink}`,
      'mail_failed',
    )
  }

  // 5. Success — comment + advance status.
  const successComment = result.driveFolderLink
    ? `✅ בריף נשלח אל ${(lead.email as string).trim()}\n📁 תיקיית הלקוח ב-Drive: ${result.driveFolderLink}\n🔗 הקישור שנשלח: ${result.fullLink}`
    : `✅ בריף נשלח אל ${(lead.email as string).trim()}\n🔗 הקישור שנשלח: ${result.fullLink}`
  await addClickUpTaskComment(taskId, successComment).catch((e) => {
    console.warn(`[clickup-send-brief] success comment failed:`, e)
  })
  await updateClickUpTaskStatus(taskId, BRIEF_SUCCESS_STATUS).catch((e) => {
    console.warn(`[clickup-send-brief] success status update failed:`, e)
  })

  console.log(`[clickup-send-brief] task=${taskId} success → ${result.fullLink}`)
  return { success: true }
}
