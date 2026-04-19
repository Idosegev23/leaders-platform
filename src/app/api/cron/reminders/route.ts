import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/reminders
 *
 * Daily job (configured in vercel.json) that scans for three kinds of
 * stale/urgent items and POSTs them to a Make.com webhook for actual
 * email delivery. We intentionally don't send mail from this route — the
 * existing Make.com tooling already owns that surface.
 *
 * Triggers:
 *   1. `client-brief` link `pending` more than 3 days  → nudge creator.
 *   2. `inner-meeting` form `draft` with no activity for 7+ days → nudge creator.
 *   3. `inner-meeting` form with a deadline (creative/internal/client)
 *      in the next 48 hours → nudge creator.
 *
 * Auth: Vercel Cron includes the `CRON_SECRET` as a bearer token when the
 * env var is set. We refuse unauthorized requests in production.
 */
const REMINDERS_WEBHOOK =
  process.env.REMINDERS_WEBHOOK_URL ||
  'https://hook.eu2.make.com/PLACEHOLDER_REPLACE_ME_reminders'

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // no gating configured — allow (dev convenience)
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

type Reminder =
  | {
      kind: 'pending_brief_link'
      token: string
      created_by_email: string
      created_by_name: string | null
      client_name: string | null
      client_email: string | null
      created_at: string
      days_pending: number
    }
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

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function hoursUntil(isoDate: string): number {
  // dates (no time) are interpreted as midnight UTC; treat as end-of-day local.
  const deadline = new Date(`${isoDate}T23:59:59`)
  return (deadline.getTime() - Date.now()) / 3_600_000
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

  const reminders: Reminder[] = []

  // 1. Pending brief links > 3 days.
  {
    const { data: briefType } = await supabase
      .from('document_types')
      .select('id')
      .eq('slug', 'client-brief')
      .maybeSingle()

    if (briefType) {
      const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString()
      const { data } = await supabase
        .from('document_links')
        .select('token, created_by_email, created_by_name, client_name, client_email, created_at')
        .eq('document_type_id', briefType.id)
        .eq('status', 'pending')
        .lt('created_at', cutoff)

      for (const r of data ?? []) {
        reminders.push({
          kind: 'pending_brief_link',
          token: r.token,
          created_by_email: r.created_by_email,
          created_by_name: r.created_by_name,
          client_name: r.client_name,
          client_email: r.client_email,
          created_at: r.created_at,
          days_pending: Math.floor(daysSince(r.created_at)),
        })
      }
    }
  }

  // 2. Stale inner-meeting drafts (> 7 days).
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

      reminders.push({
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
          reminders.push({
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

  // Fire-and-forget webhook; we return the summary either way.
  let webhookStatus: 'skipped' | 'ok' | 'failed' = 'skipped'
  if (reminders.length > 0 && !REMINDERS_WEBHOOK.includes('PLACEHOLDER')) {
    try {
      const res = await fetch(REMINDERS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generated_at: new Date().toISOString(),
          reminders,
        }),
      })
      webhookStatus = res.ok ? 'ok' : 'failed'
    } catch (e) {
      console.error('Reminders webhook failed:', e)
      webhookStatus = 'failed'
    }
  }

  return NextResponse.json({
    count: reminders.length,
    by_kind: reminders.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1
      return acc
    }, {}),
    webhook: webhookStatus,
    reminders,
  })
}
