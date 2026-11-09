'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from '../client-api'
import { Btn, Dialog, Empty, Field, Notice, Panel, SelectInput, StatusBadge, TextInput, useAction } from '../ui'
import { formatDateTime } from '@/lib/campaigns/domain/time'
import type { ParticipationRow } from './creators-tab'

type Grant = { id: string; kind: 'client' | 'creator' | 'agent' | 'agency'; campaign_id: string | null; recipient_name: string; recipient_email: string | null; status: string; expires_at: string; last_entered_at: string | null; created_at: string; creator_name: string | null; agent_name: string | null; agency_name: string | null; sessions: number }
const KIND_HE = { client: 'נציג/ת לקוח', creator: 'יוצר/ת', agent: 'סוכן/ת', agency: 'סוכנות' }

export function AccessTab({ campaignId, grants, members, staff, participations }: {
  campaignId: string; grants: Grant[]; members: { user_id: string; full_name: string; role: string }[]; staff: { id: string; full_name: string; role: string }[]; participations: ParticipationRow[]
}) {
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const { busy, run } = useAction()
  const [member, setMember] = React.useState({ user_id: '', role: 'staff' })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="הזמנות לפורטל" actions={<Btn size="sm" onClick={() => setCreating(true)}>הזמנה חדשה</Btn>}>
        <Notice>כל הזמנה מוגבלת לקמפיין זה ולתפקיד אחד. הקישור לשימוש אחד; כניסה מאוחרת יותר נעשית בבקשת קישור חדש לדוא״ל. פעולות בפורטל מיוחסות למחזיק הקישור ואינן אימות זהות חזק.</Notice>
        {grants.length === 0 ? <div className="mt-3"><Empty title="אין הזמנות" /></div> : (
          <ul className="mt-3 divide-y divide-wizard-border">
            {grants.map((g) => (
              <li key={g.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{g.recipient_name}</strong> · {KIND_HE[g.kind]}{g.creator_name ? ` (${g.creator_name})` : ''}{g.agent_name ? ` (${g.agent_name})` : ''}{g.agency_name ? ` (${g.agency_name})` : ''}{!g.campaign_id ? ' · כל הקמפיינים' : ''}</span>
                  <StatusBadge status={g.status === 'revoked' ? 'revoked' : new Date(g.expires_at) < new Date() ? 'cancelled' : 'active'} label={g.status === 'revoked' ? 'בוטלה' : new Date(g.expires_at) < new Date() ? 'פג תוקף' : 'פעילה'} />
                </div>
                <div className="text-xs text-wizard-text-secondary">
                  {g.recipient_email && <span dir="ltr">{g.recipient_email} · </span>}תוקף עד {formatDateTime(g.expires_at)} · כניסה אחרונה {formatDateTime(g.last_entered_at)} · {g.sessions} כניסות
                </div>
                {g.status === 'active' && (
                  <div className="mt-1 flex gap-2">
                    <Btn size="sm" tone="secondary" busy={busy} onClick={async () => { const r = await run(() => api<{ inviteUrl: string }>(`/api/campaigns/grants/${g.id}/reissue`, { method: 'POST' }), { success: 'הונפק קישור חדש' }); if (r) setLink(r.inviteUrl) }}>קישור חדש</Btn>
                    <Btn size="sm" tone="danger" busy={busy} onClick={() => { if (window.confirm('לבטל את ההזמנה ולנתק כניסות פעילות?')) void run(() => api(`/api/campaigns/grants/${g.id}/revoke`, { method: 'POST' }), { success: 'ההזמנה בוטלה' }) }}>ביטול גישה</Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="צוות הקמפיין">
        <ul className="space-y-1 text-sm">
          {members.length === 0 && <li className="text-wizard-text-secondary">רק האחראית ומנהלי המערכת.</li>}
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2">
              <span>{m.full_name} · {m.role === 'manager' ? 'מנהלת' : 'צוות'}</span>
              <Btn size="sm" tone="ghost" busy={busy} onClick={() => void run(() => api(`/api/campaigns/${campaignId}/members`, { body: { user_id: m.user_id, role: null } }), { success: 'הוסר' })}>הסרה</Btn>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <Field label="הוספת משתמש" htmlFor="mem-user"><SelectInput id="mem-user" value={member.user_id} onChange={(e) => setMember({ ...member, user_id: e.target.value })}><option value="">בחירה…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</SelectInput></Field>
          <Field label="תפקיד" htmlFor="mem-role"><SelectInput id="mem-role" value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })}><option value="staff">צוות</option><option value="manager">מנהלת</option></SelectInput></Field>
          <Btn busy={busy} disabled={!member.user_id} onClick={() => void run(() => api(`/api/campaigns/${campaignId}/members`, { body: member }), { success: 'נוסף לצוות' })}>הוספה</Btn>
        </div>
      </Panel>

      {creating && <CreateGrant campaignId={campaignId} participations={participations} onClose={() => setCreating(false)} onLink={setLink} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="קישור הזמנה">
        <Notice tone="good">הקישור מוצג פעם אחת בלבד ואינו נשמר במערכת. תקף לשימוש אחד במשך 14 יום.</Notice>
        <TextInput className="mt-3" readOnly dir="ltr" value={link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="קישור הזמנה" />
        <div className="mt-3 flex gap-2"><Btn onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('הועתק') }}>העתקה</Btn><Btn tone="secondary" onClick={() => setLink(null)}>סגירה</Btn></div>
      </Dialog>
    </div>
  )
}

function CreateGrant({ campaignId, participations, onClose, onLink }: { campaignId: string; participations: ParticipationRow[]; onClose: () => void; onLink: (l: string) => void }) {
  const [f, setF] = React.useState({ kind: 'client', creator_id: '', agent_id: '', talent_agency_id: '', recipient_name: '', recipient_email: '', send_email: false, all_campaigns: false })
  const { busy, run } = useAction()
  const agents = Array.from(new Map(participations.filter((p) => p.agent_id).map((p) => [p.agent_id!, p.agent_name ?? ''])).entries())
  const agencies = Array.from(new Map(participations.filter((p) => p.talent_agency_id).map((p) => [p.talent_agency_id!, p.agency_name ?? ''])).entries())
  return (
    <Dialog open onClose={onClose} title="הזמנה חדשה לפורטל">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const r = await run(() => api<{ inviteUrl: string }>(`/api/campaigns/${campaignId}/grants`, { body: {
          kind: f.kind, creator_id: f.kind === 'creator' ? f.creator_id : undefined, agent_id: f.kind === 'agent' ? f.agent_id : undefined,
          talent_agency_id: f.kind === 'agency' ? f.talent_agency_id : undefined, all_campaigns: f.all_campaigns,
          recipient_name: f.recipient_name, recipient_email: f.recipient_email || null, send_email: f.send_email,
        } }), { success: 'ההזמנה נוצרה' })
        if (r) { onClose(); onLink(r.inviteUrl) }
      }}>
        <Field label="סוג" htmlFor="g-kind"><SelectInput id="g-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="client">נציג/ת לקוח</option><option value="creator">יוצר/ת</option><option value="agent">סוכן/ת</option><option value="agency">סוכנות</option></SelectInput></Field>
        {f.kind === 'creator' && <Field label="יוצר/ת" htmlFor="g-cr"><SelectInput id="g-cr" value={f.creator_id} onChange={(e) => setF({ ...f, creator_id: e.target.value })}><option value="">בחירה…</option>{participations.map((p) => <option key={p.creator_id} value={p.creator_id}>{p.creator_name}</option>)}</SelectInput></Field>}
        {f.kind === 'agency' && <Field label="סוכנות" htmlFor="g-agency"><SelectInput id="g-agency" value={f.talent_agency_id} onChange={(e) => setF({ ...f, talent_agency_id: e.target.value })}><option value="">בחירה…</option>{agencies.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</SelectInput></Field>}
        {f.kind === 'agent' && <Field label="סוכן/ת" htmlFor="g-ag"><SelectInput id="g-ag" value={f.agent_id} onChange={(e) => setF({ ...f, agent_id: e.target.value })}><option value="">בחירה…</option>{agents.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</SelectInput></Field>}
        <Field label="שם הנמען" htmlFor="g-name"><TextInput id="g-name" value={f.recipient_name} onChange={(e) => setF({ ...f, recipient_name: e.target.value })} /></Field>
        <Field label="דוא״ל" htmlFor="g-email"><TextInput id="g-email" type="email" dir="ltr" value={f.recipient_email} onChange={(e) => setF({ ...f, recipient_email: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.send_email} disabled={!f.recipient_email} onChange={(e) => setF({ ...f, send_email: e.target.checked })} /> לשלוח את ההזמנה בדוא״ל</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.all_campaigns} onChange={(e) => setF({ ...f, all_campaigns: e.target.checked })} /> גישה לכל הקמפיינים (גם עתידיים), לא רק לקמפיין זה</label>
        {f.kind === 'client' && <Notice>נציג הלקוח יראה רק את הקמפיין הזה: מועמדים ותכנים שאושרו פנימית, סטטוס כללי ודוחות שפורסמו. לא שכר, תקציב או הערות פנימיות.</Notice>}
        <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.recipient_name.trim() || (f.kind === 'creator' && !f.creator_id) || (f.kind === 'agent' && !f.agent_id) || (f.kind === 'agency' && !f.talent_agency_id)}>יצירה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}
