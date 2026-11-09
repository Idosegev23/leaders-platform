import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, forbidden, invalid, notFound, precondition, versionConflict } from '../errors'
import { canCreateCampaigns, internalCampaignScope, requireCampaign, requireInternal } from '../auth/policy'
import { CAMPAIGN_MACHINE, assertTransition, type CampaignStatus } from '../domain/state-machines'
import { parseMoney, toDecimal } from '../domain/money'
import { cancelJobs, cancelNotifications, closeTasks } from '../jobs/queue'
import { parseInput, zDate, zOptDate, zOptMoney, zOptText, zOptUrl, zOptUuid, zRequiredText, zUuid, zVersion } from '../validation'
import { PRODUCT } from '@/lib/campaigns/brand'

export const createCampaignSchema = z.object({
  client_id: zUuid,
  name: zRequiredText(200),
  description: zOptText(5000),
  objectives: zOptText(5000),
  external_project_reference: zOptText(100),
  brief_document_link_id: zOptUuid,
  brief_url: zOptUrl,
  owner_user_id: zOptUuid,
  start_date: zOptDate,
  end_date: zOptDate,
  currency: z.string().regex(/^[A-Z]{3}$/, 'מטבע לא תקין').default('ILS'),
  approved_budget: zOptMoney,
  amounts_include_vat: z.boolean().default(false),
})

