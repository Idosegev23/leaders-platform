/**
 * Deliverables, content versions, approvals, publications and metrics.
 *
 * Content approval rules (enforced here, in one place):
 *  - A decision names the version it is about. If that version is no longer
 *    current, the decision is refused with STALE_TARGET.
 *  - A new version makes it current; earlier decisions stay in history but no
 *    longer count, because validity is "decision on the CURRENT version".
 *  - Client approval requires an internal approval of the same version.
 *  - Changes requested / rejected require a comment.
 *  - One decision per (version, stage): a double click is a no-op, a
 *    different second decision is a conflict.
 *  - "Publication verified" requires an authorized manager, an evidence file
 *    and the actual publication time.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Ctx } from '../context'
import { actorIds, actorLabel } from '../context'
import { many, one, pgCode, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, forbidden, invalid, notFound, precondition, versionConflict } from '../errors'
import {
  isUuid, portalParticipationScope, portalScopeParams, requireCampaign, requireInternal, requirePortal, requirePortalDeliverable, requirePortalParticipation,
} from '../auth/policy'
import { DELIVERABLE_MACHINE, SUBMITTABLE, WORKING_PARTICIPATION, assertTransition, type DeliverableStatus } from '../domain/state-machines'
import { closeTasks, ensureTask } from '../jobs/queue'
import {
  PUBLICATION_JOB_KINDS, SUBMISSION_JOB_KINDS, cancelDeliverableJobs, scheduleMetricsCheck, schedulePublicationJobs,
  scheduleSubmissionJobs, sendTo,
} from '../jobs/automation'
import { clientRecipients, ownerRecipient, participationRecipients, userRecipient } from './recipients'
import { requireReadyAsset } from './assets'
import { METRIC_NAMES } from '../domain/report-metrics'
import {
  parseInput, zOptBusinessDateTime, zOptText, zOptUrl, zRequiredText, zUrl, zVersion, zBusinessDateTime,
} from '../validation'

const TYPES = ['post', 'reel', 'story', 'video', 'short', 'live', 'other'] as const
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'other'] as const
const zList = z.array(z.string().trim().min(1).max(200)).max(30).default([])

export interface DeliverableRow {
  id: string; participation_id: string; campaign_id: string; title: string; status: DeliverableStatus
  submission_due_at: Date | null; publication_due_at: Date | null; current_version_id: string | null
  assigned_reviewer_id: string | null; first_submitted_at: Date | null; submission_breached_at: Date | null
  publication_breached_at: Date | null; version: number
}

async function lockDeliverable(db: Queryable, id: string): Promise<DeliverableRow> {
  if (!isUuid(id)) throw notFound('התוצר')
  const d = await one<DeliverableRow>(db,
    `select id, participation_id, campaign_id, title, status, submission_due_at, publication_due_at, current_version_id,
            assigned_reviewer_id, first_submitted_at, submission_breached_at, publication_breached_at, version
       from cm_deliverables where id = $1 for update`, [id])
  if (!d) throw notFound('התוצר')
  return d
}

const campaignLive = async (db: Queryable, campaignId: string) => {
  const c = await one<{ status: string; name: string; owner_user_id: string }>(db, `select status, name, owner_user_id from cm_campaigns where id = $1`, [campaignId])
  if (!c || ['closed', 'cancelled'].includes(c.status)) throw precondition('הקמפיין סגור או מבוטל')
  return c
}

// ── Create / update / cancel ───────────────────────────────────────────────

export const createDeliverableSchema = z.object({
  title: zRequiredText(200),
  type: z.enum(TYPES),
  platform: z.enum(PLATFORMS),
  description: zOptText(5000),
  submission_due_at: zOptBusinessDateTime,
  publication_due_at: zOptBusinessDateTime,
  required_tags: zList,
  required_mentions: zList,
  required_links: zList,
  assigned_reviewer_id: z.string().uuid().optional().nullable(),
})

export async function createDeliverable(ctx: Ctx, participationId: string, input: unknown) {
  const v = parseInput(createDeliverableSchema, input)
  if (v.submission_due_at && v.publication_due_at && v.publication_due_at < v.submission_due_at) {
    throw invalid('מועד הפרסום מוקדם ממועד ההגשה')
  }
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    const p = await one<{ id: string; campaign_id: string; participation_status: string; creator_id: string }>(tx,
      `select id, campaign_id, participation_status, creator_id from cm_participations where id = $1 for update`, [participationId])
    if (!p) throw notFound('ההשתתפות')
    await requireCampaign(tx, ctx, p.campaign_id, 'manage')
    await campaignLive(tx, p.campaign_id)
    if (['cancelled', 'completed', 'declined'].includes(p.participation_status)) throw precondition('לא ניתן להוסיף תוצר להשתתפות זו')
    for (const l of v.required_links) if (!/^https?:\/\//i.test(l)) throw invalid(`קישור נדרש לא תקין: ${l}`)
    const d = await one<DeliverableRow>(tx,
      `insert into cm_deliverables (participation_id, campaign_id, title, type, platform, description, submission_due_at, publication_due_at,
          required_tags, required_mentions, required_links, assigned_reviewer_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id, participation_id, campaign_id, title, status, submission_due_at, publication_due_at`,
      [p.id, p.campaign_id, v.title, v.type, v.platform, v.description, v.submission_due_at ?? null, v.publication_due_at ?? null,
        v.required_tags, v.required_mentions, v.required_links, v.assigned_reviewer_id ?? null, actor.userId])
    // A material change for an already-accepted creator.
    if (['accepted', 'active'].includes(p.participation_status)) {
      await ensureTask(tx, { automationKey: `d:${d!.id}:submit`, campaignId: p.campaign_id, participationId: p.id, deliverableId: d!.id,
        type: 'submit_content', title: `הגשת תוכן: ${v.title}`, audience: 'creator', dueAt: v.submission_due_at ?? null })
      await scheduleSubmissionJobs(tx, d!, ctx.now)
      await tx.query(`update cm_participations set terms_version = terms_version + 1, creator_reacceptance_required = true, version = version + 1 where id = $1`, [p.id])
    }
    await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'deliverable', entityId: d!.id, action: 'deliverable.created',
      summary: `נוסף תוצר "${v.title}"`, changes: { submission_due_at: v.submission_due_at, publication_due_at: v.publication_due_at } })
    return { id: d!.id }
  }, ctx.db)
}

export const updateDeliverableSchema = z.object({
  expected_version: zVersion,
  title: zRequiredText(200).optional(),
  description: zOptText(5000),
  type: z.enum(TYPES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  required_tags: zList.optional(),
  required_mentions: zList.optional(),
  required_links: zList.optional(),
  assigned_reviewer_id: z.string().uuid().nullable().optional(),
  submission_due_at: zOptBusinessDateTime,
  publication_due_at: zOptBusinessDateTime,
  deadline_change_reason: zOptText(1000),
})

/**
 * Deadline changes keep history (cm_deadline_changes + immutable original_*).
 * Moving a deadline that has ALREADY passed without the work done records the
 * breach first, so the lateness survives the change. Reminders for the old
 * deadline are cancelled and new ones scheduled.
 */
