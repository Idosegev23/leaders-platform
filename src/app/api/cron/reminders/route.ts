import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGmailEmail } from '@/lib/gmail'
import {
  countBusinessDaysBetween,
  isOlderThanNBusinessDays,
} from '@/lib/businessDays'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/reminders
 *
 * Daily cron (configured in vercel.json). Three reminder kinds:
 *
 *   1. `client-brief` link pending > 7 Israeli business days →
 *      send Gmail reminder from the creator's account to themselves,
 *      then stamp `reminder_sent_at` so we don't nag again.
 *   2. `inner-meeting` draft with no activity for 7+ days → webhook batch.
 *   3. `inner-meeting` with a deadline inside the next 48h → webhook batch.
 *
 * Auth: Vercel Cron adds `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is set. We only gate when the var is present — dev convenience.
 */
const REMINDERS_WEBHOOK =
  process.env.REMINDERS_WEBHOOK_URL ||
  'https://hook.eu2.make.com/PLACEHOLDER_REPLACE_ME_reminders'

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function hoursUntil(isoDate: string): number {
  const deadline = new Date(`${isoDate}T23:59:59`)
  return (deadline.getTime() - Date.now()) / 3_600_000
}

function buildReminderEmailHtml(params: {
  creatorName: string
  clientEmail: string
  briefLink: string
  daysPassed: number
  language: 'he' | 'en'
}) {
  const { creatorName, clientEmail, briefLink, daysPassed, language } = params

  if (language === 'en') {
    return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f0f8;font-family:Arial,Helvetica,sans-serif;direction:ltr;color:#1a1a2e;line-height:1.8">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f0f8;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(26,26,46,0.08)">
<tr><td align="center" style="padding:50px 40px 20px">
<img src="${appBaseUrl()}/logo.png" width="160" alt="Leaders" style="display:block" />
</td></tr>
<tr><td align="center" style="padding:10px 40px 5px">
<div style="font-size:28px;font-weight:bold;color:#1a1a2e;margin:0">Follow-Up Reminder</div>
</td></tr>
<tr><td align="center" style="padding:8px 0 30px">
<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#f0c040;height:3px;width:60px;font-size:1px;line-height:3px">&nbsp;</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px">
<table width="100%" cellpadding="24" cellspacing="0" border="0" style="background-color:#1a1a2e;border-radius:10px;margin-bottom:24px">
<tr><td>
<div style="font-size:10px;font-weight:bold;color:#f0c040;text-transform:uppercase;margin-bottom:10px">&#9888; PENDING BRIEF</div>
<div style="font-size:20px;font-weight:bold;color:#ffffff;margin-bottom:12px">Hello ${creatorName},</div>
<div style="font-size:16px;color:#ffffff;line-height:1.8;opacity:0.9">The brief sent to <strong style="color:#f0c040">${clientEmail}</strong> has not been filled yet. It has been <strong style="color:#e94560">${daysPassed} business days</strong> since it was sent.</div>
</td></tr>
</table>
<table width="100%" cellpadding="20" cellspacing="0" border="0" style="background-color:#fafbfe;border:1px solid #f0f0f8;border-radius:10px;margin-bottom:28px">
<tr><td>
<div style="font-size:10px;font-weight:bold;color:#e94560;text-transform:uppercase;margin-bottom:10px">&#9679; RECOMMENDED ACTION</div>
<div style="font-size:14px;color:#1a1a2e;line-height:1.9">We recommend reaching out to the client and reminding them to fill out the brief. You can resend the link below or contact them directly.</div>
</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 36px">
<a href="${briefLink}" target="_blank" style="display:inline-block;background-color:#e94560;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 48px;border-radius:8px;letter-spacing:0.5px">View Brief Link</a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#1a1a2e;padding:28px 40px;text-align:center">
<div style="font-size:12px;color:#8e8ea0;margin-bottom:4px">Automatic reminder from <strong style="color:#e94560">Leaders</strong></div>
<div style="font-size:11px;color:rgba(255,255,255,0.3)">&copy; ${new Date().getFullYear()} Leaders Group. All rights reserved.</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f0f8;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#1a1a2e;line-height:1.8">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f0f8;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(26,26,46,0.08)">
<tr><td align="center" style="padding:50px 40px 20px">
<img src="${appBaseUrl()}/logo.png" width="160" alt="Leaders" style="display:block" />
</td></tr>
<tr><td align="center" style="padding:10px 40px 5px">
<div style="font-size:28px;font-weight:bold;color:#1a1a2e;margin:0">תזכורת מעקב</div>
</td></tr>
<tr><td align="center" style="padding:8px 0 30px">
<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#f0c040;height:3px;width:60px;font-size:1px;line-height:3px">&nbsp;</td></tr></table>
</td></tr>
<tr><td style="padding:0 40px">
<table width="100%" cellpadding="24" cellspacing="0" border="0" style="background-color:#1a1a2e;border-radius:10px;margin-bottom:24px">
<tr><td>
<div style="font-size:10px;font-weight:bold;color:#f0c040;text-transform:uppercase;margin-bottom:10px">&#9888; בריף ממתין</div>
<div style="font-size:20px;font-weight:bold;color:#ffffff;margin-bottom:12px">שלום ${creatorName},</div>
<div style="font-size:16px;color:#ffffff;line-height:1.8;opacity:0.9">הבריף שנשלח ל-<strong style="color:#f0c040">${clientEmail}</strong> טרם מולא. עברו <strong style="color:#e94560">${daysPassed} ימי עסקים</strong> מאז השליחה.</div>
</td></tr>
</table>
<table width="100%" cellpadding="20" cellspacing="0" border="0" style="background-color:#fafbfe;border:1px solid #f0f0f8;border-radius:10px;margin-bottom:28px">
<tr><td>
<div style="font-size:10px;font-weight:bold;color:#e94560;text-transform:uppercase;margin-bottom:10px">&#9679; מה מומלץ לעשות?</div>
<div style="font-size:14px;color:#1a1a2e;line-height:1.9">מומלץ ליצור קשר עם הלקוח ולהזכיר לו למלא את הבריף. ניתן לשלוח מחדש את הקישור למטה או לפנות ישירות.</div>
</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 36px">
<a href="${briefLink}" target="_blank" style="display:inline-block;background-color:#e94560;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 48px;border-radius:8px;letter-spacing:0.5px">צפה בקישור הבריף</a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#1a1a2e;padding:28px 40px;text-align:center">
<div style="font-size:12px;color:#8e8ea0;margin-bottom:4px">תזכורת אוטומטית מ-<strong style="color:#e94560">Leaders</strong></div>
<div style="font-size:11px;color:rgba(255,255,255,0.3)">© ${new Date().getFullYear()} Leaders Group. All rights reserved.</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`
}

