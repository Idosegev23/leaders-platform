'use client'

import Link from 'next/link'
import { Empty, Panel, StatusBadge } from '../ui'
import { formatDateTime } from '@/lib/campaigns/domain/time'

type Row = {
  id: string; creator_name: string; title: string; type: string; platform: string; status: string
  submission_due_at: string | null; publication_due_at: string | null; original_submission_due_at: string | null
  submission_breached_at: string | null; publication_breached_at: string | null; first_submitted_at: string | null
  versions: number | null; published_url: string | null; verification_status: string | null
}

const WAITING: Record<string, { who: string; next: string }> = {
  awaiting_submission: { who: 'יוצר', next: 'הגשת תוכן' },
  submitted: { who: 'הצוות', next: 'בדיקה פנימית' },
  internal_review: { who: 'הצוות', next: 'החלטה פנימית' },
  changes_requested: { who: 'יוצר', next: 'הגשת גרסה מתוקנת' },
  client_review: { who: 'לקוח', next: 'אישור לקוח' },
  approved: { who: 'יוצר', next: 'פרסום ודיווח קישור' },
  publication_reported: { who: 'הצוות', next: 'אימות הפרסום' },
  publication_verified: { who: '—', next: 'השלמת נתוני ביצועים' },
  cancelled: { who: '—', next: '—' },
}

export function DeliverablesTab({ campaignId, deliverables }: { campaignId: string; deliverables: Row[] }) {
  const now = Date.now()
  const late = (d: Row) =>
    (['awaiting_submission', 'changes_requested'].includes(d.status) && d.submission_due_at && new Date(d.submission_due_at).getTime() < now) ||
    (d.status === 'approved' && d.publication_due_at && new Date(d.publication_due_at).getTime() < now)
  if (deliverables.length === 0) return <Empty title="אין עדיין תוצרים">מוסיפים תוצרים מכרטיס המשתתף בלשונית &quot;משפיענים&quot;.</Empty>
  return (
    <Panel title={`תוצרים (${deliverables.length})`}>
      <ul className="divide-y divide-wizard-border">
        {deliverables.map((d) => {
          const w = WAITING[d.status] ?? { who: '—', next: '—' }
          const moved = d.original_submission_due_at && d.submission_due_at && d.original_submission_due_at !== d.submission_due_at
          return (
            <li key={d.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <Link className="font-semibold text-brand-primary hover:underline" href={`/campaigns/${campaignId}/deliverables/${d.id}`}>{d.creator_name} · {d.title}</Link>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-wizard-text-secondary">
                  <span>{d.platform} · {d.type}</span>
                  <span>הגשה: {formatDateTime(d.submission_due_at)}{moved && ' (המועד שונה)'}</span>
                  <span>פרסום: {formatDateTime(d.publication_due_at)}</span>
                  <span>גרסאות: {d.versions ?? 0}</span>
                  {d.published_url && <a className="text-brand-primary underline" href={d.published_url} target="_blank" rel="noreferrer noopener">קישור פרסום</a>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={d.status} />
                {late(d) && <StatusBadge status="dead" label="באיחור" />}
                {(d.submission_breached_at || d.publication_breached_at) && !late(d) && <StatusBadge status="exception" label="היה באיחור" />}
                <span className="text-xs text-wizard-text-secondary">ממתין ל: <strong>{w.who}</strong> · הבא: {w.next}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
