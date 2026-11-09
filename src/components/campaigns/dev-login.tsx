'use client'

/** Local development only (see devAuthEnabled). Never rendered in production. */
import * as React from 'react'
import { api } from './client-api'
import { Btn, Notice } from './ui'

export function DevLogin() {
  const [users, setUsers] = React.useState<{ id: string; full_name: string; email: string; role: string }[] | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  React.useEffect(() => {
    api<{ users: typeof users }>('/api/campaigns/dev-login').then((r) => setUsers(r.users)).catch((e) => setErr(e.message))
  }, [])
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-bold">כניסת פיתוח מקומית</h1>
      <Notice tone="warn">מצב פיתוח בלבד: בחירת משתמש מתוך נתוני ההדגמה המקומיים. בסביבת ייצור הכניסה היא דרך Google בלבד.</Notice>
      {err && <Notice tone="bad">{err}</Notice>}
      {!users && !err && <p>טוען…</p>}
      {users?.length === 0 && <Notice>אין משתמשים. הריצו npm run campaigns:seed.</Notice>}
      <ul className="space-y-2">
        {users?.map((u) => (
          <li key={u.id}>
            <Btn tone="secondary" className="w-full justify-between" onClick={async () => {
              await api('/api/campaigns/dev-login', { body: { user_id: u.id } })
              window.location.href = '/campaigns'
            }}>
              <span>{u.full_name}</span><span className="text-xs text-wizard-text-secondary">{u.role}</span>
            </Btn>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DevSwitchUser() {
  return (
    <button type="button" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900"
      onClick={async () => { await api('/api/campaigns/dev-login', { method: 'DELETE' }); window.location.reload() }}>
      החלפת משתמש (פיתוח)
    </button>
  )
}