export async function createCampaign(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  if (!canCreateCampaigns(actor)) throw forbidden('פתיחת קמפיין שמורה למנהלות קמפיין')
  const v = parseInput(createCampaignSchema, input)
  if (v.start_date && v.end_date && v.end_date < v.start_date) throw invalid('תאריך הסיום מוקדם מתאריך ההתחלה')
  const budget = v.approved_budget === null ? null : parseMoney(v.approved_budget)
  if (budget !== null && budget < BigInt(0)) throw invalid('תקציב לא יכול להיות שלילי')

  return withTx(async (tx) => {
    if (!(await one(tx, `select 1 from clients where id = $1`, [v.client_id]))) throw invalid('הלקוח שנבחר לא נמצא')
    if (v.brief_document_link_id && !(await one(tx, `select 1 from document_links where id = $1`, [v.brief_document_link_id]))) {
      throw invalid('הבריף שנבחר לא נמצא')
    }
    const ownerId = v.owner_user_id ?? actor.userId
    if (ownerId !== actor.userId) {
      const owner = await one<{ id: string }>(tx,
        `select u.id from users u left join cm_staff_roles r on r.user_id = u.id
          where u.id = $1 and u.is_active and (u.role = 'admin' or r.role in ('admin','manager'))`, [ownerId])
      if (!owner) throw invalid('האחראית שנבחרה אינה מנהלת קמפיין פעילה')
    }
    const c = await one<{ id: string }>(tx,
      `insert into cm_campaigns (client_id, name, description, objectives, external_project_reference, brief_document_link_id,
          brief_url, owner_user_id, start_date, end_date, currency, approved_budget, amounts_include_vat, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [v.client_id, v.name, v.description, v.objectives, v.external_project_reference, v.brief_document_link_id ?? null,
        v.brief_url ?? null, ownerId, v.start_date ?? null, v.end_date ?? null, v.currency,
        budget === null ? null : toDecimal(budget), v.amounts_include_vat, actor.userId],
    )
    await audit(tx, ctx, {
      campaignId: c!.id, entityType: 'campaign', entityId: c!.id, action: 'campaign.created',
      summary: `נפתח קמפיין "${v.name}" (טיוטה)`, changes: { client_id: v.client_id, brief_document_link_id: v.brief_document_link_id },
    })
    return { id: c!.id }
  }, ctx.db)
}

export const listCampaignsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  client_id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'planning', 'recruiting', 'active', 'reporting', 'closed', 'cancelled']).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
})

export interface CampaignListRow {
  id: string; name: string; status: string; client_id: string; client_name: string; owner_name: string | null
  start_date: string | null; end_date: string | null; currency: string; approved_budget: string | null
  participants: number; deliverables: number; awaiting_approval: number; overdue: number; exposure: string
}

export async function listCampaigns(ctx: Ctx, input: unknown): Promise<{ rows: CampaignListRow[]; total: number; page: number; pageSize: number }> {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(listCampaignsSchema, input)
  const params: unknown[] = [actor.userId]
  const conds = [internalCampaignScope(actor, '$1')]
  if (v.q) { params.push(`%${v.q}%`); conds.push(`(c.name ilike $${params.length} or cl.name ilike $${params.length} or coalesce(cl.name_hebrew,'') ilike $${params.length})`) }
  if (v.client_id) { params.push(v.client_id); conds.push(`c.client_id = $${params.length}`) }
  if (v.owner_user_id) { params.push(v.owner_user_id); conds.push(`c.owner_user_id = $${params.length}`) }
  if (v.status) { params.push(v.status); conds.push(`c.status = $${params.length}`) }
  if (v.from) { params.push(v.from); conds.push(`coalesce(c.end_date, c.start_date, c.created_at::date) >= $${params.length}`) }
  if (v.to) { params.push(v.to); conds.push(`coalesce(c.start_date, c.created_at::date) <= $${params.length}`) }
  const where = conds.join(' and ')
  const total = await one<{ n: number }>(ctx.db,
    `select count(*)::int as n from cm_campaigns c join clients cl on cl.id = c.client_id where ${where}`, params)
  params.push(ctx.now)
  const nowP = `$${params.length}`
  params.push(v.page_size, (v.page - 1) * v.page_size)
  const rows = await many<CampaignListRow>(ctx.db,
    `select c.id, c.name, c.status, c.client_id, coalesce(cl.name_hebrew, cl.name) as client_name, u.full_name as owner_name,
            to_char(c.start_date,'YYYY-MM-DD') as start_date, to_char(c.end_date,'YYYY-MM-DD') as end_date,
            c.currency, c.approved_budget::text,
            (select count(*)::int from cm_participations p where p.campaign_id = c.id and p.participation_status <> 'cancelled'
                and p.selection_status not in ('rejected','withdrawn')) as participants,
            (select count(*)::int from cm_deliverables d where d.campaign_id = c.id and d.status <> 'cancelled') as deliverables,
            ((select count(*)::int from cm_deliverables d where d.campaign_id = c.id and d.status in ('submitted','internal_review','client_review','publication_reported'))
             + (select count(*)::int from cm_shortlist_items si join cm_shortlists s on s.id = si.shortlist_id
                 where s.campaign_id = c.id and ((s.status = 'internal_review' and si.internal_decision = 'pending')
                    or (s.status = 'client_review' and si.internal_decision = 'approved' and si.client_decision = 'pending')))) as awaiting_approval,
            (select count(*)::int from cm_deliverables d where d.campaign_id = c.id
                and ((d.status in ('awaiting_submission','changes_requested') and d.submission_due_at < ${nowP})
                  or (d.status = 'approved' and d.publication_due_at < ${nowP}))) as overdue,
            coalesce((select sum(b.amount) from cm_budget_lines b where b.campaign_id = c.id and b.status in ('committed','actual')), 0)::text as exposure
       from cm_campaigns c
       join clients cl on cl.id = c.client_id
       left join users u on u.id = c.owner_user_id
      where ${where}
      order by case c.status when 'active' then 0 when 'recruiting' then 1 when 'planning' then 2 when 'reporting' then 3
               when 'draft' then 4 else 5 end, c.start_date nulls last, c.created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { rows, total: total?.n ?? 0, page: v.page, pageSize: v.page_size }
}

export interface CampaignDetail {
  id: string; name: string; status: string; status_reason: string | null; description: string | null; objectives: string | null
  client_id: string; client_name: string; external_project_reference: string | null
  brief_document_link_id: string | null; brief_label: string | null; brief_url: string | null
  owner_user_id: string; owner_name: string | null; start_date: string | null; end_date: string | null
  currency: string; approved_budget: string | null; amounts_include_vat: boolean
  closed_at: Date | null; closed_with_exceptions: boolean; version: number; created_at: Date; updated_at: Date
  access_level: 'manage' | 'operate'
}

export async function getCampaign(ctx: Ctx, id: string): Promise<CampaignDetail> {
  const acc = await requireCampaign(ctx.db, ctx, id, 'operate')
  const c = await one<Omit<CampaignDetail, 'access_level'>>(ctx.db,
    `select c.id, c.name, c.status, c.status_reason, c.description, c.objectives, c.client_id,
            coalesce(cl.name_hebrew, cl.name) as client_name, c.external_project_reference,
            c.brief_document_link_id, case when dl.id is null then null
              else concat_ws(' · ', dl.client_name, case dl.status when 'completed' then 'הושלם' when 'opened' then 'נפתח' when 'pending' then 'נשלח' else 'בארכיון' end, to_char(dl.created_at, 'DD.MM.YYYY')) end as brief_label,
            c.brief_url, c.owner_user_id, u.full_name as owner_name,
            to_char(c.start_date,'YYYY-MM-DD') as start_date, to_char(c.end_date,'YYYY-MM-DD') as end_date,
            c.currency, c.approved_budget::text, c.amounts_include_vat, c.closed_at, c.closed_with_exceptions,
            c.version, c.created_at, c.updated_at
       from cm_campaigns c join clients cl on cl.id = c.client_id
       left join users u on u.id = c.owner_user_id
       left join document_links dl on dl.id = c.brief_document_link_id
      where c.id = $1`, [id])
  if (!c) throw notFound('הקמפיין')
  return { ...c, access_level: acc.level }
}

export const updateCampaignSchema = z.object({
  expected_version: zVersion,
  name: zRequiredText(200).optional(),
  description: zOptText(5000),
  objectives: zOptText(5000),
  external_project_reference: zOptText(100),
  brief_document_link_id: zOptUuid,
  brief_url: zOptUrl,
  owner_user_id: zUuid.optional(),
  start_date: zOptDate,
  end_date: zOptDate,
  approved_budget: zOptMoney,
  amounts_include_vat: z.boolean().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
})

export async function updateCampaign(ctx: Ctx, id: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, id, 'manage')
  const v = parseInput(updateCampaignSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const cur = await one<{ version: number; currency: string; status: string; start_date: string | null; end_date: string | null }>(tx,
      `select version, currency, status, to_char(start_date,'YYYY-MM-DD') as start_date, to_char(end_date,'YYYY-MM-DD') as end_date
         from cm_campaigns where id = $1 for update`, [id])
    if (!cur) throw notFound('הקמפיין')
    if (cur.version !== v.expected_version) throw versionConflict()
    if (['closed', 'cancelled'].includes(cur.status)) throw precondition('לא ניתן לערוך קמפיין סגור או מבוטל')
    const sets: string[] = []
    const params: unknown[] = [id]
    const changes: Record<string, unknown> = {}
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); changes[col] = val }
    for (const k of ['name', 'description', 'objectives', 'external_project_reference', 'brief_document_link_id', 'brief_url',
      'start_date', 'end_date', 'amounts_include_vat'] as const) {
      if (k in raw) set(k, (v as Record<string, unknown>)[k] ?? null)
    }
    if ('approved_budget' in raw) {
      const b = v.approved_budget === null ? null : parseMoney(v.approved_budget)
      if (b !== null && b < BigInt(0)) throw invalid('תקציב לא יכול להיות שלילי')
      set('approved_budget', b === null ? null : toDecimal(b))
    }
    if (v.currency && v.currency !== cur.currency) {
      const used = await one(tx, `select 1 from cm_participations where campaign_id = $1 limit 1`, [id])
        ?? await one(tx, `select 1 from cm_budget_lines where campaign_id = $1 limit 1`, [id])
      if (used) throw precondition('לא ניתן לשנות מטבע אחרי שנוספו משפיענים או שורות תקציב (אין המרת מטבע)')
      set('currency', v.currency)
    }
    if (v.owner_user_id) {
      const owner = await one(tx, `select 1 from users u left join cm_staff_roles r on r.user_id = u.id
        where u.id = $1 and u.is_active and (u.role = 'admin' or r.role in ('admin','manager'))`, [v.owner_user_id])
      if (!owner) throw invalid('האחראית שנבחרה אינה מנהלת קמפיין פעילה')
      set('owner_user_id', v.owner_user_id)
    }
    if (v.brief_document_link_id && !(await one(tx, `select 1 from document_links where id = $1`, [v.brief_document_link_id]))) {
      throw invalid('הבריף שנבחר לא נמצא')
    }
    const start = 'start_date' in raw ? v.start_date ?? null : cur.start_date
    const end = 'end_date' in raw ? v.end_date ?? null : cur.end_date
    if (start && end && end < start) throw invalid('תאריך הסיום מוקדם מתאריך ההתחלה')
    if (!sets.length) return { id, version: cur.version }
    const r = await one<{ version: number }>(tx,
      `update cm_campaigns set ${sets.join(', ')}, version = version + 1 where id = $1 returning version`, params)
    await audit(tx, ctx, { campaignId: id, entityType: 'campaign', entityId: id, action: 'campaign.updated', summary: 'פרטי הקמפיין עודכנו', changes })
    return { id, version: r!.version }
  }, ctx.db)
}

