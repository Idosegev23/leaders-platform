'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Empty, Notice, Panel, StatusBadge, useAction } from '../ui'
import { formatDate, formatDateTime } from '@/lib/campaigns/domain/time'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

type P = {
  id: string; campaign_id: string; campaign_name: string; agent_name: string | null; agency_name: string | null; campaign_description: string | null; creator_name: string; participation_status: string
  agreed_fee: string | null; currency: string; amounts_include_vat: boolean; deliverables_summary: string | null
  rights_expires_at: string | null; rights_notes: string | null; contract_reference: string | null; terms_version: number
  accepted_terms_version: number | null; creator_reacceptance_required: boolean; client_visible_notes: string | null
}
type D = { id: string; participation_id: string; title: string; type: string; platform: string; status: string; submission_due_at: string | null; publication_due_at: string | null }
type T = { id: string; participation_id: string; deliverable_id: string | null; title: string; description: string | null; due_at: string | null }
type Data = {
  me: { name: string; kind: string; orgName: string; allCampaigns: boolean }
  selectedCampaignId: string | null
  campaigns: { id: string; name: string }[]
  participations: P[]; deliverables: D[]; tasks: T[]
}
const KIND_HE: Record<string, string> = { creator: '', agent: ' (סוכן/ת)', agency: ' (סוכנות)' }

const NEXT: Record<string, string> = {
  awaiting_submission: 'להעלות תוכן', changes_requested: 'להעלות גרסה מתוקנת', submitted: 'ממתין לבדיקת הצוות',
  internal_review: 'בבדיקת הצוות', client_review: 'ממתין לאישור הלקוח', approved: 'לפרסם ולדווח קישור',
  publication_reported: 'הפרסום ממתין לאימות', publication_verified: 'להזין נתוני ביצועים (אם לא הוזנו)',
}

export function CreatorHome({ data }: { data: Data }) {
  const multi = data.me.kind !== 'creator'
  const selected = data.campaigns.find((c) => c.id === data.selectedCampaignId) ?? null
  const byCampaign = data.campaigns
    .filter((c) => !selected || c.id === selected.id)
    .map((c) => ({ ...c, parts: data.participations.filter((p) => p.campaign_id === c.id) }))
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-wizard-text-secondary">שלום {data.me.name}{KIND_HE[data.me.kind] ?? ''} · {data.me.orgName}</p>
        <h1 className="text-2xl font-bold">{selected ? selected.name : data.campaigns.length === 1 ? data.campaigns[0].name : 'הקמפיינים שלך'}</h1>
      </div>
      {data.campaigns.length > 1 && (
        <nav aria-label="סינון לפי קמפיין" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-2">
            <li><Link href="/portal" aria-current={!selected ? 'page' : undefined} className={`inline-flex rounded-full border px-3 py-1.5 text-sm ${!selected ? 'border-brand-primary bg-brand-primary text-white' : 'border-wizard-border bg-white'}`}>כל הקמפיינים</Link></li>
            {data.campaigns.map((c) => (
              <li key={c.id}><Link href={`/portal?campaign=${c.id}`} aria-current={selected?.id === c.id ? 'page' : undefined}
                className={`inline-flex rounded-full border px-3 py-1.5 text-sm ${selected?.id === c.id ? 'border-brand-primary bg-brand-primary text-white' : 'border-wizard-border bg-white'}`}>{c.name}</Link></li>
            ))}
          </ul>
        </nav>
      )}
      {multi && !selected && data.participations.length > 0 && <AgencyOverview data={data} />}
      {data.tasks.length > 0 && (
        <Panel title="מה נדרש ממך">
          <ul className="space-y-2">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <div className="font-semibold">{multi && <span className="text-wizard-text-secondary">{(() => { const p = data.participations.find((x) => x.id === t.participation_id); return p ? `${p.creator_name} · ${p.campaign_name} · ` : '' })()}</span>}{t.title}</div>
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
      {data.participations.length === 0 && <Empty title="אין השתתפויות להצגה">הזמנות לקמפיינים יופיעו כאן.</Empty>}
      {byCampaign.map((c) => (
        <section key={c.id} className="space-y-3" aria-label={c.name}>
          {(data.campaigns.length > 1 && !selected) && <h2 className="text-lg font-bold">{c.name}</h2>}
          {c.parts.map((p) => <ParticipationView key={p.id} p={p} deliverables={data.deliverables.filter((d) => d.participation_id === p.id)} />)}
        </section>
      ))}
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

/** Agency / agent dashboard: one row per creator, across every campaign. */
function AgencyOverview({ data }: { data: Data }) {
  const creators = Array.from(new Set(data.participations.map((p) => p.creator_name))).sort()
  const rows = creators.map((name) => {
    const parts = data.participations.filter((p) => p.creator_name === name)
    const ids = new Set(parts.map((p) => p.id))
    const ds = data.deliverables.filter((d) => ids.has(d.participation_id))
    return {
      name,
      campaigns: new Set(parts.map((p) => p.campaign_id)).size,
      toAnswer: parts.filter((p) => p.participation_status === 'invited' || p.creator_reacceptance_required).length,
      toSubmit: ds.filter((d) => d.status === 'awaiting_submission').length,
      toFix: ds.filter((d) => d.status === 'changes_requested').length,
      toPublish: ds.filter((d) => d.status === 'approved').length,
      late: ds.filter((d) => ['awaiting_submission', 'changes_requested'].includes(d.status) && d.submission_due_at && new Date(d.submission_due_at) < new Date()).length,
    }
  })
  return (
    <Panel title="תמונת מצב לפי יוצר">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-right text-xs text-wizard-text-secondary">
            <tr><th scope="col" className="py-1">יוצר/ת</th><th scope="col">קמפיינים</th><th scope="col">ממתין לאישור השתתפות</th><th scope="col">להגשה</th><th scope="col">תיקונים</th><th scope="col">לפרסום</th><th scope="col">באיחור</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-wizard-border">
                <th scope="row" className="py-1.5 text-right font-medium">{r.name}</th>
                <td>{r.campaigns}</td><td>{r.toAnswer || '—'}</td><td>{r.toSubmit || '—'}</td><td>{r.toFix || '—'}</td><td>{r.toPublish || '—'}</td>
                <td>{r.late ? <StatusBadge status="dead" label={`${r.late} באיחור`} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
