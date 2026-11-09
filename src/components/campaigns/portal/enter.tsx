'use client'

/**
 * The token arrives in the URL fragment (#t=…), which browsers never send to
 * servers or put in Referer headers. It is read once, removed from the address
 * bar, and exchanged on an explicit click (so automated link scanners cannot
 * burn a single-use link). It is never written to storage.
 */
import * as React from 'react'
import Link from 'next/link'
import { api, ApiError } from '../client-api'
import { Btn, Notice } from '../ui'

export function EnterPortal() {
  const token = React.useRef<string | null>(null)
  const next = React.useRef<string>('/portal')
  const [ready, setReady] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Read once: effects can run twice (React strict mode), and the first run
    // already removed the fragment from the address bar.
    if (!token.current) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      token.current = params.get('t')
      const n = params.get('next')
      if (n && n.startsWith('/portal')) next.current = n
      window.history.replaceState(null, '', window.location.pathname)
    }
    setReady(true)
  }, [])

  async function enter() {
    if (!token.current) return
    setBusy(true)
    setError(null)
    try {
      await api('/api/portal/session', { body: { token: token.current } })
      token.current = null
      window.location.replace(next.current)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'הכניסה נכשלה')
      setBusy(false)
    }
  }

  if (!ready) return <p>טוען…</p>
  return (
    <div className="space-y-4 rounded-2xl border border-wizard-border bg-white p-5">
      <h1 className="text-xl font-bold">כניסה לפורטל הקמפיין</h1>
      {!token.current && !error ? (
        <Notice tone="warn">הקישור חסר או לא שלם. בקשו קישור כניסה חדש.</Notice>
      ) : (
        <>
          <p className="text-sm">הקישור אישי ומיועד לשימוש אחד. לאחר הכניסה תישארו מחוברים במכשיר זה עד 7 ימים.</p>
          <Btn busy={busy} onClick={() => void enter()} disabled={!token.current}>כניסה</Btn>
        </>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <p className="text-sm"><Link className="text-brand-primary underline" href="/portal/login">בקשת קישור כניסה חדש לדוא״ל</Link></p>
      <p className="text-xs text-wizard-text-secondary">הפעולות בפורטל מיוחסות למי שקיבל את קישור ההזמנה. זו אינה חתימה משפטית.</p>
    </div>
  )
}
