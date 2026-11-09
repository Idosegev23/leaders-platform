'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, ApiError, newIdempotencyKey } from './client-api'
import { Btn, Field, Notice, Panel, SelectInput, TextArea, TextInput, useUnsavedGuard } from './ui'

type Client = { id: string; name: string; name_secondary: string | null; salesforce_account_id: string | null }
type Brief = { id: string; client_name: string | null; status: string; created_at: string; salesforce_ref: string | null }
type Prefill = { name: string | null; description: string | null; objectives: string | null; start_date: string | null; budget_hint: string | null; platforms: string | null; brief_status: string }

export function NewCampaignForm({ managers, me, hub }: { managers: { id: string; full_name: string }[]; me: string; hub: boolean }) {
  const router = useRouter()
  const [f, setF] = React.useState({
    client_id: '', client_label: '', name: '', description: '', objectives: '', external_project_reference: '',
    brief_document_link_id: '', brief_label: '', brief_url: '', owner_user_id: me, start_date: '', end_date: '',
    currency: 'ILS', approved_budget: '', amounts_include_vat: 'false',
  })
  const [dirty, setDirty] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<ApiError | null>(null)
  const [idem] = React.useState(newIdempotencyKey)
  useUnsavedGuard(dirty && !busy)
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setDirty(true) }

  // client search
  const [clientQ, setClientQ] = React.useState('')
  const [clients, setClients] = React.useState<Client[]>([])
  React.useEffect(() => {
    const t = setTimeout(() => {
      api<{ clients: Client[] }>(`/api/campaigns/clients?q=${encodeURIComponent(clientQ)}`).then((r) => setClients(r.clients)).catch(() => setClients([]))
    }, 250)
    return () => clearTimeout(t)
  }, [clientQ])

  // brief search + prefill
  const [briefQ, setBriefQ] = React.useState('')
  const [briefs, setBriefs] = React.useState<Brief[]>([])
  const [prefill, setPrefill] = React.useState<Prefill | null>(null)
  React.useEffect(() => {
    if (!hub) return
    const t = setTimeout(() => {
      api<{ briefs: Brief[] }>(`/api/campaigns/briefs?q=${encodeURIComponent(briefQ)}`).then((r) => setBriefs(r.briefs)).catch(() => setBriefs([]))
    }, 250)
    return () => clearTimeout(t)
  }, [briefQ, hub])

  async function pickBrief(b: Brief) {
    set('brief_document_link_id', b.id)
    set('brief_label', `${b.client_name ?? 'בריף'} · ${new Date(b.created_at).toLocaleDateString('he-IL')}`)
    if (b.salesforce_ref && !f.external_project_reference) set('external_project_reference', b.salesforce_ref)
    try {
      setPrefill(await api<Prefill>(`/api/campaigns/briefs/${b.id}/prefill`))
    } catch {
      setPrefill(null)
    }
  }

  async function createClient() {
    const name = clientQ.trim()
    if (!name) return
    try {
      const r = await api<{ id: string; existing: boolean }>('/api/campaigns/clients', { body: { name } })
      set('client_id', r.id)
      set('client_label', name)
      toast.success(r.existing ? 'נבחר לקוח קיים בשם זה' : 'הלקוח נוסף')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'יצירת הלקוח נכשלה')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ id: string }>('/api/campaigns', {
        idempotencyKey: idem,
        body: {
          client_id: f.client_id, name: f.name, description: f.description, objectives: f.objectives,
          external_project_reference: f.external_project_reference, brief_document_link_id: f.brief_document_link_id || null,
          brief_url: f.brief_url, owner_user_id: f.owner_user_id, start_date: f.start_date, end_date: f.end_date,
          currency: f.currency, approved_budget: f.approved_budget, amounts_include_vat: f.amounts_include_vat === 'true',
        },
      })
      setDirty(false)
      toast.success('הקמפיין נשמר כטיוטה')
      router.push(`/campaigns/${r.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('השמירה נכשלה', 'UNKNOWN', 0))
      setBusy(false)
    }
  }

  const fieldErr = (name: string) => (error?.details?.fields as { field: string; message: string }[] | undefined)?.find((x) => x.field === name)?.message

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Notice tone="bad">{error.message}</Notice>}
      <Panel title="לקוח ופרויקט">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <Field label="לקוח *" htmlFor="client-q" hint="מתוך הלקוחות של הארגון. אם הלקוח חסר אפשר להוסיף אותו כאן." error={fieldErr('client_id')}>
              <TextInput id="client-q" value={f.client_id ? f.client_label : clientQ} placeholder="חיפוש לקוח…"
                onChange={(e) => { setClientQ(e.target.value); if (f.client_id) { set('client_id', ''); set('client_label', '') } }}
                aria-autocomplete="list" aria-controls="client-list" />
            </Field>
            {!f.client_id && (
              <ul id="client-list" role="listbox" aria-label="לקוחות" className="max-h-48 overflow-y-auto rounded-xl border border-wizard-border">
                {clients.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}>
                    <button type="button" className="w-full px-3 py-2 text-right text-sm hover:bg-brand-pearl" onClick={() => { set('client_id', c.id); set('client_label', c.name) }}>
                      {c.name}{c.name_secondary ? <span className="text-xs text-wizard-text-secondary"> · {c.name_secondary}</span> : null}
                    </button>
                  </li>
                ))}
                {clientQ.trim() && (
                  <li><button type="button" className="w-full px-3 py-2 text-right text-sm font-medium text-brand-primary hover:bg-brand-pearl" onClick={() => void createClient()}>+ הוספת לקוח &quot;{clientQ.trim()}&quot;</button></li>
                )}
              </ul>
            )}
          </div>
          <Field label="מזהה פרויקט ב-Salesforce" htmlFor="sf" hint="קישור ידני; המערכת אינה כותבת ל-Salesforce">
            <TextInput id="sf" value={f.external_project_reference} onChange={(e) => set('external_project_reference', e.target.value)} />
          </Field>
          <Field label={hub ? 'קישור חיצוני לבריף (אם אין בריף במערכת)' : 'קישור לבריף'} htmlFor="brief-url" error={fieldErr('brief_url')}>
            <TextInput id="brief-url" type="url" dir="ltr" value={f.brief_url} onChange={(e) => set('brief_url', e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </Panel>

      {hub && <Panel title="בריף מה-Hub">
        {f.brief_document_link_id ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>בריף מקושר: <strong>{f.brief_label}</strong></span>
            <Btn size="sm" tone="ghost" onClick={() => { set('brief_document_link_id', ''); set('brief_label', ''); setPrefill(null) }}>הסרה</Btn>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="חיפוש בריף לקוח" htmlFor="brief-q">
              <TextInput id="brief-q" value={briefQ} onChange={(e) => setBriefQ(e.target.value)} placeholder="שם לקוח…" />
            </Field>
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-wizard-border">
              {briefs.length === 0 && <li className="px-3 py-2 text-sm text-wizard-text-secondary">לא נמצאו בריפים</li>}
              {briefs.map((b) => (
                <li key={b.id}><button type="button" className="w-full px-3 py-2 text-right text-sm hover:bg-brand-pearl" onClick={() => void pickBrief(b)}>
                  {b.client_name ?? '—'} · {new Date(b.created_at).toLocaleDateString('he-IL')} · {b.status === 'completed' ? 'הושלם' : b.status}
                </button></li>
              ))}
            </ul>
          </div>
        )}
        {prefill && (
          <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
            <p className="font-semibold text-sky-900">הצעות מתוך הבריף. בדקו לפני שמחילים; שום דבר לא נשמר עד הלחיצה על &quot;שמירה כטיוטה&quot;.</p>
            {(['name', 'description', 'objectives', 'start_date'] as const).map((k) => prefill[k] && (
              <div key={k} className="flex flex-wrap items-start justify-between gap-2 border-t border-sky-200 pt-2">
                <div className="min-w-0 flex-1 whitespace-pre-wrap"><span className="text-xs text-sky-800">{{ name: 'שם', description: 'תיאור', objectives: 'מטרות', start_date: 'תאריך השקה' }[k]}: </span>{prefill[k]}</div>
                <Btn size="sm" tone="secondary" onClick={() => set(k, prefill[k] as string)}>החלה</Btn>
              </div>
            ))}
            {prefill.budget_hint && <p className="border-t border-sky-200 pt-2">תקציב שצוין בבריף (טקסט חופשי, לא מועתק אוטומטית): <strong>{prefill.budget_hint}</strong></p>}
          </div>
        )}
      </Panel>}

      <Panel title="פרטי הקמפיין">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="שם הקמפיין *" htmlFor="name" error={fieldErr('name')}>
            <TextInput id="name" value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={200} />
          </Field></div>
          <div className="sm:col-span-2"><Field label="תיאור" htmlFor="desc"><TextArea id="desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="מטרות" htmlFor="obj"><TextArea id="obj" value={f.objectives} onChange={(e) => set('objectives', e.target.value)} /></Field></div>
          <Field label="אחראית" htmlFor="owner">
            <SelectInput id="owner" value={f.owner_user_id} onChange={(e) => set('owner_user_id', e.target.value)}>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </SelectInput>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="תאריך התחלה" htmlFor="start" error={fieldErr('start_date')}><TextInput id="start" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
            <Field label="תאריך סיום" htmlFor="end" error={fieldErr('end_date')}><TextInput id="end" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="תקציב">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="תקציב מאושר" htmlFor="budget" hint="מספר עם עד שתי ספרות אחרי הנקודה" error={fieldErr('approved_budget')}>
            <TextInput id="budget" inputMode="decimal" dir="ltr" value={f.approved_budget} onChange={(e) => set('approved_budget', e.target.value)} />
          </Field>
          <Field label="מטבע" htmlFor="cur" hint="מטבע אחד לקמפיין, ללא המרה">
            <SelectInput id="cur" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="ILS">₪ ILS</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option>
            </SelectInput>
          </Field>
          <Field label="הסכומים בקמפיין" htmlFor="vat">
            <SelectInput id="vat" value={f.amounts_include_vat} onChange={(e) => set('amounts_include_vat', e.target.value)}>
              <option value="false">לפני מע״מ</option><option value="true">כולל מע״מ</option>
            </SelectInput>
          </Field>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Btn type="submit" busy={busy} disabled={!f.client_id || !f.name.trim()}>שמירה כטיוטה</Btn>
        <Btn tone="secondary" onClick={() => router.push('/campaigns')}>ביטול</Btn>
        {(!f.client_id || !f.name.trim()) && <span className="self-center text-xs text-wizard-text-secondary">יש לבחור לקוח ולתת שם לקמפיין</span>}
      </div>
    </form>
  )
}
