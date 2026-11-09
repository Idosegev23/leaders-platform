'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from './client-api'
import { Btn, Dialog, Field, Notice, Panel, SelectInput, StatusBadge, TextInput, useAction } from './ui'
import { formatDateTime } from '@/lib/campaigns/domain/time'

type Member = { account_id: string; full_name: string; email: string; role: 'admin' | 'manager' | 'staff'; status: string; last_login_at: string | null }
const ROLE_HE = { admin: 'מנהל/ת ארגון', manager: 'מנהלת קמפיין', staff: 'צוות' }

export function OrgSettings({ org, members, me }: { org: { name: string; slug: string; settings: Record<string, unknown> }; members: Member[]; me: string }) {
  const [name, setName] = React.useState(org.name)
  const [sender, setSender] = React.useState(String(org.settings.sender_name ?? ''))
  const [inviting, setInviting] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const { busy, run } = useAction()
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title={`חברי הארגון (${members.length})`} actions={<Btn size="sm" onClick={() => setInviting(true)}>הזמנת חבר/ה</Btn>}>
        <p className="mb-2 text-sm text-wizard-text-secondary">מנהל/ת ארגון: הכול, כולל הגדרות וחברים. מנהלת קמפיין: פותחת ומנהלת קמפיינים. צוות: צפייה ותפעול בקמפיינים שצורף/ה אליהם.</p>
        <ul className="divide-y divide-wizard-border">
          {members.map((m) => (
            <li key={m.account_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{m.full_name}</div>
                <div className="text-xs text-wizard-text-secondary" dir="ltr">{m.email}</div>
                <div className="text-xs text-wizard-text-secondary">כניסה אחרונה: {formatDateTime(m.last_login_at)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={m.status === 'active' ? 'active' : m.status === 'invited' ? 'invited' : 'revoked'} label={m.status === 'active' ? 'פעיל/ה' : m.status === 'invited' ? 'הוזמן/ה' : 'מושבת/ת'} />
                {m.account_id === me ? <span className="text-xs">{ROLE_HE[m.role]} (את/ה)</span> : (
                  <>
                    <SelectInput aria-label={`תפקיד עבור ${m.full_name}`} className="h-8 w-40 text-xs" value={m.role} disabled={busy}
                      onChange={(e) => void run(() => api(`/api/campaigns/members/${m.account_id}`, { method: 'PATCH', body: { role: e.target.value } }), { success: 'התפקיד עודכן' })}>
                      <option value="admin">{ROLE_HE.admin}</option><option value="manager">{ROLE_HE.manager}</option><option value="staff">{ROLE_HE.staff}</option>
                    </SelectInput>
                    {m.status === 'active' && <Btn size="sm" tone="ghost" busy={busy} onClick={() => { if (window.confirm(`להשבית את הגישה של ${m.full_name}?`)) void run(() => api(`/api/campaigns/members/${m.account_id}`, { method: 'PATCH', body: { status: 'disabled' } }), { success: 'הגישה הושבתה' }) }}>השבתה</Btn>}
                    {m.status === 'disabled' && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void run(() => api(`/api/campaigns/members/${m.account_id}`, { method: 'PATCH', body: { status: 'active' } }), { success: 'הגישה הוחזרה' })}>הפעלה</Btn>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="פרטי הארגון">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => api('/api/campaigns/organization', { method: 'PATCH', body: { name, sender_name: sender || null } }), { success: 'נשמר' }) }}>
          <Field label="שם הארגון" htmlFor="org-name"><TextInput id="org-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="שם השולח בהודעות" htmlFor="org-sender" hint="מוצג ללקוחות וליוצרים במיילים. ברירת מחדל: שם הארגון."><TextInput id="org-sender" value={sender} onChange={(e) => setSender(e.target.value)} /></Field>
          <p className="text-xs text-wizard-text-secondary">מזהה: <span dir="ltr">{org.slug}</span>{org.settings.hub_integration ? ' · מחובר ל-Hub של לידרס' : ''}</p>
          <Btn type="submit" busy={busy}>שמירה</Btn>
        </form>
      </Panel>
      {inviting && <InviteMember onClose={() => setInviting(false)} onLink={setLink} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="קישור הצטרפות">
        <Notice tone="good">נשלח גם במייל. הקישור מוצג פעם אחת, תקף ל-7 ימים ולשימוש אחד.</Notice>
        <TextInput className="mt-3" readOnly dir="ltr" value={link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="קישור הצטרפות" />
        <div className="mt-3 flex gap-2"><Btn onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('הועתק') }}>העתקה</Btn><Btn tone="secondary" onClick={() => setLink(null)}>סגירה</Btn></div>
      </Dialog>
    </div>
  )
}

function InviteMember({ onClose, onLink }: { onClose: () => void; onLink: (l: string) => void }) {
  const [f, setF] = React.useState({ full_name: '', email: '', role: 'staff' })
  const { busy, run } = useAction()
  return (
    <Dialog open onClose={onClose} title="הזמנת חבר/ה לארגון">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const r = await run(() => api<{ inviteUrl: string }>('/api/campaigns/members', { body: f }), { success: 'ההזמנה נשלחה' })
        if (r) { onClose(); onLink(r.inviteUrl) }
      }}>
        <Field label="שם" htmlFor="im-name"><TextInput id="im-name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="דוא״ל" htmlFor="im-email"><TextInput id="im-email" type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="תפקיד" htmlFor="im-role"><SelectInput id="im-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="staff">{ROLE_HE.staff}</option><option value="manager">{ROLE_HE.manager}</option><option value="admin">{ROLE_HE.admin}</option>
        </SelectInput></Field>
        <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.full_name.trim() || !f.email.includes('@')}>שליחת הזמנה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}