export async function updateDeliverable(ctx: Ctx, id: string, input: unknown) {
  const v = parseInput(updateDeliverableSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const d = await lockDeliverable(tx, id)
    await requireCampaign(tx, ctx, d.campaign_id, 'manage')
    if (d.version !== v.expected_version) throw versionConflict()
    if (['cancelled', 'publication_verified'].includes(d.status)) throw precondition('לא ניתן לערוך תוצר שבוטל או שפרסומו אומת')
    const actor = requireInternal(ctx.actor)
    const sets: string[] = []
    const params: unknown[] = [id]
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    for (const k of ['title', 'description', 'type', 'platform', 'required_tags', 'required_mentions', 'required_links', 'assigned_reviewer_id'] as const) {
      if (k in raw) set(k, (v as Record<string, unknown>)[k] ?? null)
    }
    const changes: { field: 'submission_due_at' | 'publication_due_at'; old: Date | null; neu: Date | null }[] = []
    for (const f of ['submission_due_at', 'publication_due_at'] as const) {
      if (!(f in raw)) continue
      const neu = (v[f] ?? null) as Date | null
      const old = d[f] ? new Date(d[f] as Date) : null
      if ((old?.getTime() ?? null) === (neu?.getTime() ?? null)) continue
      changes.push({ field: f, old, neu })
      set(f, neu)
    }
    if (changes.length && !v.deadline_change_reason) throw invalid('שינוי מועד מחייב סיבה')
    const subDue = changes.find((c) => c.field === 'submission_due_at')
    const pubDue = changes.find((c) => c.field === 'publication_due_at')
    const finalSub = subDue ? subDue.neu : d.submission_due_at
    const finalPub = pubDue ? pubDue.neu : d.publication_due_at
    if (finalSub && finalPub && new Date(finalPub) < new Date(finalSub)) throw invalid('מועד הפרסום מוקדם ממועד ההגשה')
    // Record a breach that already happened before the deadline moves away.
    if (subDue?.old && subDue.old < ctx.now && !d.first_submitted_at && !d.submission_breached_at) set('submission_breached_at', subDue.old)
    if (pubDue?.old && pubDue.old < ctx.now && ['approved'].includes(d.status) && !d.publication_breached_at) set('publication_breached_at', pubDue.old)
    if (!sets.length) return { id, version: d.version }
    const r = await one<DeliverableRow & { version: number }>(tx,
      `update cm_deliverables set ${sets.join(', ')}, version = version + 1 where id = $1
       returning id, participation_id, campaign_id, title, status, submission_due_at, publication_due_at, version`, params)
    for (const c of changes) {
      await tx.query(`insert into cm_deadline_changes (deliverable_id, field, old_value, new_value, reason, changed_by, changed_at)
        values ($1,$2,$3,$4,$5,$6,$7)`, [id, c.field, c.old, c.neu, v.deadline_change_reason, actor.userId, ctx.now])
    }
    if (subDue) {
      await cancelDeliverableJobs(tx, id, SUBMISSION_JOB_KINDS, 'deadline changed')
      const p = await one<{ participation_status: string }>(tx, `select participation_status from cm_participations where id = $1`, [d.participation_id])
      if (p && WORKING_PARTICIPATION.includes(p.participation_status as never)) await scheduleSubmissionJobs(tx, r!, ctx.now)
      await tx.query(`update cm_tasks set due_at = $2 where deliverable_id = $1 and type in ('submit_content') and status in ('open','in_progress')`, [id, subDue.neu])
    }
    if (pubDue) {
      await cancelDeliverableJobs(tx, id, PUBLICATION_JOB_KINDS, 'deadline changed')
      await schedulePublicationJobs(tx, r!, ctx.now)
      await tx.query(`update cm_tasks set due_at = $2 where deliverable_id = $1 and type in ('publish_content') and status in ('open','in_progress')`, [id, pubDue.neu])
    }
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: id, action: changes.length ? 'deliverable.deadline_changed' : 'deliverable.updated',
      summary: changes.length ? `מועד שונה: ${v.deadline_change_reason}` : 'פרטי התוצר עודכנו',
      changes: Object.fromEntries(changes.map((c) => [c.field, { from: c.old, to: c.neu }])) })
    return { id, version: r!.version }
  }, ctx.db)
}

export async function cancelDeliverable(ctx: Ctx, id: string, input: unknown) {
  const v = parseInput(z.object({ expected_version: zVersion, reason: z.string().trim().min(3, 'ביטול מחייב סיבה').max(1000) }), input)
  return withTx(async (tx) => {
    const d = await lockDeliverable(tx, id)
    await requireCampaign(tx, ctx, d.campaign_id, 'manage')
    if (d.version !== v.expected_version) throw versionConflict()
    assertTransition(DELIVERABLE_MACHINE, d.status, 'cancelled', 'תוצר')
    await tx.query(`update cm_deliverables set status = 'cancelled', status_reason = $2, version = version + 1 where id = $1`, [id, v.reason])
    await cancelDeliverableJobs(tx, id, undefined, 'deliverable cancelled')
    await closeTasks(tx, { deliverableId: id }, 'cancelled', ctx.now, v.reason)
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: id, action: 'deliverable.cancelled', summary: `התוצר "${d.title}" בוטל: ${v.reason}` })
    return { ok: true }
  }, ctx.db)
}

// ── Submitting versions ────────────────────────────────────────────────────

