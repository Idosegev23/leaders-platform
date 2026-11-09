'use client'

/**
 * Direct, private upload: ask the server for an upload slot (access-checked),
 * PUT the file straight to storage (no app-server streaming), then ask the
 * server to verify it. Only a verified file id is handed to the form, so a
 * failed upload can never be submitted. Failures can be retried.
 */
import * as React from 'react'
import { api, ApiError } from './client-api'
import { Btn } from './ui'

type Purpose = 'content' | 'evidence' | 'metric_evidence'

const ACCEPT: Record<Purpose, string> = {
  content: 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf',
  evidence: 'image/jpeg,image/png,image/webp,application/pdf',
  metric_evidence: 'image/jpeg,image/png,image/webp,application/pdf',
}

export function Uploader({
  apiBase, participationId, campaignId, purpose, onReady, label = 'בחירת קובץ',
}: {
  apiBase: '/api/campaigns' | '/api/portal'
  participationId?: string
  campaignId?: string
  purpose: Purpose
  onReady: (asset: { id: string; name: string; type: string } | null) => void
  label?: string
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [state, setState] = React.useState<'idle' | 'uploading' | 'verifying' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const inputId = React.useId()

  async function start(f: File) {
    setFile(f)
    setError(null)
    setState('uploading')
    setProgress(0)
    onReady(null)
    try {
      const intent = await api<{ asset_id: string; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }>(`${apiBase}/uploads`, {
        body: { participation_id: participationId, campaign_id: campaignId, purpose, filename: f.name, mime_type: f.type, size: f.size },
      })
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', intent.upload.url)
        Object.entries(intent.upload.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('network'))
        xhr.send(f)
      })
      setState('verifying')
      const done = await api<{ status: string; message?: string }>(`${apiBase}/uploads/${intent.asset_id}/complete`, { method: 'POST' })
      if (done.status !== 'ready') throw new ApiError(done.message ?? 'הקובץ עדיין לא אומת', 'PENDING', 409)
      setState('ready')
      onReady({ id: intent.asset_id, name: f.name, type: f.type })
    } catch (e) {
      setState('error')
      setError(e instanceof ApiError ? e.message : 'ההעלאה נכשלה. בדקו את החיבור ונסו שוב.')
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-[13px] font-semibold text-wizard-text-secondary">{label}</label>
      <input id={inputId} type="file" accept={ACCEPT[purpose]} disabled={state === 'uploading' || state === 'verifying'}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void start(f) }}
        className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-pearl file:px-3 file:py-2 file:text-sm file:font-medium" />
      {state === 'uploading' && (
        <div aria-live="polite" className="text-xs text-wizard-text-secondary">
          מעלה {file?.name}… {progress}%
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-brand-pearl"><div className="h-full bg-brand-primary" style={{ width: `${progress ?? 0}%` }} /></div>
        </div>
      )}
      {state === 'verifying' && <p aria-live="polite" className="text-xs text-wizard-text-secondary">בודק את הקובץ…</p>}
      {state === 'ready' && <p aria-live="polite" className="text-xs text-emerald-700">✓ {file?.name} הועלה ואומת</p>}
      {state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-700">
          {error}
          {file && <Btn size="sm" tone="secondary" onClick={() => void start(file)}>ניסיון חוזר</Btn>}
        </div>
      )}
    </div>
  )
}

/** Loads a short-lived signed URL only when asked, then previews or links it. */
export function AssetViewer({ apiBase, assetId, mime, name }: { apiBase: '/api/campaigns' | '/api/portal'; assetId: string; mime: string | null; name?: string | null }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [type, setType] = React.useState<string | null>(mime)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function load() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ url: string; mime_type: string }>(`${apiBase}/assets/${assetId}/url`)
      setUrl(r.url)
      setType(r.mime_type)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'לא ניתן לטעון את הקובץ')
    } finally {
      setBusy(false)
    }
  }
  if (!url) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" tone="secondary" busy={busy} onClick={() => void load()}>הצגת הקובץ{name ? ` (${name})` : ''}</Btn>
        {err && <span role="alert" className="text-xs text-rose-700">{err}</span>}
      </div>
    )
  }
  if (type?.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name ?? 'תוכן שהוגש'} referrerPolicy="no-referrer" className="max-h-[480px] w-auto max-w-full rounded-xl border border-wizard-border" />
  }
  if (type?.startsWith('video/')) {
    return <video src={url} controls preload="metadata" className="max-h-[480px] w-full rounded-xl border border-wizard-border bg-black" />
  }
  return (
    <p className="text-sm">
      אין תצוגה מקדימה לסוג קובץ זה. <a className="font-medium text-brand-primary underline" href={url} target="_blank" rel="noreferrer noopener">פתיחה/הורדה מאובטחת</a> (הקישור תקף ל-5 דקות).
    </p>
  )
}
