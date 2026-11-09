'use client'

import * as React from 'react'
import { api } from '../client-api'
import { Uploader } from '../uploader'
import { Btn, Dialog, Field, Notice, Panel, StatusBadge, TextArea, TextInput, useAction } from '../ui'
import { VersionList, type Version } from '../deliverable/versions'
import { MetricsForm, MetricsTable } from '../deliverable/metrics'
import { formatDateTime, toJerusalemInput } from '@/lib/campaigns/domain/time'

type Data = {
  deliverable: {
    id: string; participation_id: string; title: string; type: string; platform: string; description: string | null; status: string
    submission_due_at: string | null; publication_due_at: string | null; required_tags: string[]; required_mentions: string[]; required_links: string[]
    current_version_id: string | null; campaign_name: string; creator_name: string; participation_status: string
  }
  versions: Version[]
  publication: null | { published_url: string; reported_published_at: string; verification_status: string; verification_notes: string | null }
  metrics: { id: string; metric_name: string; metric_value: string; source_type: string; captured_at: string; measurement_period: string; evidence_asset_id: string | null }[]
}

const CREATOR_STAGE: Record<string, string> = {
  awaiting_submission: 'מחכים לתוכן ממך', changes_requested: 'התקבלו הערות. מחכים לגרסה מתוקנת', submitted: 'התוכן הוגש ונבדק בצוות',
  internal_review: 'התוכן בבדיקת הצוות', client_review: 'התוכן אושר בצוות ומחכה לאישור הלקוח', approved: 'התוכן אושר! אפשר לפרסם ולדווח קישור',
  publication_reported: 'הפרסום דווח ומחכה לאימות', publication_verified: 'הפרסום אומת. תודה!', cancelled: 'התוצר בוטל',
}

export function PortalDeliverable({ data, role }: { data: Data; role: 'client' | 'creator' | 'agent' }) {
  const d = data.deliverable
  const current = data.versions.find((v) => v.id === d.current_version_id) ?? null
  const isClient = role === 'client'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{d.title}</h1>
        <p className="text-sm text-wizard-text-secondary">{d.creator_name} · {d.platform} · {d.type} · {d.campaign_name}</p>
        <div className="mt-2"><StatusBadge status={d.status} /></div>
      </div>
      {!isClient && <Notice>{CREATOR_STAGE[d.status]}</Notice>}

      {isClient && d.status === 'client_review' && current && <ClientDecision deliverableId={d.id} version={current} />}
      {isClient && d.status !== 'client_review' && <Notice>{d.status === 'changes_requested' ? 'ביקשת תיקונים. הגרסה המתוקנת תוצג כאן אחרי בדיקת הצוות.' : d.status === 'submitted' || d.status === 'internal_review' ? 'הוגשה גרסה חדשה והיא בבדיקת הצוות. תוצג כאן כשתהיה מוכנה לאישורך.' : 'אין החלטה ממתינה לתוכן זה.'}</Notice>}

      <Panel title="בריף ודרישות">
        <p className="whitespace-pre-wrap text-sm">{d.description || 'אין פירוט'}</p>
        <ul className="mt-2 space-y-0.5 text-xs">
          {d.required_tags.length > 0 && <li>תגיות: {d.required_tags.join(' ')}</li>}
          {d.required_mentions.length > 0 && <li>תיוגים: {d.required_mentions.join(' ')}</li>}
          {d.required_links.length > 0 && <li dir="ltr">{d.required_links.join(' ')}</li>}
          <li>הגשה עד: {formatDateTime(d.submission_due_at)} · פרסום: {formatDateTime(d.publication_due_at)} (שעון ישראל)</li>
        </ul>
      </Panel>

      {!isClient && ['awaiting_submission', 'changes_requested', 'submitted', 'internal_review', 'client_review', 'approved'].includes(d.status) && ['accepted', 'active'].includes(d.participation_status) && (
        <SubmitVersion d={d} current={current} />
      )}

      <Panel title={isClient ? 'התוכן לאישור' : 'הגרסאות שלך והערות'}>
        <VersionList versions={data.versions} currentId={d.current_version_id} apiBase="/api/portal" deliverableId={d.id} canComment allowInternalComments={false} />
      </Panel>

      {!isClient && (
        <Panel title="פרסום">
          {data.publication ? (
            <div className="space-y-1 text-sm">
              <a className="text-brand-primary underline" href={data.publication.published_url} target="_blank" rel="noreferrer noopener">הקישור שדווח</a>
              <div><StatusBadge status={data.publication.verification_status} /> · דווח כפורסם ב-{formatDateTime(data.publication.reported_published_at)}</div>
              {data.publication.verification_status === 'rejected' && data.publication.verification_notes && <Notice tone="warn">הדיווח הוחזר: {data.publication.verification_notes}</Notice>}
            </div>
          ) : <p className="text-sm text-wizard-text-secondary">{d.status === 'approved' ? 'לאחר הפרסום, דווחו כאן את הקישור.' : 'הדיווח יתאפשר אחרי אישור הלקוח.'}</p>}
          {['approved', 'publication_reported'].includes(d.status) && <ReportPublication d={d} />}
        </Panel>
      )}

      {!isClient && data.publication && data.publication.verification_status !== 'rejected' && (
        <Panel title="נתוני ביצועים">
          <MetricsTable metrics={data.metrics} apiBase="/api/portal" />
          <div className="mt-3"><MetricsForm apiBase="/api/portal" deliverableId={d.id} participationId={d.participation_id} /></div>
        </Panel>
      )}
    </div>
  )
}

