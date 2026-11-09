'use client'

import * as React from 'react'
import { api } from '../client-api'
import { AssetViewer, Uploader } from '../uploader'
import { Btn, Dialog, Field, Notice, Panel, SelectInput, StatusBadge, TextArea, TextInput, useAction } from '../ui'
import { VersionList, type Version } from './versions'
import { MetricsForm, MetricsTable } from './metrics'
import { formatDateTime, toJerusalemInput } from '@/lib/campaigns/domain/time'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

export type DeliverableData = {
  deliverable: {
    id: string; campaign_id: string; participation_id: string; title: string; type: string; platform: string; description: string | null
    status: string; status_reason: string | null; submission_due_at: string | null; publication_due_at: string | null
    original_submission_due_at: string | null; original_publication_due_at: string | null
    required_tags: string[]; required_mentions: string[]; required_links: string[]; current_version_id: string | null
    first_submitted_at: string | null; submission_breached_at: string | null; publication_breached_at: string | null; version: number
    campaign_name: string; creator_name: string; participation_status: string
  }
  versions: Version[]
  publication: null | { id: string; published_url: string; reported_published_at: string; actual_published_at: string | null; verification_status: string; verified_at: string | null; verification_notes: string | null; evidence_asset_id: string | null; version: number }
  metrics: { id: string; metric_name: string; metric_value: string; source_type: string; captured_at: string; measurement_period: string; evidence_asset_id: string | null }[]
  deadlineHistory: { field: string; old_value: string | null; new_value: string | null; reason: string | null; changed_at: string }[]
  history: { action: string; summary: string | null; actor_label: string; created_at: string }[]
  access_level: 'manage' | 'operate' | null
}

const STAGE: Record<string, string> = {
  awaiting_submission: 'ממתין להגשה מהיוצר', submitted: 'הוגש — ממתין לבדיקה פנימית', internal_review: 'בבדיקה פנימית',
  changes_requested: 'נשלחו הערות ליוצר — ממתין לגרסה מתוקנת', client_review: 'אושר פנימית — ממתין לאישור הלקוח',
  approved: 'אושר על ידי הלקוח — ממתין לפרסום ודיווח', publication_reported: 'דווח פרסום — ממתין לאימות שלנו',
  publication_verified: 'הפרסום אומת', cancelled: 'בוטל',
}

