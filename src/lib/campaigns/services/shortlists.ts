/**
 * Candidate lists. A shortlist VERSION freezes which participations are being
 * decided and a client-visible snapshot of each (no fees, no internal notes).
 * Decisions are recorded against (item, shortlist version, stage), so a client
 * approval can only ever cover the candidates that were in front of them; a
 * creator added later goes into the next version.
 *
 *   internal_review  → manager decides each item (approve / changes / reject)
 *   client_review    → only internally approved items are shown to the client
 *   completed        → every shown item has a client decision
 *   superseded       → withdrawn by the manager before completion
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Ctx } from '../context'
import { many, one, pgCode, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { actorIds, actorLabel } from '../context'
import { DomainError, invalid, notFound, precondition } from '../errors'
import { requireCampaign, requireClientCampaign, requireInternal, requirePortal } from '../auth/policy'
import { SELECTION_MACHINE, assertTransition, type SelectionStatus } from '../domain/state-machines'
import { closeTasks, ensureTask } from '../jobs/queue'
import { sendTo } from '../jobs/automation'
import { clientRecipients, ownerRecipient } from './recipients'
import { parseInput, zOptText, zUuid } from '../validation'

async function clientSnapshot(db: Queryable, participationId: string) {
  return one<Record<string, unknown>>(db,
    `select cr.display_name, cr.categories, p.deliverables_summary, p.client_visible_notes,
            coalesce((select json_agg(json_build_object('platform', s.platform, 'handle', s.handle, 'profile_url', s.profile_url,
                       'follower_count', s.follower_count) order by s.platform)
               from cm_creator_social_accounts s where s.creator_id = cr.id), '[]') as accounts
       from cm_participations p join cm_creators cr on cr.id = p.creator_id where p.id = $1`, [participationId])
}

export async function createShortlist(ctx: Ctx, campaignId: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const actor = requireInternal(ctx.actor)
  const v = parseInput(z.object({ participation_ids: z.array(zUuid).min(1, 'יש לבחור מועמדים').max(100), note: zOptText(2000) }), input)
  return withTx(async (tx) => {
    await tx.query(`select id from cm_campaigns where id = $1 for update`, [campaignId])
    const open = await one(tx, `select 1 from cm_shortlists where campaign_id = $1 and status in ('internal_review','client_review')`, [campaignId])
    if (open) throw precondition('יש כבר רשימת מועמדים פתוחה. סיימו או בטלו אותה לפני יצירת גרסה חדשה.')
    const ver = await one<{ n: number }>(tx, `select coalesce(max(version_number), 0) + 1 as n from cm_shortlists where campaign_id = $1`, [campaignId])
    const s = await one<{ id: string }>(tx,
      `insert into cm_shortlists (campaign_id, version_number, note, created_by) values ($1,$2,$3,$4) returning id`,
      [campaignId, ver!.n, v.note, actor.userId])
    for (const pid of Array.from(new Set(v.participation_ids))) {
      const p = await one<{ id: string; selection_status: SelectionStatus; client_reapproval_required: boolean; terms_version: number }>(tx,
        `select id, selection_status, client_reapproval_required, terms_version from cm_participations where id = $1 and campaign_id = $2 for update`,
        [pid, campaignId])
      if (!p) throw invalid('אחד המועמדים אינו שייך לקמפיין')
      const eligible = p.selection_status === 'proposed' || (p.selection_status === 'approved' && p.client_reapproval_required)
      if (!eligible) throw precondition('אפשר לכלול ברשימה רק מועמדים במצב "מוצע" או מאושרים שנדרש להם אישור מחדש')
      assertTransition(SELECTION_MACHINE, p.selection_status, 'internal_review', 'מועמד')
      await tx.query(`insert into cm_shortlist_items (shortlist_id, participation_id, participation_terms_version, client_snapshot) values ($1,$2,$3,$4)`,
        [s!.id, pid, p.terms_version, await clientSnapshot(tx, pid)])
      await tx.query(`update cm_participations set selection_status = 'internal_review', version = version + 1 where id = $1`, [pid])
    }
    await ensureTask(tx, { automationKey: `s:${s!.id}:internal_review`, campaignId, type: 'shortlist_internal_review',
      title: `בדיקה פנימית של רשימת מועמדים גרסה ${ver!.n}`, assigneeUserId: actor.userId })
    await audit(tx, ctx, { campaignId, entityType: 'shortlist', entityId: s!.id, action: 'shortlist.created',
      summary: `נוצרה רשימת מועמדים גרסה ${ver!.n} (${v.participation_ids.length} מועמדים) לבדיקה פנימית` })
    return { id: s!.id, version_number: ver!.n }
  }, ctx.db)
}

async function lockShortlist(db: Queryable, id: string) {
  const s = await one<{ id: string; campaign_id: string; version_number: number; status: string }>(db,
    `select id, campaign_id, version_number, status from cm_shortlists where id = $1 for update`, [id])
  if (!s) throw notFound('רשימת המועמדים')
  return s
}

const decisionSchema = z.object({
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  feedback: zOptText(2000),
  shortlist_version: z.number().int().positive(),
})

/**
 * Record one decision. Repeating the same decision is a no-op (double click);
 * a different decision on the same item/version/stage is a conflict.
 */
