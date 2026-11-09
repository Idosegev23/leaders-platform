'use client'

/** Version list with media, per-version decisions and comments. Shared by the internal and portal screens. */
import * as React from 'react'
import { api } from '../client-api'
import { AssetViewer } from '../uploader'
import { Btn, Field, SelectInput, StatusBadge, TextArea, TextInput, useAction } from '../ui'
import { formatDateTime } from '@/lib/campaigns/domain/time'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

export type Version = {
  id: string; version_number: number; asset_id: string | null; external_url: string | null; caption: string | null; creator_notes: string | null
  submitted_at: string; mime_type: string | null; original_filename: string | null
  decisions: { stage: 'internal' | 'client'; decision: string; feedback: string | null; actor: string; at: string }[]
  comments: { id: string; body: string; ts: number | null; visibility: string; at: string; author: string | null }[]
}

const fmtTs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VersionList({ versions, currentId, apiBase, deliverableId, canComment, allowInternalComments }: {
  versions: Version[]; currentId: string | null; apiBase: '/api/campaigns' | '/api/portal'; deliverableId: string; canComment: boolean; allowInternalComments: boolean
}) {
  if (versions.length === 0) return <p className="text-sm text-wizard-text-secondary">עדיין לא הוגשה גרסה.</p>
  return (
    <ol className="space-y-4">
      {versions.map((v) => (
        <li key={v.id} className={`rounded-xl border p-3 ${v.id === currentId ? 'border-brand-primary/40 bg-white' : 'border-wizard-border bg-brand-pearl/30'}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-bold">גרסה {v.version_number}</h3>
            {v.id === currentId ? <StatusBadge status="active" label="הגרסה הנוכחית" /> : <StatusBadge status="withdrawn" label="הוחלפה" />}
            <span className="text-xs text-wizard-text-secondary">הוגשה {formatDateTime(v.submitted_at)}</span>
          </div>
          {v.asset_id && <AssetViewer apiBase={apiBase} assetId={v.asset_id} mime={v.mime_type} name={v.original_filename} />}
          {v.external_url && <p className="text-sm">קישור לתוכן: <a className="text-brand-primary underline" href={v.external_url} target="_blank" rel="noreferrer noopener">פתיחה</a></p>}
          {v.caption && <div className="mt-2 rounded-lg bg-brand-pearl/50 p-2 text-sm"><div className="text-xs text-wizard-text-secondary">כיתוב</div><p className="whitespace-pre-wrap">{v.caption}</p></div>}
          {v.creator_notes && <p className="mt-1 text-xs">הערת היוצר: {v.creator_notes}</p>}
          {v.decisions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {v.decisions.map((d, i) => (
                <li key={i} className="text-xs">
                  <StatusBadge status={d.decision} label={`${d.stage === 'internal' ? 'אישור פנימי' : 'אישור לקוח'}: ${heStatus(d.decision)}`} /> {d.actor} · {formatDateTime(d.at)}
                  {d.feedback && <div className="mt-0.5 whitespace-pre-wrap rounded bg-amber-50 p-1.5 text-amber-950">{d.feedback}</div>}
                </li>
              ))}
            </ul>
          )}
          <Comments v={v} apiBase={apiBase} deliverableId={deliverableId} canComment={canComment} allowInternal={allowInternalComments} />
        </li>
      ))}
    </ol>
  )
}

function Comments({ v, apiBase, deliverableId, canComment, allowInternal }: { v: Version; apiBase: string; deliverableId: string; canComment: boolean; allowInternal: boolean }) {
  const [body, setBody] = React.useState('')
  const [ts, setTs] = React.useState('')
  const [vis, setVis] = React.useState<'shared' | 'internal'>('shared')
  const { busy, run } = useAction()
  const isVideo = v.mime_type?.startsWith('video/')
  const id = `c-${v.id}`
  return (
    <div className="mt-3 border-t border-wizard-border pt-2">
      <h4 className="text-xs font-bold text-wizard-text-secondary">הערות על גרסה {v.version_number}</h4>
      <ul className="mt-1 space-y-1">
        {v.comments.length === 0 && <li className="text-xs text-wizard-text-secondary">אין הערות</li>}
        {v.comments.map((c) => (
          <li key={c.id} className="text-sm">
            {c.ts !== null && <span className="me-1 rounded bg-slate-100 px-1 font-mono text-xs" dir="ltr">{fmtTs(Number(c.ts))}</span>}
            {c.body}
            <span className="text-xs text-wizard-text-secondary"> — {c.author ?? ''}, {formatDateTime(c.at)}{c.visibility === 'internal' ? ' · פנימי' : ''}</span>
          </li>
        ))}
      </ul>
      {canComment && (
        <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={async (e) => {
          e.preventDefault()
          const tsNum = ts.trim() ? (ts.includes(':') ? ts.split(':').reduce((a, x) => a * 60 + Number(x), 0) : Number(ts)) : null
          if (await run(() => api(`${apiBase}/deliverables/${deliverableId}/comments`, { body: { version_id: v.id, body, video_timestamp_seconds: tsNum, visibility: vis } }), { success: 'ההערה נשמרה' })) { setBody(''); setTs('') }
        }}>
          <Field label="הערה חדשה" htmlFor={id}><TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[60px]" /></Field>
          <div className="flex flex-wrap items-end gap-2">
            {isVideo && <Field label="זמן בסרטון (דק:שנ)" htmlFor={`${id}-ts`}><TextInput id={`${id}-ts`} dir="ltr" className="w-24" value={ts} onChange={(e) => setTs(e.target.value)} placeholder="0:42" /></Field>}
            {allowInternal && <Field label="נראות" htmlFor={`${id}-vis`}><SelectInput id={`${id}-vis`} value={vis} onChange={(e) => setVis(e.target.value as 'shared' | 'internal')}><option value="shared">גלויה ליוצר וללקוח</option><option value="internal">פנימית בלבד</option></SelectInput></Field>}
            <Btn type="submit" size="sm" busy={busy} disabled={!body.trim()}>שמירה</Btn>
          </div>
        </form>
      )}
    </div>
  )
}
