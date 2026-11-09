'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api } from '../client-api'
import { Btn, Dialog, Empty, Field, Notice, Panel, SelectInput, StatusBadge, TextArea, TextInput, useAction, useUnsavedGuard } from '../ui'
import { formatDate, formatDateTime, toJerusalemInput } from '@/lib/campaigns/domain/time'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { heStatus } from '@/lib/campaigns/domain/state-machines'
import type { CampaignDetail } from '@/lib/campaigns/services/campaigns'

export type ParticipationRow = {
  id: string; creator_id: string; creator_name: string; agent_id: string | null; agent_name: string | null
  talent_agency_id: string | null; agency_name: string | null
  selection_status: string; participation_status: string; status_reason: string | null; agreed_fee: string | null; currency: string
  payment_status: string; contract_reference: string | null; contract_signature_request_id: string | null; rights_expires_at: string | null
  rights_notes: string | null; internal_notes: string | null; client_visible_notes: string | null; deliverables_summary: string | null
  terms_version: number; accepted_terms_version: number | null; creator_reacceptance_required: boolean; client_reapproval_required: boolean
  version: number; accounts: { platform: string; handle: string; follower_count: number | null }[]
  deliverables: number; deliverables_verified: number; next_submission_due: string | null; next_publication_due: string | null
  shipment_status: string | null; shipment_id: string | null
}
type ShortlistItem = { id: string; participation_id: string; client_snapshot: { display_name: string; accounts: { platform: string; handle: string; follower_count: number | null }[]; deliverables_summary: string | null }; internal_decision: string; client_decision: string; decisions: { stage: string; decision: string; feedback: string | null; actor: string; at: string }[] | null }
type Shortlist = { id: string; version_number: number; status: string; note: string | null; created_at: string; sent_to_client_at: string | null; items: ShortlistItem[] }

function nextAction(p: ParticipationRow): string {
  if (p.participation_status === 'cancelled') return 'בוטל'
  if (p.creator_reacceptance_required) return 'ממתין לאישור התנאים המעודכנים מהיוצר'
  if (p.client_reapproval_required) return 'נדרש אישור לקוח מחדש (להכליל ברשימה חדשה)'
  switch (p.selection_status) {
    case 'proposed': return 'להכליל ברשימת מועמדים'
    case 'internal_review': return 'החלטה פנימית ברשימה'
    case 'client_review': return 'ממתין להחלטת הלקוח'
    case 'changes_requested': return 'הלקוח/הצוות ביקשו החלפה או שינוי'
    case 'rejected': case 'withdrawn': return '—'
  }
  if (p.participation_status === 'not_invited') return 'לשלוח הזמנה ליוצר'
  if (p.participation_status === 'invited') return 'ממתין לאישור השתתפות מהיוצר'
  if (p.participation_status === 'declined') return 'היוצר סירב; למצוא חלופה'
  if (p.deliverables === 0) return 'להגדיר תוצרים'
  if (p.participation_status === 'completed') return 'הושלם'
  return 'מעקב תוצרים'
}