export function DeliverableWorkspace({ data }: { data: DeliverableData }) {
  const d = data.deliverable
  const manage = data.access_level === 'manage'
  const current = data.versions.find((v) => v.id === d.current_version_id) ?? null
  const internalDone = current?.decisions.find((x) => x.stage === 'internal')
  const clientDone = current?.decisions.find((x) => x.stage === 'client')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{d.title}</h1>
        <StatusBadge status={d.status} />
        {(d.submission_breached_at || d.publication_breached_at) && <StatusBadge status="exception" label="נרשם איחור" />}
      </div>
      <p className="text-sm text-wizard-text-secondary">{d.creator_name} · {d.platform} · {d.type} · קמפיין {d.campaign_name}</p>
      <Notice tone={d.status === 'cancelled' ? 'bad' : 'info'}><strong>שלב נוכחי:</strong> {STAGE[d.status]}{d.status_reason ? ` (${d.status_reason})` : ''}</Notice>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Panel title="אישורים לגרסה הנוכחית">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-wizard-border p-3">
                <div className="text-xs text-wizard-text-secondary">שלב 1 · אישור פנימי (הצוות)</div>
                <div className="mt-1">{internalDone ? <StatusBadge status={internalDone.decision} label={heStatus(internalDone.decision)} /> : current ? <StatusBadge status="pending" label="ממתין" /> : '—'}</div>
              </div>
              <div className="rounded-xl border border-wizard-border p-3">
                <div className="text-xs text-wizard-text-secondary">שלב 2 · אישור לקוח (בפורטל הלקוח)</div>
                <div className="mt-1">{clientDone ? <StatusBadge status={clientDone.decision} label={heStatus(clientDone.decision)} /> : internalDone?.decision === 'approved' ? <StatusBadge status="pending" label="ממתין ללקוח" /> : <span className="text-xs text-wizard-text-secondary">זמין רק אחרי אישור פנימי</span>}</div>
              </div>
            </div>
            {manage && current && ['submitted', 'internal_review'].includes(d.status) && <InternalDecision deliverableId={d.id} versionId={current.id} versionNumber={current.version_number} />}
            {!manage && current && d.status === 'submitted' && <StartReview deliverableId={d.id} />}
          </Panel>

          <Panel title="גרסאות והערות">
            <VersionList versions={data.versions} currentId={d.current_version_id} apiBase="/api/campaigns" deliverableId={d.id} canComment allowInternalComments />
            {['awaiting_submission', 'changes_requested', 'submitted', 'internal_review', 'client_review', 'approved'].includes(d.status) && ['accepted', 'active'].includes(d.participation_status) && (
              <SubmitOnBehalf d={d} />
            )}
          </Panel>

          <Panel title="פרסום">
            <PublicationSection data={data} manage={manage} />
          </Panel>

          <Panel title="ביצועים">
            <MetricsTable metrics={data.metrics} apiBase="/api/campaigns" />
            {data.publication && data.publication.verification_status !== 'rejected' && (
              <div className="mt-3"><MetricsForm apiBase="/api/campaigns" deliverableId={d.id} participationId={d.participation_id} internal /></div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="בריף ודרישות">
            <p className="whitespace-pre-wrap text-sm">{d.description || 'אין פירוט'}</p>
            <dl className="mt-2 space-y-1 text-xs">
              {d.required_tags.length > 0 && <div><dt className="inline text-wizard-text-secondary">תגיות: </dt><dd className="inline">{d.required_tags.join(' ')}</dd></div>}
              {d.required_mentions.length > 0 && <div><dt className="inline text-wizard-text-secondary">תיוגים: </dt><dd className="inline">{d.required_mentions.join(' ')}</dd></div>}
              {d.required_links.length > 0 && <div><dt className="inline text-wizard-text-secondary">קישורים: </dt><dd className="inline" dir="ltr">{d.required_links.join(' ')}</dd></div>}
            </dl>
          </Panel>
          <Panel title="מועדים" actions={manage && !['cancelled', 'publication_verified'].includes(d.status) && <EditDates d={d} />}>
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-wizard-text-secondary">הגשה: </dt><dd className="inline">{formatDateTime(d.submission_due_at)}</dd></div>
              {d.original_submission_due_at && d.original_submission_due_at !== d.submission_due_at && <div className="text-xs text-wizard-text-secondary">מועד מקורי: {formatDateTime(d.original_submission_due_at)}</div>}
              <div><dt className="inline text-wizard-text-secondary">פרסום: </dt><dd className="inline">{formatDateTime(d.publication_due_at)}</dd></div>
              {d.original_publication_due_at && d.original_publication_due_at !== d.publication_due_at && <div className="text-xs text-wizard-text-secondary">מועד מקורי: {formatDateTime(d.original_publication_due_at)}</div>}
              <div><dt className="inline text-wizard-text-secondary">הוגש לראשונה: </dt><dd className="inline">{formatDateTime(d.first_submitted_at)}</dd></div>
              {d.submission_breached_at && <div className="text-xs font-semibold text-rose-700">נרשם איחור בהגשה (מועד שעבר: {formatDateTime(d.submission_breached_at)})</div>}
              {d.publication_breached_at && <div className="text-xs font-semibold text-rose-700">נרשם איחור בפרסום (מועד שעבר: {formatDateTime(d.publication_breached_at)})</div>}
            </dl>
            {data.deadlineHistory.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-wizard-border pt-2 text-xs text-wizard-text-secondary">
                {data.deadlineHistory.map((h, i) => <li key={i}>{h.field === 'submission_due_at' ? 'הגשה' : 'פרסום'}: {formatDateTime(h.old_value)} ← {formatDateTime(h.new_value)} · {h.reason} · {formatDateTime(h.changed_at)}</li>)}
              </ul>
            )}
          </Panel>
          <Panel title="היסטוריה">
            <ol className="max-h-80 space-y-1.5 overflow-y-auto text-xs">
              {data.history.map((h, i) => <li key={i}><div>{h.summary ?? h.action}</div><div className="text-wizard-text-secondary">{formatDateTime(h.created_at)} · {h.actor_label}</div></li>)}
            </ol>
          </Panel>
          {manage && !['cancelled', 'publication_verified'].includes(d.status) && <CancelDeliverable d={d} />}
        </div>
      </div>
    </div>
  )
}

