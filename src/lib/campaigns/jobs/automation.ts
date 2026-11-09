/**
 * Business automations. Two halves:
 *  1. schedule*() / cancel*() — called inside the business transaction when a
 *     deadline is set, moved or no longer applies.
 *  2. JOB_HANDLERS — run later by the worker. Each handler RE-READS the
 *     current state and does nothing if the condition no longer holds (the
 *     deliverable was submitted, the deadline moved, the campaign was
 *     cancelled). That re-check, plus dedupe keys that include the deadline
 *     value, is what prevents stale or repeated reminders.
 */
import type { Queryable } from '../db'
import { one } from '../db'
import { formatDate, formatDateTime, jerusalemLocalToUtc } from '../domain/time'
import { cancelJobs, closeTasks, enqueueJob, ensureTask, queueNotification, type Relevance } from './queue'
import { ownerRecipient, participationRecipients, type Recipient } from '../services/recipients'

export const REMINDER_LEAD_HOURS = 24
export const METRICS_CHECK_DAYS = 7
export const RIGHTS_ALERT_DAYS = 30

const iso = (d: Date) => d.toISOString()

export interface DeliverableTiming {
  id: string
  campaign_id: string
  participation_id: string
  status: string
  submission_due_at: Date | null
  publication_due_at: Date | null
}

export async function scheduleSubmissionJobs(db: Queryable, d: DeliverableTiming, now: Date): Promise<void> {
  if (d.status !== 'awaiting_submission' || !d.submission_due_at) return
  const due = new Date(d.submission_due_at)
  const remindAt = new Date(due.getTime() - REMINDER_LEAD_HOURS * 3_600_000)
  if (due > now) {
    await enqueueJob(db, {
      kind: 'deliverable.submission_reminder', dedupeKey: `d:${d.id}:sub_rem:${iso(due)}`,
      runAfter: remindAt > now ? remindAt : now, campaignId: d.campaign_id,
      subjectType: 'deliverable', subjectId: d.id, payload: { dueAt: iso(due) },
    })
  }
  await enqueueJob(db, {
    kind: 'deliverable.submission_overdue', dedupeKey: `d:${d.id}:sub_over:${iso(due)}`,
    runAfter: due > now ? due : now, campaignId: d.campaign_id,
    subjectType: 'deliverable', subjectId: d.id, payload: { dueAt: iso(due) },
  })
}

export async function schedulePublicationJobs(db: Queryable, d: DeliverableTiming, now: Date): Promise<void> {
  if (d.status !== 'approved' || !d.publication_due_at) return
  const due = new Date(d.publication_due_at)
  await enqueueJob(db, {
    kind: 'deliverable.publication_overdue', dedupeKey: `d:${d.id}:pub_over:${iso(due)}`,
    runAfter: due > now ? due : now, campaignId: d.campaign_id,
    subjectType: 'deliverable', subjectId: d.id, payload: { dueAt: iso(due) },
  })
}

export const SUBMISSION_JOB_KINDS = ['deliverable.submission_reminder', 'deliverable.submission_overdue']
export const PUBLICATION_JOB_KINDS = ['deliverable.publication_overdue']

export async function cancelDeliverableJobs(db: Queryable, deliverableId: string, kinds: string[] | undefined, reason: string) {
  return cancelJobs(db, { subjectId: deliverableId, kinds }, reason)
}

export async function scheduleMetricsCheck(db: Queryable, d: { id: string; campaign_id: string }, verifiedAt: Date): Promise<void> {
  await enqueueJob(db, {
    kind: 'deliverable.metrics_check', dedupeKey: `d:${d.id}:metrics_check`,
    runAfter: new Date(verifiedAt.getTime() + METRICS_CHECK_DAYS * 86_400_000), campaignId: d.campaign_id,
    subjectType: 'deliverable', subjectId: d.id,
  })
}

export async function scheduleRightsJob(db: Queryable, p: { id: string; campaign_id: string; rights_expires_at: string | null }, now: Date) {
  await cancelJobs(db, { subjectId: p.id, kinds: ['participation.rights_expiry'] }, 'rights date changed')
  if (!p.rights_expires_at) return
  const expiry = jerusalemLocalToUtc(`${p.rights_expires_at}T09:00`)
  const alertAt = new Date(expiry.getTime() - RIGHTS_ALERT_DAYS * 86_400_000)
  await enqueueJob(db, {
    kind: 'participation.rights_expiry', dedupeKey: `p:${p.id}:rights:${p.rights_expires_at}`,
    runAfter: alertAt > now ? alertAt : now, campaignId: p.campaign_id,
    subjectType: 'participation', subjectId: p.id, payload: { expiresOn: p.rights_expires_at },
  })
}

// ── Messages ───────────────────────────────────────────────────────────────

