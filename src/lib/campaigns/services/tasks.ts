import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx } from '../db'
import { audit } from '../audit'
import { invalid, notFound, versionConflict } from '../errors'
import { internalCampaignScope, requireCampaign, requireInternal } from '../auth/policy'
import { parseInput, zOptBusinessDateTime, zOptText, zRequiredText, zVersion } from '../validation'

export const listTasksSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled', 'active']).default('active'),
  audience: z.enum(['internal', 'creator', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export async function listTasks(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(listTasksSchema, input)
  if (v.campaign_id) await requireCampaign(ctx.db, ctx, v.campaign_id, 'operate')
  const params: unknown[] = [actor.userId]
  const conds = [internalCampaignScope(actor, '$1')]
  if (v.campaign_id) { params.push(v.campaign_id); conds.push(`t.campaign_id = $${params.length}`) }
  if (v.mine) conds.push(`t.assignee_user_id = $1`)
  if (v.status === 'active') conds.push(`t.status in ('open','in_progress')`)
  else { params.push(v.status); conds.push(`t.status = $${params.length}`) }
  const nowP = () => { params.push(ctx.now); return `$${params.length}::timestamptz` }
  if (v.overdue) conds.push(`t.due_at < ${nowP()} and t.status in ('open','in_progress')`)
  if (v.audience !== 'all') { params.push(v.audience); conds.push(`t.audience = $${params.length}`) }
  const where = conds.join(' and ')
  const total = await one<{ n: number }>(ctx.db, `select count(*)::int as n from cm_tasks t join cm_campaigns c on c.id = t.campaign_id where ${where}`, params)
  const now = nowP()
  params.push(v.page_size, (v.page - 1) * v.page_size)
  const rows = await many(ctx.db,
    `select t.id, t.campaign_id, c.name as campaign_name, t.participation_id, t.deliverable_id, t.type, t.title, t.description,
            t.audience, t.assignee_user_id, u.full_name as assignee_name, t.due_at, t.status, t.priority, t.completed_at, t.version,
            (t.due_at < ${now} and t.status in ('open','in_progress')) as overdue,
            cr.display_name as creator_name, d.title as deliverable_title
       from cm_tasks t join cm_campaigns c on c.id = t.campaign_id
       left join users u on u.id = t.assignee_user_id
       left join cm_participations p on p.id = t.participation_id left join cm_creators cr on cr.id = p.creator_id
       left join cm_deliverables d on d.id = t.deliverable_id
      where ${where}
      order by (t.status in ('open','in_progress')) desc, t.due_at nulls last,
               case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end
      limit $${params.length - 1} offset $${params.length}`, params)
  return { rows, total: total?.n ?? 0, page: v.page, pageSize: v.page_size }
}

export const createTaskSchema = z.object({
  title: zRequiredText(300),
  description: zOptText(4000),
  assignee_user_id: z.string().uuid().nullable().optional(),
  due_at: zOptBusinessDateTime,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  participation_id: z.string().uuid().nullable().optional(),
  deliverable_id: z.string().uuid().nullable().optional(),
})

export async function createTask(ctx: Ctx, campaignId: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  const actor = requireInternal(ctx.actor)
  const v = parseInput(createTaskSchema, input)
  return withTx(async (tx) => {
    if (v.participation_id && !(await one(tx, `select 1 from cm_participations where id = $1 and campaign_id = $2`, [v.participation_id, campaignId]))) throw invalid('ההשתתפות אינה שייכת לקמפיין')
    if (v.deliverable_id && !(await one(tx, `select 1 from cm_deliverables where id = $1 and campaign_id = $2`, [v.deliverable_id, campaignId]))) throw invalid('התוצר אינו שייך לקמפיין')
    if (v.assignee_user_id && !(await one(tx, `select 1 from users u left join cm_staff_roles r on r.user_id = u.id where u.id = $1 and (u.role = 'admin' or r.role is not null)`, [v.assignee_user_id]))) {
      throw invalid('המשתמש אינו מורשה במודול')
    }
    const t = await one<{ id: string }>(tx,
      `insert into cm_tasks (campaign_id, participation_id, deliverable_id, type, title, description, assignee_user_id, due_at, priority, created_by_user_id)
       values ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9) returning id`,
      [campaignId, v.participation_id ?? null, v.deliverable_id ?? null, v.title, v.description, v.assignee_user_id ?? null, v.due_at ?? null, v.priority, actor.userId])
    await audit(tx, ctx, { campaignId, entityType: 'task', entityId: t!.id, action: 'task.created', summary: `נוצרה משימה "${v.title}"` })
    return { id: t!.id }
  }, ctx.db)
}

export const updateTaskSchema = z.object({
  expected_version: zVersion,
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  due_at: zOptBusinessDateTime,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  cancel_reason: zOptText(500),
})

export async function updateTask(ctx: Ctx, taskId: string, input: unknown) {
  const v = parseInput(updateTaskSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const t = await one<{ campaign_id: string; version: number; audience: string; status: string }>(tx,
      `select campaign_id, version, audience, status from cm_tasks where id = $1 for update`, [taskId])
    if (!t) throw notFound('המשימה')
    await requireCampaign(tx, ctx, t.campaign_id, 'operate')
    if (t.version !== v.expected_version) throw versionConflict()
    if (t.audience === 'creator' && v.status === 'done') throw invalid('משימת יוצר נסגרת אוטומטית כשהיוצר מבצע את הפעולה')
    if (v.status === 'cancelled' && !v.cancel_reason) throw invalid('ביטול משימה מחייב סיבה')
    const sets: string[] = []
    const params: unknown[] = [taskId]
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (v.status) {
      set('status', v.status)
      set('completed_at', v.status === 'done' ? ctx.now : null)
      if (v.status === 'cancelled') set('cancel_reason', v.cancel_reason)
    }
    if ('assignee_user_id' in raw) set('assignee_user_id', v.assignee_user_id ?? null)
    if ('due_at' in raw) set('due_at', v.due_at ?? null)
    if (v.priority) set('priority', v.priority)
    if (!sets.length) return { id: taskId, version: t.version }
    const r = await one<{ version: number }>(tx, `update cm_tasks set ${sets.join(', ')}, version = version + 1 where id = $1 returning version`, params)
    await audit(tx, ctx, { campaignId: t.campaign_id, entityType: 'task', entityId: taskId, action: 'task.updated', summary: 'משימה עודכנה',
      changes: { status: v.status, priority: v.priority } })
    return { id: taskId, version: r!.version }
  }, ctx.db)
}
