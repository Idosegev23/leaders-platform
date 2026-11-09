'use client'

import * as React from 'react'
import Link from 'next/link'
import { api } from '../client-api'
import { Btn, Dialog, Empty, Field, Panel, SelectInput, StatusBadge, TextArea, TextInput, useAction } from '../ui'
import { formatDate, formatDateTime, jerusalemDate } from '@/lib/campaigns/domain/time'

export type TaskRow = {
  id: string; campaign_id: string; campaign_name?: string; participation_id: string | null; deliverable_id: string | null; type: string; title: string
  description: string | null; audience: string; assignee_user_id: string | null; assignee_name: string | null; due_at: string | null
  status: string; priority: string; version: number; overdue: boolean; creator_name: string | null; deliverable_title: string | null
}
type Deliverable = { id: string; title: string; creator_name: string; submission_due_at: string | null; publication_due_at: string | null; status: string }

const PRIORITY_HE: Record<string, string> = { low: 'נמוכה', normal: 'רגילה', high: 'גבוהה', urgent: 'דחופה' }

export function TaskList({ tasks, showCampaign }: { tasks: TaskRow[]; showCampaign?: boolean }) {
  const [overdueOnly, setOverdueOnly] = React.useState(false)
  const shown = overdueOnly ? tasks.filter((t) => t.overdue) : tasks
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> רק משימות באיחור ({tasks.filter((t) => t.overdue).length})</label>
      {shown.length === 0 ? <Empty title={overdueOnly ? 'אין משימות באיחור' : 'אין משימות פתוחות'} /> : (
        <ul className="divide-y divide-wizard-border rounded-xl border border-wizard-border bg-white">
          {shown.map((t) => <TaskItem key={t.id} t={t} showCampaign={showCampaign} />)}
        </ul>
      )}
    </div>
  )
}

