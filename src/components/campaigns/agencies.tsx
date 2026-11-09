'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api } from './client-api'
import { Btn, Dialog, Empty, Field, Notice, Panel, SelectInput, TextInput, useAction } from './ui'

export function NewAgencyButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [f, setF] = React.useState({ name: '', email: '', phone: '' })
  const { busy, run } = useAction()
  return (
    <>
      <Btn onClick={() => setOpen(true)}>סוכנות חדשה</Btn>
      <Dialog open={open} onClose={() => setOpen(false)} title="סוכנות כישרונות חדשה">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          const r = await run(() => api<{ id: string }>('/api/campaigns/agencies', { body: f }), { success: 'הסוכנות נוספה', refresh: false })
          if (r) router.push(`/campaigns/agencies/${r.id}`)
        }}>
          <Field label="שם הסוכנות" htmlFor="na-name"><TextInput id="na-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="דוא״ל" htmlFor="na-email"><TextInput id="na-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="טלפון" htmlFor="na-phone"><TextInput id="na-phone" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Btn type="submit" busy={busy} disabled={!f.name.trim()}>הוספה</Btn>
        </form>
      </Dialog>
    </>
  )
}

type Agency = {
  id: string; name: string; email: string | null; phone: string | null
  agents: { id: string; display_name: string; email: string | null; creators: { id: string; name: string }[] }[]
  creators: { id: string; display_name: string }[]
}