function InternalDecision({ deliverableId, versionId, versionNumber }: { deliverableId: string; versionId: string; versionNumber: number }) {
  const [mode, setMode] = React.useState<null | 'changes_requested' | 'rejected'>(null)
  const [feedback, setFeedback] = React.useState('')
  const { busy, run } = useAction()
  const decide = (decision: string, fb: string | null) =>
    run(() => api(`/api/campaigns/deliverables/${deliverableId}/decision`, { body: { version_id: versionId, decision, feedback: fb } }), { success: 'ההחלטה נשמרה' })
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm">החלטה פנימית על <strong>גרסה {versionNumber}</strong>. אישור יעביר את הגרסה ללקוח.</p>
      <div className="flex flex-wrap gap-2">
        <Btn tone="good" busy={busy} onClick={() => void decide('approved', null)}>אישור פנימי ושליחה ללקוח</Btn>
        <Btn tone="secondary" onClick={() => setMode('changes_requested')}>בקשת תיקונים</Btn>
        <Btn tone="danger" onClick={() => setMode('rejected')}>דחייה</Btn>
      </div>
      <Dialog open={!!mode} onClose={() => setMode(null)} title={mode === 'rejected' ? 'דחיית הגרסה' : 'בקשת תיקונים'}>
        <Field label="מה צריך לתקן (חובה, יוצג ליוצר)" htmlFor="idec-fb"><TextArea id="idec-fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Btn busy={busy} disabled={feedback.trim().length < 2} onClick={async () => { if (mode && await decide(mode, feedback.trim())) setMode(null) }}>שליחה</Btn><Btn tone="secondary" onClick={() => setMode(null)}>ביטול</Btn></div>
      </Dialog>
    </div>
  )
}

function StartReview({ deliverableId }: { deliverableId: string }) {
  const { busy, run } = useAction()
  return <div className="mt-3"><Btn size="sm" tone="secondary" busy={busy} onClick={() => void run(() => api(`/api/campaigns/deliverables/${deliverableId}/review`, { method: 'POST' }), { success: 'סומן כבבדיקה' })}>התחלת בדיקה</Btn></div>
}

function SubmitOnBehalf({ d }: { d: DeliverableData['deliverable'] }) {
  const [open, setOpen] = React.useState(false)
  const [asset, setAsset] = React.useState<{ id: string } | null>(null)
  const [url, setUrl] = React.useState('')
  const [caption, setCaption] = React.useState('')
  const { busy, run } = useAction()
  return (
    <div className="mt-3">
      <Btn size="sm" tone="secondary" onClick={() => setOpen(true)}>העלאת גרסה בשם היוצר</Btn>
      <Dialog open={open} onClose={() => setOpen(false)} title="גרסה חדשה (בשם היוצר)">
        <div className="space-y-3">
          <Notice>הגשה בשם היוצר תתועד בשמך. גרסה חדשה מחייבת אישור פנימי ואישור לקוח מחדש.</Notice>
          <Uploader apiBase="/api/campaigns" participationId={d.participation_id} purpose="content" onReady={(a) => setAsset(a)} label="קובץ תוכן" />
          <Field label="או קישור לתוכן" htmlFor="sob-url"><TextInput id="sob-url" dir="ltr" type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="כיתוב" htmlFor="sob-cap"><TextArea id="sob-cap" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
          <Btn busy={busy} disabled={!asset && !url} onClick={async () => {
            if (await run(() => api(`/api/campaigns/deliverables/${d.id}/versions`, { body: { asset_id: asset?.id ?? null, external_url: url || null, caption, based_on_version_id: d.current_version_id } }), { success: 'הגרסה הוגשה' })) setOpen(false)
          }}>הגשה</Btn>
        </div>
      </Dialog>
    </div>
  )
}

function PublicationSection({ data, manage }: { data: DeliverableData; manage: boolean }) {
  const d = data.deliverable
  const p = data.publication
  const [evidence, setEvidence] = React.useState<{ id: string } | null>(null)
  const [actual, setActual] = React.useState(p?.reported_published_at ? toJerusalemInput(p.reported_published_at) : '')
  const [notes, setNotes] = React.useState('')
  const [decision, setDecision] = React.useState<'verified' | 'rejected'>('verified')
  const { busy, run } = useAction()
  if (!p) return <p className="text-sm text-wizard-text-secondary">{d.status === 'approved' ? 'ממתין לדיווח פרסום מהיוצר.' : 'הפרסום יתאפשר אחרי אישור הלקוח.'}</p>
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <a className="font-medium text-brand-primary underline" href={p.published_url} target="_blank" rel="noreferrer noopener">קישור הפרסום</a>
        <StatusBadge status={p.verification_status} />
      </div>
      <div className="text-xs text-wizard-text-secondary">דווח כמועד פרסום: {formatDateTime(p.reported_published_at)}{p.actual_published_at && <> · פורסם בפועל (אומת): {formatDateTime(p.actual_published_at)}</>}</div>
      {p.verification_notes && <div className="text-xs">הערות אימות: {p.verification_notes}</div>}
      {p.evidence_asset_id && <AssetEvidence id={p.evidence_asset_id} />}
      {manage && d.status === 'publication_reported' && (
        <div className="mt-2 space-y-2 rounded-xl border border-wizard-border p-3">
          <h3 className="font-semibold">אימות הפרסום</h3>
          <Field label="החלטה" htmlFor="v-dec"><SelectInput id="v-dec" value={decision} onChange={(e) => setDecision(e.target.value as 'verified' | 'rejected')}><option value="verified">הפרסום אומת</option><option value="rejected">הדיווח שגוי — להחזיר ליוצר</option></SelectInput></Field>
          {decision === 'verified' && (
            <>
              <Field label="מועד פרסום בפועל (שעון ישראל) *" htmlFor="v-actual"><TextInput id="v-actual" type="datetime-local" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
              {!p.evidence_asset_id && <Uploader apiBase="/api/campaigns" participationId={d.participation_id} purpose="evidence" onReady={(a) => setEvidence(a)} label="אסמכתה: צילום מסך של הפרסום *" />}
            </>
          )}
          <Field label={decision === 'rejected' ? 'מה לא תקין (חובה)' : 'הערות'} htmlFor="v-notes"><TextArea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Btn busy={busy} disabled={decision === 'verified' ? !actual || (!p.evidence_asset_id && !evidence) : notes.trim().length < 2} onClick={() => void run(() => api(`/api/campaigns/deliverables/${d.id}/publication/verify`, {
            body: { decision, actual_published_at: actual || null, evidence_asset_id: evidence?.id ?? null, notes: notes || null, expected_publication_version: p.version },
          }), { success: decision === 'verified' ? 'הפרסום אומת' : 'הדיווח הוחזר ליוצר' })}>שמירה</Btn>
        </div>
      )}
    </div>
  )
}

