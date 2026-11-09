'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Dialog, Field, Notice, Panel, Stat, StatusBadge, TextArea, TextInput, SelectInput, useAction, useUnsavedGuard } from '../ui'
import { CAMPAIGN_MACHINE, heStatus, type CampaignStatus } from '@/lib/campaigns/domain/state-machines'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { formatDateTime } from '@/lib/campaigns/domain/time'
import type { CampaignDetail } from '@/lib/campaigns/services/campaigns'

type Overview = {
  counts: Record<string, number>
  actions: { kind: string; deliverable_id: string | null; participation_id: string | null; title: string; creator_name: string; due_at: string | null; waiting_on: string }[]
  budget: { approved: string | null; exposure: string; overrun: string; available: string | null; currency: string }
}

const ACTION_HE: Record<string, string> = {
  overdue_submission: 'הגשה באיחור', awaiting_internal: 'ממתין לבדיקה פנימית', awaiting_client: 'ממתין לאישור לקוח',
  overdue_publication: 'פרסום באיחור', verify_publication: 'פרסום לאימות', invite_creator: 'להזמין יוצר', awaiting_acceptance: 'ממתין לאישור השתתפות',
}
const WAITING_HE: Record<string, string> = { creator: 'ממתין ליוצר', client: 'ממתין ללקוח', leaders: 'ממתין לנו' }