export const submitVersionSchema = z.object({
  asset_id: z.string().uuid().optional().nullable(),
  external_url: zOptUrl,
  caption: zOptText(5000),
  creator_notes: zOptText(2000),
  /** the version the submitter last saw; guards against two people submitting at once */
  based_on_version_id: z.string().uuid().nullable().optional(),
})

export async function submitVersion(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(submitVersionSchema, input)
  if (!v.asset_id && !v.external_url) throw invalid('יש לצרף קובץ או קישור לתוכן')
  return withTx(async (tx) => {
    if (ctx.actor.kind === 'portal') {
      if (ctx.actor.grantKind === 'client') throw forbidden()
      await requirePortalDeliverable(tx, ctx.actor, deliverableId)
    }
    const d = await lockDeliverable(tx, deliverableId)
    if (ctx.actor.kind === 'internal') await requireCampaign(tx, ctx, d.campaign_id, 'operate')
    else if (ctx.actor.kind !== 'portal') throw forbidden()
    const camp = await campaignLive(tx, d.campaign_id)
    const p = await one<{ participation_status: string; creator_id: string }>(tx,
      `select participation_status, creator_id from cm_participations where id = $1 for update`, [d.participation_id])
    if (!p || !WORKING_PARTICIPATION.includes(p.participation_status as never)) throw precondition('אפשר להגיש תוכן רק אחרי אישור ההשתתפות')
    if (!SUBMITTABLE.includes(d.status)) throw precondition(`לא ניתן להגיש גרסה כשהתוצר במצב "${d.status}"`)
    if (v.based_on_version_id !== undefined && (v.based_on_version_id ?? null) !== d.current_version_id) {
      throw new DomainError('STALE_TARGET', 'הוגשה בינתיים גרסה אחרת לתוצר זה. רעננו את הדף לפני הגשה נוספת.')
    }
    if (v.asset_id) await requireReadyAsset(tx, ctx, v.asset_id, { campaignId: d.campaign_id, participationId: d.participation_id, purposes: ['content'] })
    const num = await one<{ n: number }>(tx, `select coalesce(max(version_number),0) + 1 as n from cm_content_versions where deliverable_id = $1`, [d.id])
    const ids = actorIds(ctx.actor)
    const ver = await one<{ id: string }>(tx,
      `insert into cm_content_versions (deliverable_id, version_number, asset_id, external_url, caption, creator_notes, submitted_by_user_id,
          submitted_by_grant_id, submitted_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [d.id, num!.n, v.asset_id ?? null, v.external_url ?? null, v.caption, v.creator_notes, ids.userId, ids.grantId, ctx.now])
    if (d.status !== 'submitted') assertTransition(DELIVERABLE_MACHINE, d.status, 'submitted', 'תוצר')
    const late = !d.first_submitted_at && d.submission_due_at && ctx.now > new Date(d.submission_due_at) && !d.submission_breached_at
    await tx.query(
      `update cm_deliverables set status = 'submitted', current_version_id = $2, first_submitted_at = coalesce(first_submitted_at, $3),
              submission_breached_at = case when $4 then submission_due_at else submission_breached_at end, version = version + 1
        where id = $1`, [d.id, ver!.id, ctx.now, !!late])
    if (p.participation_status === 'accepted') {
      await tx.query(`update cm_participations set participation_status = 'active', version = version + 1 where id = $1`, [d.participation_id])
    }
    // Automation 5: submission closes the submit/revise tasks, cancels reminders, opens internal review.
    await closeTasks(tx, { deliverableId: d.id, types: ['submit_content', 'revise_content', 'chase_submission'] }, 'done', ctx.now)
    await closeTasks(tx, { deliverableId: d.id, types: ['internal_review', 'await_client_content'] }, 'cancelled', ctx.now, 'הוגשה גרסה חדשה')
    await cancelDeliverableJobs(tx, d.id, SUBMISSION_JOB_KINDS, 'submitted')
    const reviewer = d.assigned_reviewer_id ?? camp.owner_user_id
    await ensureTask(tx, { automationKey: `v:${ver!.id}:internal_review`, campaignId: d.campaign_id, participationId: d.participation_id,
      deliverableId: d.id, type: 'internal_review', title: `בדיקה פנימית: ${d.title} (גרסה ${num!.n})`, assigneeUserId: reviewer,
      dueAt: new Date(ctx.now.getTime() + 2 * 86_400_000), priority: 'high' })
    const cr = await one<{ display_name: string }>(tx, `select display_name from cm_creators where id = $1`, [p.creator_id])
    await sendTo(tx, [await userRecipient(tx, reviewer)], {
      campaignId: d.campaign_id, key: `v:${ver!.id}:submitted`, correlationId: randomUUID(),
      subject: `הוגשה גרסה ${num!.n}: ${cr?.display_name} — "${d.title}"`,
      body: `${cr?.display_name} הגיש/ה גרסה ${num!.n} לתוצר "${d.title}" בקמפיין "${camp.name}". ממתין לבדיקה פנימית.`,
      internalPath: `/campaigns/${d.campaign_id}/deliverables/${d.id}`, portalPath: null,
      relevance: { deliverableId: d.id, statuses: ['submitted', 'internal_review'] },
    }, ctx.now)
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'content.version_submitted',
      summary: `הוגשה גרסה ${num!.n}${late ? ' (באיחור)' : ''}`, changes: { version_id: ver!.id, version_number: num!.n, asset: !!v.asset_id, url: !!v.external_url } })
    return { version_id: ver!.id, version_number: num!.n }
  }, ctx.db)
}

export async function startReview(ctx: Ctx, deliverableId: string) {
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    const d = await lockDeliverable(tx, deliverableId)
    await requireCampaign(tx, ctx, d.campaign_id, 'operate')
    if (d.status === 'internal_review') return { idempotent: true }
    assertTransition(DELIVERABLE_MACHINE, d.status, 'internal_review', 'תוצר')
    await tx.query(`update cm_deliverables set status = 'internal_review', assigned_reviewer_id = coalesce(assigned_reviewer_id, $2), version = version + 1 where id = $1`,
      [d.id, actor.userId])
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'content.review_started', summary: 'החלה בדיקה פנימית' })
    return { idempotent: false }
  }, ctx.db)
}

// ── Decisions ──────────────────────────────────────────────────────────────

async function recordContentDecision(tx: Queryable, ctx: Ctx, args: {
  campaignId: string; versionId: string; versionNumber: number; stage: 'internal' | 'client'; decision: string; feedback: string | null
}): Promise<'created' | 'same'> {
  if (args.decision !== 'approved' && !args.feedback) throw invalid('בקשת תיקון או דחייה מחייבת הערה')
  const ids = actorIds(ctx.actor)
  await tx.query('savepoint cdec')
  try {
    await tx.query(
      `insert into cm_approval_decisions (campaign_id, target_type, target_id, target_version, approval_stage, decision, feedback,
         actor_user_id, actor_grant_id, actor_label, decided_at)
       values ($1,'content_version',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [args.campaignId, args.versionId, args.versionNumber, args.stage, args.decision, args.feedback, ids.userId, ids.grantId, actorLabel(ctx.actor), ctx.now])
    await tx.query('release savepoint cdec')
    return 'created'
  } catch (e) {
    await tx.query('rollback to savepoint cdec')
    if (pgCode(e) !== '23505') throw e
    const prev = await one<{ decision: string }>(tx, `select decision from cm_approval_decisions where target_type = 'content_version'
       and target_id = $1 and approval_stage = $2`, [args.versionId, args.stage])
    if (prev?.decision === args.decision) return 'same'
    throw new DomainError('CONFLICT', 'כבר התקבלה החלטה אחרת על גרסה זו')
  }
}

const contentDecisionSchema = z.object({
  version_id: z.string().uuid('חסרה גרסה'),
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  feedback: zOptText(4000),
})

async function versionNumber(db: Queryable, versionId: string, deliverableId: string) {
  const v = await one<{ version_number: number }>(db, `select version_number from cm_content_versions where id = $1 and deliverable_id = $2`, [versionId, deliverableId])
  if (!v) throw notFound('הגרסה')
  return v.version_number
}

export async function internalContentDecision(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(contentDecisionSchema, input)
  return withTx(async (tx) => {
    const d = await lockDeliverable(tx, deliverableId)
    await requireCampaign(tx, ctx, d.campaign_id, 'manage')
    const camp = await campaignLive(tx, d.campaign_id)
    const num = await versionNumber(tx, v.version_id, d.id)
    if (d.current_version_id !== v.version_id) {
      throw new DomainError('STALE_TARGET', `גרסה ${num} כבר הוחלפה בגרסה חדשה יותר. ההחלטה לא נשמרה; פתחו את הגרסה הנוכחית.`)
    }
    if (!['submitted', 'internal_review'].includes(d.status)) {
      const prev = await one<{ decision: string }>(tx, `select decision from cm_approval_decisions where target_type = 'content_version'
         and target_id = $1 and approval_stage = 'internal'`, [v.version_id])
      if (prev?.decision === v.decision) return { idempotent: true }
      throw precondition('הגרסה אינה ממתינה לבדיקה פנימית')
    }
    const r = await recordContentDecision(tx, ctx, { campaignId: d.campaign_id, versionId: v.version_id, versionNumber: num, stage: 'internal', decision: v.decision, feedback: v.feedback })
    if (r === 'same') return { idempotent: true }
    await closeTasks(tx, { deliverableId: d.id, types: ['internal_review'] }, 'done', ctx.now)
    if (v.decision === 'approved') {
      assertTransition(DELIVERABLE_MACHINE, d.status, 'client_review', 'תוצר')
      await tx.query(`update cm_deliverables set status = 'client_review', version = version + 1 where id = $1`, [d.id])
      // Automation 6: internal approval opens client approval.
      await ensureTask(tx, { automationKey: `v:${v.version_id}:await_client`, campaignId: d.campaign_id, participationId: d.participation_id,
        deliverableId: d.id, type: 'await_client_content', title: `מעקב: אישור לקוח ל"${d.title}" (גרסה ${num})`,
        assigneeUserId: camp.owner_user_id, dueAt: new Date(ctx.now.getTime() + 2 * 86_400_000) })
      await sendTo(tx, await clientRecipients(tx, d.campaign_id, ctx.now), {
        campaignId: d.campaign_id, key: `v:${v.version_id}:to_client`, correlationId: randomUUID(),
        subject: `תוכן ממתין לאישורך — "${camp.name}"`,
        body: `תוכן חדש בקמפיין "${camp.name}" ממתין לאישורך: "${d.title}" (גרסה ${num}).`,
        internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
        relevance: { deliverableId: d.id, statuses: ['client_review'] },
      }, ctx.now)
    } else {
      await requestChanges(tx, ctx, d, v.version_id, num, v.feedback as string, 'internal', camp.name)
    }
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: `content.internal_${v.decision}`,
      summary: `החלטה פנימית על גרסה ${num}: ${v.decision}${v.feedback ? ` — ${v.feedback}` : ''}` })
    return { idempotent: false }
  }, ctx.db)
}

