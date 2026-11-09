'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from './client-api'
import { Btn, Dialog, Field, Notice, Panel, StatusBadge, TextInput, useAction } from './ui'
import { formatDate } from '@/lib/campaigns/domain/time'

type Org = { id: string; name: string; slug: string; status: string; members: number; campaigns: number; created_at: string }

export function PlatformOrgs({ orgs }: { orgs: Org[] }) {
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const [f, setF] = React.useState({ name: '', admin_name: '', admin_email: '' })
  const { busy, run } = useAction()
  return (
    <>
      <Panel title={`${orgs.length} ארגונים`} actions={<Btn size="sm" onClick={() => setCreating(true)}>ארגון חדש</Btn>}>
        <p className="mb-2 text-sm text-wizard-text-secondary">כל ארגון רואה רק את הלקוחות, הקמפיינים והמשפיענים שלו. מכאן אפשר לפתוח ארגון ולהשהות אותו; אין כאן גישה לנתוני הקמפיינים.</p>
        <ul className="divide-y divide-wizard-border">
          {orgs.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div><div className="font-medium">{o.name}</div><div className="text-xs text-wizard-text-secondary">{o.members} חברים · {o.campaigns} קמפיינים · נפתח {formatDate(o.created_at)}</div></div>
              <div className="flex items-center gap-2">
                <StatusBadge status={o.status === 'active' ? 'active' : 'revoked'} label={o.status === 'active' ? 'פעיל' : 'מושהה'} />
                <Btn size="sm" tone={o.status === 'active' ? 'ghost' : 'secondary'} busy={busy} onClick={() => {
                  const to = o.status === 'active' ? 'suspended' : 'active'
                  if (to === 'suspended' && !window.confirm(`להשהות את ${o.name}? כל הכניסות לפורטל שלו ינותקו.`)) return
                  void run(() => api(`/api/campaigns/platform/orgs/${o.id}`, { method: 'PATCH', body: { status: to } }), { success: 'עודכן' })
                }}>{o.status === 'active' ? 'השהיה' : 'הפעלה'}</Btn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Dialog open={creating} onClose={() => setCreating(false)} title="ארגון חדש">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          const r = await run(() => api<{ inviteUrl: string }>('/api/campaigns/platform/orgs', { body: f }), { success: 'הארגון נוצר' })
          if (r) { setCreating(false); setLink(r.inviteUrl); setF({ name: '', admin_name: '', admin_email: '' }) }
        }}>
          <Field label="שם הארגון" htmlFor="po-name"><TextInput id="po-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="שם מנהל/ת הארגון" htmlFor="po-admin"><TextInput id="po-admin" value={f.admin_name} onChange={(e) => setF({ ...f, admin_name: e.target.value })} /></Field>
          <Field label="דוא״ל מנהל/ת הארגון" htmlFor="po-email"><TextInput id="po-email" type="email" dir="ltr" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} /></Field>
          <Btn type="submit" busy={busy} disabled={!f.name || !f.admin_name || !f.admin_email.includes('@')}>יצירה ושליחת הזמנה</Btn>
        </form>
      </Dialog>
      <Dialog open={!!link} onClose={() => setLink(null)} title="קישור הזמנה למנהל/ת הארגון">
        <Notice tone="good">נשלח גם במייל. מוצג פעם אחת, תקף ל-7 ימים.</Notice>
        <TextInput className="mt-3" readOnly dir="ltr" value={link ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="קישור" />
        <div className="mt-3"><Btn onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('הועתק') }}>העתקה</Btn></div>
      </Dialog>
    </>
  )
}