type WebhookReminder =
  | {
      kind: 'stale_inner_meeting_draft'
      form_id: string
      share_token: string
      title: string | null
      last_editor_email: string | null
      last_editor_name: string | null
      updated_at: string
      days_idle: number
    }
  | {
      kind: 'upcoming_deadline'
      form_id: string
      share_token: string
      client_name: string | null
      deadline_type: 'creative' | 'internal' | 'client'
      deadline_date: string
      hours_until: number
      last_editor_email: string | null
    }

type BriefReminderResult = {
  link_id: string
  token: string
  creator_email: string
  client_email: string
  business_days_passed: number
  delivery: 'sent' | 'skipped_no_token' | 'skipped_no_user' | 'failed'
  error?: string
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const briefResults: BriefReminderResult[] = []
  const webhookReminders: WebhookReminder[] = []

  // 1. Pending brief links > 7 Israeli business days → Gmail reminder.
  {
    const { data: briefType } = await supabase
      .from('document_types')
      .select('id')
      .eq('slug', 'client-brief')
      .maybeSingle()

    if (briefType) {
      const { data: candidates } = await supabase
        .from('document_links')
        .select(
          'id, token, created_by_email, created_by_name, client_name, client_email, metadata, created_at',
        )
        .eq('document_type_id', briefType.id)
        .eq('status', 'pending')
        .is('reminder_sent_at', null)
        .not('client_email', 'is', null)

      const overdue = (candidates ?? []).filter((r) =>
        isOlderThanNBusinessDays(new Date(r.created_at), 7),
      )

      if (overdue.length > 0) {
        const creatorEmails = Array.from(
          new Set(
            overdue
              .map((r) => r.created_by_email?.toLowerCase())
              .filter((e): e is string => !!e),
          ),
        )
        const { data: users } = await supabase
          .from('users')
          .select('id, email')
          .in('email', creatorEmails)

        const userIdByEmail = new Map(
          (users ?? []).map((u) => [u.email.toLowerCase(), u.id]),
        )
        const userIds = (users ?? []).map((u) => u.id)

        const { data: tokens } = userIds.length
          ? await supabase
              .from('user_google_tokens')
              .select('user_id, refresh_token')
              .in('user_id', userIds)
          : { data: [] }

        const tokenByUserId = new Map(
          (tokens ?? []).map((t) => [t.user_id, t.refresh_token]),
        )

        for (const brief of overdue) {
          const creatorEmailLower = brief.created_by_email.toLowerCase()
          const userId = userIdByEmail.get(creatorEmailLower)
          const refreshToken = userId ? tokenByUserId.get(userId) : null

          const businessDaysPassed = countBusinessDaysBetween(
            new Date(brief.created_at),
            new Date(),
          )

          if (!userId) {
            briefResults.push({
              link_id: brief.id,
              token: brief.token,
              creator_email: brief.created_by_email,
              client_email: brief.client_email!,
              business_days_passed: businessDaysPassed,
              delivery: 'skipped_no_user',
            })
            continue
          }
          if (!refreshToken) {
            briefResults.push({
              link_id: brief.id,
              token: brief.token,
              creator_email: brief.created_by_email,
              client_email: brief.client_email!,
              business_days_passed: businessDaysPassed,
              delivery: 'skipped_no_token',
            })
            continue
          }

          const metaLang = (brief.metadata as { language?: string } | null)?.language
          const language: 'he' | 'en' = metaLang === 'en' ? 'en' : 'he'
          const creatorName = brief.created_by_name || brief.created_by_email
          const briefLink = `${appBaseUrl()}/forms/client-brief?token=${brief.token}`
          const subject =
            language === 'en'
              ? `Reminder: ${brief.client_email} hasn't filled the brief yet — Leaders`
              : `תזכורת: ${brief.client_email} טרם מילא את הבריף — Leaders`
          const html = buildReminderEmailHtml({
            creatorName,
            clientEmail: brief.client_email!,
            briefLink,
            daysPassed: businessDaysPassed,
            language,
          })

          try {
            await sendGmailEmail({
              refreshToken,
              from: brief.created_by_email,
              fromName: creatorName,
              to: brief.created_by_email,
              subject,
              html,
            })
            await supabase
              .from('document_links')
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq('id', brief.id)
            briefResults.push({
              link_id: brief.id,
              token: brief.token,
              creator_email: brief.created_by_email,
              client_email: brief.client_email!,
              business_days_passed: businessDaysPassed,
              delivery: 'sent',
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error(`Reminder failed for link ${brief.id}:`, msg)
            briefResults.push({
              link_id: brief.id,
              token: brief.token,
              creator_email: brief.created_by_email,
              client_email: brief.client_email!,
              business_days_passed: businessDaysPassed,
              delivery: 'failed',
              error: msg,
            })
          }
        }
      }
    }
  }

  // 2. Stale inner-meeting drafts (> 7 calendar days idle).
  {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: forms } = await supabase
      .from('forms')
      .select('id, share_token, title, updated_at')
      .eq('type', 'inner_meeting')
      .eq('status', 'draft')
      .lt('updated_at', cutoff)

    for (const form of forms ?? []) {
      const { data: lastLog } = await supabase
        .from('form_activity_logs')
        .select('user_email, user_name')
        .eq('form_id', form.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      webhookReminders.push({
        kind: 'stale_inner_meeting_draft',
        form_id: form.id,
        share_token: form.share_token,
        title: form.title,
        last_editor_email: lastLog?.user_email ?? null,
        last_editor_name: lastLog?.user_name ?? null,
        updated_at: form.updated_at,
        days_idle: Math.floor(daysSince(form.updated_at)),
      })
    }
  }

  // 3. Upcoming deadlines in the next 48 hours.
  {
    const today = new Date()
    const twoDaysOut = new Date(Date.now() + 2 * 86_400_000)
    const ymd = (d: Date) => d.toISOString().slice(0, 10)

    const { data: meetings } = await supabase
      .from('inner_meeting_forms')
      .select(
        'form_id, client_name, creative_deadline, internal_deadline, client_deadline, forms(share_token, status)',
      )
      .or(
        [
          `creative_deadline.gte.${ymd(today)},creative_deadline.lte.${ymd(twoDaysOut)}`,
          `internal_deadline.gte.${ymd(today)},internal_deadline.lte.${ymd(twoDaysOut)}`,
          `client_deadline.gte.${ymd(today)},client_deadline.lte.${ymd(twoDaysOut)}`,
        ].join(','),
      )

    for (const m of (meetings ?? []) as Array<{
      form_id: string
      client_name: string | null
      creative_deadline: string | null
      internal_deadline: string | null
      client_deadline: string | null
      forms: { share_token: string; status: string } | { share_token: string; status: string }[] | null
    }>) {
      const formMeta = Array.isArray(m.forms) ? m.forms[0] : m.forms
      if (!formMeta || formMeta.status !== 'draft') continue

      const { data: lastLog } = await supabase
        .from('form_activity_logs')
        .select('user_email')
        .eq('form_id', m.form_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const lastEditor = lastLog?.user_email ?? null

      const pushIf = (
        deadline: string | null,
        type: 'creative' | 'internal' | 'client',
      ) => {
        if (!deadline) return
        const hrs = hoursUntil(deadline)
        if (hrs <= 48 && hrs >= 0) {
          webhookReminders.push({
            kind: 'upcoming_deadline',
            form_id: m.form_id,
            share_token: formMeta.share_token,
            client_name: m.client_name,
            deadline_type: type,
            deadline_date: deadline,
            hours_until: Math.round(hrs),
            last_editor_email: lastEditor,
          })
        }
      }

      pushIf(m.creative_deadline, 'creative')
      pushIf(m.internal_deadline, 'internal')
      pushIf(m.client_deadline, 'client')
    }
  }

  // Webhook batch for #2 + #3 only.
  let webhookStatus: 'skipped' | 'ok' | 'failed' = 'skipped'
  if (webhookReminders.length > 0 && !REMINDERS_WEBHOOK.includes('PLACEHOLDER')) {
    try {
      const res = await fetch(REMINDERS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generated_at: new Date().toISOString(),
          reminders: webhookReminders,
        }),
      })
      webhookStatus = res.ok ? 'ok' : 'failed'
    } catch (e) {
      console.error('Reminders webhook failed:', e)
      webhookStatus = 'failed'
    }
  }

  const sentBriefs = briefResults.filter((r) => r.delivery === 'sent').length
  const skippedBriefs = briefResults.filter((r) => r.delivery !== 'sent' && r.delivery !== 'failed').length
  const failedBriefs = briefResults.filter((r) => r.delivery === 'failed').length

  return NextResponse.json({
    client_briefs: {
      total: briefResults.length,
      sent: sentBriefs,
      skipped: skippedBriefs,
      failed: failedBriefs,
      details: briefResults,
    },
    webhook: {
      status: webhookStatus,
      count: webhookReminders.length,
      by_kind: webhookReminders.reduce<Record<string, number>>((acc, r) => {
        acc[r.kind] = (acc[r.kind] ?? 0) + 1
        return acc
      }, {}),
      reminders: webhookReminders,
    },
  })
}