// ── Status changes and closing ─────────────────────────────────────────────

export interface CloseIssue { code: string; count: number; message: string }

export async function closeCheck(ctx: Ctx, id: string): Promise<CloseIssue[]> {
  await requireCampaign(ctx.db, ctx, id, 'operate')
  return computeCloseIssues(ctx.db, id)
}

async function computeCloseIssues(db: Queryable, id: string): Promise<CloseIssue[]> {
  const r = await one<{
    open_deliverables: number; unpublished: number; unverified: number; missing_metrics: number; open_tasks: number
    pending_shortlist: number; over: boolean
  }>(db,
    `select
       (select count(*)::int from cm_deliverables where campaign_id = $1 and status in ('awaiting_submission','submitted','internal_review','changes_requested','client_review')) as open_deliverables,
       (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'approved') as unpublished,
       (select count(*)::int from cm_deliverables where campaign_id = $1 and status = 'publication_reported') as unverified,
       (select count(*)::int from cm_deliverables d where campaign_id = $1 and status = 'publication_verified'
           and not exists (select 1 from cm_metric_observations m where m.deliverable_id = d.id)) as missing_metrics,
       (select count(*)::int from cm_tasks where campaign_id = $1 and status in ('open','in_progress') and audience = 'internal') as open_tasks,
       (select count(*)::int from cm_shortlists where campaign_id = $1 and status in ('internal_review','client_review')) as pending_shortlist,
       coalesce((select c.approved_budget < (select coalesce(sum(amount),0) from cm_budget_lines b where b.campaign_id = c.id and b.status in ('committed','actual'))
                   from cm_campaigns c where c.id = $1), false) as over`, [id])
  const issues: CloseIssue[] = []
  const add = (code: string, count: number, message: string) => { if (count > 0) issues.push({ code, count, message }) }
  add('open_deliverables', r!.open_deliverables, 'תוצרים שעדיין לא אושרו')
  add('unpublished', r!.unpublished, 'תוצרים מאושרים שלא דווח פרסומם')
  add('unverified', r!.unverified, 'פרסומים שדווחו ולא אומתו')
  add('missing_metrics', r!.missing_metrics, 'פרסומים מאומתים ללא נתוני ביצועים')
  add('open_tasks', r!.open_tasks, 'משימות פנימיות פתוחות')
  add('pending_shortlist', r!.pending_shortlist, 'רשימת מועמדים שממתינה להחלטה')
  if (r!.over) issues.push({ code: 'budget_overrun', count: 1, message: 'ההתחייבויות וההוצאות חורגות מהתקציב המאושר' })
  return issues
}