/** Automation 7: changes requested → task + message for the creator. */
async function requestChanges(tx: Queryable, ctx: Ctx, d: DeliverableRow, versionId: string, num: number, feedback: string, stage: 'internal' | 'client', campaignName: string) {
  await tx.query(`update cm_deliverables set status = 'changes_requested', version = version + 1 where id = $1`, [d.id])
  await closeTasks(tx, { deliverableId: d.id, types: ['await_client_content'] }, 'done', ctx.now)
  await ensureTask(tx, { automationKey: `v:${versionId}:revise`, campaignId: d.campaign_id, participationId: d.participation_id, deliverableId: d.id,
    type: 'revise_content', title: `תיקונים ל"${d.title}" (גרסה ${num})`, description: feedback, audience: 'creator', dueAt: d.submission_due_at })
  await sendTo(tx, await participationRecipients(tx, d.participation_id, ctx.now), {
    campaignId: d.campaign_id, key: `v:${versionId}:changes:${stage}`, correlationId: randomUUID(),
    subject: `נדרשים תיקונים: "${d.title}" (${campaignName})`,
    body: `התקבלו הערות על גרסה ${num} של "${d.title}". ההערות מחכות בפורטל, ושם אפשר להעלות גרסה מתוקנת.`,
    internalPath: null, portalPath: `/portal/deliverables/${d.id}`,
    relevance: { deliverableId: d.id, statuses: ['changes_requested'] },
  }, ctx.now)
}

