'use client'

import * as React from 'react'
import { api } from '../client-api'
import { Btn, Dialog, Field, Notice, Panel, SelectInput, Stat, StatusBadge, TextInput, useAction } from '../ui'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { HE_CATEGORY, BUDGET_TRANSITIONS, type BudgetCategory, type BudgetStatus } from '@/lib/campaigns/domain/budget'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

type Bucket = { planned: string; committed: string; actual: string }
type Budget = {
  currency: string; amountsIncludeVat: boolean; approvedBudget: string | null
  lines: { id: string; category: BudgetCategory; description: string; amount: string; status: BudgetStatus; source: string; creator_name: string | null; source_reference: string | null; version: number }[]
  summary: Bucket & { approved: string | null; exposure: string; available: string | null; availableAfterPlanned: string | null; overrun: string; byCategory: Record<BudgetCategory, Bucket> }
}

export function BudgetTab({ campaignId, budget, manage }: { campaignId: string; budget: Budget; manage: boolean }) {
  const s = budget.summary
  const m = (v: string | null) => formatMoney(v === null ? null : BigInt(v), budget.currency)
  const over = BigInt(s.overrun) > BigInt(0)
  const [adding, setAdding] = React.useState(false)
  return (
    <div className="space-y-4">
      <p className="text-sm text-wizard-text-secondary">כל הסכומים ב-{budget.currency}, <strong>{budget.amountsIncludeVat ? 'כולל מע״מ' : 'לפני מע״מ'}</strong>. אין העברת כספים במערכת; סטטוס תשלום נרשם ידנית.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="תקציב מאושר" value={m(s.approved)} />
        <Stat label="מתוכנן" value={m(s.planned)} hint="עדיין לא סוכם" />
        <Stat label="התחייבויות פתוחות" value={m(s.committed)} hint="סוכם, טרם שולם" />
        <Stat label="הוצאות בפועל" value={m(s.actual)} />
        <Stat label="יתרה זמינה" value={m(s.available)} hint={`אחרי מתוכנן: ${m(s.availableAfterPlanned)}`} tone={s.available !== null && BigInt(s.available) < BigInt(0) ? 'bad' : undefined} />
        <Stat label="חריגה" value={m(s.overrun)} tone={over ? 'bad' : 'good'} />
      </div>
      <Notice>
        איך מחושב: כל שורה נספרת פעם אחת לפי הסטטוס הנוכחי שלה. התחייבות שמסומנת כהוצאה בפועל עוברת מ&quot;התחייבויות&quot; ל&quot;הוצאות&quot; באותה שורה ולא נספרת פעמיים.
        יתרה זמינה = תקציב מאושר − (התחייבויות פתוחות + הוצאות בפועל). שורות מבוטלות אינן נספרות.
      </Notice>
      <Panel title="לפי קטגוריה">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-wizard-text-secondary"><tr><th scope="col" className="py-1">קטגוריה</th><th scope="col">מתוכנן</th><th scope="col">התחייבויות</th><th scope="col">בפועל</th></tr></thead>
            <tbody>
              {(Object.keys(s.byCategory) as BudgetCategory[]).map((c) => (
                <tr key={c} className="border-t border-wizard-border"><th scope="row" className="py-1.5 text-right font-medium">{HE_CATEGORY[c]}</th><td>{m(s.byCategory[c].planned)}</td><td>{m(s.byCategory[c].committed)}</td><td>{m(s.byCategory[c].actual)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="שורות תקציב" actions={manage && <Btn size="sm" onClick={() => setAdding(true)}>שורה חדשה</Btn>}>
        <ul className="divide-y divide-wizard-border">
          {budget.lines.length === 0 && <li className="py-2 text-sm text-wizard-text-secondary">אין שורות תקציב. שכר משפיענים נוסף אוטומטית כשמגדירים שכר בהשתתפות.</li>}
          {budget.lines.map((l) => <LineRow key={l.id} l={l} currency={budget.currency} manage={manage} />)}
        </ul>
      </Panel>
      {adding && <AddLine campaignId={campaignId} currency={budget.currency} onClose={() => setAdding(false)} />}
    </div>
  )
}

function LineRow({ l, currency, manage }: { l: Budget['lines'][number]; currency: string; manage: boolean }) {
  const { busy, run } = useAction()
  const [actualOpen, setActualOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(l.amount)
  const options = BUDGET_TRANSITIONS[l.status].filter((s) => l.source !== 'participation_fee' || s === 'actual')
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{l.description}</div>
        <div className="text-xs text-wizard-text-secondary">{HE_CATEGORY[l.category]}{l.source === 'participation_fee' ? ' · מתעדכן מתנאי ההשתתפות' : ''}{l.source_reference ? ` · אסמכתה: ${l.source_reference}` : ''}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{formatMoney(parseMoney(l.amount), currency)}</span>
        <StatusBadge status={l.status} />
        {manage && options.map((s) => (
          s === 'actual'
            ? <Btn key={s} size="sm" tone="secondary" onClick={() => setActualOpen(true)}>סימון כהוצאה בפועל</Btn>
            : <Btn key={s} size="sm" tone="ghost" busy={busy} onClick={() => void run(() => api(`/api/campaigns/budget/${l.id}`, { method: 'PATCH', body: { expected_version: l.version, status: s } }), { success: 'עודכן' })}>{heStatus(s)}</Btn>
        ))}
      </div>
      <Dialog open={actualOpen} onClose={() => setActualOpen(false)} title="סימון כהוצאה בפועל">
        <p className="text-sm">השורה תעבור להוצאה בפועל ולא תיספר עוד כהתחייבות. אפשר לעדכן את הסכום הסופי. סימון זה הוא תיעוד ידני ואינו מבצע תשלום.</p>
        <Field label={`סכום סופי (${currency})`} htmlFor={`act-${l.id}`}><TextInput id={`act-${l.id}`} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={l.source === 'participation_fee'} /></Field>
        <div className="mt-3 flex gap-2">
          <Btn busy={busy} onClick={async () => {
            const body: Record<string, unknown> = { expected_version: l.version, status: 'actual' }
            if (l.source !== 'participation_fee') body.amount = amount
            if (await run(() => api(`/api/campaigns/budget/${l.id}`, { method: 'PATCH', body }), { success: 'סומן כהוצאה בפועל' })) setActualOpen(false)
          }}>אישור</Btn>
        </div>
      </Dialog>
    </li>
  )
}

function AddLine({ campaignId, currency, onClose }: { campaignId: string; currency: string; onClose: () => void }) {
  const [f, setF] = React.useState({ category: 'production', description: '', amount: '', status: 'planned', source_reference: '' })
  const { busy, run } = useAction()
  return (
    <Dialog open onClose={onClose} title="שורת תקציב חדשה">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/api/campaigns/${campaignId}/budget`, { body: f }), { success: 'נוספה שורה' })) onClose() }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="קטגוריה" htmlFor="bl-cat"><SelectInput id="bl-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(HE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="סטטוס" htmlFor="bl-st"><SelectInput id="bl-st" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="planned">מתוכנן</option><option value="committed">התחייבות</option><option value="actual">הוצאה בפועל</option></SelectInput></Field>
        </div>
        <Field label="תיאור *" htmlFor="bl-desc"><TextInput id="bl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={`סכום (${currency}) *`} htmlFor="bl-amt"><TextInput id="bl-amt" dir="ltr" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="אסמכתה / מספר הזמנה" htmlFor="bl-ref"><TextInput id="bl-ref" value={f.source_reference} onChange={(e) => setF({ ...f, source_reference: e.target.value })} /></Field>
        <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.description.trim() || !f.amount.trim()}>הוספה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}
