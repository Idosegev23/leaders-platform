'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Dialog, Empty, Field, Notice, Panel, StatusBadge, TextArea, useAction } from '../ui'
import { formatDate, formatDateTime } from '@/lib/campaigns/domain/time'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

type Item = { id: string; client_snapshot: { display_name: string; categories: string[]; deliverables_summary: string | null; client_visible_notes: string | null; accounts: { platform: string; handle: string; profile_url: string | null; follower_count: number | null }[] }; client_decision: string; client_feedback: string | null }
type CampaignRow = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; client_name: string; awaiting: number }
type Data = {
  me: { name: string; orgName: string; allCampaigns: boolean }
  campaigns: CampaignRow[]
  campaign: CampaignRow | null
  shortlists?: { id: string; version_number: number; status: string; sent_to_client_at: string | null; items: Item[] }[]
  deliverables?: { id: string; title: string; platform: string; type: string; status: string; publication_due_at: string | null; creator_name: string; awaiting_you: boolean }[]
  reports?: { id: string; published_to_client_at: string }[]
  progress?: { planned: number; approved: number; published: number }
}

export function ClientHome({ data }: { data: Data }) {
  if (!data.campaign) {
    return <Empty title="אין עדיין קמפיינים להצגה">קמפיינים יופיעו כאן כשהצוות של {data.me.orgName} ישתף אותם.</Empty>
  }
  const c = data.campaign
  const open = data.shortlists?.find((s) => s.status === 'client_review')
  const waitingContent = (data.deliverables ?? []).filter((d) => d.awaiting_you)
  return (
    <div className="space-y-4">
      <p className="text-sm text-wizard-text-secondary">שלום {data.me.name}</p>
      {data.campaigns.length > 1 && (
        <nav aria-label="הקמפיינים שלך" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-2">
            {data.campaigns.map((k) => (
              <li key={k.id}>
                <Link href={`/portal?campaign=${k.id}`} aria-current={k.id === c.id ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${k.id === c.id ? 'border-brand-primary bg-brand-primary text-white' : 'border-wizard-border bg-white'}`}>
                  {k.name}{k.awaiting > 0 && <span className={`rounded-full px-1.5 text-[11px] font-bold ${k.id === c.id ? 'bg-white/25' : 'bg-amber-100 text-amber-900'}`}>{k.awaiting}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div>
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="text-sm text-wizard-text-secondary">{c.client_name} · {formatDate(c.start_date)} – {formatDate(c.end_date)} · {heStatus(c.status)}</p>
      </div>
      {data.progress && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-wizard-border bg-white p-3"><div className="text-xs text-wizard-text-secondary">תוצרים מתוכננים</div><div className="text-xl font-bold">{data.progress.planned}</div></div>
          <div className="rounded-xl border border-wizard-border bg-white p-3"><div className="text-xs text-wizard-text-secondary">אושרו</div><div className="text-xl font-bold">{data.progress.approved}</div></div>
          <div className="rounded-xl border border-wizard-border bg-white p-3"><div className="text-xs text-wizard-text-secondary">פורסמו ואומתו</div><div className="text-xl font-bold">{data.progress.published}</div></div>
        </div>
      )}

      {open ? <ShortlistDecisions shortlist={open} /> : null}

      <Panel title={`תכנים ממתינים להחלטתך (${waitingContent.length})`}>
        {waitingContent.length === 0 ? <p className="text-sm text-wizard-text-secondary">אין כרגע תכנים שממתינים לך בקמפיין זה.</p> : (
          <ul className="space-y-2">
            {waitingContent.map((d) => (
              <li key={d.id}><Link href={`/portal/deliverables/${d.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <span className="min-w-0"><span className="font-semibold">{d.creator_name}</span> · {d.title}<span className="block text-xs text-wizard-text-secondary">{d.platform} · פרסום מתוכנן {formatDateTime(d.publication_due_at)}</span></span>
                <span className="shrink-0 text-sm font-medium text-brand-primary">לצפייה ואישור ←</span>
              </Link></li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="כל התכנים">
        {(data.deliverables ?? []).length === 0 ? <Empty title="עדיין אין תכנים לצפייה">תכנים יופיעו כאן אחרי בדיקה פנימית של הצוות.</Empty> : (
          <ul className="divide-y divide-wizard-border">
            {data.deliverables!.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/portal/deliverables/${d.id}`} className="text-brand-primary underline">{d.creator_name} · {d.title}</Link>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(data.reports ?? []).length > 0 && (
        <Panel title="דוחות">
          <ul className="space-y-1 text-sm">{data.reports!.map((r) => <li key={r.id}><Link className="text-brand-primary underline" href={`/portal/reports/${r.id}`}>דוח מתאריך {formatDateTime(r.published_to_client_at)}</Link></li>)}</ul>
        </Panel>
      )}
    </div>
  )
}

function ShortlistDecisions({ shortlist }: { shortlist: NonNullable<Data['shortlists']>[number] }) {
  const { busy, run } = useAction()
  const [ask, setAsk] = React.useState<{ item: Item; decision: 'changes_requested' | 'rejected' } | null>(null)
  const [fb, setFb] = React.useState('')
  const decide = (item: Item, decision: string, feedback: string | null) =>
    run(() => api(`/api/portal/shortlist-items/${item.id}/decision`, { body: { decision, feedback, shortlist_version: shortlist.version_number } }), { success: 'ההחלטה נשמרה' })
  const pending = shortlist.items.filter((i) => i.client_decision === 'pending').length
  return (
    <Panel title={`משפיענים מוצעים לאישורך (רשימה ${shortlist.version_number})`}>
      <Notice>{pending > 0 ? `נותרו ${pending} החלטות.` : 'כל ההחלטות התקבלו. תודה!'} ההחלטה חלה על הרשימה הזו בלבד; משפיענים נוספים יוצגו ברשימה חדשה.</Notice>
      <ul className="mt-3 space-y-3">
        {shortlist.items.map((it) => (
          <li key={it.id} className="rounded-xl border border-wizard-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{it.client_snapshot.display_name}</div>
                <ul className="text-xs text-wizard-text-secondary">
                  {it.client_snapshot.accounts.map((a, i) => (
                    <li key={i}>{a.platform} {a.profile_url ? <a className="underline" href={a.profile_url} target="_blank" rel="noreferrer noopener" dir="ltr">@{a.handle}</a> : <span dir="ltr">@{a.handle}</span>}{a.follower_count ? ` · ${a.follower_count.toLocaleString('he-IL')} עוקבים` : ''}</li>
                  ))}
                </ul>
                {it.client_snapshot.deliverables_summary && <p className="mt-1 text-sm">תוצרים: {it.client_snapshot.deliverables_summary}</p>}
                {it.client_snapshot.client_visible_notes && <p className="text-sm text-wizard-text-secondary">{it.client_snapshot.client_visible_notes}</p>}
                {it.client_feedback && <p className="mt-1 text-xs">ההערה שלך: {it.client_feedback}</p>}
              </div>
              <StatusBadge status={it.client_decision} />
            </div>
            {it.client_decision === 'pending' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn size="sm" tone="good" busy={busy} onClick={() => void decide(it, 'approved', null)}>אישור</Btn>
                <Btn size="sm" tone="secondary" onClick={() => { setFb(''); setAsk({ item: it, decision: 'changes_requested' }) }}>בקשת החלפה</Btn>
                <Btn size="sm" tone="danger" onClick={() => { setFb(''); setAsk({ item: it, decision: 'rejected' }) }}>דחייה</Btn>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={ask?.decision === 'rejected' ? 'דחיית משפיען' : 'בקשת החלפה'}>
        <Field label="הסבר קצר (חובה)" htmlFor="cl-fb"><TextArea id="cl-fb" value={fb} onChange={(e) => setFb(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Btn busy={busy} disabled={fb.trim().length < 2} onClick={async () => { if (ask && await decide(ask.item, ask.decision, fb.trim())) setAsk(null) }}>שליחה</Btn><Btn tone="secondary" onClick={() => setAsk(null)}>ביטול</Btn></div>
      </Dialog>
    </Panel>
  )
}
