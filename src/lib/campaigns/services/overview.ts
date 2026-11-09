/**
 * The manager's "what needs action now" view, the activity log, and the
 * message/job queue screen. All computed from live data; nothing hard-coded.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx } from '../db'
import { audit } from '../audit'
import { invalid, notFound } from '../errors'
import { requireCampaign } from '../auth/policy'
import { summarizeBudget, type BudgetCategory } from '../domain/budget'
import { parseInput } from '../validation'

export async function campaignOverview(ctx: Ctx, campaignId: string) {
  const acc = await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  const counts = await one<Record<string, number>>(ctx.db,
    `select
      (select count(*)::int from cm_participations where campaign_id = $1 and selection_status = 'approved' and participation_status not in ('cancelled','declined')) as creators_approved,
      (select count(*)::int from cm_participations where campaign_id = $1 and selection_status in ('proposed','internal_review','client_review','changes_requested')) as creators_pending_selection,
      (select count(*)::int from cm_participations where campaign_id = $1 and selection_status = 'approved' and participation_status in ('not_invited','invited')) as creators_awaiting_acceptance,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status <> 'cancelled') as deliverables_total,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'publication_verified') as deliverables_verified,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status in ('awaiting_submission','changes_requested') and submission_due_at < $2) as overdue_submissions,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status in ('submitted','internal_review')) as awaiting_internal,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'client_review') as awaiting_client,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'approved' and publication_due_at < $2) as overdue_publications,
      (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'publication_reported') as unverified_publications,
      (select count(*)::int from cm_deliverables d where campaign_id = $1 and status = 'publication_verified'
          and not exists (select 1 from cm_metric_observations m where m.deliverable_id = d.id)) as missing_metrics,
      (select count(*)::int from cm_tasks where campaign_id = $1 and status in ('open','in_progress') and audience = 'internal' and due_at < $2) as overdue_tasks,
      (select count(*)::int from cm_notifications where campaign_id = $1 and status in ('dead','uncertain')) as failed_messages,
      (select count(*)::int from cm_jobs where campaign_id = $1 and status = 'dead') as failed_jobs,
      (select count(*)::int from cm_participations where campaign_id = $1 and rights_expires_at is not null
          and rights_expires_at <= ($2::timestamptz + interval '30 days')::date and participation_status <> 'cancelled') as rights_expiring,
      (select count(*)::int from cm_participations where campaign_id = $1 and (creator_reacceptance_required or client_reapproval_required)) as reapproval_needed`,
    [campaignId, ctx.now])

  // The concrete items behind "needs action", each with who is being waited on.
  const actions = await many<{ kind: string; deliverable_id: string | null; participation_id: string | null; title: string; creator_name: string; due_at: Date | null; waiting_on: string }>(ctx.db,
    `select * from (
       select 'overdue_submission' as kind, d.id as deliverable_id, d.participation_id, d.title, cr.display_name as creator_name, d.submission_due_at as due_at, 'creator' as waiting_on
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status in ('awaiting_submission','changes_requested') and d.submission_due_at < $2
       union all
       select 'awaiting_internal', d.id, d.participation_id, d.title, cr.display_name, d.submission_due_at, 'leaders'
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status in ('submitted','internal_review')
       union all
       select 'awaiting_client', d.id, d.participation_id, d.title, cr.display_name, null, 'client'
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status = 'client_review'
       union all
       select 'overdue_publication', d.id, d.participation_id, d.title, cr.display_name, d.publication_due_at, 'creator'
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status = 'approved' and d.publication_due_at < $2
       union all
       select 'verify_publication', d.id, d.participation_id, d.title, cr.display_name, null, 'leaders'
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status = 'publication_reported'
       union all
       select 'invite_creator', null, p.id, 'הזמנת יוצר', cr.display_name, null, 'leaders'
         from cm_participations p join cm_creators cr on cr.id = p.creator_id
        where p.campaign_id = $1 and p.selection_status = 'approved' and p.participation_status = 'not_invited'
       union all
       select 'awaiting_acceptance', null, p.id, 'אישור השתתפות', cr.display_name, null, 'creator'
         from cm_participations p join cm_creators cr on cr.id = p.creator_id
        where p.campaign_id = $1 and p.participation_status = 'invited'
     ) x order by due_at nulls last limit 50`, [campaignId, ctx.now])

  let budget = null
  const camp = await one<{ approved_budget: string | null; currency: string }>(ctx.db, `select approved_budget::text, currency from cm_campaigns where id = $1`, [campaignId])
  const lines = await many<{ amount: string; status: 'planned' | 'committed' | 'actual' | 'cancelled'; category: BudgetCategory }>(ctx.db,
    `select amount::text, status, category from cm_budget_lines where campaign_id = $1`, [campaignId])
  const s = summarizeBudget(camp!.approved_budget, lines)
  budget = { approved: s.approved?.toString() ?? null, exposure: s.exposure.toString(), overrun: s.overrun.toString(), available: s.available?.toString() ?? null, currency: camp!.currency }

  return { counts: counts!, actions, budget, accessLevel: acc.level }
}

export async function campaignActivity(ctx: Ctx, campaignId: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  const v = parseInput(z.object({ page: z.coerce.number().int().min(1).default(1), page_size: z.coerce.number().int().min(1).max(200).default(50) }), input)
  const rows = await many(ctx.db,
    `select id, entity_type, entity_id, action, actor_type, actor_label, summary, created_at from cm_audit_events
      where campaign_id = $1 order by created_at desc limit $2 offset $3`, [campaignId, v.page_size, (v.page - 1) * v.page_size])
  const total = await one<{ n: number }>(ctx.db, `select count(*)::int as n from cm_audit_events where campaign_id = $1`, [campaignId])
  return { rows, total: total?.n ?? 0, page: v.page, pageSize: v.page_size }
}

export async function campaignQueue(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const notifications = await many(ctx.db,
    `select id, audience, to_address, subject, status, provider, provider_message_id, attempts, max_attempts, next_attempt_at,
            last_error, correlation_id, sent_at, created_at
       from cm_notifications where campaign_id = $1 order by created_at desc limit 200`, [campaignId])
  const jobs = await many(ctx.db,
    `select id, kind, subject_type, subject_id, status, attempts, max_attempts, run_after, last_error, result, correlation_id, created_at, updated_at
       from cm_jobs where campaign_id = $1 order by run_after desc limit 200`, [campaignId])
  return { notifications, jobs }
}

/**
 * Manager-authorized retry. For an "uncertain" message the manager confirms
 * that resending is acceptable (it may arrive twice), or dismisses it.
 */