export async function clientContentDecision(ctx: Ctx, deliverableId: string, input: unknown) {
  const actor = requirePortal(ctx.actor)
  if (actor.grantKind !== 'client') throw forbidden()
  const v = parseInput(contentDecisionSchema.extend({ decision: z.enum(['approved', 'changes_requested']) }), input)
  return withTx(async (tx) => {
    await requirePortalDeliverable(tx, actor, deliverableId)
    const d = await lockDeliverable(tx, deliverableId)
    const camp = await campaignLive(tx, d.campaign_id)
    const num = await versionNumber(tx, v.version_id, d.id)
    if (d.current_version_id !== v.version_id) {
      throw new DomainError('STALE_TARGET', `הגרסה שצפית בה (גרסה ${num}) הוחלפה בגרסה חדשה. ההחלטה לא נשמרה; רעננו כדי לראות את הגרסה העדכנית.`)
    }
    const internalOk = await one(tx, `select 1 from cm_approval_decisions where target_type = 'content_version' and target_id = $1
      and approval_stage = 'internal' and decision = 'approved'`, [v.version_id])
    if (!internalOk) throw precondition('הגרסה טרם אושרה פנימית')
    if (d.status !== 'client_review') {
      const prev = await one<{ decision: string }>(tx, `select decision from cm_approval_decisions where target_type = 'content_version'
         and target_id = $1 and approval_stage = 'client'`, [v.version_id])
      if (prev?.decision === v.decision) return { idempotent: true }
      throw new DomainError('STALE_TARGET', 'התוכן כבר אינו ממתין להחלטתך. רעננו את הדף.')
    }
    const r = await recordContentDecision(tx, ctx, { campaignId: d.campaign_id, versionId: v.version_id, versionNumber: num, stage: 'client', decision: v.decision, feedback: v.feedback })
    if (r === 'same') return { idempotent: true }
    if (v.decision === 'approved') {
      await tx.query(`update cm_deliverables set status = 'approved', version = version + 1 where id = $1`, [d.id])
      await closeTasks(tx, { deliverableId: d.id, types: ['await_client_content'] }, 'done', ctx.now)
      // Automation 8: client approval → publishing task + publication deadline watch.
      await ensureTask(tx, { automationKey: `v:${v.version_id}:publish`, campaignId: d.campaign_id, participationId: d.participation_id,
        deliverableId: d.id, type: 'publish_content', title: `לפרסם ולדווח קישור: ${d.title}`, audience: 'creator', dueAt: d.publication_due_at })
      await schedulePublicationJobs(tx, { ...d, status: 'approved' }, ctx.now)
      await sendTo(tx, [await ownerRecipient(tx, d.campaign_id), ...(await participationRecipients(tx, d.participation_id, ctx.now))], {
        campaignId: d.campaign_id, key: `v:${v.version_id}:client_approved`, correlationId: randomUUID(),
        subject: `התוכן אושר: "${d.title}" (${camp.name})`,
        body: `הלקוח אישר את גרסה ${num} של "${d.title}".${d.publication_due_at ? ' מועד הפרסום מופיע בפורטל.' : ''} לאחר הפרסום יש לדווח את הקישור.`,
        internalPath: `/campaigns/${d.campaign_id}/deliverables/${d.id}`, portalPath: `/portal/deliverables/${d.id}`,
        relevance: { deliverableId: d.id, statuses: ['approved'] },
      }, ctx.now)
    } else {
      await requestChanges(tx, ctx, d, v.version_id, num, v.feedback as string, 'client', camp.name)
    }
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: `content.client_${v.decision}`,
      summary: `החלטת לקוח על גרסה ${num}: ${v.decision}${v.feedback ? ` — ${v.feedback}` : ''} (מיוחס למחזיק/ת קישור ההזמנה)` })
    return { idempotent: false }
  }, ctx.db)
}

// ── Comments ───────────────────────────────────────────────────────────────

export async function addComment(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(z.object({
    version_id: z.string().uuid(),
    body: zRequiredText(4000),
    video_timestamp_seconds: z.number().min(0).max(36_000).nullable().optional(),
    visibility: z.enum(['internal', 'shared']).default('shared'),
  }), input)
  return withTx(async (tx) => {
    let visibility = v.visibility
    if (ctx.actor.kind === 'portal') {
      await requirePortalDeliverable(tx, ctx.actor, deliverableId)
      visibility = 'shared'
    }
    const d = await one<{ campaign_id: string }>(tx, `select campaign_id from cm_deliverables where id = $1`, [deliverableId])
    if (!d) throw notFound('התוצר')
    if (ctx.actor.kind === 'internal') await requireCampaign(tx, ctx, d.campaign_id, 'operate')
    if (ctx.actor.kind === 'portal' && ctx.actor.grantKind === 'client') {
      const ok = await one(tx, `select 1 from cm_approval_decisions where target_type = 'content_version' and target_id = $1 and approval_stage = 'internal' and decision = 'approved'`, [v.version_id])
      if (!ok) throw notFound('הגרסה')
    }
    await versionNumber(tx, v.version_id, deliverableId)
    const ids = actorIds(ctx.actor)
    const c = await one<{ id: string }>(tx, `insert into cm_content_comments (content_version_id, body, video_timestamp_seconds, visibility, author_user_id, author_grant_id)
      values ($1,$2,$3,$4,$5,$6) returning id`, [v.version_id, v.body, v.video_timestamp_seconds ?? null, visibility, ids.userId, ids.grantId])
    return { id: c!.id }
  }, ctx.db)
}

// ── Publication ────────────────────────────────────────────────────────────

export const reportPublicationSchema = z.object({
  published_url: zUrl,
  reported_published_at: zBusinessDateTime,
  evidence_asset_id: z.string().uuid().optional().nullable(),
})

