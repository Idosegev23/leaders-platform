/**
 * Helpers for sending mail to the Leaders management group.
 *
 * Recipient policy: read MANAGEMENT_EMAILS / ADMIN_EMAILS env (comma-separated),
 * fall back to the three approved test recipients (CTO, Noa Sabagi, Yoav Bogin).
 *
 * Hard rule: NEVER include Eran Nizri (Leaders owner) in any automated send.
 * He can be added manually outside this codepath if needed.
 *
 * Sender policy: prefer the user who triggered the action (we look up their
 * `user_google_tokens.refresh_token`). Fall back to a configured "system"
 * sender (SYSTEM_SENDER_EMAIL) so cron / unattended flows still go out.
 */

import { sendGmailEmail, sendGmailViaServiceAccount } from '@/lib/gmail'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const APPROVED_FALLBACK = [
  'cto@ldrsgroup.com',
  'noa@ldrsgroup.com',
  'yoav@ldrsgroup.com',
] as const

// Block Eran Nizri's known emails just in case anyone adds him to env vars.
// See memory: feedback_exclude_eran_nizri_from_tests.
const HARD_BLOCKLIST = new Set<string>([
  'eran@ldrsgroup.com',
  'eran.nizri@ldrsgroup.com',
  'erann@ldrsgroup.com',
])

export function getManagementRecipients(extra: Array<string | null | undefined> = []): string[] {
  const raw =
    process.env.MANAGEMENT_EMAILS ||
    process.env.ADMIN_EMAILS ||
    APPROVED_FALLBACK.join(',')
  const parsed = [...raw.split(','), ...extra]
    .map((s) => (s ?? '').toString().trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .filter((s) => !HARD_BLOCKLIST.has(s))
  return Array.from(new Set(parsed))
}

/**
 * Resolve a refresh_token for a sender email. Returns null if no token is
 * stored — caller should fall back to the system sender or skip silently.
 */
async function resolveRefreshToken(senderEmail: string): Promise<string | null> {
  if (!senderEmail) return null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  const sb = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: user } = await sb
    .from('users')
    .select('id')
    .eq('email', senderEmail.toLowerCase())
    .single()
  if (!user) return null
  const { data: token } = await sb
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()
  return token?.refresh_token || null
}

/**
 * Send a single notification to all management recipients. Each address gets
 * its own Gmail send so a bounce on one doesn't block the others. Returns
 * the number of successful sends + a list of failures for logging.
 */
export async function sendToManagement(params: {
  senderEmail?: string         // Person who triggered the event (preferred)
  senderName?: string
  subject: string
  html: string
  /** Override recipient list. If omitted, uses getManagementRecipients(). */
  to?: string[]
}): Promise<{ sent: number; failed: Array<{ to: string; error: string }> }> {
  const recipients = params.to?.length ? params.to : getManagementRecipients()
  if (recipients.length === 0) {
    console.warn('[mgmt-mail] no recipients — set MANAGEMENT_EMAILS env')
    return { sent: 0, failed: [] }
  }

  // Pick the sender + send mechanism. User-triggered flows pass senderEmail and
  // we use their OAuth refresh_token. When there's no token (e.g. Salesforce-
  // created briefs attributed to info@), fall back to the service account
  // impersonating the shared mailbox (BRIEF_DEFAULT_SENDER_EMAIL).
  const senderEmail =
    params.senderEmail || process.env.SYSTEM_SENDER_EMAIL || ''
  const refreshToken = senderEmail ? await resolveRefreshToken(senderEmail) : null
  const serviceSender = (process.env.BRIEF_DEFAULT_SENDER_EMAIL || '').trim()
  const useServiceAccount = !refreshToken && !!serviceSender
  if (!refreshToken && !useServiceAccount) {
    console.warn(
      `[mgmt-mail] no refresh_token for "${senderEmail}" and BRIEF_DEFAULT_SENDER_EMAIL unset — cannot send`,
    )
    return { sent: 0, failed: recipients.map((to) => ({ to, error: 'no_sender' })) }
  }

  const senderName = params.senderName || 'Leaders'
  const fromEmail = useServiceAccount ? serviceSender : senderEmail
  const failed: Array<{ to: string; error: string }> = []
  let sent = 0
  for (const to of recipients) {
    try {
      if (useServiceAccount) {
        await sendGmailViaServiceAccount({
          from: fromEmail,
          fromName: senderName,
          to,
          subject: params.subject,
          html: params.html,
        })
      } else {
        await sendGmailEmail({
          refreshToken: refreshToken!,
          from: fromEmail,
          fromName: senderName,
          to,
          subject: params.subject,
          html: params.html,
        })
      }
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[mgmt-mail] send to ${to} failed:`, msg)
      failed.push({ to, error: msg })
    }
  }
  return { sent, failed }
}
