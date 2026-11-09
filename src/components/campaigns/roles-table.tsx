'use client'

import * as React from 'react'
import { api } from './client-api'
import { SelectInput, useAction } from './ui'

export function RolesTable({ users, me }: { users: { id: string; full_name: string; email: string; hub_role: string; cm_role: string | null; is_active: boolean }[]; me: string }) {
  const { busy, run } = useAction()
  const [q, setQ] = React.useState('')
  const shown = users.filter((u) => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-2">
      <label className="block max-w-sm"><span className="sr-only">חיפוש משתמש</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש משתמש…" className="h-10 w-full rounded-xl border border-wizard-border px-3 text-sm" /></label>
      <div className="overflow-x-auto rounded-2xl border border-wizard-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-pearl/60 text-right text-xs text-wizard-text-secondary"><tr><th scope="col" className="p-2">משתמש</th><th scope="col" className="p-2">תפקיד במודול</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className="border-t border-wizard-border">
                <td className="p-2">{u.full_name}<div className="text-xs text-wizard-text-secondary" dir="ltr">{u.email}</div></td>
                <td className="p-2">
                  {u.hub_role === 'admin' ? <span className="text-xs">מנהל/ת מערכת ב-Hub (גישה מלאה)</span> : (
                    <SelectInput aria-label={`תפקיד עבור ${u.full_name}`} disabled={busy || u.id === me} value={u.cm_role ?? ''}
                      onChange={(e) => void run(() => api('/api/campaigns/roles', { body: { user_id: u.id, role: e.target.value || null } }), { success: 'ההרשאה עודכנה' })}>
                      <option value="">ללא גישה</option><option value="staff">צוות</option><option value="manager">מנהלת קמפיין</option><option value="admin">מנהל/ת מערכת</option>
                    </SelectInput>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
