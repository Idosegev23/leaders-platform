'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { api, newIdempotencyKey } from './client-api'
import { Btn, Dialog, Empty, Field, Notice, Panel, TextArea, TextInput, useAction } from './ui'

type Client = { id: string; name: string; name_secondary: string | null; hub_client_id: string | null; salesforce_account_id: string | null; campaigns: number }

export function ClientsManager({ clients, hub, q, canCreate }: { clients: Client[]; hub: boolean; q: string; canCreate: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const [inviteFor, setInviteFor] = React.useState<Client | null>(null)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form method="get" role="search" className="flex flex-1 gap-2">
          <label className="flex-1"><span className="sr-only">חיפוש לקוח</span><input name="q" defaultValue={q} placeholder="חיפוש לקוח" className="h-10 w-full rounded-xl border border-wizard-border px-3 text-sm" /></label>
          <button className="h-10 rounded-xl bg-brand-primary px-4 text-sm text-white">חיפוש</button>
        </form>
        {canCreate && <Btn onClick={() => setOpen(true)}>לקוח חדש</Btn>}
      </div>
      <Panel>
        {clients.length === 0 ? <Empty title="אין לקוחות עדיין" /> : (
          <ul className="divide-y divide-wizard-border">
            {clients.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <div className="font-semibold">{c.name}{c.name_secondary ? <span className="font-normal text-wizard-text-secondary"> · {c.name_secondary}</span> : null}</div>
                  <div className="text-xs text-wizard-text-secondary">
                    {c.campaigns} קמפיינים{c.salesforce_account_id ? ` · Salesforce ${c.salesforce_account_id}` : ''}{c.hub_client_id ? ' · מקושר ללקוח ב-Hub' : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/campaigns?client_id=${c.id}`} className="text-xs text-brand-primary underline">לקמפיינים</Link>
                  {canCreate && c.campaigns > 0 && <Btn size="sm" tone="ghost" onClick={() => setInviteFor(c)}>הזמנת נציג/ה לכל הקמפיינים</Btn>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {open && <NewClient hub={hub} onClose={() => setOpen(false)} />}
      {inviteFor && <ClientInvite client={inviteFor} onClose={() => setInviteFor(null)} onLink={setLink} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="קישור הזמנה לנציג/ת הלקוח">
        <Notice tone="good">הקישור נותן גישה לכל הקמפיינים של הלקוח, גם עתידיים. מוצג פעם אחת ולשימוש אחד.</Notice>
        <TextInput className="mt-3" readOnly dir="ltr" value={link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="קישור" />
        <div className="mt-3"><Btn onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('הועתק') }}>העתקה</Btn></div>
      </Dialog>
    </div>
  )
}

function NewClient({ hub, onClose }: { hub: boolean; onClose: () => void }) {
  const [f, setF] = React.useState({ name: '', name_secondary: '', salesforce_account_id: '', notes: '', hub_client_id: '' })
  const [hubQ, setHubQ] = React.useState('')
  const [hubResults, setHubResults] = React.useState<{ id: string; name: string; name_hebrew: string | null; linked: boolean }[]>([])
  const [idem] = React.useState(newIdempotencyKey)
  const { busy, run } = useAction()
  React.useEffect(() => {
    if (!hub) return
    const t = setTimeout(() => { api<{ clients: typeof hubResults }>(`/api/campaigns/clients/hub?q=${encodeURIComponent(hubQ)}`).then((r) => setHubResults(r.clients)).catch(() => setHubResults([])) }, 250)
    return () => clearTimeout(t)
  }, [hub, hubQ])
  return (
    <Dialog open onClose={onClose} title="לקוח חדש">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => api('/api/campaigns/clients', { idempotencyKey: idem, body: { ...f, hub_client_id: f.hub_client_id || null } }), { success: 'הלקוח נוסף' })) onClose()
      }}>
        {hub && (
          <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <Field label="בחירה מרשימת הלקוחות של ה-Hub (לא חובה)" htmlFor="nc-hub"><TextInput id="nc-hub" value={hubQ} onChange={(e) => setHubQ(e.target.value)} placeholder="חיפוש…" /></Field>
            <ul className="max-h-36 overflow-y-auto text-sm">
              {hubResults.slice(0, 8).map((h) => (
                <li key={h.id}><button type="button" disabled={h.linked} className="w-full px-2 py-1 text-right hover:bg-white disabled:opacity-50"
                  onClick={() => setF({ ...f, name: h.name_hebrew || h.name, name_secondary: h.name_hebrew ? h.name : '', hub_client_id: h.id })}>
                  {h.name_hebrew || h.name}{h.linked ? ' (כבר מקושר)' : ''}
                </button></li>
              ))}
            </ul>
          </div>
        )}
        <Field label="שם הלקוח *" htmlFor="nc-name"><TextInput id="nc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="שם נוסף (למשל באנגלית)" htmlFor="nc-sec"><TextInput id="nc-sec" value={f.name_secondary} onChange={(e) => setF({ ...f, name_secondary: e.target.value })} /></Field>
        <Field label="מזהה לקוח ב-Salesforce" htmlFor="nc-sf" hint="קישור ידני; המערכת אינה כותבת ל-Salesforce"><TextInput id="nc-sf" dir="ltr" value={f.salesforce_account_id} onChange={(e) => setF({ ...f, salesforce_account_id: e.target.value })} /></Field>
        <Field label="הערות" htmlFor="nc-notes"><TextArea id="nc-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Btn type="submit" busy={busy} disabled={!f.name.trim()}>הוספה</Btn>
      </form>
    </Dialog>
  )
}

function ClientInvite({ client, onClose, onLink }: { client: Client; onClose: () => void; onLink: (l: string) => void }) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [send, setSend] = React.useState(false)
  const { busy, run } = useAction()
  return (
    <Dialog open onClose={onClose} title={`נציג/ת ${client.name} — כל הקמפיינים`}>
      <div className="space-y-3">
        <Notice>הנציג/ה יראה/תראה את כל הקמפיינים של {client.name}: מועמדים ותכנים לאישור, סטטוס ודוחות שפורסמו. לא מחירים, תקציב או הערות פנימיות.</Notice>
        <Field label="שם" htmlFor="ci-name"><TextInput id="ci-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="דוא״ל" htmlFor="ci-email"><TextInput id="ci-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={send} disabled={!email} onChange={(e) => setSend(e.target.checked)} /> לשלוח בדוא״ל</label>
        <Btn busy={busy} disabled={!name.trim()} onClick={async () => {
          const r = await run(() => api<{ inviteUrl: string }>('/api/campaigns/grants', { body: { kind: 'client', client_id: client.id, recipient_name: name, recipient_email: email || null, send_email: send } }), { success: 'ההזמנה נוצרה' })
          if (r) { onClose(); onLink(r.inviteUrl) }
        }}>יצירת הזמנה</Btn>
      </div>
    </Dialog>
  )
}
