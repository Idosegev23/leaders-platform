'use client'

import * as React from 'react'
import { api } from './client-api'

export function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; name: string }[] }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">ארגון פעיל</span>
      <select value={current} disabled={busy} className="h-8 rounded-lg border border-wizard-border bg-white px-2 text-xs font-semibold text-foreground"
        onChange={async (e) => {
          setBusy(true)
          await api('/api/campaigns/auth/org', { body: { organization_id: e.target.value } })
          window.location.href = '/campaigns'
        }}>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

export function SignOut({ dev }: { dev: boolean }) {
  return (
    <button type="button" className={dev ? 'rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900' : 'underline'}
      onClick={async () => { await api('/api/campaigns/auth/session', { method: 'DELETE' }); window.location.href = '/campaigns/login' }}>
      {dev ? 'יציאה / החלפת משתמש (פיתוח)' : 'יציאה'}
    </button>
  )
}