function TaskItem({ t, showCampaign }: { t: TaskRow; showCampaign?: boolean }) {
  const { busy, run } = useAction()
  const [cancel, setCancel] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const link = t.deliverable_id ? `/campaigns/${t.campaign_id}/deliverables/${t.deliverable_id}` : `/campaigns/${t.campaign_id}?tab=creators`
  const update = (body: Record<string, unknown>, success: string) => run(() => api(`/api/campaigns/tasks/${t.id}`, { method: 'PATCH', body: { expected_version: t.version, ...body } }), { success })
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 p-3">
      <div className="min-w-0 text-sm">
        <div className="font-medium">{t.title}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-wizard-text-secondary">
          {showCampaign && t.campaign_name && <span>{t.campaign_name}</span>}
          {t.audience === 'creator' ? <span>אצל היוצר</span> : <span>אחראי/ת: {t.assignee_name ?? 'לא שויך'}</span>}
          <span>מועד: {formatDateTime(t.due_at)}</span>
          <span>עדיפות: {PRIORITY_HE[t.priority]}</span>
          <Link className="text-brand-primary underline" href={link}>{t.deliverable_title ?? t.creator_name ?? 'לרשומה'}</Link>
        </div>
        {t.description && <p className="mt-1 whitespace-pre-wrap text-xs">{t.description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={t.status} />
        {t.overdue && <StatusBadge status="dead" label="באיחור" />}
        {t.audience === 'internal' && t.status === 'open' && <Btn size="sm" tone="secondary" busy={busy} onClick={() => void update({ status: 'in_progress' }, 'המשימה בטיפול')}>בטיפול</Btn>}
        {t.audience === 'internal' && ['open', 'in_progress'].includes(t.status) && <Btn size="sm" tone="good" busy={busy} onClick={() => void update({ status: 'done' }, 'המשימה בוצעה')}>בוצע</Btn>}
        {['open', 'in_progress'].includes(t.status) && <Btn size="sm" tone="ghost" onClick={() => setCancel(true)}>ביטול</Btn>}
      </div>
      <Dialog open={cancel} onClose={() => setCancel(false)} title="ביטול משימה">
        <Field label="סיבה" htmlFor={`tc-${t.id}`}><TextInput id={`tc-${t.id}`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="mt-3 flex gap-2"><Btn tone="danger" disabled={reason.trim().length < 2} busy={busy} onClick={async () => { if (await update({ status: 'cancelled', cancel_reason: reason }, 'המשימה בוטלה')) setCancel(false) }}>ביטול המשימה</Btn></div>
      </Dialog>
    </li>
  )
}

export function TasksTab({ campaignId, tasks, staff, deliverables }: { campaignId: string; tasks: TaskRow[]; staff: { id: string; full_name: string }[]; deliverables: Deliverable[] }) {
  const [open, setOpen] = React.useState(false)
  const [f, setF] = React.useState({ title: '', description: '', assignee_user_id: '', due_at: '', priority: 'normal', deliverable_id: '' })
  const { busy, run } = useAction()

  // Basic timeline: deadlines grouped by business date (Asia/Jerusalem).
  const events = deliverables.filter((d) => d.status !== 'cancelled').flatMap((d) => [
    d.submission_due_at && { at: d.submission_due_at, label: `הגשה: ${d.creator_name} · ${d.title}`, id: d.id, done: !['awaiting_submission', 'changes_requested'].includes(d.status) },
    d.publication_due_at && { at: d.publication_due_at, label: `פרסום: ${d.creator_name} · ${d.title}`, id: d.id, done: ['publication_reported', 'publication_verified'].includes(d.status) },
  ]).filter(Boolean) as { at: string; label: string; id: string; done: boolean }[]
  events.sort((a, b) => a.at.localeCompare(b.at))
  const byDay = events.reduce<Record<string, typeof events>>((acc, e) => { (acc[jerusalemDate(new Date(e.at))] ||= []).push(e); return acc }, {})

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="משימות הקמפיין" actions={<Btn size="sm" onClick={() => setOpen(true)}>משימה חדשה</Btn>}>
        <TaskList tasks={tasks} />
      </Panel>
      <Panel title="לוח זמנים">
        {Object.keys(byDay).length === 0 ? <p className="text-sm text-wizard-text-secondary">אין מועדים מוגדרים.</p> : (
          <ol className="space-y-3">
            {Object.entries(byDay).map(([day, list]) => (
              <li key={day}>
                <div className="text-xs font-bold text-wizard-text-secondary">{formatDate(day)}</div>
                <ul className="mt-1 space-y-1 border-s-2 border-wizard-border ps-3">
                  {list.map((e, i) => (
                    <li key={i} className="text-sm">
                      <Link className={e.done ? 'text-wizard-text-secondary line-through' : 'text-foreground hover:underline'} href={`/campaigns/${campaignId}/deliverables/${e.id}`}>
                        {new Date(e.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })} · {e.label}
                      </Link>
                      {e.done && <span className="sr-only"> (בוצע)</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Dialog open={open} onClose={() => setOpen(false)} title="משימה חדשה">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          const ok = await run(() => api(`/api/campaigns/${campaignId}/tasks`, { body: { ...f, assignee_user_id: f.assignee_user_id || null, due_at: f.due_at || null, deliverable_id: f.deliverable_id || null } }), { success: 'המשימה נוצרה' })
          if (ok) { setOpen(false); setF({ title: '', description: '', assignee_user_id: '', due_at: '', priority: 'normal', deliverable_id: '' }) }
        }}>
          <Field label="כותרת *" htmlFor="nt-title"><TextInput id="nt-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="פירוט" htmlFor="nt-desc"><TextArea id="nt-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="אחראי/ת" htmlFor="nt-as"><SelectInput id="nt-as" value={f.assignee_user_id} onChange={(e) => setF({ ...f, assignee_user_id: e.target.value })}><option value="">לא שויך</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</SelectInput></Field>
            <Field label="עדיפות" htmlFor="nt-pr"><SelectInput id="nt-pr" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          </div>
          <Field label="מועד (שעון ישראל)" htmlFor="nt-due"><TextInput id="nt-due" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></Field>
          <Field label="קישור לתוצר" htmlFor="nt-del"><SelectInput id="nt-del" value={f.deliverable_id} onChange={(e) => setF({ ...f, deliverable_id: e.target.value })}><option value="">ללא</option>{deliverables.map((d) => <option key={d.id} value={d.id}>{d.creator_name} · {d.title}</option>)}</SelectInput></Field>
          <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.title.trim()}>יצירה</Btn><Btn tone="secondary" onClick={() => setOpen(false)}>ביטול</Btn></div>
        </form>
      </Dialog>
    </div>
  )
}