export async function reportPublication(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(reportPublicationSchema, input)
  if (v.reported_published_at > new Date(ctx.now.getTime() + 10 * 60_000)) throw invalid('מועד הפרסום לא יכול להיות בעתיד')
  return withTx(async (tx) => {
    if (ctx.actor.kind === 'portal') {
      if (ctx.actor.grantKind === 'client') throw forbidden()
      await requirePortalDeliverable(tx, ctx.actor, deliverableId)
    }
    const d = await lockDeliverable(tx, deliverableId)
    if (ctx.actor.kind === 'internal') await requireCampaign(tx, ctx, d.campaign_id, 'operate')
    const camp = await campaignLive(tx, d.campaign_id)
    if (!['approved', 'publication_reported'].includes(d.status)) throw precondition('אפשר לדווח פרסום רק אחרי אישור הלקוח לתוכן')
    if (v.evidence_asset_id) await requireReadyAsset(tx, ctx, v.evidence_asset_id, { campaignId: d.campaign_id, participationId: d.participation_id, purposes: ['evidence'] })
    const ids = actorIds(ctx.actor)
    await tx.query(
      `insert into cm_publications (deliverable_id, published_url, reported_published_at, reported_by_user_id, reported_by_grant_id, evidence_asset_id)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (deliverable_id) do update set published_url = excluded.published_url, reported_published_at = excluded.reported_published_at,
         reported_by_user_id = excluded.reported_by_user_id, reported_by_grant_id = excluded.reported_by_grant_id,
         evidence_asset_id = coalesce(excluded.evidence_asset_id, cm_publications.evidence_asset_id),
         verification_status = 'reported', verified_by = null, verified_at = null, version = cm_publications.version + 1`,
      [d.id, v.published_url, v.reported_published_at, ids.userId, ids.grantId, v.evidence_asset_id ?? null])
    if (d.status !== 'publication_reported') {
      await tx.query(`update cm_deliverables set status = 'publication_reported', version = version + 1 where id = $1`, [d.id])
    }
    // Automation 10: report → verification task for the manager.
    await closeTasks(tx, { deliverableId: d.id, types: ['publish_content', 'chase_publication'] }, 'done', ctx.now)
    await cancelDeliverableJobs(tx, d.id, PUBLICATION_JOB_KINDS, 'publication reported')
    await ensureTask(tx, { automationKey: `d:${d.id}:verify:${v.reported_published_at.toISOString()}`, campaignId: d.campaign_id,
      participationId: d.participation_id, deliverableId: d.id, type: 'verify_publication', title: `לאמת פרסום: ${d.title}`,
      assigneeUserId: camp.owner_user_id, dueAt: new Date(ctx.now.getTime() + 86_400_000), priority: 'high' })
    await sendTo(tx, [await ownerRecipient(tx, d.campaign_id)], {
      campaignId: d.campaign_id, key: `d:${d.id}:reported:${v.reported_published_at.toISOString()}`, correlationId: randomUUID(),
      subject: `דווח פרסום: "${d.title}" (${camp.name})`, body: `דווח קישור פרסום: ${v.published_url}\nיש לאמת את הפרסום במערכת.`,
      internalPath: `/campaigns/${d.campaign_id}/deliverables/${d.id}`, portalPath: null,
      relevance: { deliverableId: d.id, statuses: ['publication_reported'] },
    }, ctx.now)
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'publication.reported',
      summary: `דווח פרסום (${v.published_url})`, changes: { reported_published_at: v.reported_published_at } })
    return { ok: true }
  }, ctx.db)
}

export const verifyPublicationSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  actual_published_at: zOptBusinessDateTime,
  evidence_asset_id: z.string().uuid().optional().nullable(),
  notes: zOptText(2000),
  expected_publication_version: z.number().int().positive(),
})

export async function verifyPublication(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(verifyPublicationSchema, input)
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    const d = await lockDeliverable(tx, deliverableId)
    await requireCampaign(tx, ctx, d.campaign_id, 'manage')
    if (d.status !== 'publication_reported') throw precondition('אין פרסום שממתין לאימות')
    const pub = await one<{ id: string; version: number; evidence_asset_id: string | null; reported_published_at: Date }>(tx,
      `select id, version, evidence_asset_id, reported_published_at from cm_publications where deliverable_id = $1 for update`, [d.id])
    if (!pub) throw precondition('אין פרסום שממתין לאימות')
    if (pub.version !== v.expected_publication_version) throw new DomainError('STALE_TARGET', 'דיווח הפרסום עודכן בינתיים. רעננו ובדקו שוב.')
    if (v.decision === 'rejected') {
      if (!v.notes) throw invalid('דחיית דיווח מחייבת הסבר')
      await tx.query(`update cm_publications set verification_status = 'rejected', verification_notes = $2, verified_by = $3, verified_at = $4, version = version + 1 where id = $1`,
        [pub.id, v.notes, actor.userId, ctx.now])
      await tx.query(`update cm_deliverables set status = 'approved', version = version + 1 where id = $1`, [d.id])
      await closeTasks(tx, { deliverableId: d.id, types: ['verify_publication'] }, 'done', ctx.now)
      await ensureTask(tx, { automationKey: `d:${d.id}:republish:${ctx.now.getTime()}`, campaignId: d.campaign_id, participationId: d.participation_id,
        deliverableId: d.id, type: 'publish_content', title: `לתקן את דיווח הפרסום: ${d.title}`, description: v.notes, audience: 'creator', dueAt: d.publication_due_at })
      await sendTo(tx, await participationRecipients(tx, d.participation_id, ctx.now), {
        campaignId: d.campaign_id, key: `d:${d.id}:pub_rejected:${pub.version}`, correlationId: randomUUID(),
        subject: `דיווח הפרסום של "${d.title}" דורש תיקון`, body: `דיווח הפרסום לא אומת: ${v.notes}`,
        internalPath: null, portalPath: `/portal/deliverables/${d.id}`, relevance: { deliverableId: d.id, statuses: ['approved'] },
      }, ctx.now)
      await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'publication.rejected', summary: `דיווח הפרסום נדחה: ${v.notes}` })
      return { status: 'approved' }
    }
    const evidence = v.evidence_asset_id ?? pub.evidence_asset_id
    if (!evidence) throw invalid('אימות פרסום מחייב אסמכתה (צילום מסך של הפרסום)')
    if (!v.actual_published_at) throw invalid('יש להזין את מועד הפרסום בפועל')
    if (v.actual_published_at > new Date(ctx.now.getTime() + 10 * 60_000)) throw invalid('מועד הפרסום לא יכול להיות בעתיד')
    await requireReadyAsset(tx, ctx, evidence, { campaignId: d.campaign_id, purposes: ['evidence'] })
    await tx.query(`update cm_publications set verification_status = 'verified', verified_by = $2, verified_at = $3, actual_published_at = $4,
        evidence_asset_id = $5, verification_notes = $6, version = version + 1 where id = $1`,
      [pub.id, actor.userId, ctx.now, v.actual_published_at, evidence, v.notes])
    const late = d.publication_due_at && v.actual_published_at > new Date(d.publication_due_at) && !d.publication_breached_at
    await tx.query(`update cm_deliverables set status = 'publication_verified',
        publication_breached_at = case when $2 then publication_due_at else publication_breached_at end, version = version + 1 where id = $1`, [d.id, !!late])
    await closeTasks(tx, { deliverableId: d.id, types: ['verify_publication', 'chase_publication'] }, 'done', ctx.now)
    await scheduleMetricsCheck(tx, d, ctx.now)
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'publication.verified',
      summary: `הפרסום אומת${late ? ' (פורסם אחרי המועד)' : ''}`, changes: { actual_published_at: v.actual_published_at } })
    return { status: 'publication_verified' }
  }, ctx.db)
}