async function recordDecision(tx: Queryable, ctx: Ctx, args: {
  campaignId: string; itemId: string; version: number; stage: 'internal' | 'client'; decision: string; feedback: string | null
}): Promise<'created' | 'same'> {
  if (args.decision !== 'approved' && !args.feedback) throw invalid('בקשת שינוי או דחייה מחייבת הערה')
  const ids = actorIds(ctx.actor)
  try {
    await tx.query('savepoint dec')
    await tx.query(
      `insert into cm_approval_decisions (campaign_id, target_type, target_id, target_version, approval_stage, decision, feedback,
         actor_user_id, actor_grant_id, actor_label, decided_at)
       values ($1,'shortlist_item',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [args.campaignId, args.itemId, args.version, args.stage, args.decision, args.feedback, ids.userId, ids.grantId, actorLabel(ctx.actor), ctx.now])
    await tx.query('release savepoint dec')
    return 'created'
  } catch (e) {
    await tx.query('rollback to savepoint dec')
    if (pgCode(e) !== '23505') throw e
    const prev = await one<{ decision: string }>(tx, `select decision from cm_approval_decisions where target_type = 'shortlist_item'
      and target_id = $1 and target_version = $2 and approval_stage = $3`, [args.itemId, args.version, args.stage])
    if (prev?.decision === args.decision) return 'same'
    throw new DomainError('CONFLICT', 'כבר התקבלה החלטה אחרת על מועמד זה בגרסה זו של הרשימה')
  }
}

export async function internalShortlistDecision(ctx: Ctx, shortlistId: string, itemId: string, input: unknown) {
  const v = parseInput(decisionSchema, input)
  return withTx(async (tx) => {
    const s = await lockShortlist(tx, shortlistId)
    await requireCampaign(tx, ctx, s.campaign_id, 'manage')
    if (s.version_number !== v.shortlist_version || s.status !== 'internal_review') {
      throw new DomainError('STALE_TARGET', 'הרשימה כבר אינה בבדיקה פנימית (ייתכן שנשלחה ללקוח או הוחלפה). רעננו את הדף.')
    }
    const item = await one<{ id: string; participation_id: string }>(tx,
      `select id, participation_id from cm_shortlist_items where id = $1 and shortlist_id = $2 for update`, [itemId, shortlistId])
    if (!item) throw notFound('המועמד ברשימה')
    const r = await recordDecision(tx, ctx, { campaignId: s.campaign_id, itemId, version: s.version_number, stage: 'internal', decision: v.decision, feedback: v.feedback })
    if (r === 'same') return { idempotent: true }
    await tx.query(`update cm_shortlist_items set internal_decision = $2 where id = $1`, [itemId, v.decision])
    if (v.decision !== 'approved') {
      const to: SelectionStatus = v.decision === 'rejected' ? 'rejected' : 'changes_requested'
      await tx.query(`update cm_participations set selection_status = $2, version = version + 1 where id = $1`, [item.participation_id, to])
    }
    await audit(tx, ctx, { campaignId: s.campaign_id, entityType: 'shortlist_item', entityId: itemId, action: `shortlist.internal_${v.decision}`,
      summary: `החלטה פנימית על מועמד (רשימה גרסה ${s.version_number}): ${v.decision}${v.feedback ? ` — ${v.feedback}` : ''}` })
    return { idempotent: false }
  }, ctx.db)
}

export async function sendShortlistToClient(ctx: Ctx, shortlistId: string) {
  return withTx(async (tx) => {
    const s = await lockShortlist(tx, shortlistId)
    await requireCampaign(tx, ctx, s.campaign_id, 'manage')
    if (s.status === 'client_review') return { idempotent: true }
    if (s.status !== 'internal_review') throw precondition('אפשר לשלוח ללקוח רק רשימה שבבדיקה פנימית')
    const counts = await one<{ pending: number; approved: number }>(tx,
      `select count(*) filter (where internal_decision = 'pending')::int as pending, count(*) filter (where internal_decision = 'approved')::int as approved
         from cm_shortlist_items where shortlist_id = $1`, [shortlistId])
    if (counts!.pending > 0) throw precondition(`נותרו ${counts!.pending} מועמדים ללא החלטה פנימית`)
    if (counts!.approved === 0) throw precondition('אין מועמדים שאושרו פנימית לשליחה ללקוח')
    const clients = await clientRecipients(tx, s.campaign_id, ctx.now)
    await tx.query(`update cm_shortlists set status = 'client_review', sent_to_client_at = $2 where id = $1`, [shortlistId, ctx.now])
    await tx.query(`update cm_participations p set selection_status = 'client_review', version = version + 1
       from cm_shortlist_items si where si.shortlist_id = $1 and si.participation_id = p.id and si.internal_decision = 'approved'`, [shortlistId])
    await closeTasks(tx, { campaignId: s.campaign_id, types: ['shortlist_internal_review'] }, 'done', ctx.now)
    const camp = await one<{ name: string; owner_user_id: string }>(tx, `select name, owner_user_id from cm_campaigns where id = $1`, [s.campaign_id])
    await ensureTask(tx, { automationKey: `s:${shortlistId}:await_client`, campaignId: s.campaign_id, type: 'await_client_shortlist',
      title: `מעקב: אישור לקוח לרשימת מועמדים גרסה ${s.version_number}`, assigneeUserId: camp!.owner_user_id,
      dueAt: new Date(ctx.now.getTime() + 2 * 86_400_000) })
    await sendTo(tx, clients, {
      campaignId: s.campaign_id, key: `s:${shortlistId}:sent`, correlationId: randomUUID(),
      subject: `רשימת משפיענים ממתינה לאישורך — "${camp!.name}"`,
      body: `שלום,\nרשימת המשפיענים המוצעת לקמפיין "${camp!.name}" ממתינה לאישורך. אפשר לאשר, לדחות או לבקש החלפה לכל משפיען.`,
      internalPath: null, portalPath: '/portal',
      relevance: { shortlistId, shortlistStatuses: ['client_review'] },
    }, ctx.now)
    await audit(tx, ctx, { campaignId: s.campaign_id, entityType: 'shortlist', entityId: shortlistId, action: 'shortlist.sent_to_client',
      summary: `רשימה גרסה ${s.version_number} נשלחה ללקוח (${counts!.approved} מועמדים)${clients.length ? '' : ' — אין עדיין נציג לקוח עם הזמנה פעילה'}` })
    return { idempotent: false, client_recipients: clients.length }
  }, ctx.db)
}

export async function supersedeShortlist(ctx: Ctx, shortlistId: string, input: unknown) {
  const v = parseInput(z.object({ reason: z.string().trim().min(3, 'יש לציין סיבה').max(1000) }), input)
  return withTx(async (tx) => {
    const s = await lockShortlist(tx, shortlistId)
    await requireCampaign(tx, ctx, s.campaign_id, 'manage')
    if (!['internal_review', 'client_review'].includes(s.status)) throw precondition('הרשימה כבר סגורה')
    await tx.query(`update cm_shortlists set status = 'superseded', completed_at = $2 where id = $1`, [shortlistId, ctx.now])
    // Undecided candidates go back to "proposed" for the next version.
    await tx.query(`update cm_participations p set selection_status = 'proposed', version = version + 1
       from cm_shortlist_items si where si.shortlist_id = $1 and si.participation_id = p.id
        and p.selection_status in ('internal_review','client_review')`, [shortlistId])
    await closeTasks(tx, { campaignId: s.campaign_id, types: ['shortlist_internal_review', 'await_client_shortlist'] }, 'cancelled', ctx.now, 'הרשימה בוטלה')
    await audit(tx, ctx, { campaignId: s.campaign_id, entityType: 'shortlist', entityId: shortlistId, action: 'shortlist.superseded',
      summary: `רשימה גרסה ${s.version_number} בוטלה: ${v.reason}` })
    return { ok: true }
  }, ctx.db)
}

export async function listShortlists(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  const lists = await many<{ id: string; version_number: number; status: string; note: string | null; created_at: Date; sent_to_client_at: Date | null; completed_at: Date | null }>(ctx.db,
    `select id, version_number, status, note, created_at, sent_to_client_at, completed_at from cm_shortlists where campaign_id = $1 order by version_number desc`, [campaignId])
  const items = await many<{ shortlist_id: string }>(ctx.db,
    `select si.id, si.shortlist_id, si.participation_id, si.participation_terms_version, si.client_snapshot, si.internal_decision, si.client_decision,
            (select json_agg(json_build_object('stage', a.approval_stage, 'decision', a.decision, 'feedback', a.feedback, 'actor', a.actor_label, 'at', a.decided_at) order by a.decided_at)
               from cm_approval_decisions a join cm_shortlists s2 on s2.id = si.shortlist_id
              where a.target_type = 'shortlist_item' and a.target_id = si.id and a.target_version = s2.version_number) as decisions
       from cm_shortlist_items si join cm_shortlists s on s.id = si.shortlist_id where s.campaign_id = $1 order by si.created_at`, [campaignId])
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.shortlist_id === l.id) }))
}

// ── Client portal ──────────────────────────────────────────────────────────

/** What the client sees: only internally approved items, only snapshot fields. */
export async function clientShortlists(ctx: Ctx) {
  const actor = requirePortal(ctx.actor)
  await requireClientCampaign(ctx.db, actor)
  const lists = await many<{ id: string; version_number: number; status: string; sent_to_client_at: Date | null }>(ctx.db,
    `select id, version_number, status, sent_to_client_at from cm_shortlists where campaign_id = $1 and status in ('client_review','completed')
      order by version_number desc`, [actor.campaignId])
  const items = await many<{ shortlist_id: string }>(ctx.db,
    `select si.id, si.shortlist_id, si.client_snapshot, si.client_decision,
            (select a.feedback from cm_approval_decisions a where a.target_type = 'shortlist_item' and a.target_id = si.id
                and a.approval_stage = 'client' and a.target_version = s.version_number) as client_feedback
       from cm_shortlist_items si join cm_shortlists s on s.id = si.shortlist_id
      where s.campaign_id = $1 and s.status in ('client_review','completed') and si.internal_decision = 'approved'
      order by si.created_at`, [actor.campaignId])
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.shortlist_id === l.id) }))
}

export async function clientShortlistDecision(ctx: Ctx, itemId: string, input: unknown) {
  const actor = requirePortal(ctx.actor)
  const v = parseInput(decisionSchema, input)
  return withTx(async (tx) => {
    await requireClientCampaign(tx, actor)
    const item = await one<{ id: string; shortlist_id: string; participation_id: string; internal_decision: string }>(tx,
      `select si.id, si.shortlist_id, si.participation_id, si.internal_decision from cm_shortlist_items si
         join cm_shortlists s on s.id = si.shortlist_id where si.id = $1 and s.campaign_id = $2`, [itemId, actor.campaignId])
    if (!item || item.internal_decision !== 'approved') throw notFound('המועמד')
    const s = await lockShortlist(tx, item.shortlist_id)
    if (s.version_number !== v.shortlist_version) {
      throw new DomainError('STALE_TARGET', 'הרשימה שאישרת הוחלפה בגרסה חדשה. רעננו את הדף כדי לראות את הרשימה העדכנית.')
    }
    if (s.status !== 'client_review') {
      const prev = await one<{ decision: string }>(tx, `select decision from cm_approval_decisions where target_type = 'shortlist_item'
         and target_id = $1 and target_version = $2 and approval_stage = 'client'`, [itemId, s.version_number])
      if (prev?.decision === v.decision) return { idempotent: true }
      throw new DomainError('STALE_TARGET', 'הרשימה כבר אינה פתוחה לאישור. רעננו את הדף.')
    }
    const r = await recordDecision(tx, ctx, { campaignId: s.campaign_id, itemId, version: s.version_number, stage: 'client', decision: v.decision, feedback: v.feedback })
    if (r === 'same') return { idempotent: true }
    await tx.query(`update cm_shortlist_items set client_decision = $2 where id = $1`, [itemId, v.decision])
    const to: SelectionStatus = v.decision === 'approved' ? 'approved' : v.decision === 'rejected' ? 'rejected' : 'changes_requested'
    const p = await one<{ selection_status: SelectionStatus; creator_id: string }>(tx,
      `select selection_status, creator_id from cm_participations where id = $1 for update`, [item.participation_id])
    assertTransition(SELECTION_MACHINE, p!.selection_status, to, 'מועמד')
    await tx.query(`update cm_participations set selection_status = $2,
        client_reapproval_required = case when $2 = 'approved' then false else client_reapproval_required end, version = version + 1
       where id = $1`, [item.participation_id, to])
    const owner = await ownerRecipient(tx, s.campaign_id)
    const cr = await one<{ display_name: string }>(tx, `select display_name from cm_creators where id = $1`, [p!.creator_id])
    if (to === 'approved') {
      const ps = await one<{ participation_status: string }>(tx, `select participation_status from cm_participations where id = $1`, [item.participation_id])
      if (ps?.participation_status === 'not_invited') {
        await ensureTask(tx, { automationKey: `p:${item.participation_id}:invite`, campaignId: s.campaign_id, participationId: item.participation_id,
          type: 'invite_creator', title: `להזמין את ${cr?.display_name} (הלקוח אישר)`, assigneeUserId: owner?.userId ?? null,
          dueAt: new Date(ctx.now.getTime() + 2 * 86_400_000), priority: 'high' })
      }
    }
    const remaining = await one<{ n: number }>(tx, `select count(*)::int as n from cm_shortlist_items where shortlist_id = $1
      and internal_decision = 'approved' and client_decision = 'pending'`, [s.id])
    if ((remaining?.n ?? 0) === 0) {
      await tx.query(`update cm_shortlists set status = 'completed', completed_at = $2 where id = $1`, [s.id, ctx.now])
      await closeTasks(tx, { campaignId: s.campaign_id, types: ['await_client_shortlist'] }, 'done', ctx.now)
      await sendTo(tx, [owner], {
        campaignId: s.campaign_id, key: `s:${s.id}:completed`, correlationId: randomUUID(),
        subject: `הלקוח השלים החלטות על רשימת המועמדים (גרסה ${s.version_number})`,
        body: `כל המועמדים ברשימה גרסה ${s.version_number} קיבלו החלטת לקוח.`,
        internalPath: `/campaigns/${s.campaign_id}?tab=creators`, portalPath: null,
      }, ctx.now)
    }
    await audit(tx, ctx, { campaignId: s.campaign_id, entityType: 'shortlist_item', entityId: itemId, action: `shortlist.client_${v.decision}`,
      summary: `החלטת לקוח על ${cr?.display_name} (רשימה גרסה ${s.version_number}): ${v.decision}${v.feedback ? ` — ${v.feedback}` : ''}` })
    return { idempotent: false }
  }, ctx.db)
}