export interface MessageSpec {
  campaignId: string
  key: string
  subject: string
  body: string
  /** internal recipients link here; portal recipients get /portal (+ a fresh login link) */
  internalPath: string | null
  portalPath: string | null
  relevance?: Relevance | null
  jobId?: string | null
  correlationId: string
}

export async function sendTo(db: Queryable, recipients: (Recipient | null)[], m: MessageSpec, now: Date): Promise<number> {
  let n = 0
  for (const r of recipients) {
    if (!r || !r.email) continue
    await queueNotification(db, {
      campaignId: m.campaignId, jobId: m.jobId ?? null, audience: r.audience,
      recipientUserId: r.userId, recipientGrantId: r.grantId, toAddress: r.email,
      subject: m.subject, bodyText: m.body,
      linkPath: r.audience === 'internal' ? m.internalPath : m.portalPath,
      idempotencyKey: `${m.key}:${r.userId ?? r.grantId}`, correlationId: m.correlationId,
      relevance: m.relevance ?? null,
    }, now)
    n++
  }
  return n
}

// ── Job handlers ───────────────────────────────────────────────────────────

export interface JobRow {
  id: string
  kind: string
  campaign_id: string | null
  subject_type: string | null
  subject_id: string | null
  payload: Record<string, unknown>
  correlation_id: string
}

export type JobOutcome = { outcome: 'done' | 'skipped'; result: string }

interface DeliverableCtx {
  id: string; title: string; status: string; campaign_id: string; participation_id: string
  submission_due_at: Date | null; publication_due_at: Date | null; submission_breached_at: Date | null
  publication_breached_at: Date | null
  campaign_name: string; campaign_status: string; owner_user_id: string
  participation_status: string; creator_name: string
}

async function loadDeliverableCtx(db: Queryable, id: string): Promise<DeliverableCtx | null> {
  return one<DeliverableCtx>(db,
    `select d.id, d.title, d.status, d.campaign_id, d.participation_id, d.submission_due_at, d.publication_due_at,
            d.submission_breached_at, d.publication_breached_at,
            c.name as campaign_name, c.status as campaign_status, c.owner_user_id,
            p.participation_status, cr.display_name as creator_name
       from cm_deliverables d
       join cm_campaigns c on c.id = d.campaign_id
       join cm_participations p on p.id = d.participation_id
       join cm_creators cr on cr.id = p.creator_id
      where d.id = $1
      for update of d`, [id])
}

const LIVE_CAMPAIGN = new Set(['draft', 'planning', 'recruiting', 'active', 'reporting'])
const sameInstant = (a: Date | null, b: unknown) => !!a && typeof b === 'string' && new Date(a).getTime() === new Date(b).getTime()

type Handler = (db: Queryable, job: JobRow, now: Date) => Promise<JobOutcome>

