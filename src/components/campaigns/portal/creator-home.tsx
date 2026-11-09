'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Empty, Notice, Panel, StatusBadge, useAction } from '../ui'
import { formatDate, formatDateTime } from '@/lib/campaigns/domain/time'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

type P = {
  id: string; campaign_name: string; campaign_description: string | null; creator_name: string; participation_status: string
  agreed_fee: string | null; currency: string; amounts_include_vat: boolean; deliverables_summary: string | null
  rights_expires_at: string | null; rights_notes: string | null; contract_reference: string | null; terms_version: number
  accepted_terms_version: number | null; creator_reacceptance_required: boolean; client_visible_notes: string | null
}
type D = { id: string; participation_id: string; title: string; type: string; platform: string; status: string; submission_due_at: string | null; publication_due_at: string | null }
type T = { id: string; participation_id: string; deliverable_id: string | null; title: string; description: string | null; due_at: string | null }
type Data = { me: { name: string; kind: string }; campaign: { name: string }; participations: P[]; deliverables: D[]; tasks: T[] }

const NEXT: Record<string, string> = {
  awaiting_submission: 'להעלות תוכן', changes_requested: 'להעלות גרסה מתוקנת', submitted: 'ממתין לבדיקת הצוות',
  internal_review: 'בבדיקת הצוות', client_review: 'ממתין לאישור הלקוח', approved: 'לפרסם ולדווח קישור',
  publication_reported: 'הפרסום ממתין לאימות', publication_verified: 'להזין נתוני ביצועים (אם לא הוזנו)',
}

export function CreatorHome({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-wizard-text-secondary">שלום {data.me.name}{data.me.kind === 'agent' ? ' (סוכן/ת)' : ''}</p>
        <h1 className="text-2xl font-bold">{data.campaign.name}</h1>
      </div>
      {data.tasks.length > 0 && (
        <Panel title="מה נדרש ממך">
          <ul className="space-y-2">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <div className="font-semibold">{data.me.kind === 'agent' && <span className="text-wizard-text-secondary">{data.participations.find((p) => p.id === t.participation_id)?.creator_name} · </span>}{t.title}</div>
                {t.description && <p className="mt-0.5 whitespace-pre-wrap">{t.description}</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  {t.due_at && <span>עד {formatDateTime(t.due_at)} (שעון ישראל)</span>}
                  {t.deliverable_id && <Link className="font-medium text-brand-primary underline" href={`/portal/deliverables/${t.deliverable_id}`}>לביצוע</Link>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {data.participations.length === 0 && <Empty title="אין השתתפויות להצגה" />}
      {data.participations.map((p) => <ParticipationView key={p.id} p={p} deliverables={data.deliverables.filter((d) => d.participation_id === p.id)} />)}
    </div>
  )
}

function ParticipationView({ p, deliverables }: { p: P; deliverables: D[] }) {
  const { busy, run } = useAction()
  const respond = (response: 'accepted' | 'declined') => run(() => api(`/api/portal/participations/${p.id}/respond`, { body: { response, terms_version: p.terms_version } }),
    { success: response === 'accepted' ? 'אישרת את ההשתתפות' : 'עדכנו שלא תשתתפו' })
  const needsAnswer = p.participation_status === 'invited' || p.creator_reacceptance_required
  return (
    <Panel title={<>{p.creator_name} <StatusBadge status={p.participation_status} className="ms-2" /></>}>
      {p.campaign_description && <p className="mb-2 whitespace-pre-wrap text-sm">{p.campaign_description}</p>}
      <dl className="grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-wizard-text-secondary">שכר שסוכם: </dt><dd className="inline font-semibold">{formatMoney(parseMoney(p.agreed_fee), p.currency)} {p.amounts_include_vat ? '(כולל מע״מ)' : '(לפני מע״מ)'}</dd></div>
        <div><dt className="inline text-wizard-text-secondary">זכויות שימוש עד: </dt><dd className="inline">{formatDate(p.rights_expires_at)}</dd></div>
        {p.deliverables_summary && <div className="sm:col-span-2"><dt className="inline text-wizard-text-secondary">מה הוזמן: </dt><dd className="inline">{p.deliverables_summary}</dd></div>}
        {p.rights_notes && <div className="sm:col-span-2"><dt className="inline text-wizard-text-secondary">הערות שימוש: </dt><dd className="inline">{p.rights_notes}</dd></div>}
        {p.contract_reference && <div className="sm:col-span-2"><dt className="inline text-wizard-text-secondary">הסכם: </dt><dd className="inline">{/^https?:/.test(p.contract_reference) ? <a className="text-brand-primary underline" href={p.contract_reference} target="_blank" rel="noreferrer noopener">קישור להסכם</a> : p.contract_reference}</dd></div>}
      </dl>
      {needsAnswer && (
        <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
          {p.creator_reacceptance_required
            ? <p className="text-sm font-semibold">התנאים עודכנו (גרסה {p.terms_version}). יש לאשר את התנאים המעודכנים.</p>
            : <p className="text-sm font-semibold">האם תשתתפו בקמפיין בתנאים האלה?</p>}
          <div className="flex flex-wrap gap-2">
            <Btn tone="good" busy={busy} onClick={() => void respond('accepted')}>אישור השתתפות</Btn>
            {!p.creator_reacceptance_required && <Btn tone="secondary" busy={busy} onClick={() => { if (window.confirm('לסרב להשתתפות?')) void respond('declined') }}>לא אשתתף</Btn>}
          </div>
          <p className="text-xs text-wizard-text-secondary">האישור מתועד כפעולה של מי שמחזיק בקישור ההזמנה. אינו מחליף חתימה על הסכם.</p>
        </div>
      )}
      <h3 className="mb-1 mt-4 font-bold">תוצרים</h3>
      {deliverables.length === 0 ? <p className="text-sm text-wizard-text-secondary">התוצרים יוגדרו בקרוב.</p> : (
        <ul className="space-y-2">
          {deliverables.map((d) => (
            <li key={d.id}>
              <Link href={`/portal/deliverables/${d.id}`} className="block rounded-xl border border-wizard-border bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{d.title}</span><StatusBadge status={d.status} /></div>
                <div className="mt-1 text-xs text-wizard-text-secondary">{d.platform} · {d.type} · הגשה עד {formatDateTime(d.submission_due_at)} · פרסום {formatDateTime(d.publication_due_at)}</div>
                <div className="mt-1 text-xs font-medium">הצעד הבא: {NEXT[d.status] ?? heStatus(d.status)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!['accepted', 'active'].includes(p.participation_status) && deliverables.length > 0 && <div className="mt-2"><Notice>אפשר להגיש תוכן אחרי אישור ההשתתפות.</Notice></div>}
    </Panel>
  )
}
