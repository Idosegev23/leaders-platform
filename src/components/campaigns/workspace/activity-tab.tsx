'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Empty, Panel, StatusBadge, useAction } from '../ui'
import { formatDateTime } from '@/lib/campaigns/domain/time'

type Activity = { rows: { id: string; action: string; actor_type: string; actor_label: string; summary: string | null; created_at: string }[]; total: number; page: number; pageSize: number }
type Queue = {
  notifications: { id: string; audience: string; to_address: string; subject: string; status: string; provider_message_id: string | null; attempts: number; max_attempts: number; next_attempt_at: string; last_error: string | null; sent_at: string | null; created_at: string }[]
  jobs: { id: string; kind: string; status: string; attempts: number; max_attempts: number; run_after: string; last_error: string | null; result: string | null }[]
} | null

const JOB_HE: Record<string, string> = {
  'deliverable.submission_reminder': 'תזכורת הגשה', 'deliverable.submission_overdue': 'בדיקת איחור בהגשה',
  'deliverable.publication_overdue': 'בדיקת איחור בפרסום', 'deliverable.metrics_check': 'בדיקת נתוני ביצועים', 'participation.rights_expiry': 'התראת זכויות',
}

export function ActivityTab({ campaignId, activity, queue }: { campaignId: string; activity: Activity; queue: Queue }) {
  const pages = Math.max(1, Math.ceil(activity.total / activity.pageSize))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="היסטוריית פעולות">
        {activity.rows.length === 0 ? <Empty title="אין פעולות עדיין" /> : (
          <ol className="space-y-2">
            {activity.rows.map((a) => (
              <li key={a.id} className="text-sm">
                <div>{a.summary ?? a.action}</div>
                <div className="text-xs text-wizard-text-secondary">{formatDateTime(a.created_at)} · {a.actor_label}</div>
              </li>
            ))}
          </ol>
        )}
        {pages > 1 && (
          <nav aria-label="עמודים" className="mt-3 flex gap-2 text-sm">
            {activity.page > 1 && <Link href={`/campaigns/${campaignId}?tab=activity&page=${activity.page - 1}`} className="underline">הקודם</Link>}
            <span>עמוד {activity.page}/{pages}</span>
            {activity.page < pages && <Link href={`/campaigns/${campaignId}?tab=activity&page=${activity.page + 1}`} className="underline">הבא</Link>}
          </nav>
        )}
      </Panel>
      {queue && (
        <div className="space-y-4">
          <Panel title="הודעות יוצאות">
            {queue.notifications.length === 0 ? <Empty title="לא נשלחו הודעות" /> : (
              <ul className="divide-y divide-wizard-border">{queue.notifications.map((n) => <NotificationRow key={n.id} n={n} />)}</ul>
            )}
          </Panel>
          <Panel title="עבודות רקע (תזכורות ובדיקות)">
            <ul className="divide-y divide-wizard-border">{queue.jobs.map((j) => <JobRow key={j.id} j={j} />)}</ul>
          </Panel>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ n }: { n: NonNullable<Queue>['notifications'][number] }) {
  const { busy, run } = useAction()
  const failed = ['dead', 'uncertain', 'failed'].includes(n.status)
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate">{n.subject}</span>
        <StatusBadge status={n.status} />
      </div>
      <div className="text-xs text-wizard-text-secondary">
        אל: <span dir="ltr">{n.to_address}</span> · {formatDateTime(n.created_at)} · ניסיונות {n.attempts}/{n.max_attempts}
        {n.status === 'failed' && <> · ניסיון הבא {formatDateTime(n.next_attempt_at)}</>}
        {n.provider_message_id && <> · מזהה ספק <span dir="ltr">{n.provider_message_id}</span></>}
      </div>
      {n.last_error && <div className="text-xs text-rose-800">{n.last_error}</div>}
      {failed && (
        <div className="mt-1 flex gap-2">
          <Btn size="sm" tone="secondary" busy={busy} onClick={() => {
            if (n.status === 'uncertain' && !window.confirm('ייתכן שההודעה כבר נשלחה. לשלוח שוב (ייתכן כפל)?')) return
            void run(() => api(`/api/campaigns/notifications/${n.id}/retry`, { body: { action: 'retry', confirm_possible_duplicate: n.status === 'uncertain' } }), { success: 'ההודעה הוחזרה לתור' })
          }}>שליחה חוזרת</Btn>
          <Btn size="sm" tone="ghost" busy={busy} onClick={() => void run(() => api(`/api/campaigns/notifications/${n.id}/retry`, { body: { action: 'dismiss' } }), { success: 'סומן כטופל' })}>סימון כטופל</Btn>
        </div>
      )}
    </li>
  )
}

function JobRow({ j }: { j: NonNullable<Queue>['jobs'][number] }) {
  const { busy, run } = useAction()
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <div>{JOB_HE[j.kind] ?? j.kind}</div>
        <div className="text-xs text-wizard-text-secondary">מתוזמן ל-{formatDateTime(j.run_after)}{j.result ? ` · ${j.result}` : ''}{j.last_error ? ` · שגיאה: ${j.last_error}` : ''}</div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={j.status} />
        {['dead', 'failed'].includes(j.status) && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void run(() => api(`/api/campaigns/jobs/${j.id}/retry`, { method: 'POST' }), { success: 'העבודה הוחזרה לתור' })}>ניסיון חוזר</Btn>}
      </div>
    </li>
  )
}
