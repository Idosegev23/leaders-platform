'use client'

import * as React from 'react'
import { api, ApiError } from '../client-api'
import { Btn, Field, Notice, TextInput } from '../ui'

export function RequestLoginLink() {
  const [email, setEmail] = React.useState('')
  const [msg, setMsg] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <form className="space-y-4 rounded-2xl border border-wizard-border bg-white p-5" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true); setErr(null)
      try {
        const r = await api<{ message: string }>('/api/portal/login-link', { body: { email } })
        setMsg(r.message)
      } catch (e2) {
        setErr(e2 instanceof ApiError ? e2.message : 'הבקשה נכשלה')
      } finally {
        setBusy(false)
      }
    }}>
      <h1 className="text-xl font-bold">קישור כניסה חדש</h1>
      <p className="text-sm">הזינו את כתובת הדוא״ל שאליה נשלחה ההזמנה. אם יש לה הזמנה פעילה, יישלח אליה קישור כניסה חד־פעמי.</p>
      <Field label="דוא״ל" htmlFor="ll-email"><TextInput id="ll-email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Btn type="submit" busy={busy} disabled={!email.includes('@')}>שליחת קישור</Btn>
      {msg && <Notice tone="good">{msg}</Notice>}
      {err && <Notice tone="bad">{err}</Notice>}
    </form>
  )
}