export function AgencyDetail({ agency, canInvite }: { agency: Agency; canInvite: boolean }) {
  const { busy, run } = useAction()
  const [agentOpen, setAgentOpen] = React.useState(false)
  const [agentForm, setAgentForm] = React.useState({ display_name: '', email: '' })
  const [invite, setInvite] = React.useState<null | { kind: 'agency' | 'agent'; agent_id?: string; name: string; email: string }>(null)
  const [link, setLink] = React.useState<string | null>(null)
  const assigned = new Map(agency.agents.flatMap((a) => a.creators.map((c) => [c.id, a.id] as const)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{agency.name}</h1>
          <p className="text-sm text-wizard-text-secondary">{agency.creators.length} יוצרים מיוצגים · {agency.agents.length} סוכנים{agency.email ? ` · ${agency.email}` : ''}</p>
        </div>
        {canInvite && <Btn onClick={() => setInvite({ kind: 'agency', name: agency.name, email: agency.email ?? '' })}>הזמנת הסוכנות לפורטל</Btn>}
      </div>
      <Notice>
        <strong>רמות הגישה בפורטל:</strong> הסוכנות רואה את כל היוצרים שהיא מייצגת, בכל הקמפיינים, ויכולה לאשר השתתפות, להגיש תוכן ולדווח פרסום בשמם.
        סוכן רואה רק את היוצרים שהוקצו לו. יוצר רואה רק את עצמו. מחיר ללקוח והערות פנימיות לא מוצגים לאף אחד מהם.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="סוכנים" actions={<Btn size="sm" tone="secondary" onClick={() => setAgentOpen(true)}>סוכן חדש</Btn>}>
          {agency.agents.length === 0 ? <Empty title="אין סוכנים">הוסיפו סוכן והקצו לו יוצרים.</Empty> : (
            <ul className="divide-y divide-wizard-border">
              {agency.agents.map((a) => (
                <li key={a.id} className="space-y-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{a.display_name}</span>
                    {canInvite && <Btn size="sm" tone="ghost" onClick={() => setInvite({ kind: 'agent', agent_id: a.id, name: a.display_name, email: a.email ?? '' })}>הזמנה לפורטל</Btn>}
                  </div>
                  <div className="text-xs text-wizard-text-secondary">מטפל/ת ב: {a.creators.map((c) => c.name).join(', ') || 'אף יוצר עדיין'}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="יוצרים מיוצגים והקצאה לסוכן">
          {agency.creators.length === 0 ? <Empty title="אין יוצרים">משייכים יוצר לסוכנות מכרטיס היוצר או בייבוא מקובץ.</Empty> : (
            <ul className="divide-y divide-wizard-border">
              {agency.creators.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/campaigns/creators/${c.id}`} className="text-brand-primary hover:underline">{c.display_name}</Link>
                  <SelectInput aria-label={`סוכן עבור ${c.display_name}`} className="h-8 w-44 text-xs" value={assigned.get(c.id) ?? ''} disabled={busy}
                    onChange={async (e) => {
                      const prev = assigned.get(c.id)
                      if (prev) await run(() => api(`/api/campaigns/agents/${prev}/creators`, { body: { creator_id: c.id, active: false } }), { refresh: false })
                      if (e.target.value) await run(() => api(`/api/campaigns/agents/${e.target.value}/creators`, { body: { creator_id: c.id, active: true } }), { success: 'ההקצאה עודכנה' })
                      else await run(async () => null, { success: 'ההקצאה הוסרה' })
                    }}>
                    <option value="">ללא סוכן</option>
                    {agency.agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                  </SelectInput>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Dialog open={agentOpen} onClose={() => setAgentOpen(false)} title="סוכן חדש">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => api('/api/campaigns/agents', { body: { ...agentForm, talent_agency_id: agency.id } }), { success: 'הסוכן נוסף' })) {
            setAgentOpen(false); setAgentForm({ display_name: '', email: '' })
          }
        }}>
          <Field label="שם" htmlFor="ag-name"><TextInput id="ag-name" value={agentForm.display_name} onChange={(e) => setAgentForm({ ...agentForm, display_name: e.target.value })} /></Field>
          <Field label="דוא״ל" htmlFor="ag-email"><TextInput id="ag-email" type="email" dir="ltr" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} /></Field>
          <Btn type="submit" busy={busy} disabled={!agentForm.display_name.trim()}>הוספה</Btn>
        </form>
      </Dialog>

      {invite && <OrgInvite invite={invite} agencyId={agency.id} onClose={() => setInvite(null)} onLink={setLink} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="קישור הזמנה לפורטל">
        <Notice tone="good">הקישור נותן גישה לכל הקמפיינים הרלוונטיים, גם עתידיים. מוצג פעם אחת ולשימוש אחד; בהמשך אפשר לבקש קישור כניסה למייל.</Notice>
        <TextInput className="mt-3" readOnly dir="ltr" value={link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="קישור" />
        <div className="mt-3"><Btn onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('הועתק') }}>העתקה</Btn></div>
      </Dialog>
    </div>
  )
}

function OrgInvite({ invite, agencyId, onClose, onLink }: {
  invite: { kind: 'agency' | 'agent'; agent_id?: string; name: string; email: string }; agencyId: string; onClose: () => void; onLink: (l: string) => void
}) {
  const [name, setName] = React.useState(invite.name)
  const [email, setEmail] = React.useState(invite.email)
  const [send, setSend] = React.useState(false)
  const { busy, run } = useAction()
  return (
    <Dialog open onClose={onClose} title={invite.kind === 'agency' ? 'הזמנת הסוכנות לפורטל (כל הקמפיינים)' : 'הזמנת סוכן לפורטל (כל הקמפיינים)'}>
      <div className="space-y-3">
        <Field label="שם הנמען" htmlFor="oi-name"><TextInput id="oi-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="דוא״ל" htmlFor="oi-email" hint="לבקשת קישורי כניסה ולתזכורות"><TextInput id="oi-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={send} disabled={!email} onChange={(e) => setSend(e.target.checked)} /> לשלוח את ההזמנה בדוא״ל</label>
        <Btn busy={busy} disabled={!name.trim()} onClick={async () => {
          const r = await run(() => api<{ inviteUrl: string }>('/api/campaigns/grants', { body: {
            kind: invite.kind, talent_agency_id: invite.kind === 'agency' ? agencyId : undefined, agent_id: invite.agent_id,
            recipient_name: name, recipient_email: email || null, send_email: send,
          } }), { success: 'ההזמנה נוצרה' })
          if (r) { onClose(); onLink(r.inviteUrl) }
        }}>יצירת הזמנה</Btn>
      </div>
    </Dialog>
  )
}
