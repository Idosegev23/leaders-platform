/**
 * POST /api/briefs/[token]/reminder
 * Nudge a client whose brief is still pending/opened.
 *
 * Body: { text?: string }
 *   text — optional override for the reminder body. Defaults to a
 *          system-generated nudge in the link's language.
 *
 * Rules:
 *   - Only fires for status in {pending, opened}. Completed / failed /
 *     archived / outcome'd briefs are no-ops.
 *   - 72-hour cooldown: if metadata.reminder_sent_at is within 72h we
 *     refuse, so the team can't accidentally spam.
 *   - The email is sent FROM the original sender's Gmail (not whoever
 *     clicks the button) — keeps the conversation threaded as the
 *     client expects.
 *   - Stamps metadata.reminder_sent_at / reminder_count and writes an
 *     activity_log entry for the dashboard ticker.
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'
import { sendGmailEmail } from '@/lib/gmail'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const COOLDOWN_HOURS = 72

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Auth — dev-mode bypass or real session.
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
  const customText = String((body as { text?: unknown }).text || '').trim() || null

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: link, error: linkErr } = await service
    .from('document_links')
    .select(`
      id, token, status, client_name, client_email, created_by_email,
      created_by_name, metadata, created_at, opened_at,
      document_types (slug, target_url)
    `)
    .eq('token', token)
    .maybeSingle()

  if (linkErr || !link) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  const docType = link.document_types as { slug?: string; target_url?: string } | null
  if (docType?.slug !== 'client-brief') {
    return NextResponse.json({ error: 'Not a client-brief link' }, { status: 400 })
  }
  if (!link.client_email) {
    return NextResponse.json({ error: 'Brief has no client_email' }, { status: 400 })
  }
  if (link.status !== 'pending' && link.status !== 'opened') {
    return NextResponse.json(
      { error: 'Reminder only available for pending/opened briefs', current_status: link.status },
      { status: 409 },
    )
  }

  const meta = (link.metadata as Record<string, unknown> | null) ?? {}

  // Cooldown check.
  const lastReminder = meta.reminder_sent_at ? new Date(String(meta.reminder_sent_at)) : null
  if (lastReminder && !Number.isNaN(lastReminder.getTime())) {
    const hoursSince = (Date.now() - lastReminder.getTime()) / 3_600_000
    if (hoursSince < COOLDOWN_HOURS) {
      const hoursLeft = Math.ceil(COOLDOWN_HOURS - hoursSince)
      return NextResponse.json(
        { error: 'cooldown', message: `נשלחה תזכורת לפני פחות מ-72 שעות. נסה שוב בעוד ${hoursLeft}ש'`, cooldown_hours_left: hoursLeft },
        { status: 429 },
      )
    }
  }

  // Resolve sender's Gmail refresh token. We want to keep the conversation
  // on the original thread, so we look up the original `created_by_email`,
  // not the actor clicking the button.
  const senderEmail = link.created_by_email
  if (!senderEmail) {
    return NextResponse.json({ error: 'Brief has no original sender' }, { status: 400 })
  }
  const { data: senderUser } = await service
    .from('users')
    .select('id')
    .eq('email', senderEmail.toLowerCase())
    .maybeSingle()
  if (!senderUser?.id) {
    return NextResponse.json(
      { error: 'Original sender is no longer registered — cannot send reminder via their mailbox' },
      { status: 422 },
    )
  }
  const { data: tokenRow } = await service
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', senderUser.id)
    .maybeSingle()
  if (!tokenRow?.refresh_token) {
    return NextResponse.json(
      { error: 'No Gmail token for the original sender — they must sign in once to grant Gmail access' },
      { status: 422 },
    )
  }

  // Compose the reminder.
  const language = (meta.language as 'he' | 'en' | undefined) === 'en' ? 'en' : 'he'
  const daysSinceSent = Math.max(
    1,
    Math.floor((Date.now() - new Date(link.created_at).getTime()) / 86_400_000),
  )
  const briefLink = `${appBaseUrl()}${docType.target_url || '/forms/client-brief'}?token=${link.token}`
  const senderName = link.created_by_name || senderEmail.split('@')[0]
  const reminderText = customText || defaultReminderText({
    language,
    clientName: link.client_name || '',
    daysSinceSent,
    senderName,
  })
  const subject = language === 'en'
    ? `Quick reminder — your brief from ${senderName}`
    : `תזכורת קטנה — הבריף ש${senderName} שלח/ה לך`

  const html = buildReminderHtml({
    language,
    clientName: link.client_name || '',
    body: reminderText,
    link: briefLink,
    senderName,
  })

  try {
    await sendGmailEmail({
      refreshToken: tokenRow.refresh_token,
      from: senderEmail,
      fromName: senderName,
      to: link.client_email,
      subject,
      html,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[/api/briefs/reminder] gmail send failed:', msg)
    return NextResponse.json({ error: 'gmail_send_failed', detail: msg }, { status: 502 })
  }

  // Persist reminder state.
  const reminderCount = Number(meta.reminder_count || 0) + 1
  const nowIso = new Date().toISOString()
  await service
    .from('document_links')
    .update({
      metadata: {
        ...meta,
        reminder_sent_at: nowIso,
        reminder_count: reminderCount,
        last_reminder_text: reminderText,
        last_reminder_by_email: actorEmail,
      },
    })
    .eq('id', link.id)

  // Activity log for the dashboard ticker.
  try {
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: 'brief_reminder_sent',
      summary: `${actorName} שלח/ה תזכורת ל-${link.client_name || link.client_email}`,
      entity_type: 'document_link',
      entity_id: link.id,
      actor_email: actorEmail,
      actor_name: actorName,
      payload: {
        document_link_id: link.id,
        token: link.token,
        reminder_count: reminderCount,
        days_since_sent: daysSinceSent,
      },
    })
  } catch (e) {
    console.warn('[/api/briefs/reminder] activity_log failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    reminder_sent_at: nowIso,
    reminder_count: reminderCount,
  })
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

function defaultReminderText(opts: {
  language: 'he' | 'en'
  clientName: string
  daysSinceSent: number
  senderName: string
}): string {
  if (opts.language === 'en') {
    return `Hi${opts.clientName ? ' ' + opts.clientName : ''},

Just a soft nudge — I sent over the brief about ${opts.daysSinceSent} day${opts.daysSinceSent === 1 ? '' : 's'} ago and we're holding a slot to get started as soon as you submit. It only takes ~15 minutes, and your answers save as you go.

Happy to jump on a quick call if anything's unclear.`
  }
  return `היי${opts.clientName ? ' ' + opts.clientName : ''},

רציתי להזכיר בעדינות — שלחתי את הבריף לפני כ-${opts.daysSinceSent} ימים ושמרנו לך מקום להתחיל מיד אחרי המילוי. זה לוקח כ-15 דקות, ומה שמילאת נשמר אוטומטית.

אם משהו לא ברור, אשמח לקפוץ על שיחה קצרה.`
}

function buildReminderHtml(opts: {
  language: 'he' | 'en'
  clientName: string
  body: string
  link: string
  senderName: string
}): string {
  const isHe = opts.language !== 'en'
  const dir = isHe ? 'rtl' : 'ltr'
  const lang = isHe ? 'he' : 'en'
  const bodyHtml = opts.body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="font-size:15px;line-height:1.75;margin:0 0 14px;color:#1a1a2e;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const cta = isHe ? 'פתח את הבריף ←' : 'Open the brief →'
  const eyebrow = isHe ? 'Leaders × OS' : 'Leaders × OS'
  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="${dir}" style="margin:0;padding:0;background:#f5f3ef;font-family:'Heebo','Helvetica Neue',Arial,sans-serif;color:#1a1a2e;">
  <div dir="${dir}" style="padding:32px 16px;">
    <div dir="${dir}" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;text-align:${isHe ? 'right' : 'left'};">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;direction:ltr;text-align:${isHe ? 'right' : 'left'};unicode-bidi:plaintext;">${eyebrow}</p>
      ${bodyHtml}
      <div style="text-align:center;margin:24px 0 16px;">
        <a href="${opts.link}" style="background:#1a1a2e;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9999px;font-weight:600;display:inline-block;font-size:15px;">${cta}</a>
      </div>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0 16px;">
      <p style="font-size:13px;color:#777;margin:0;">${escapeHtml(opts.senderName)} • Leaders</p>
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