export async function retryNotification(ctx: Ctx, notificationId: string, input: unknown) {
  const v = parseInput(z.object({ action: z.enum(['retry', 'dismiss']), confirm_possible_duplicate: z.boolean().optional() }), input)
  const n = await one<{ campaign_id: string; status: string }>(ctx.db, `select campaign_id, status from cm_notifications where id = $1`, [notificationId])
  if (!n) throw notFound('ההודעה')
  await requireCampaign(ctx.db, ctx, n.campaign_id, 'manage')
  if (!['dead', 'uncertain', 'failed'].includes(n.status)) throw invalid('אפשר לנסות שוב רק הודעה שנכשלה')
  if (v.action === 'retry' && n.status === 'uncertain' && !v.confirm_possible_duplicate) {
    throw invalid('ייתכן שההודעה כבר נשלחה. כדי לשלוח שוב יש לאשר שייתכן כפל.')
  }
  return withTx(async (tx) => {
    if (v.action === 'retry') {
      await tx.query(`update cm_notifications set status = 'pending', attempts = 0, next_attempt_at = $2 where id = $1`, [notificationId, ctx.now])
    } else {
      await tx.query(`update cm_notifications set status = 'cancelled', last_error = coalesce(last_error,'') || ' | dismissed by manager' where id = $1`, [notificationId])
    }
    await audit(tx, ctx, { campaignId: n.campaign_id, entityType: 'notification', entityId: notificationId, action: `notification.${v.action}`,
      summary: v.action === 'retry' ? 'הודעה שנכשלה הוחזרה לתור השליחה' : 'הודעה שנכשלה סומנה כטופלה' })
    return { ok: true }
  }, ctx.db)
}

export async function retryJob(ctx: Ctx, jobId: string) {
  const j = await one<{ campaign_id: string; status: string }>(ctx.db, `select campaign_id, status from cm_jobs where id = $1`, [jobId])
  if (!j) throw notFound('העבודה')
  await requireCampaign(ctx.db, ctx, j.campaign_id, 'manage')
  if (!['dead', 'failed'].includes(j.status)) throw invalid('אפשר לנסות שוב רק עבודה שנכשלה')
  return withTx(async (tx) => {
    await tx.query(`update cm_jobs set status = 'pending', attempts = 0, run_after = $2 where id = $1`, [jobId, ctx.now])
    await audit(tx, ctx, { campaignId: j.campaign_id, entityType: 'job', entityId: jobId, action: 'job.retry', summary: 'עבודת רקע שנכשלה הוחזרה לתור' })
    return { ok: true }
  }, ctx.db)
}