export const JOB_HANDLERS: Record<string, Handler> = {
  async 'deliverable.submission_reminder'(db, job, now) {
    const d = job.subject_id ? await loadDeliverableCtx(db, job.subject_id) : null
    if (!d) return { outcome: 'skipped', result: 'deliverable gone' }
    if (!LIVE_CAMPAIGN.has(d.campaign_status)) return { outcome: 'skipped', result: `campaign ${d.campaign_status}` }
    if (d.status !== 'awaiting_submission') return { outcome: 'skipped', result: `status ${d.status}` }
    if (!sameInstant(d.submission_due_at, job.payload.dueAt)) return { outcome: 'skipped', result: 'deadline changed' }
    if (!['accepted', 'active'].includes(d.participation_status)) return { outcome: 'skipped', result: `participation ${d.participation_status}` }
    const n = await sendTo(db, await participationRecipients(db, d.participation_id, now), {
      campaignId: d.campaign_id, key: `job:${job.id}`, jobId: job.id, correlationId: job.correlation_id,
      subject: `תזכורת: הגשת תוכן ל"${d.campaign_name}" עד ${formatDateTime(d.submission_due_at)}`,
      body: `שלום,\nמועד ההגשה של "${d.title}" בקמפיין "${d.campaign_name}" הוא ${formatDateTime(d.submission_due_at)} (שעון ישראל).\nאפשר להעלות את התוכן בפורטל.`,
      internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
      relevance: { deliverableId: d.id, statuses: ['awaiting_submission'], dueField: 'submission_due_at', dueAt: String(job.payload.dueAt) },
    }, now)
    return { outcome: 'done', result: `queued ${n} reminder(s)` }
  },

  async 'deliverable.submission_overdue'(db, job, now) {
    const d = job.subject_id ? await loadDeliverableCtx(db, job.subject_id) : null
    if (!d) return { outcome: 'skipped', result: 'deliverable gone' }
    if (!LIVE_CAMPAIGN.has(d.campaign_status)) return { outcome: 'skipped', result: `campaign ${d.campaign_status}` }
    if (d.status !== 'awaiting_submission') return { outcome: 'skipped', result: `status ${d.status}` }
    if (!sameInstant(d.submission_due_at, job.payload.dueAt)) return { outcome: 'skipped', result: 'deadline changed' }
    if (!d.submission_breached_at) {
      await db.query(`update cm_deliverables set submission_breached_at = $2 where id = $1 and submission_breached_at is null`, [d.id, d.submission_due_at])
    }
    await ensureTask(db, {
      automationKey: `d:${d.id}:chase_submission:${iso(new Date(d.submission_due_at as Date))}`,
      campaignId: d.campaign_id, participationId: d.participation_id, deliverableId: d.id,
      type: 'chase_submission', title: `הגשה באיחור: ${d.creator_name} — ${d.title}`,
      assigneeUserId: d.owner_user_id, dueAt: now, priority: 'high', eventId: job.id,
    })
    const owner = await ownerRecipient(db, d.campaign_id)
    await sendTo(db, [owner], {
      campaignId: d.campaign_id, key: `job:${job.id}:owner`, jobId: job.id, correlationId: job.correlation_id,
      subject: `איחור בהגשה: ${d.creator_name} — "${d.title}" (${d.campaign_name})`,
      body: `מועד ההגשה ${formatDateTime(d.submission_due_at)} עבר ולא הוגש תוכן.`,
      internalPath: `/campaigns/${d.campaign_id}/deliverables/${d.id}`, portalPath: null,
      relevance: { deliverableId: d.id, statuses: ['awaiting_submission'] },
    }, now)
    await sendTo(db, await participationRecipients(db, d.participation_id, now), {
      campaignId: d.campaign_id, key: `job:${job.id}:creator`, jobId: job.id, correlationId: job.correlation_id,
      subject: `מועד ההגשה עבר: "${d.title}" (${d.campaign_name})`,
      body: `מועד ההגשה של "${d.title}" היה ${formatDateTime(d.submission_due_at)}. נשמח לקבל את התוכן בהקדם דרך הפורטל.`,
      internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
      relevance: { deliverableId: d.id, statuses: ['awaiting_submission'] },
    }, now)
    return { outcome: 'done', result: 'breach recorded, manager notified' }
  },

  async 'deliverable.publication_overdue'(db, job, now) {
    const d = job.subject_id ? await loadDeliverableCtx(db, job.subject_id) : null
    if (!d) return { outcome: 'skipped', result: 'deliverable gone' }
    if (!LIVE_CAMPAIGN.has(d.campaign_status)) return { outcome: 'skipped', result: `campaign ${d.campaign_status}` }
    if (d.status !== 'approved') return { outcome: 'skipped', result: `status ${d.status}` }
    if (!sameInstant(d.publication_due_at, job.payload.dueAt)) return { outcome: 'skipped', result: 'deadline changed' }
    if (!d.publication_breached_at) {
      await db.query(`update cm_deliverables set publication_breached_at = $2 where id = $1 and publication_breached_at is null`, [d.id, d.publication_due_at])
    }
    await ensureTask(db, {
      automationKey: `d:${d.id}:chase_publication:${iso(new Date(d.publication_due_at as Date))}`,
      campaignId: d.campaign_id, participationId: d.participation_id, deliverableId: d.id,
      type: 'chase_publication', title: `לא דווח פרסום: ${d.creator_name} — ${d.title}`,
      assigneeUserId: d.owner_user_id, dueAt: now, priority: 'high', eventId: job.id,
    })
    await sendTo(db, await participationRecipients(db, d.participation_id, now), {
      campaignId: d.campaign_id, key: `job:${job.id}:creator`, jobId: job.id, correlationId: job.correlation_id,
      subject: `תזכורת: דיווח פרסום "${d.title}" (${d.campaign_name})`,
      body: `מועד הפרסום ${formatDateTime(d.publication_due_at)} עבר ועדיין לא דווח קישור לפרסום. אפשר לדווח בפורטל.`,
      internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
      relevance: { deliverableId: d.id, statuses: ['approved'] },
    }, now)
    return { outcome: 'done', result: 'publication breach recorded' }
  },

  async 'deliverable.metrics_check'(db, job, now) {
    const d = job.subject_id ? await loadDeliverableCtx(db, job.subject_id) : null
    if (!d) return { outcome: 'skipped', result: 'deliverable gone' }
    if (d.campaign_status === 'cancelled') return { outcome: 'skipped', result: 'campaign cancelled' }
    if (d.status !== 'publication_verified') return { outcome: 'skipped', result: `status ${d.status}` }
    const has = await one<{ n: number }>(db, `select count(*)::int as n from cm_metric_observations where deliverable_id = $1`, [d.id])
    if ((has?.n ?? 0) > 0) return { outcome: 'skipped', result: 'metrics present' }
    await ensureTask(db, {
      automationKey: `d:${d.id}:collect_metrics`, campaignId: d.campaign_id, participationId: d.participation_id,
      deliverableId: d.id, type: 'collect_metrics', title: `חסרים נתוני ביצועים: ${d.creator_name} — ${d.title}`,
      assigneeUserId: d.owner_user_id, dueAt: new Date(now.getTime() + 3 * 86_400_000), eventId: job.id,
    })
    await sendTo(db, await participationRecipients(db, d.participation_id, now), {
      campaignId: d.campaign_id, key: `job:${job.id}:creator`, jobId: job.id, correlationId: job.correlation_id,
      subject: `נשמח לנתוני ביצועים: "${d.title}" (${d.campaign_name})`,
      body: `אפשר להזין בפורטל צפיות, חשיפות ושאר הנתונים ולצרף צילום מסך מהסטטיסטיקות.`,
      internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
      relevance: { deliverableId: d.id, statuses: ['publication_verified'] },
    }, now)
    return { outcome: 'done', result: 'metrics task opened' }
  },

  async 'participation.rights_expiry'(db, job, now) {
    const p = job.subject_id ? await one<{
      id: string; campaign_id: string; rights_expires_at: string | null; participation_status: string
      campaign_name: string; campaign_status: string; owner_user_id: string; creator_name: string
    }>(db,
      `select p.id, p.campaign_id, to_char(p.rights_expires_at, 'YYYY-MM-DD') as rights_expires_at, p.participation_status,
              c.name as campaign_name, c.status as campaign_status, c.owner_user_id, cr.display_name as creator_name
         from cm_participations p join cm_campaigns c on c.id = p.campaign_id join cm_creators cr on cr.id = p.creator_id
        where p.id = $1`, [job.subject_id]) : null
    if (!p) return { outcome: 'skipped', result: 'participation gone' }
    if (p.campaign_status === 'cancelled' || p.participation_status === 'cancelled') return { outcome: 'skipped', result: 'cancelled' }
    if (p.rights_expires_at !== job.payload.expiresOn) return { outcome: 'skipped', result: 'rights date changed' }
    await ensureTask(db, {
      automationKey: `p:${p.id}:rights:${p.rights_expires_at}`, campaignId: p.campaign_id, participationId: p.id,
      type: 'rights_expiring', title: `זכויות שימוש פוקעות ב-${formatDate(p.rights_expires_at)}: ${p.creator_name}`,
      assigneeUserId: p.owner_user_id, dueAt: jerusalemLocalToUtc(`${p.rights_expires_at}T09:00`), priority: 'high', eventId: job.id,
    })
    const owner = await ownerRecipient(db, p.campaign_id)
    await sendTo(db, [owner], {
      campaignId: p.campaign_id, key: `job:${job.id}`, jobId: job.id, correlationId: job.correlation_id,
      subject: `התראה: זכויות שימוש של ${p.creator_name} פוקעות ב-${formatDate(p.rights_expires_at)}`,
      body: `קמפיין "${p.campaign_name}". המערכת אינה בודקת את ההסכם משפטית; יש לבדוק את תנאי השימוש בהסכם עצמו.`,
      internalPath: `/campaigns/${p.campaign_id}?tab=creators`, portalPath: null,
      relevance: { participationId: p.id, participationStatuses: ['not_invited', 'invited', 'accepted', 'active', 'completed', 'declined'] },
    }, now)
    return { outcome: 'done', result: 'rights alert' }
  },
}