function ClientDecision({ deliverableId, version }: { deliverableId: string; version: Version }) {
  const [changes, setChanges] = React.useState(false)
  const [fb, setFb] = React.useState('')
  const { busy, run } = useAction()
  const decide = (decision: string, feedback: string | null) =>
    run(() => api(`/api/portal/deliverables/${deliverableId}/decision`, { body: { version_id: version.id, decision, feedback } }), { success: decision === 'approved' ? 'התוכן אושר' : 'הבקשה נשלחה' })
  return (
    <div className="sticky top-2 z-10 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <p className="font-semibold">גרסה {version.version_number} ממתינה לאישורך</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn tone="good" busy={busy} onClick={() => void decide('approved', null)}>אישור התוכן</Btn>
        <Btn tone="secondary" onClick={() => setChanges(true)}>בקשת תיקון</Btn>
      </div>
      <Dialog open={changes} onClose={() => setChanges(false)} title="בקשת תיקון">
        <Field label="מה לתקן (חובה)" htmlFor="cd-fb"><TextArea id="cd-fb" value={fb} onChange={(e) => setFb(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Btn busy={busy} disabled={fb.trim().length < 2} onClick={async () => { if (await decide('changes_requested', fb.trim())) setChanges(false) }}>שליחה</Btn><Btn tone="secondary" onClick={() => setChanges(false)}>ביטול</Btn></div>
      </Dialog>
    </div>
  )
}

function SubmitVersion({ d, current }: { d: Data['deliverable']; current: Version | null }) {
  const [asset, setAsset] = React.useState<{ id: string; name: string } | null>(null)
  const [url, setUrl] = React.useState('')
  const [caption, setCaption] = React.useState(current?.caption ?? '')
  const [notes, setNotes] = React.useState('')
  const [key, setKey] = React.useState(0)
  const { busy, run } = useAction()
  const replacing = !!current && d.status !== 'changes_requested'
  return (
    <Panel title={current ? 'הגשת גרסה חדשה' : 'הגשת תוכן'}>
      {replacing && <Notice tone="warn">הגשת גרסה חדשה תחליף את הגרסה הנוכחית ותדרוש בדיקה ואישור מחדש.</Notice>}
      <div key={key} className="mt-2 space-y-3">
        <Uploader apiBase="/api/portal" participationId={d.participation_id} purpose="content" onReady={(a) => setAsset(a)} label="קובץ (תמונה, וידאו או PDF)" />
        <Field label="או קישור לתוכן (למשל טיוטה בדרייב)" htmlFor="sv-url"><TextInput id="sv-url" type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="כיתוב לפוסט" htmlFor="sv-cap"><TextArea id="sv-cap" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
        <Field label="הערה לצוות" htmlFor="sv-notes"><TextInput id="sv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Btn busy={busy} disabled={!asset && !url.trim()} onClick={async () => {
          if (await run(() => api(`/api/portal/deliverables/${d.id}/versions`, { body: { asset_id: asset?.id ?? null, external_url: url.trim() || null, caption, creator_notes: notes, based_on_version_id: d.current_version_id } }), { success: 'התוכן הוגש' })) {
            setAsset(null); setUrl(''); setNotes(''); setKey((k) => k + 1)
          }
        }}>הגשה</Btn>
        {!asset && !url.trim() && <p className="text-xs text-wizard-text-secondary">ההגשה תתאפשר אחרי שהקובץ יועלה ויאומת, או אחרי הזנת קישור.</p>}
      </div>
    </Panel>
  )
}

function ReportPublication({ d }: { d: Data['deliverable'] }) {
  const [url, setUrl] = React.useState('')
  const [at, setAt] = React.useState(toJerusalemInput(new Date()))
  const [evidence, setEvidence] = React.useState<{ id: string } | null>(null)
  const { busy, run } = useAction()
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-wizard-border p-3">
      <Field label="קישור לפרסום *" htmlFor="rp-url"><TextInput id="rp-url" type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" /></Field>
      <Field label="מתי פורסם (שעון ישראל) *" htmlFor="rp-at"><TextInput id="rp-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <Uploader apiBase="/api/portal" participationId={d.participation_id} purpose="evidence" onReady={(a) => setEvidence(a)} label="צילום מסך של הפרסום (מאיץ את האימות)" />
      <Btn busy={busy} disabled={!/^https?:\/\//.test(url) || !at} onClick={() => void run(() => api(`/api/portal/deliverables/${d.id}/publication`, { body: { published_url: url, reported_published_at: at, evidence_asset_id: evidence?.id ?? null } }), { success: 'הפרסום דווח' })}>דיווח פרסום</Btn>
    </div>
  )
}