export function OverviewTab({ campaign, overview, closeIssues, manage, isOwnerOrAdmin }: {
  campaign: CampaignDetail; overview: Overview; closeIssues: { code: string; count: number; message: string }[]; manage: boolean; isOwnerOrAdmin: boolean
}) {
  const c = overview.counts
  const money = (v: string | null) => formatMoney(v === null ? null : BigInt(v), overview.budget.currency)
  const over = BigInt(overview.budget.overrun) > BigInt(0)
  const progress = c.deliverables_total ? Math.round((c.deliverables_verified / c.deliverables_total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="התקדמות (פרסומים מאומתים)" value={`${progress}%`} hint={`${c.deliverables_verified} מתוך ${c.deliverables_total} תוצרים`} />
        <Stat label="משפיענים מאושרים" value={c.creators_approved} hint={`${c.creators_pending_selection} בתהליך בחירה`} />
        <Stat label="הגשות באיחור" value={c.overdue_submissions} tone={c.overdue_submissions ? 'bad' : undefined} />
        <Stat label="ממתינים לאישור לקוח" value={c.awaiting_client} tone={c.awaiting_client ? 'warn' : undefined} />
        <Stat label="פרסומים לא מאומתים" value={c.unverified_publications} tone={c.unverified_publications ? 'warn' : undefined} />
        <Stat label="תקציב: התחייבויות+הוצאות" value={money(overview.budget.exposure)} hint={`מאושר ${money(overview.budget.approved)}`} tone={over ? 'bad' : undefined} />
      </div>

      {(c.failed_messages > 0 || c.failed_jobs > 0) && (
        <Notice tone="warn">יש {c.failed_messages} הודעות ו-{c.failed_jobs} עבודות רקע שנכשלו. <Link className="underline" href={`?tab=activity`}>לפרטים ולניסיון חוזר</Link></Notice>
      )}
      {c.reapproval_needed > 0 && <Notice tone="warn">{c.reapproval_needed} השתתפויות עם תנאים ששונו אחרי אישור: נדרש אישור מחדש. <Link className="underline" href="?tab=creators">ללשונית משפיענים</Link></Notice>}
      {c.rights_expiring > 0 && <Notice tone="warn">{c.rights_expiring} השתתפויות שזכויות השימוש שלהן פוקעות ב-30 הימים הקרובים (תאריך מתוך ההסכם; המערכת אינה בודקת את ההסכם משפטית).</Notice>}

      <Panel title="מה דורש פעולה עכשיו">
        {overview.actions.length === 0 ? <p className="text-sm text-wizard-text-secondary">אין פריטים פתוחים.</p> : (
          <ul className="divide-y divide-wizard-border">
            {overview.actions.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{ACTION_HE[a.kind] ?? a.kind}</span> · {a.creator_name} · {a.title}
                  {a.due_at && <span className="text-xs text-wizard-text-secondary"> · מועד {formatDateTime(a.due_at)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.waiting_on === 'leaders' ? 'pending' : a.waiting_on === 'client' ? 'client_review' : 'invited'} label={WAITING_HE[a.waiting_on]} />
                  {a.deliverable_id ? <Link className="text-xs font-medium text-brand-primary underline" href={`/campaigns/${campaign.id}/deliverables/${a.deliverable_id}`}>לתוצר</Link>
                    : <Link className="text-xs font-medium text-brand-primary underline" href="?tab=creators">למשפיענים</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="פרטי הקמפיין" actions={manage && !['closed', 'cancelled'].includes(campaign.status) && <EditCampaign campaign={campaign} />}>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-wizard-text-secondary">תיאור</dt><dd className="col-span-2 whitespace-pre-wrap">{campaign.description || '—'}</dd>
            <dt className="text-wizard-text-secondary">מטרות</dt><dd className="col-span-2 whitespace-pre-wrap">{campaign.objectives || '—'}</dd>
            <dt className="text-wizard-text-secondary">מטבע וסכומים</dt><dd className="col-span-2">{campaign.currency} · {campaign.amounts_include_vat ? 'כולל מע״מ' : 'לפני מע״מ'}</dd>
            {campaign.brief_url && <><dt className="text-wizard-text-secondary">קישור לבריף</dt><dd className="col-span-2"><a className="text-brand-primary underline" href={campaign.brief_url} target="_blank" rel="noreferrer noopener">פתיחה</a></dd></>}
            {campaign.status_reason && <><dt className="text-wizard-text-secondary">סיבה אחרונה</dt><dd className="col-span-2">{campaign.status_reason}</dd></>}
          </dl>
        </Panel>
        {manage && <StatusControl campaign={campaign} closeIssues={closeIssues} isOwnerOrAdmin={isOwnerOrAdmin} />}
      </div>
    </div>
  )
}

function StatusControl({ campaign, closeIssues, isOwnerOrAdmin }: { campaign: CampaignDetail; closeIssues: { code: string; count: number; message: string }[]; isOwnerOrAdmin: boolean }) {
  const next = CAMPAIGN_MACHINE[campaign.status as CampaignStatus] ?? []
  const [target, setTarget] = React.useState<CampaignStatus | null>(null)
  const [reason, setReason] = React.useState('')
  const [withExceptions, setWithExceptions] = React.useState(false)
  const { busy, run } = useAction()
  const needsReason = target === 'cancelled' || (target === 'closed' && closeIssues.length > 0)
  async function go() {
    if (!target) return
    const ok = await run(() => api(`/api/campaigns/${campaign.id}/status`, {
      body: { to: target, expected_version: campaign.version, reason: reason || null, close_with_exceptions: withExceptions },
    }), { success: `הסטטוס עודכן ל"${heStatus(target)}"` })
    if (ok) { setTarget(null); setReason(''); setWithExceptions(false) }
  }
  return (
    <Panel title="סטטוס הקמפיין">
      {next.length === 0 ? <p className="text-sm text-wizard-text-secondary">הקמפיין במצב סופי.</p> : (
        <div className="flex flex-wrap gap-2">
          {next.map((s) => <Btn key={s} size="sm" tone={s === 'cancelled' ? 'danger' : 'secondary'} onClick={() => setTarget(s)}>העברה ל{heStatus(s)}</Btn>)}
        </div>
      )}
      {closeIssues.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-semibold">בדיקת סגירה: פריטים פתוחים</p>
          <ul className="mt-1 list-disc pe-5 text-wizard-text-secondary">{closeIssues.map((i) => <li key={i.code}>{i.message}: {i.count}</li>)}</ul>
        </div>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={target ? `העברה ל${heStatus(target)}` : ''}>
        <div className="space-y-3">
          {target === 'closed' && closeIssues.length > 0 && (
            <>
              <Notice tone="warn">יש פריטים פתוחים. אפשר לסגור עם חריגות רק בידי האחראית על הקמפיין או מנהל מערכת, עם סיבה מתועדת.</Notice>
              {isOwnerOrAdmin ? (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withExceptions} onChange={(e) => setWithExceptions(e.target.checked)} /> סגירה עם חריגות</label>
              ) : <Notice tone="bad">אין לך הרשאה לסגור עם חריגות.</Notice>}
            </>
          )}
          {(needsReason || target !== 'closed') && (
            <Field label={needsReason ? 'סיבה *' : 'הערה (לא חובה)'} htmlFor="st-reason">
              <TextArea id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <div className="flex gap-2">
            <Btn tone={target === 'cancelled' ? 'danger' : 'primary'} busy={busy} disabled={needsReason && reason.trim().length < 3} onClick={() => void go()}>אישור</Btn>
            <Btn tone="secondary" onClick={() => setTarget(null)}>ביטול</Btn>
          </div>
        </div>
      </Dialog>
    </Panel>
  )
}

function EditCampaign({ campaign }: { campaign: CampaignDetail }) {
  const [open, setOpen] = React.useState(false)
  const [f, setF] = React.useState({
    name: campaign.name, description: campaign.description ?? '', objectives: campaign.objectives ?? '',
    start_date: campaign.start_date ?? '', end_date: campaign.end_date ?? '', approved_budget: campaign.approved_budget ?? '',
    amounts_include_vat: String(campaign.amounts_include_vat), external_project_reference: campaign.external_project_reference ?? '',
  })
  const [dirty, setDirty] = React.useState(false)
  useUnsavedGuard(open && dirty)
  const { busy, run } = useAction()
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setDirty(true) }
  const budgetValid = f.approved_budget === '' || (() => { try { parseMoney(f.approved_budget); return true } catch { return false } })()
  return (
    <>
      <Btn size="sm" tone="secondary" onClick={() => setOpen(true)}>עריכה</Btn>
      <Dialog open={open} onClose={() => setOpen(false)} title="עריכת פרטי הקמפיין">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          const ok = await run(() => api(`/api/campaigns/${campaign.id}`, { method: 'PATCH', body: { ...f, amounts_include_vat: f.amounts_include_vat === 'true', expected_version: campaign.version } }), { success: 'נשמר' })
          if (ok) { setDirty(false); setOpen(false) }
        }}>
          <Field label="שם" htmlFor="e-name"><TextInput id="e-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="תיאור" htmlFor="e-desc"><TextArea id="e-desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="מטרות" htmlFor="e-obj"><TextArea id="e-obj" value={f.objectives} onChange={(e) => set('objectives', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="התחלה" htmlFor="e-s"><TextInput id="e-s" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
            <Field label="סיום" htmlFor="e-e"><TextInput id="e-e" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`תקציב מאושר (${campaign.currency})`} htmlFor="e-b" error={budgetValid ? undefined : 'סכום לא תקין'}><TextInput id="e-b" dir="ltr" inputMode="decimal" value={f.approved_budget} onChange={(e) => set('approved_budget', e.target.value)} /></Field>
            <Field label="סכומים" htmlFor="e-v"><SelectInput id="e-v" value={f.amounts_include_vat} onChange={(e) => set('amounts_include_vat', e.target.value)}><option value="false">לפני מע״מ</option><option value="true">כולל מע״מ</option></SelectInput></Field>
          </div>
          <Field label="מזהה פרויקט Salesforce" htmlFor="e-sf"><TextInput id="e-sf" dir="ltr" value={f.external_project_reference} onChange={(e) => set('external_project_reference', e.target.value)} /></Field>
          <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!budgetValid}>שמירה</Btn><Btn tone="secondary" onClick={() => setOpen(false)}>ביטול</Btn></div>
        </form>
      </Dialog>
    </>
  )
}
