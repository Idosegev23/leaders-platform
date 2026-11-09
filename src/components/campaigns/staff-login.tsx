'use client'

/**
 * Staff sign-in for Brieflow (any agency): emailed single-use link; Leaders
 * staff may use their Hub Google login; local development lists seeded
 * accounts. The link token arrives in the URL fragment and is exchanged by an
 * explicit POST, as in the portal.
 */
import * as React from 'react'
import Link from 'next/link'
import { api, ApiError } from './client-api'
import { Btn, Field, Notice, TextInput } from './ui'
import { PRODUCT } from '@/lib/campaigns/brand'

function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <div className="text-center">
        <div className="text-2xl font-bold text-brand-primary">{PRODUCT.name}</div>
        <div className="text-xs text-wizard-text-secondary">{PRODUCT.byline}</div>
      </div>
      <div className="space-y-4 rounded-2xl border border-wizard-border bg-white p-5">
        <h1 className="text-lg font-bold">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function StaffLogin({ dev, hub, signup, signedInWithoutOrg }: { dev: boolean; hub: boolean; signup: boolean; signedInWithoutOrg: string | null }) {
  const [email, setEmail] = React.useState('')
  const [msg, setMsg] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <Shell title="כניסה לצוות">
      {signedInWithoutOrg && <Notice tone="warn">החשבון {signedInWithoutOrg} מחובר, אך אינו חבר פעיל באף ארגון. פתחו את קישור ההזמנה שקיבלתם או פנו למנהל הארגון.</Notice>}
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true); setErr(null)
        try {
          const r = await api<{ message: string }>('/api/campaigns/auth/login-link', { body: { email } })
          setMsg(r.message)
        } catch (e2) {
          setErr(e2 instanceof ApiError ? e2.message : 'הבקשה נכשלה')
        } finally { setBusy(false) }
      }}>
        <Field label="דוא״ל" htmlFor="sl-email"><TextInput id="sl-email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Btn type="submit" busy={busy} disabled={!email.includes('@')} className="w-full">שליחת קישור כניסה</Btn>
        {msg && <Notice tone="good">{msg}</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
      </form>
      {hub && (
        <div className="border-t border-wizard-border pt-3 text-center text-sm">
          צוות לידרס? <a className="font-medium text-brand-primary underline" href="/login?redirect=/campaigns">כניסה עם Google</a>
        </div>
      )}
      {signup && <p className="text-center text-sm">סוכנות חדשה? <Link className="font-medium text-brand-primary underline" href="/campaigns/signup">פתיחת חשבון</Link></p>}
      {dev && <DevAccounts />}
    </Shell>
  )
}

function DevAccounts() {
  const [users, setUsers] = React.useState<{ id: string; full_name: string; email: string; orgs: string }[] | null>(null)
  React.useEffect(() => { api<{ users: typeof users }>('/api/campaigns/dev-login').then((r) => setUsers(r.users)).catch(() => setUsers([])) }, [])
  return (
    <div className="space-y-2 border-t border-dashed border-amber-300 pt-3">
      <Notice tone="warn">פיתוח מקומי בלבד: כניסה בלחיצה כמשתמש מנתוני ההדגמה. לא קיים בסביבת ייצור.</Notice>
      {users?.length === 0 && <p className="text-sm">אין משתמשים. הריצו npm run campaigns:seed.</p>}
      <ul className="space-y-1">
        {users?.map((u) => (
          <li key={u.id}>
            <button type="button" className="w-full rounded-xl border border-wizard-border px-3 py-2 text-right text-sm hover:bg-brand-pearl"
              onClick={async () => { await api('/api/campaigns/dev-login', { body: { user_id: u.id } }); window.location.href = '/campaigns' }}>
              <span className="font-medium">{u.full_name}</span>
              <span className="block text-xs text-wizard-text-secondary">{u.orgs}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StaffEnter() {
  const token = React.useRef<string | null>(null)
  const [ready, setReady] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    // Read once (effects may run twice); remove the token from the address bar.
    if (!token.current) {
      token.current = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t')
      window.history.replaceState(null, '', window.location.pathname)
    }
    setReady(true)
  }, [])
  if (!ready) return <Shell title="כניסה">טוען…</Shell>
  return (
    <Shell title="כניסה לצוות">
      {!token.current && !error ? <Notice tone="warn">הקישור חסר או לא שלם.</Notice> : (
        <>
          <p className="text-sm">הקישור אישי ומיועד לשימוש אחד.</p>
          <Btn className="w-full" busy={busy} disabled={!token.current} onClick={async () => {
            setBusy(true); setError(null)
            try {
              await api('/api/campaigns/auth/session', { body: { token: token.current } })
              token.current = null
              window.location.replace('/campaigns')
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'הכניסה נכשלה'); setBusy(false)
            }
          }}>כניסה</Btn>
        </>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <p className="text-sm"><Link className="text-brand-primary underline" href="/campaigns/login">בקשת קישור כניסה חדש</Link></p>
    </Shell>
  )
}

export function SignupForm() {
  const [f, setF] = React.useState({ name: '', admin_name: '', admin_email: '' })
  const [msg, setMsg] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <Shell title="פתיחת חשבון לסוכנות">
      {msg ? <Notice tone="good">{msg}</Notice> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null)
          try { setMsg((await api<{ message: string }>('/api/campaigns/auth/signup', { body: f })).message) }
          catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'הפתיחה נכשלה') } finally { setBusy(false) }
        }}>
          <Field label="שם הסוכנות" htmlFor="su-org"><TextInput id="su-org" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="השם שלך" htmlFor="su-name"><TextInput id="su-name" value={f.admin_name} onChange={(e) => setF({ ...f, admin_name: e.target.value })} required /></Field>
          <Field label="דוא״ל" htmlFor="su-email"><TextInput id="su-email" type="email" dir="ltr" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} required /></Field>
          <Btn type="submit" busy={busy} className="w-full" disabled={!f.name || !f.admin_name || !f.admin_email.includes('@')}>פתיחת חשבון</Btn>
          {err && <Notice tone="bad">{err}</Notice>}
          <p className="text-xs text-wizard-text-secondary">נשלח קישור לאישור הדוא״ל. החשבון ייפתח רק אחרי האישור.</p>
        </form>
      )}
    </Shell>
  )
}