export const changeStatusSchema = z.object({
  to: z.enum(['draft', 'planning', 'recruiting', 'active', 'reporting', 'closed', 'cancelled']),
  expected_version: zVersion,
  reason: zOptText(2000),
  close_with_exceptions: z.boolean().optional(),
})

export async function changeCampaignStatus(ctx: Ctx, id: string, input: unknown) {
  const acc = await requireCampaign(ctx.db, ctx, id, 'manage')
  const actor = requireInternal(ctx.actor)
  const v = parseInput(changeStatusSchema, input)
  return withTx(async (tx) => {
    const cur = await one<{ status: CampaignStatus; version: number }>(tx, `select status, version from cm_campaigns where id = $1 for update`, [id])
    if (!cur) throw notFound('הקמפיין')
    if (cur.version !== v.expected_version) throw versionConflict()
    assertTransition(CAMPAIGN_MACHINE, cur.status, v.to, 'קמפיין')
    let withExceptions = false
    if (v.to === 'cancelled' && !v.reason) throw invalid('ביטול קמפיין מחייב סיבה')
    if (v.to === 'closed') {
      const issues = await computeCloseIssues(tx, id)
      if (issues.length) {
        if (!v.close_with_exceptions) {
          throw precondition('יש פריטים פתוחים. אפשר להשלים אותם או לסגור עם חריגות (דורש סיבה).', { issues })
        }
        if (!(actor.role === 'admin' || acc.ownerUserId === actor.userId)) {
          throw forbidden('סגירה עם חריגות שמורה למנהלת האחראית על הקמפיין או למנהל המערכת')
        }
        if (!v.reason || v.reason.length < 5) throw invalid('סגירה עם חריגות מחייבת סיבה מתועדת')
        withExceptions = true
      }
    }
    const r = await one<{ version: number }>(tx,
      `update cm_campaigns set status = $2, status_reason = $3, version = version + 1,
              closed_at = case when $2 = 'closed' then $4::timestamptz else closed_at end,
              closed_with_exceptions = case when $2 = 'closed' then $5 else closed_with_exceptions end
        where id = $1 returning version`,
      [id, v.to, v.reason ?? null, ctx.now, withExceptions])
    if (v.to === 'cancelled' || v.to === 'closed') {
      const why = v.to === 'cancelled' ? 'campaign cancelled' : 'campaign closed'
      const jobs = await cancelJobs(tx, { campaignId: id }, why)
      const msgs = await cancelNotifications(tx, id, why)
      const tasks = await closeTasks(tx, { campaignId: id }, 'cancelled', ctx.now, v.to === 'cancelled' ? 'הקמפיין בוטל' : 'הקמפיין נסגר')
      await audit(tx, ctx, { campaignId: id, entityType: 'campaign', entityId: id, action: `campaign.${v.to}`,
        summary: v.to === 'cancelled' ? `הקמפיין בוטל: ${v.reason}` : withExceptions ? `הקמפיין נסגר עם חריגות: ${v.reason}` : 'הקמפיין נסגר',
        changes: { from: cur.status, to: v.to, cancelled_jobs: jobs, cancelled_messages: msgs, cancelled_tasks: tasks } })
    } else {
      await audit(tx, ctx, { campaignId: id, entityType: 'campaign', entityId: id, action: 'campaign.status_changed',
        summary: `סטטוס הקמפיין שונה`, changes: { from: cur.status, to: v.to, reason: v.reason } })
    }
    return { id, status: v.to, version: r!.version, closed_with_exceptions: withExceptions }
  }, ctx.db)
}