// ── Metrics ────────────────────────────────────────────────────────────────

export const metricsSchema = z.object({
  captured_at: zBusinessDateTime,
  measurement_period: z.enum(['24h', '48h', '7d', '14d', '30d', 'lifetime']).default('lifetime'),
  source_type: z.enum(['creator_reported', 'manager_entered', 'platform_export']).optional(),
  evidence_asset_id: z.string().uuid().optional().nullable(),
  /** empty / missing = not provided (NOT zero). 0 is a valid value. */
  values: z.record(z.enum(METRIC_NAMES), z.union([z.number(), z.string(), z.null()])),
})

export async function addMetrics(ctx: Ctx, deliverableId: string, input: unknown) {
  const v = parseInput(metricsSchema, input)
  const entries: { name: string; value: number }[] = []
  for (const [name, raw] of Object.entries(v.values)) {
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) continue
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
    if (!Number.isInteger(n) || n < 0) throw invalid(`ערך לא תקין עבור ${name}: יש להזין מספר שלם אי-שלילי`)
    entries.push({ name, value: n })
  }
  if (!entries.length) throw invalid('לא הוזן אף נתון')
  if (v.captured_at > new Date(ctx.now.getTime() + 10 * 60_000)) throw invalid('מועד האיסוף לא יכול להיות בעתיד')
  return withTx(async (tx) => {
    if (ctx.actor.kind === 'portal') {
      if (ctx.actor.grantKind === 'client') throw forbidden()
      await requirePortalDeliverable(tx, ctx.actor, deliverableId)
    }
    const d = await lockDeliverable(tx, deliverableId)
    if (ctx.actor.kind === 'internal') await requireCampaign(tx, ctx, d.campaign_id, 'operate')
    const pub = await one<{ id: string; verification_status: string }>(tx, `select id, verification_status from cm_publications where deliverable_id = $1`, [d.id])
    if (!pub || pub.verification_status === 'rejected') throw precondition('אפשר להזין ביצועים רק לפרסום שדווח')
    if (v.evidence_asset_id) await requireReadyAsset(tx, ctx, v.evidence_asset_id, { campaignId: d.campaign_id, purposes: ['metric_evidence', 'evidence'] })
    const source = ctx.actor.kind === 'portal' ? 'creator_reported' : (v.source_type ?? 'manager_entered')
    const ids = actorIds(ctx.actor)
    for (const e of entries) {
      await tx.query(`insert into cm_metric_observations (campaign_id, deliverable_id, publication_id, metric_name, metric_value, source_type,
          captured_at, measurement_period, evidence_asset_id, entered_by_user_id, entered_by_grant_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [d.campaign_id, d.id, pub.id, e.name, e.value, source, v.captured_at, v.measurement_period, v.evidence_asset_id ?? null, ids.userId, ids.grantId])
    }
    await closeTasks(tx, { deliverableId: d.id, types: ['collect_metrics'] }, 'done', ctx.now)
    await audit(tx, ctx, { campaignId: d.campaign_id, entityType: 'deliverable', entityId: d.id, action: 'metrics.entered',
      summary: `הוזנו ${entries.length} נתוני ביצועים (${source === 'creator_reported' ? 'דיווח יוצר' : 'הזנה ידנית'})`,
      changes: Object.fromEntries(entries.map((e) => [e.name, e.value])) })
    return { saved: entries.length }
  }, ctx.db)
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listCampaignDeliverables(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  return many(ctx.db,
    `select d.id, d.participation_id, cr.display_name as creator_name, d.title, d.type, d.platform, d.status,
            d.submission_due_at, d.publication_due_at, d.original_submission_due_at, d.original_publication_due_at,
            d.submission_breached_at, d.publication_breached_at, d.first_submitted_at, d.version,
            (select max(version_number) from cm_content_versions v where v.deliverable_id = d.id) as versions,
            pub.published_url, pub.verification_status
       from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
       left join cm_publications pub on pub.deliverable_id = d.id
      where d.campaign_id = $1
      order by coalesce(d.submission_due_at, d.created_at), cr.display_name`, [campaignId])
}

/**
 * Full deliverable view. `audience` decides what is included:
 *  internal → everything; creator/agent → no internal comments; client →
 *  only internally approved versions and shared comments.
 */
export async function getDeliverable(ctx: Ctx, deliverableId: string) {
  let audienceKind: 'internal' | 'creator' | 'client'
  let accessLevel: 'manage' | 'operate' | null = null
  if (ctx.actor.kind === 'internal') {
    const d0 = await one<{ campaign_id: string }>(ctx.db, `select campaign_id from cm_deliverables where id = $1`, [isUuid(deliverableId) ? deliverableId : null])
    if (!d0) throw notFound('התוצר')
    accessLevel = (await requireCampaign(ctx.db, ctx, d0.campaign_id, 'operate')).level
    audienceKind = 'internal'
  } else {
    const actor = requirePortal(ctx.actor)
    await requirePortalDeliverable(ctx.db, actor, deliverableId)
    audienceKind = actor.grantKind === 'client' ? 'client' : 'creator'
  }
  const d = await one<Record<string, unknown> & { campaign_id: string; participation_id: string }>(ctx.db,
    `select d.id, d.campaign_id, d.participation_id, d.title, d.type, d.platform, d.description, d.status, d.status_reason,
            d.submission_due_at, d.publication_due_at, d.original_submission_due_at, d.original_publication_due_at,
            d.required_tags, d.required_mentions, d.required_links, d.current_version_id, d.assigned_reviewer_id,
            d.first_submitted_at, d.submission_breached_at, d.publication_breached_at, d.version,
            c.name as campaign_name, cr.display_name as creator_name, p.participation_status
       from cm_deliverables d join cm_campaigns c on c.id = d.campaign_id
       join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
      where d.id = $1`, [deliverableId])
  if (!d) throw notFound('התוצר')
  const clientOnly = audienceKind === 'client'
  const versions = await many<{ id: string }>(ctx.db,
    `select v.id, v.version_number, v.asset_id, v.external_url, v.caption, v.creator_notes, v.submitted_at,
            a.mime_type, a.original_filename,
            coalesce((select json_agg(json_build_object('stage', ad.approval_stage, 'decision', ad.decision, 'feedback', ad.feedback,
                       'actor', ad.actor_label, 'at', ad.decided_at) order by ad.decided_at)
               from cm_approval_decisions ad where ad.target_type = 'content_version' and ad.target_id = v.id
                 and ($2::boolean = false or ad.approval_stage = 'client' or ad.decision = 'approved')), '[]') as decisions,
            coalesce((select json_agg(json_build_object('id', cc.id, 'body', cc.body, 'ts', cc.video_timestamp_seconds, 'visibility', cc.visibility,
                       'at', cc.created_at, 'author', coalesce(u.full_name, g.recipient_name)) order by cc.created_at)
               from cm_content_comments cc left join cm_accounts u on u.id = cc.author_user_id left join cm_portal_grants g on g.id = cc.author_grant_id
              where cc.content_version_id = v.id and ($3::boolean = false or cc.visibility = 'shared')), '[]') as comments
       from cm_content_versions v left join cm_assets a on a.id = v.asset_id
      where v.deliverable_id = $1
        and ($2::boolean = false or exists (select 1 from cm_approval_decisions x where x.target_type = 'content_version' and x.target_id = v.id
                                              and x.approval_stage = 'internal' and x.decision = 'approved'))
      order by v.version_number desc`, [deliverableId, clientOnly, audienceKind !== 'internal'])
  const publication = await one(ctx.db,
    `select id, published_url, reported_published_at, actual_published_at, verification_status, verified_at, verification_notes,
            evidence_asset_id, version from cm_publications where deliverable_id = $1`, [deliverableId])
  const metrics = await many(ctx.db,
    `select id, metric_name, metric_value::text, source_type, captured_at, measurement_period, evidence_asset_id, created_at
       from cm_metric_observations where deliverable_id = $1 order by captured_at desc, metric_name`, [deliverableId])
  const deadlineHistory = audienceKind === 'client' ? [] : await many(ctx.db,
    `select field, old_value, new_value, reason, changed_at from cm_deadline_changes where deliverable_id = $1 order by changed_at`, [deliverableId])
  const history = audienceKind === 'internal' ? await many(ctx.db,
    `select action, summary, actor_label, created_at from cm_audit_events where entity_type = 'deliverable' and entity_id = $1 order by created_at desc limit 100`, [deliverableId]) : []
  const { assigned_reviewer_id: _r, ...pub } = d
  void _r
  return {
    deliverable: audienceKind === 'internal' ? d : pub,
    versions, publication, metrics: audienceKind === 'client' ? [] : metrics, deadlineHistory, history,
    audience: audienceKind, access_level: accessLevel,
  }
}

/**
 * Influencer-side portal (creator, agent, talent agency): participations,
 * deliverables and open tasks, across every campaign the grant covers or for
 * one selected campaign. Never internal notes, never other creators.
 */
export async function portalParticipations(ctx: Ctx, campaignId?: string | null) {
  const actor = requirePortal(ctx.actor)
  if (actor.grantKind === 'client') throw forbidden()
  if (campaignId && !isUuid(campaignId)) throw notFound('הקמפיין')
  const rows = await many<{ id: string; campaign_id: string }>(ctx.db,
    `select p.id, p.campaign_id, c.name as campaign_name, c.description as campaign_description, c.status as campaign_status,
            to_char(c.start_date,'YYYY-MM-DD') as campaign_start, to_char(c.end_date,'YYYY-MM-DD') as campaign_end,
            cr.display_name as creator_name, a.display_name as agent_name, ta.name as agency_name,
            p.selection_status, p.participation_status, p.agreed_fee::text, p.currency,
            c.amounts_include_vat, p.deliverables_summary, to_char(p.rights_expires_at,'YYYY-MM-DD') as rights_expires_at, p.rights_notes,
            p.contract_reference, p.terms_version, p.accepted_terms_version, p.creator_reacceptance_required, p.client_visible_notes
       from cm_participations p join cm_campaigns c on c.id = p.campaign_id join cm_creators cr on cr.id = p.creator_id
       left join cm_agents a on a.id = p.agent_id left join cm_talent_agencies ta on ta.id = cr.talent_agency_id
      where ${portalParticipationScope(actor, '$1', '$2', '$3')} and ($4::uuid is null or p.campaign_id = $4::uuid)
        and c.status <> 'cancelled'
      order by c.start_date desc nulls last, c.name, cr.display_name`, [...portalScopeParams(actor), campaignId ?? null])
  const ids = rows.map((r) => r.id)
  const deliverables = ids.length ? await many(ctx.db,
    `select d.id, d.participation_id, d.title, d.type, d.platform, d.status, d.submission_due_at, d.publication_due_at, d.current_version_id
       from cm_deliverables d where d.participation_id = any($1) and d.status <> 'cancelled' order by d.submission_due_at nulls last`, [ids]) : []
  const tasks = ids.length ? await many(ctx.db,
    `select id, participation_id, deliverable_id, type, title, description, due_at from cm_tasks
      where participation_id = any($1) and audience = 'creator' and status in ('open','in_progress') order by due_at nulls last`, [ids]) : []
  const campaigns = Array.from(new Map(rows.map((r) => [r.campaign_id, r])).values())
    .map((r) => ({ id: r.campaign_id, name: (r as Record<string, unknown>).campaign_name as string }))
  return { participations: rows, deliverables, tasks, campaigns }
}

export { requirePortalParticipation }