export function CreatorsTab({ campaign, participations, shortlists, agents, manage }: {
  campaign: CampaignDetail; participations: ParticipationRow[]; shortlists: Shortlist[]; agents: { id: string; display_name: string }[]; manage: boolean
}) {
  const open = shortlists.find((s) => ['internal_review', 'client_review'].includes(s.status))
  const closed = shortlists.filter((s) => s !== open)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const { busy, run } = useAction()
  const proposable = participations.filter((p) => p.selection_status === 'proposed' || (p.selection_status === 'approved' && p.client_reapproval_required))
  const byId = Object.fromEntries(participations.map((p) => [p.id, p]))
  const live = !['closed', 'cancelled'].includes(campaign.status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {manage && live && <Link href={`/campaigns/creators?campaign=${campaign.id}`} className="inline-flex h-10 items-center rounded-xl bg-brand-primary px-4 text-sm font-medium text-white">הוספת משפיענים מהמאגר</Link>}
      </div>

      {open && <ShortlistPanel shortlist={open} campaignId={campaign.id} manage={manage} participations={byId} />}

      {manage && live && !open && proposable.length > 0 && (
        <Panel title="יצירת רשימת מועמדים לאישור" actions={
          <Btn busy={busy} disabled={picked.size === 0} onClick={() => void run(() => api(`/api/campaigns/${campaign.id}/shortlists`, { body: { participation_ids: Array.from(picked) } }), { success: 'נוצרה רשימה לבדיקה פנימית' }).then(() => setPicked(new Set()))}>
            יצירת רשימה ({picked.size})
          </Btn>}>
          <p className="mb-2 text-sm text-wizard-text-secondary">הרשימה ננעלת כגרסה: הלקוח יאשר בדיוק את מי שברשימה. משפיען שיתווסף אחר כך ייכנס לגרסה הבאה.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {proposable.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-pearl">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(p.id); else n.delete(p.id); setPicked(n) }} />
                  {p.creator_name} {p.client_reapproval_required && <StatusBadge status="required" label="אישור מחדש" />}
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`משתתפים (${participations.length})`}>
        {participations.length === 0 ? <Empty title="עדיין לא נוספו משפיענים">הוסיפו משפיענים מהמאגר כדי להתחיל בבחירה.</Empty> : (
          <div className="space-y-2">
            {participations.map((p) => <ParticipationCard key={p.id} p={p} campaign={campaign} manage={manage} agents={agents} />)}
          </div>
        )}
      </Panel>

      {closed.length > 0 && (
        <Panel title="גרסאות קודמות של רשימת המועמדים">
          <ul className="space-y-1 text-sm">
            {closed.map((s) => (
              <li key={s.id}>גרסה {s.version_number} · <StatusBadge status={s.status === 'completed' ? 'completed' : 'withdrawn'} label={s.status === 'completed' ? 'הושלמה' : 'בוטלה'} /> · {s.items.length} מועמדים · נוצרה {formatDateTime(s.created_at)}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function ShortlistPanel({ shortlist, campaignId, manage, participations }: { shortlist: Shortlist; campaignId: string; manage: boolean; participations: Record<string, ParticipationRow> }) {
  const { busy, run } = useAction()
  const [decide, setDecide] = React.useState<{ item: ShortlistItem; decision: 'changes_requested' | 'rejected' } | null>(null)
  const [feedback, setFeedback] = React.useState('')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const pending = shortlist.items.filter((i) => i.internal_decision === 'pending').length
  const decideApi = (item: ShortlistItem, decision: string, fb: string | null) =>
    run(() => api(`/api/campaigns/shortlists/${shortlist.id}/items/${item.id}/decision`, { body: { decision, feedback: fb, shortlist_version: shortlist.version_number } }), { success: 'ההחלטה נשמרה' })

  return (
    <Panel title={<>רשימת מועמדים גרסה {shortlist.version_number} <StatusBadge status={shortlist.status} className="ms-2" /></>} actions={manage && (
      <>
        {shortlist.status === 'internal_review' && <Btn busy={busy} disabled={pending > 0} onClick={() => void run(() => api(`/api/campaigns/shortlists/${shortlist.id}/send`, { method: 'POST' }), { success: 'הרשימה נשלחה ללקוח' })}>שליחה ללקוח</Btn>}
        <Btn tone="secondary" onClick={() => setCancelOpen(true)}>ביטול הרשימה</Btn>
      </>)}>
      {shortlist.status === 'internal_review' && <Notice>שלב 1 מתוך 2: אישור פנימי. {pending > 0 ? `נותרו ${pending} מועמדים להחלטה.` : 'כל המועמדים הוחלטו; אפשר לשלוח ללקוח.'} רק מי שאושר פנימית יוצג ללקוח.</Notice>}
      {shortlist.status === 'client_review' && <Notice>שלב 2 מתוך 2: ממתין להחלטת הלקוח בפורטל. נשלח {formatDateTime(shortlist.sent_to_client_at)}.</Notice>}
      <ul className="mt-3 divide-y divide-wizard-border">
        {shortlist.items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{it.client_snapshot.display_name}</div>
              <div className="text-xs text-wizard-text-secondary">{it.client_snapshot.accounts.map((a) => `${a.platform} @${a.handle}${a.follower_count ? ` (${a.follower_count.toLocaleString('he-IL')})` : ''}`).join(' · ') || 'ללא חשבונות'}</div>
              {it.client_snapshot.deliverables_summary && <div className="text-xs">תוצרים: {it.client_snapshot.deliverables_summary}</div>}
              {participations[it.participation_id]?.agreed_fee && <div className="text-xs text-wizard-text-secondary">שכר (פנימי, לא מוצג ללקוח): {formatMoney(parseMoney(participations[it.participation_id].agreed_fee), participations[it.participation_id].currency)}</div>}
              {(it.decisions ?? []).map((d, i) => <div key={i} className="text-xs text-wizard-text-secondary">{d.stage === 'internal' ? 'פנימי' : 'לקוח'}: {heStatus(d.decision)} · {d.actor} · {formatDateTime(d.at)}{d.feedback ? ` · "${d.feedback}"` : ''}</div>)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={it.internal_decision} label={`פנימי: ${heStatus(it.internal_decision)}`} />
              {shortlist.status !== 'internal_review' && it.internal_decision === 'approved' && <StatusBadge status={it.client_decision} label={`לקוח: ${heStatus(it.client_decision)}`} />}
              {manage && shortlist.status === 'internal_review' && it.internal_decision === 'pending' && (
                <>
                  <Btn size="sm" tone="good" busy={busy} onClick={() => void decideApi(it, 'approved', null)}>אישור</Btn>
                  <Btn size="sm" tone="secondary" onClick={() => { setFeedback(''); setDecide({ item: it, decision: 'changes_requested' }) }}>בקשת שינוי</Btn>
                  <Btn size="sm" tone="danger" onClick={() => { setFeedback(''); setDecide({ item: it, decision: 'rejected' }) }}>דחייה</Btn>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!decide} onClose={() => setDecide(null)} title={decide?.decision === 'rejected' ? 'דחיית מועמד' : 'בקשת שינוי'}>
        <Field label="הערה (חובה)" htmlFor="sl-fb"><TextArea id="sl-fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2">
          <Btn busy={busy} disabled={feedback.trim().length < 2} onClick={async () => { if (decide && await decideApi(decide.item, decide.decision, feedback.trim())) setDecide(null) }}>שמירה</Btn>
          <Btn tone="secondary" onClick={() => setDecide(null)}>ביטול</Btn>
        </div>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="ביטול רשימת המועמדים">
        <p className="text-sm">מועמדים שטרם הוחלט עליהם יחזרו למצב &quot;מוצע&quot; ויוכלו להיכלל בגרסה הבאה. החלטות שכבר התקבלו נשמרות.</p>
        <Field label="סיבה" htmlFor="sl-cancel"><TextArea id="sl-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2">
          <Btn tone="danger" busy={busy} disabled={cancelReason.trim().length < 3} onClick={async () => { if (await run(() => api(`/api/campaigns/shortlists/${shortlist.id}/supersede`, { body: { reason: cancelReason } }), { success: 'הרשימה בוטלה' })) setCancelOpen(false) }}>ביטול הרשימה</Btn>
          <Btn tone="secondary" onClick={() => setCancelOpen(false)}>חזרה</Btn>
        </div>
      </Dialog>
    </Panel>
  )
}

function ParticipationCard({ p, campaign, manage, agents }: { p: ParticipationRow; campaign: CampaignDetail; manage: boolean; agents: { id: string; display_name: string }[] }) {
  const [dialog, setDialog] = React.useState<null | 'terms' | 'invite' | 'response' | 'cancel' | 'withdraw' | 'deliverable' | 'shipment'>(null)
  const { busy, run } = useAction()
  const act = (body: Record<string, unknown>, success: string) => run(() => api(`/api/campaigns/participations/${p.id}/actions`, { body: { expected_version: p.version, ...body } }), { success })
  const live = !['closed', 'cancelled'].includes(campaign.status)
  return (
    <div className="rounded-xl border border-wizard-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/campaigns/creators/${p.creator_id}`} className="font-semibold text-brand-primary hover:underline">{p.creator_name}</Link>
            {(p.agency_name || p.agent_name) && <span className="text-xs text-wizard-text-secondary">{p.agency_name ? `סוכנות ${p.agency_name}` : ''}{p.agent_name ? ` · סוכן ${p.agent_name}` : ''}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusBadge status={p.selection_status} label={`בחירה: ${heStatus(p.selection_status)}`} />
            <StatusBadge status={p.participation_status} label={`השתתפות: ${heStatus(p.participation_status)}`} />
            {p.creator_reacceptance_required && <StatusBadge status="required" label="נדרש אישור תנאים מחדש" />}
            {p.client_reapproval_required && <StatusBadge status="required" label="נדרש אישור לקוח מחדש" />}
          </div>
        </div>
        <div className="text-left text-sm">
          <div className="font-semibold">{formatMoney(parseMoney(p.agreed_fee), p.currency)}</div>
          <div className="text-xs text-wizard-text-secondary">{campaign.amounts_include_vat ? 'כולל מע״מ' : 'לפני מע״מ'} · תשלום: {p.payment_status === 'paid_manual' ? 'סומן כשולם (ידני)' : p.payment_status === 'pending' ? 'ממתין' : 'לא תועד'}</div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div><dt className="text-wizard-text-secondary">תוצרים</dt><dd>{p.deliverables_verified}/{p.deliverables} פורסמו ואומתו</dd></div>
        <div><dt className="text-wizard-text-secondary">הגשה קרובה</dt><dd>{formatDateTime(p.next_submission_due)}</dd></div>
        <div><dt className="text-wizard-text-secondary">משלוח</dt><dd>{p.shipment_status ? heStatus(p.shipment_status) : 'לא הוגדר'}</dd></div>
        <div><dt className="text-wizard-text-secondary">זכויות עד</dt><dd>{formatDate(p.rights_expires_at)}</dd></div>
        <div className="col-span-2"><dt className="text-wizard-text-secondary">הסכם</dt><dd>{p.contract_reference ? (/^https?:/.test(p.contract_reference) ? <a className="text-brand-primary underline" href={p.contract_reference} target="_blank" rel="noreferrer noopener">קישור להסכם</a> : p.contract_reference) : p.contract_signature_request_id ? 'מקושר לחוזה במערכת החתימות' : '—'}</dd></div>
        <div className="col-span-2"><dt className="text-wizard-text-secondary">פעולה הבאה</dt><dd className="font-medium">{nextAction(p)}</dd></div>
      </dl>
      {p.internal_notes && <p className="mt-1 text-xs text-wizard-text-secondary">הערה פנימית: {p.internal_notes}</p>}
      {manage && live && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Btn size="sm" tone="secondary" onClick={() => setDialog('terms')}>תנאים והסכם</Btn>
          {p.selection_status === 'approved' && ['not_invited', 'declined', 'invited'].includes(p.participation_status) && <Btn size="sm" onClick={() => setDialog('invite')}>{p.participation_status === 'invited' ? 'הזמנה נוספת' : 'הזמנה ליוצר'}</Btn>}
          {p.participation_status === 'invited' && <Btn size="sm" tone="secondary" onClick={() => setDialog('response')}>תיעוד תשובה שהתקבלה</Btn>}
          {p.participation_status === 'accepted' && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void act({ action: 'activate' }, 'ההשתתפות פעילה')}>סימון כפעיל</Btn>}
          {p.participation_status === 'active' && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void act({ action: 'complete' }, 'ההשתתפות הושלמה')}>סיום השתתפות</Btn>}
          {!['cancelled', 'completed', 'declined'].includes(p.participation_status) && <Btn size="sm" tone="secondary" onClick={() => setDialog('deliverable')}>הוספת תוצר</Btn>}
          <Btn size="sm" tone="secondary" onClick={() => setDialog('shipment')}>משלוח</Btn>
          {['rejected', 'withdrawn', 'changes_requested'].includes(p.selection_status) && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void act({ action: 'repropose' }, 'הוחזר למועמדים')}>החזרה למועמדים</Btn>}
          {['proposed', 'changes_requested', 'internal_review', 'client_review', 'approved'].includes(p.selection_status) && ['not_invited', 'declined'].includes(p.participation_status) && <Btn size="sm" tone="ghost" onClick={() => setDialog('withdraw')}>הסרה מהמועמדים</Btn>}
          {!['not_invited', 'cancelled', 'completed'].includes(p.participation_status) && <Btn size="sm" tone="ghost" onClick={() => setDialog('cancel')}>ביטול השתתפות</Btn>}
        </div>
      )}
      {dialog === 'terms' && <TermsDialog p={p} agents={agents} onClose={() => setDialog(null)} />}
      {dialog === 'invite' && <InviteDialog p={p} onClose={() => setDialog(null)} />}
      {dialog === 'response' && <ReasonDialog title="תיעוד תשובה שהתקבלה מחוץ לפורטל" label="איך התקבלה התשובה (חובה)" withResponse onClose={() => setDialog(null)}
        onSubmit={(note, response) => act({ action: 'record_response', response, note }, 'התשובה תועדה')} />}
      {dialog === 'cancel' && <ReasonDialog title="ביטול השתתפות" label="סיבה (חובה)" danger onClose={() => setDialog(null)} onSubmit={(reason) => act({ action: 'cancel', reason }, 'ההשתתפות בוטלה')} />}
      {dialog === 'withdraw' && <ReasonDialog title="הסרה מרשימת המועמדים" label="סיבה (חובה)" onClose={() => setDialog(null)} onSubmit={(reason) => act({ action: 'withdraw', reason }, 'הוסר מהמועמדים')} />}
      {dialog === 'deliverable' && <DeliverableDialog participationId={p.id} onClose={() => setDialog(null)} />}
      {dialog === 'shipment' && <ShipmentDialog participationId={p.id} onClose={() => setDialog(null)} />}
    </div>
  )
}

function ReasonDialog({ title, label, onClose, onSubmit, danger, withResponse }: {
  title: string; label: string; onClose: () => void; danger?: boolean; withResponse?: boolean
  onSubmit: (text: string, response: 'accepted' | 'declined') => Promise<unknown>
}) {
  const [text, setText] = React.useState('')
  const [response, setResponse] = React.useState<'accepted' | 'declined'>('accepted')
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="space-y-3">
        {withResponse && (
          <Field label="התשובה" htmlFor="rd-resp"><SelectInput id="rd-resp" value={response} onChange={(e) => setResponse(e.target.value as 'accepted' | 'declined')}><option value="accepted">אישר/ה השתתפות</option><option value="declined">סירב/ה</option></SelectInput></Field>
        )}
        {withResponse && <Notice tone="warn">התשובה תתועד כאישור שנרשם על ידך ולא כאישור היוצר בפורטל.</Notice>}
        <Field label={label} htmlFor="rd-text"><TextArea id="rd-text" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Btn tone={danger ? 'danger' : 'primary'} busy={busy} disabled={text.trim().length < 3} onClick={async () => { setBusy(true); const ok = await onSubmit(text.trim(), response); setBusy(false); if (ok) onClose() }}>אישור</Btn>
          <Btn tone="secondary" onClick={onClose}>ביטול</Btn>
        </div>
      </div>
    </Dialog>
  )
}

function TermsDialog({ p, agents, onClose }: { p: ParticipationRow; agents: { id: string; display_name: string }[]; onClose: () => void }) {
  const [f, setF] = React.useState({
    agreed_fee: p.agreed_fee ?? '', deliverables_summary: p.deliverables_summary ?? '', agent_id: p.agent_id ?? '',
    contract_reference: p.contract_reference ?? '', contract_signature_request_id: p.contract_signature_request_id ?? '',
    rights_expires_at: p.rights_expires_at ?? '', rights_notes: p.rights_notes ?? '', internal_notes: p.internal_notes ?? '',
    client_visible_notes: p.client_visible_notes ?? '',
  })
  const [dirty, setDirty] = React.useState(false)
  useUnsavedGuard(dirty)
  const { busy, run } = useAction()
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true) }
  const accepted = p.accepted_terms_version !== null && ['accepted', 'active'].includes(p.participation_status)
  return (
    <Dialog open onClose={onClose} title={`תנאים — ${p.creator_name}`}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const body: Record<string, unknown> = { expected_version: p.version, ...f, agent_id: f.agent_id || null, contract_signature_request_id: f.contract_signature_request_id || null }
        if (await run(() => api(`/api/campaigns/participations/${p.id}`, { method: 'PATCH', body }), { success: 'התנאים נשמרו' })) { setDirty(false); onClose() }
      }}>
        {accepted && <Notice tone="warn">היוצר כבר אישר את התנאים (גרסה {p.accepted_terms_version}). שינוי בשכר, בתוצרים או בזכויות יסמן שנדרש אישור מחדש; האישור הקודם יישמר בהיסטוריה.</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Field label={`שכר שסוכם (${p.currency})`} htmlFor="t-fee" hint="מחיר שסוכם לא משתנה אוטומטית"><TextInput id="t-fee" dir="ltr" inputMode="decimal" value={f.agreed_fee} onChange={(e) => set('agreed_fee', e.target.value)} /></Field>
          <Field label="סוכן" htmlFor="t-agent" hint="רק סוכן שמורשה לייצג את היוצר">
            <SelectInput id="t-agent" value={f.agent_id} onChange={(e) => set('agent_id', e.target.value)}><option value="">ללא</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</SelectInput>
          </Field>
        </div>
        <Field label="מה הוזמן (מוצג גם ללקוח)" htmlFor="t-del"><TextArea id="t-del" value={f.deliverables_summary} onChange={(e) => set('deliverables_summary', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="קישור/מזהה הסכם" htmlFor="t-contract"><TextInput id="t-contract" dir="ltr" value={f.contract_reference} onChange={(e) => set('contract_reference', e.target.value)} /></Field>
          <Field label="מזהה חוזה במערכת החתימות" htmlFor="t-sr" hint="אופציונלי (signature_requests)"><TextInput id="t-sr" dir="ltr" value={f.contract_signature_request_id} onChange={(e) => set('contract_signature_request_id', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="זכויות שימוש עד" htmlFor="t-rights"><TextInput id="t-rights" type="date" value={f.rights_expires_at} onChange={(e) => set('rights_expires_at', e.target.value)} /></Field>
          <Field label="הערות זכויות" htmlFor="t-rn"><TextInput id="t-rn" value={f.rights_notes} onChange={(e) => set('rights_notes', e.target.value)} /></Field>
        </div>
        <Field label="הערה פנימית (לא מוצגת ללקוח וליוצר)" htmlFor="t-int"><TextArea id="t-int" value={f.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} /></Field>
        <Field label="הערה שמוצגת ללקוח" htmlFor="t-cv"><TextArea id="t-cv" value={f.client_visible_notes} onChange={(e) => set('client_visible_notes', e.target.value)} /></Field>
        <div className="flex gap-2"><Btn type="submit" busy={busy}>שמירה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}

function InviteDialog({ p, onClose }: { p: ParticipationRow; onClose: () => void }) {
  type Via = 'creator' | 'agent' | 'agency'
  const nameFor = (v: Via) => (v === 'agent' ? p.agent_name ?? '' : v === 'agency' ? p.agency_name ?? '' : p.creator_name)
  const [via, setVia] = React.useState<Via>(p.talent_agency_id ? 'agency' : p.agent_id ? 'agent' : 'creator')
  const [name, setName] = React.useState(nameFor(via))
  const [email, setEmail] = React.useState('')
  const [send, setSend] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const { busy, run } = useAction()
  return (
    <Dialog open onClose={onClose} title={`הזמנת ${p.creator_name}`}>
      {link ? (
        <div className="space-y-3">
          <Notice tone="good">ההזמנה נוצרה. הקישור מוצג פעם אחת בלבד ואינו נשמר במערכת. הוא תקף לשימוש אחד במשך 14 יום.</Notice>
          <TextInput readOnly dir="ltr" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="קישור הזמנה" />
          <div className="flex gap-2">
            <Btn onClick={() => { void navigator.clipboard.writeText(link); toast.success('הקישור הועתק') }}>העתקה</Btn>
            <Btn tone="secondary" onClick={onClose}>סגירה</Btn>
          </div>
          <p className="text-xs text-wizard-text-secondary">פעולות בפורטל מיוחסות למי שמחזיק בקישור שנשלח לנמען. זה אינו אימות זהות חזק ואינו חתימה משפטית.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(p.agent_id || p.talent_agency_id) && (
            <Field label="למי לשלוח" htmlFor="inv-via" hint="סוכנות רואה את כל היוצרים שהיא מייצגת; סוכן רק את המוקצים לו">
              <SelectInput id="inv-via" value={via} onChange={(e) => { const v = e.target.value as Via; setVia(v); setName(nameFor(v)) }}>
                <option value="creator">ליוצר ישירות</option>
                {p.agent_id && <option value="agent">לסוכן ({p.agent_name})</option>}
                {p.talent_agency_id && <option value="agency">לסוכנות ({p.agency_name})</option>}
              </SelectInput>
            </Field>
          )}
          <Field label="שם הנמען" htmlFor="inv-name"><TextInput id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="דוא״ל (לא חובה)" htmlFor="inv-email" hint="משמש לתזכורות ולבקשת קישור כניסה חדש"><TextInput id="inv-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={send} disabled={!email} onChange={(e) => setSend(e.target.checked)} /> לשלוח גם בדוא״ל</label>
          <div className="flex gap-2">
            <Btn busy={busy} disabled={!name.trim()} onClick={async () => {
              const r = await run(() => api<{ invite_url: string }>(`/api/campaigns/participations/${p.id}/actions`, {
                body: { action: 'invite', expected_version: p.version, via, recipient_name: name.trim(), recipient_email: email || null, send_email: send },
              }), { success: 'ההזמנה נוצרה' })
              if (r?.invite_url) setLink(r.invite_url)
            }}>יצירת הזמנה</Btn>
            <Btn tone="secondary" onClick={onClose}>ביטול</Btn>
          </div>
        </div>
      )}
    </Dialog>
  )
}

const TYPES = [['reel', 'ריל'], ['post', 'פוסט'], ['story', 'סטורי'], ['video', 'וידאו'], ['short', 'שורט'], ['live', 'לייב'], ['other', 'אחר']] as const
const PLATFORMS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['x', 'X'], ['linkedin', 'LinkedIn'], ['other', 'אחר']] as const

function DeliverableDialog({ participationId, onClose }: { participationId: string; onClose: () => void }) {
  const [f, setF] = React.useState({ title: '', type: 'reel', platform: 'instagram', description: '', submission_due_at: '', publication_due_at: '', required_tags: '', required_mentions: '', required_links: '' })
  const { busy, run } = useAction()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const list = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean)
  return (
    <Dialog open onClose={onClose} title="תוצר חדש">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => api(`/api/campaigns/participations/${participationId}/deliverables`, { body: {
          ...f, submission_due_at: f.submission_due_at || null, publication_due_at: f.publication_due_at || null,
          required_tags: list(f.required_tags), required_mentions: list(f.required_mentions), required_links: list(f.required_links),
        } }), { success: 'התוצר נוסף' })
        if (ok) onClose()
      }}>
        <Field label="כותרת *" htmlFor="d-title"><TextInput id="d-title" value={f.title} onChange={(e) => set('title', e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="סוג" htmlFor="d-type"><SelectInput id="d-type" value={f.type} onChange={(e) => set('type', e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></Field>
          <Field label="פלטפורמה" htmlFor="d-pl"><SelectInput id="d-pl" value={f.platform} onChange={(e) => set('platform', e.target.value)}>{PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></Field>
        </div>
        <Field label="בריף ודרישות" htmlFor="d-desc"><TextArea id="d-desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="מועד הגשה (שעון ישראל)" htmlFor="d-sub"><TextInput id="d-sub" type="datetime-local" value={f.submission_due_at} onChange={(e) => set('submission_due_at', e.target.value)} /></Field>
          <Field label="מועד פרסום (שעון ישראל)" htmlFor="d-pub"><TextInput id="d-pub" type="datetime-local" value={f.publication_due_at} onChange={(e) => set('publication_due_at', e.target.value)} /></Field>
        </div>
        <Field label="תגיות נדרשות" htmlFor="d-tags" hint="מופרדות בפסיק"><TextInput id="d-tags" value={f.required_tags} onChange={(e) => set('required_tags', e.target.value)} /></Field>
        <Field label="תיוגים נדרשים" htmlFor="d-men"><TextInput id="d-men" value={f.required_mentions} onChange={(e) => set('required_mentions', e.target.value)} /></Field>
        <Field label="קישורים נדרשים" htmlFor="d-links"><TextInput id="d-links" dir="ltr" value={f.required_links} onChange={(e) => set('required_links', e.target.value)} /></Field>
        <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.title.trim()}>הוספה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}

function ShipmentDialog({ participationId, onClose }: { participationId: string; onClose: () => void }) {
  const [loaded, setLoaded] = React.useState(false)
  const [version, setVersion] = React.useState<number | null>(null)
  const [f, setF] = React.useState({ status: 'required', carrier_name: '', tracking_number: '', tracking_url: '', shipping_address: '', dispatched_at: '', delivered_at: '', notes: '' })
  const { busy, run } = useAction()
  React.useEffect(() => {
    api<{ shipment: null | Record<string, string | number | null> }>(`/api/campaigns/participations/${participationId}/shipment`).then((r) => {
      const s = r.shipment
      if (s) {
        setVersion(Number(s.version))
        setF({ status: String(s.status), carrier_name: String(s.carrier_name ?? ''), tracking_number: String(s.tracking_number ?? ''), tracking_url: String(s.tracking_url ?? ''),
          shipping_address: String(s.shipping_address ?? ''), dispatched_at: toJerusalemInput(s.dispatched_at as string | null), delivered_at: toJerusalemInput(s.delivered_at as string | null), notes: String(s.notes ?? '') })
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [participationId])
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Dialog open onClose={onClose} title="משלוח (עדכון ידני)">
      {!loaded ? <p>טוען…</p> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => api(`/api/campaigns/participations/${participationId}/shipment`, { method: 'PUT', body: { ...f, expected_version: version, dispatched_at: f.dispatched_at || null, delivered_at: f.delivered_at || null } }), { success: 'המשלוח עודכן' })) onClose()
        }}>
          <Field label="סטטוס" htmlFor="s-st"><SelectInput id="s-st" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {['not_required', 'required', 'preparing', 'shipped', 'delivered', 'exception'].map((s) => <option key={s} value={s}>{heStatus(s)}</option>)}
          </SelectInput></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="חברת שילוח" htmlFor="s-c"><TextInput id="s-c" value={f.carrier_name} onChange={(e) => set('carrier_name', e.target.value)} /></Field>
            <Field label="מספר מעקב" htmlFor="s-n"><TextInput id="s-n" dir="ltr" value={f.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} /></Field>
          </div>
          <Field label="קישור מעקב" htmlFor="s-u"><TextInput id="s-u" dir="ltr" type="url" value={f.tracking_url} onChange={(e) => set('tracking_url', e.target.value)} /></Field>
          <Field label="כתובת למשלוח" htmlFor="s-a" hint="מוצגת לצוות בלבד; לא ללקוח"><TextArea id="s-a" value={f.shipping_address} onChange={(e) => set('shipping_address', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="נשלח ב" htmlFor="s-d"><TextInput id="s-d" type="datetime-local" value={f.dispatched_at} onChange={(e) => set('dispatched_at', e.target.value)} /></Field>
            <Field label="נמסר ב" htmlFor="s-dl"><TextInput id="s-dl" type="datetime-local" value={f.delivered_at} onChange={(e) => set('delivered_at', e.target.value)} /></Field>
          </div>
          <Field label="הערות" htmlFor="s-notes" hint="חובה במקרה של חריגה"><TextArea id="s-notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <div className="flex gap-2"><Btn type="submit" busy={busy}>שמירה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
        </form>
      )}
    </Dialog>
  )
}