// ── Members ────────────────────────────────────────────────────────────────

export async function listMembers(ctx: Ctx, id: string) {
  await requireCampaign(ctx.db, ctx, id, 'operate')
  return many<{ user_id: string; full_name: string; email: string; role: string }>(ctx.db,
    `select m.user_id, u.full_name, u.email, m.role from cm_campaign_members m join users u on u.id = m.user_id
      where m.campaign_id = $1 order by u.full_name`, [id])
}

export async function setMember(ctx: Ctx, id: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, id, 'manage')
  const v = parseInput(z.object({ user_id: zUuid, role: z.enum(['manager', 'staff']).nullable() }), input)
  return withTx(async (tx) => {
    const u = await one<{ id: string }>(tx, `select u.id from users u left join cm_staff_roles r on r.user_id = u.id
       where u.id = $1 and u.is_active and (u.role = 'admin' or r.role is not null)`, [v.user_id])
    if (!u) throw invalid(`המשתמש אינו מורשה ב-${PRODUCT.name}`)
    if (v.role === null) {
      await tx.query(`delete from cm_campaign_members where campaign_id = $1 and user_id = $2`, [id, v.user_id])
    } else {
      await tx.query(`insert into cm_campaign_members (campaign_id, user_id, role, added_by) values ($1,$2,$3,$4)
        on conflict (campaign_id, user_id) do update set role = excluded.role`, [id, v.user_id, v.role, requireInternal(ctx.actor).userId])
    }
    await audit(tx, ctx, { campaignId: id, entityType: 'campaign', entityId: id, action: 'campaign.member_changed',
      summary: v.role ? 'צוות הקמפיין עודכן' : 'משתמש הוסר מצוות הקמפיין', changes: { user_id: v.user_id, role: v.role } })
    return { ok: true }
  }, ctx.db)
}

/** Internal users who may own or join campaigns. */
export async function listStaff(ctx: Ctx) {
  requireInternal(ctx.actor)
  return many<{ id: string; full_name: string; email: string; role: string }>(ctx.db,
    `select u.id, u.full_name, u.email, case when u.role = 'admin' then 'admin' else r.role end as role
       from users u left join cm_staff_roles r on r.user_id = u.id
      where u.is_active and (u.role = 'admin' or r.role is not null) order by u.full_name`)
}

export function assertModuleEnabled() {
  if (process.env.CAMPAIGNS_MODULE_ENABLED !== 'true') throw new DomainError('MODULE_DISABLED', `${PRODUCT.name} כבוי`)
}
