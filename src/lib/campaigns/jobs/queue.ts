/**
 * Outbox primitives. Called INSIDE the business transaction, so a status change
 * and the jobs/tasks/messages it implies commit or roll back together.
 * Every insert is keyed (dedupe_key / automation_key / idempotency_key) so
 * repeating an event or a cron run never creates duplicates.
 */
import type { Queryable } from '../db'

export interface JobInput {
  kind: string
  dedupeKey: string
  runAfter: Date
  campaignId: string | null
  subjectType?: string
  subjectId?: string
  payload?: Record<string, unknown>
}

/**
 * Insert a job once. A job with the same key that was CANCELLED is revived
 * (e.g. a deadline moved away and then back); a job that already ran is not.
 */
export async function enqueueJob(db: Queryable, j: JobInput): Promise<void> {
  await db.query(
    `insert into cm_jobs (kind, dedupe_key, run_after, campaign_id, subject_type, subject_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (dedupe_key) do update
       set status = 'pending', run_after = excluded.run_after, attempts = 0, last_error = null, result = null
     where cm_jobs.status = 'cancelled'`,
    [j.kind, j.dedupeKey, j.runAfter, j.campaignId, j.subjectType ?? null, j.subjectId ?? null, j.payload ?? {}],
  )
}

export async function cancelJobs(db: Queryable, where: { subjectId?: string; campaignId?: string; kinds?: string[] }, reason: string): Promise<number> {
  const conds = [`status in ('pending','failed')`]
  const params: unknown[] = [reason]
  if (where.subjectId) { params.push(where.subjectId); conds.push(`subject_id = $${params.length}`) }
  if (where.campaignId) { params.push(where.campaignId); conds.push(`campaign_id = $${params.length}`) }
  if (where.kinds?.length) { params.push(where.kinds); conds.push(`kind = any($${params.length})`) }
  if (!where.subjectId && !where.campaignId) throw new Error('cancelJobs needs a subject or campaign')
  const res = await db.query(`update cm_jobs set status = 'cancelled', result = $1 where ${conds.join(' and ')}`, params)
  return res.rowCount ?? 0
}

export interface TaskInput {
  automationKey: string | null
  campaignId: string
  participationId?: string | null
  deliverableId?: string | null
  type: string
  title: string
  description?: string | null
  audience?: 'internal' | 'creator'
  assigneeUserId?: string | null
  dueAt?: Date | null
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  createdByUserId?: string | null
  eventId?: string | null
}

/** Create a task once per automation key. Returns the id (new or existing). */
export async function ensureTask(db: Queryable, t: TaskInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into cm_tasks (automation_key, campaign_id, participation_id, deliverable_id, type, title, description,
        audience, assignee_user_id, due_at, priority, created_by_user_id, created_by_event_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (automation_key) do nothing
     returning id`,
    [t.automationKey, t.campaignId, t.participationId ?? null, t.deliverableId ?? null, t.type, t.title,
      t.description ?? null, t.audience ?? 'internal', t.assigneeUserId ?? null, t.dueAt ?? null,
      t.priority ?? 'normal', t.createdByUserId ?? null, t.eventId ?? null],
  )
  if (rows[0]) return rows[0].id
  const existing = await db.query<{ id: string }>(`select id from cm_tasks where automation_key = $1`, [t.automationKey])
  return existing.rows[0].id
}

/** Close open automated tasks of the given types for a deliverable/participation. */
export async function closeTasks(
  db: Queryable,
  where: { deliverableId?: string; participationId?: string; campaignId?: string; types?: string[] },
  status: 'done' | 'cancelled',
  now: Date,
  reason?: string,
): Promise<number> {
  const conds = [`status in ('open','in_progress')`]
  const params: unknown[] = [status, now, reason ?? null]
  if (where.deliverableId) { params.push(where.deliverableId); conds.push(`deliverable_id = $${params.length}`) }
  if (where.participationId) { params.push(where.participationId); conds.push(`participation_id = $${params.length}`) }
  if (where.campaignId) { params.push(where.campaignId); conds.push(`campaign_id = $${params.length}`) }
  if (where.types?.length) { params.push(where.types); conds.push(`type = any($${params.length})`) }
  const res = await db.query(
    `update cm_tasks set status = $1, completed_at = case when $1 = 'done' then $2::timestamptz else completed_at end,
            cancel_reason = case when $1 = 'cancelled' then $3 else cancel_reason end, version = version + 1
      where ${conds.join(' and ')}`,
    params,
  )
  return res.rowCount ?? 0
}

export type Relevance =
  | { deliverableId: string; statuses: string[]; dueField?: 'submission_due_at' | 'publication_due_at'; dueAt?: string }
  | { participationId: string; participationStatuses: string[] }
  | { shortlistId: string; shortlistStatuses: string[] }

export interface NotificationInput {
  campaignId: string | null
  /** required when there is no campaign */
  organizationId?: string | null
  jobId?: string | null
  audience: 'internal' | 'client' | 'creator' | 'agent' | 'agency'
  recipientUserId?: string | null
  recipientGrantId?: string | null
  toAddress: string
  subject: string
  bodyText: string
  linkPath: string | null
  idempotencyKey: string
  correlationId: string
  relevance?: Relevance | null
}

export async function queueNotification(db: Queryable, n: NotificationInput, now: Date): Promise<void> {
  await db.query(
    `insert into cm_notifications (organization_id, campaign_id, job_id, channel, audience, recipient_user_id, recipient_grant_id, to_address,
        subject, body_text, link_path, relevance, idempotency_key, correlation_id, next_attempt_at)
     values (coalesce($14::uuid, (select organization_id from cm_campaigns where id = $1::uuid)),$1,$2,'email',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (idempotency_key) do nothing`,
    [n.campaignId, n.jobId ?? null, n.audience, n.recipientUserId ?? null, n.recipientGrantId ?? null, n.toAddress,
      n.subject, n.bodyText, n.linkPath, n.relevance ?? null, n.idempotencyKey, n.correlationId, now, n.organizationId ?? null],
  )
}

export async function cancelNotifications(db: Queryable, campaignId: string, reason: string): Promise<number> {
  const res = await db.query(
    `update cm_notifications set status = 'cancelled', last_error = $2
      where campaign_id = $1 and status in ('pending','failed')`,
    [campaignId, reason],
  )
  return res.rowCount ?? 0
}