/** Re-check before sending: is the message still needed? */
export async function stillRelevant(db: Queryable, rel: Relevance | null, campaignId: string | null): Promise<boolean> {
  if (campaignId) {
    const c = await one<{ status: string }>(db, `select status from cm_campaigns where id = $1`, [campaignId])
    if (!c || c.status === 'cancelled') return false
  }
  if (!rel) return true
  if ('deliverableId' in rel) {
    const d = await one<{ status: string; submission_due_at: Date | null; publication_due_at: Date | null }>(db,
      `select status, submission_due_at, publication_due_at from cm_deliverables where id = $1`, [rel.deliverableId])
    if (!d || !rel.statuses.includes(d.status)) return false
    if (rel.dueField && rel.dueAt && !sameInstant(d[rel.dueField], rel.dueAt)) return false
    return true
  }
  if ('participationId' in rel) {
    const p = await one<{ participation_status: string }>(db, `select participation_status from cm_participations where id = $1`, [rel.participationId])
    return !!p && rel.participationStatuses.includes(p.participation_status)
  }
  if ('shortlistId' in rel) {
    const s = await one<{ status: string }>(db, `select status from cm_shortlists where id = $1`, [rel.shortlistId])
    return !!s && rel.shortlistStatuses.includes(s.status)
  }
  return true
}

export { closeTasks, ensureTask }