function AssetEvidence({ id }: { id: string }) {
  return <div className="mt-1"><AssetViewer apiBase="/api/campaigns" assetId={id} mime={null} name="אסמכתה" /></div>
}

function EditDates({ d }: { d: DeliverableData['deliverable'] }) {
  const [open, setOpen] = React.useState(false)
  const [sub, setSub] = React.useState(toJerusalemInput(d.submission_due_at))
  const [pub, setPub] = React.useState(toJerusalemInput(d.publication_due_at))
  const [reason, setReason] = React.useState('')
  const { busy, run } = useAction()
  return (
    <>
      <Btn size="sm" tone="secondary" onClick={() => setOpen(true)}>שינוי מועד</Btn>
      <Dialog open={open} onClose={() => setOpen(false)} title="שינוי מועדים">
        <div className="space-y-3">
          <Notice>המועד המקורי נשמר, וכל שינוי מתועד. אם מועד כבר עבר בלי שהעבודה בוצעה, האיחור נרשם ולא יימחק. תזכורות למועד הישן מבוטלות.</Notice>
          <Field label="מועד הגשה (שעון ישראל)" htmlFor="ed-sub"><TextInput id="ed-sub" type="datetime-local" value={sub} onChange={(e) => setSub(e.target.value)} /></Field>
          <Field label="מועד פרסום (שעון ישראל)" htmlFor="ed-pub"><TextInput id="ed-pub" type="datetime-local" value={pub} onChange={(e) => setPub(e.target.value)} /></Field>
          <Field label="סיבה (חובה)" htmlFor="ed-reason"><TextInput id="ed-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Btn busy={busy} disabled={reason.trim().length < 2} onClick={async () => {
            const body: Record<string, unknown> = { expected_version: d.version, deadline_change_reason: reason }
            if (sub !== toJerusalemInput(d.submission_due_at)) body.submission_due_at = sub || null
            if (pub !== toJerusalemInput(d.publication_due_at)) body.publication_due_at = pub || null
            if (await run(() => api(`/api/campaigns/deliverables/${d.id}`, { method: 'PATCH', body }), { success: 'המועדים עודכנו' })) setOpen(false)
          }}>שמירה</Btn>
        </div>
      </Dialog>
    </>
  )
}

function CancelDeliverable({ d }: { d: DeliverableData['deliverable'] }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const { busy, run } = useAction()
  return (
    <>
      <Btn tone="ghost" size="sm" onClick={() => setOpen(true)}>ביטול התוצר</Btn>
      <Dialog open={open} onClose={() => setOpen(false)} title="ביטול תוצר">
        <p className="text-sm">תוצר מבוטל אינו נספר במדדי ההגשה והפרסום ומופיע בדוח כמבוטל. תזכורות ומשימות שלו מבוטלות.</p>
        <Field label="סיבה (חובה)" htmlFor="cd-reason"><TextInput id="cd-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="mt-3"><Btn tone="danger" busy={busy} disabled={reason.trim().length < 3} onClick={async () => { if (await run(() => api(`/api/campaigns/deliverables/${d.id}/cancel`, { body: { expected_version: d.version, reason } }), { success: 'התוצר בוטל' })) setOpen(false) }}>ביטול התוצר</Btn></div>
      </Dialog>
    </>
  )
}
