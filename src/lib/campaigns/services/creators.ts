/**
 * Creator pool (operational card in the Hub). Besti remains the source for the
 * creator account and agent deals; a Besti account id is stored as an external
 * reference, never synced automatically.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, pgCode, pgConstraint, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, invalid, notFound, versionConflict } from '../errors'
import { internalCampaignScope, requireInternal } from '../auth/policy'
import { normalizeEmail, normalizeHandle, normalizePhone, parseInput, zOptText, zRequiredText, zUuid, zVersion } from '../validation'

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'other'] as const

const socialSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: zRequiredText(100),
  external_user_id: zOptText(100),
  profile_url: z.string().trim().url().optional().nullable().or(z.literal('').transform(() => null)),
  follower_count: z.coerce.number().int().min(0).optional().nullable(),
})

export const creatorSchema = z.object({
  display_name: zRequiredText(200),
  email: zOptText(200),
  phone: zOptText(40),
  agent_id: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  categories: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  internal_notes: zOptText(5000),
  social_accounts: z.array(socialSchema).max(10).default([]),
  besti_account_id: zOptText(100),
})

export interface DuplicateHit { creator_id: string; display_name: string; reason: string }

export async function findDuplicates(db: Queryable, c: { email: string | null; phone: string | null; social: { platform: string; handle: string; external_user_id?: string | null }[] }, excludeId?: string): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = []
  const push = (rows: { id: string; display_name: string }[], reason: string) =>
    rows.forEach((r) => { if (r.id !== excludeId && !hits.some((h) => h.creator_id === r.id && h.reason === reason)) hits.push({ creator_id: r.id, display_name: r.display_name, reason }) })
  if (c.email) push(await many(db, `select id, display_name from cm_creators where lower(email) = $1`, [c.email]), 'דוא"ל זהה')
  if (c.phone) push(await many(db, `select id, display_name from cm_creators where phone = $1`, [c.phone]), 'טלפון זהה')
  for (const s of c.social) {
    push(await many(db, `select c.id, c.display_name from cm_creator_social_accounts a join cm_creators c on c.id = a.creator_id
       where a.platform = $1 and (lower(a.handle) = lower($2) or ($3::text is not null and a.external_user_id = $3))`,
      [s.platform, s.handle, s.external_user_id ?? null]), `חשבון ${s.platform} @${s.handle}`)
  }
  return hits
}

export async function createCreator(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(creatorSchema, input)
  const email = normalizeEmail(v.email)
  const phone = normalizePhone(v.phone)
  const social = v.social_accounts.map((s) => ({ ...s, handle: normalizeHandle(s.handle) }))
  return withTx(async (tx) => {
    const dups = await findDuplicates(tx, { email, phone, social })
    if (dups.length) {
      throw new DomainError('CONFLICT', `יוצר דומה כבר קיים במאגר: ${dups.map((d) => `${d.display_name} (${d.reason})`).join(', ')}`, { duplicates: dups })
    }
    if (v.agent_id && !(await one(tx, `select 1 from cm_agents where id = $1`, [v.agent_id]))) throw invalid('הסוכן לא נמצא')
    try {
      const c = await one<{ id: string }>(tx,
        `insert into cm_creators (display_name, email, phone, agent_id, categories, internal_notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [v.display_name, email, phone, v.agent_id ?? null, v.categories, v.internal_notes, actor.userId])
      for (const s of social) {
        await tx.query(`insert into cm_creator_social_accounts (creator_id, platform, handle, external_user_id, profile_url, follower_count)
          values ($1,$2,$3,$4,$5,$6)`, [c!.id, s.platform, s.handle, s.external_user_id ?? null, s.profile_url ?? null, s.follower_count ?? null])
      }
      if (v.agent_id) {
        await tx.query(`insert into cm_agent_creators (agent_id, creator_id) values ($1,$2) on conflict do nothing`, [v.agent_id, c!.id])
      }
      if (v.besti_account_id) {
        await tx.query(`insert into cm_external_references (entity_type, entity_id, system, external_type, external_id, linked_by)
          values ('creator', $1, 'besti', 'account', $2, $3)`, [c!.id, v.besti_account_id, actor.userId])
      }
      await audit(tx, ctx, { campaignId: null, entityType: 'creator', entityId: c!.id, action: 'creator.created', summary: `נוסף יוצר "${v.display_name}"` })
      return { id: c!.id }
    } catch (e) {
      if (pgCode(e) === '23505') {
        throw new DomainError('CONFLICT', `יוצר עם פרטים זהים כבר קיים (${pgConstraint(e) ?? ''})`)
      }
      throw e
    }
  }, ctx.db)
}

export const listCreatorsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  exclude_campaign_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
})

export async function listCreators(ctx: Ctx, input: unknown) {
  requireInternal(ctx.actor)
  const v = parseInput(listCreatorsSchema, input)
  const params: unknown[] = []
  const conds: string[] = ['true']
  if (v.q) {
    params.push(`%${v.q.replace(/^@/, '')}%`)
    conds.push(`(c.display_name ilike $${params.length} or coalesce(c.email,'') ilike $${params.length}
      or exists (select 1 from cm_creator_social_accounts a where a.creator_id = c.id and a.handle ilike $${params.length}))`)
  }
  if (v.category) { params.push(v.category); conds.push(`$${params.length} = any(c.categories)`) }
  if (v.platform) { params.push(v.platform); conds.push(`exists (select 1 from cm_creator_social_accounts a where a.creator_id = c.id and a.platform = $${params.length})`) }
  if (v.status) { params.push(v.status); conds.push(`c.status = $${params.length}`) }
  const where = conds.join(' and ')
  const total = await one<{ n: number }>(ctx.db, `select count(*)::int as n from cm_creators c where ${where}`, params)
  const exclude = v.exclude_campaign_id ?? null
  params.push(exclude, v.page_size, (v.page - 1) * v.page_size)
  const rows = await many<{
    id: string; display_name: string; status: string; categories: string[]; agent_name: string | null
    accounts: { platform: string; handle: string; follower_count: number | null }[]; in_campaign: boolean
  }>(ctx.db,
    `select c.id, c.display_name, c.status, c.categories, a.display_name as agent_name,
            coalesce((select json_agg(json_build_object('platform', s.platform, 'handle', s.handle, 'follower_count', s.follower_count) order by s.platform)
               from cm_creator_social_accounts s where s.creator_id = c.id), '[]') as accounts,
            ($${params.length - 2}::uuid is not null and exists (select 1 from cm_participations p where p.creator_id = c.id and p.campaign_id = $${params.length - 2}::uuid)) as in_campaign
       from cm_creators c left join cm_agents a on a.id = c.agent_id
      where ${where}
      order by c.display_name
      limit $${params.length - 1} offset $${params.length}`, params)
  return { rows, total: total?.n ?? 0, page: v.page, pageSize: v.page_size }
}

export async function getCreator(ctx: Ctx, id: string) {
  const actor = requireInternal(ctx.actor)
  const c = await one<{
    id: string; display_name: string; email: string | null; phone: string | null; agent_id: string | null; agent_name: string | null
    categories: string[]; status: string; internal_notes: string | null; version: number
  }>(ctx.db,
    `select c.id, c.display_name, c.email, c.phone, c.agent_id, a.display_name as agent_name, c.categories, c.status,
            c.internal_notes, c.version
       from cm_creators c left join cm_agents a on a.id = c.agent_id where c.id = $1`, [id])
  if (!c) throw notFound('היוצר')
  const accounts = await many(ctx.db, `select id, platform, handle, external_user_id, profile_url, follower_count
    from cm_creator_social_accounts where creator_id = $1 order by platform`, [id])
  const refs = await many(ctx.db, `select system, external_type, external_id, url from cm_external_references
    where entity_type = 'creator' and entity_id = $1`, [id])
  // History limited to campaigns this user may see.
  const history = await many(ctx.db,
    `select p.id as participation_id, c.id as campaign_id, c.name as campaign_name, c.status as campaign_status,
            p.selection_status, p.participation_status, p.agreed_fee::text, p.currency
       from cm_participations p join cm_campaigns c on c.id = p.campaign_id
      where p.creator_id = $1 and ${internalCampaignScope(actor, '$2')}
      order by c.created_at desc`, [id, actor.userId])
  return { ...c, accounts, external_references: refs, history }
}

export const updateCreatorSchema = creatorSchema.partial().extend({
  expected_version: zVersion,
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
})

export async function updateCreator(ctx: Ctx, id: string, input: unknown) {
  requireInternal(ctx.actor)
  const v = parseInput(updateCreatorSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const cur = await one<{ version: number }>(tx, `select version from cm_creators where id = $1 for update`, [id])
    if (!cur) throw notFound('היוצר')
    if (cur.version !== v.expected_version) throw versionConflict()
    const email = 'email' in raw ? normalizeEmail(v.email) : undefined
    const phone = 'phone' in raw ? normalizePhone(v.phone) : undefined
    const social = v.social_accounts?.map((s) => ({ ...s, handle: normalizeHandle(s.handle) }))
    const dups = await findDuplicates(tx, { email: email ?? null, phone: phone ?? null, social: social ?? [] }, id)
    if (dups.length) throw new DomainError('CONFLICT', `פרטים אלה כבר שייכים ליוצר אחר: ${dups.map((d) => d.display_name).join(', ')}`, { duplicates: dups })
    const sets: string[] = []
    const params: unknown[] = [id]
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (v.display_name) set('display_name', v.display_name)
    if (email !== undefined) set('email', email)
    if (phone !== undefined) set('phone', phone)
    if ('agent_id' in raw) set('agent_id', v.agent_id ?? null)
    if (v.categories) set('categories', v.categories)
    if ('internal_notes' in raw) set('internal_notes', v.internal_notes ?? null)
    if (v.status) set('status', v.status)
    const r = await one<{ version: number }>(tx, `update cm_creators set ${[...sets, 'version = version + 1'].join(', ')} where id = $1 returning version`, params)
    if (social) {
      await tx.query(`delete from cm_creator_social_accounts where creator_id = $1`, [id])
      for (const s of social) {
        await tx.query(`insert into cm_creator_social_accounts (creator_id, platform, handle, external_user_id, profile_url, follower_count)
          values ($1,$2,$3,$4,$5,$6)`, [id, s.platform, s.handle, s.external_user_id ?? null, s.profile_url ?? null, s.follower_count ?? null])
      }
    }
    if (v.agent_id) await tx.query(`insert into cm_agent_creators (agent_id, creator_id) values ($1,$2) on conflict (agent_id, creator_id) do update set active = true`, [v.agent_id, id])
    await audit(tx, ctx, { campaignId: null, entityType: 'creator', entityId: id, action: 'creator.updated', summary: 'כרטיס היוצר עודכן',
      changes: { fields: Object.keys(raw).filter((k) => k !== 'expected_version') } })
    return { id, version: r!.version }
  }, ctx.db)
}

// ── Agents ─────────────────────────────────────────────────────────────────

export const agentSchema = z.object({
  display_name: zRequiredText(200),
  company: zOptText(200),
  email: zOptText(200),
  phone: zOptText(40),
  internal_notes: zOptText(2000),
  creator_ids: z.array(zUuid).max(200).default([]),
})

export async function listAgents(ctx: Ctx) {
  requireInternal(ctx.actor)
  return many<{ id: string; display_name: string; company: string | null; creators: number }>(ctx.db,
    `select a.id, a.display_name, a.company, (select count(*)::int from cm_agent_creators ac where ac.agent_id = a.id and ac.active) as creators
       from cm_agents a order by a.display_name`)
}

export async function createAgent(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(agentSchema, input)
  const email = normalizeEmail(v.email)
  return withTx(async (tx) => {
    if (email && (await one(tx, `select 1 from cm_agents where lower(email) = $1`, [email]))) {
      throw new DomainError('CONFLICT', 'סוכן עם כתובת דוא"ל זו כבר קיים')
    }
    const a = await one<{ id: string }>(tx, `insert into cm_agents (display_name, company, email, phone, internal_notes, created_by)
      values ($1,$2,$3,$4,$5,$6) returning id`, [v.display_name, v.company, email, normalizePhone(v.phone), v.internal_notes, actor.userId])
    for (const cid of v.creator_ids) {
      await tx.query(`insert into cm_agent_creators (agent_id, creator_id) values ($1,$2) on conflict do nothing`, [a!.id, cid])
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'agent', entityId: a!.id, action: 'agent.created', summary: `נוסף סוכן "${v.display_name}"` })
    return { id: a!.id }
  }, ctx.db)
}

export async function setAgentCreator(ctx: Ctx, agentId: string, creatorId: string, active: boolean) {
  requireInternal(ctx.actor)
  return withTx(async (tx) => {
    if (!(await one(tx, `select 1 from cm_agents where id = $1`, [agentId]))) throw notFound('הסוכן')
    if (!(await one(tx, `select 1 from cm_creators where id = $1`, [creatorId]))) throw notFound('היוצר')
    await tx.query(`insert into cm_agent_creators (agent_id, creator_id, active) values ($1,$2,$3)
      on conflict (agent_id, creator_id) do update set active = excluded.active`, [agentId, creatorId, active])
    await audit(tx, ctx, { campaignId: null, entityType: 'agent', entityId: agentId, action: active ? 'agent.creator_linked' : 'agent.creator_unlinked',
      summary: active ? 'הסוכן הורשה לייצג יוצר' : 'הרשאת הייצוג בוטלה', changes: { creator_id: creatorId } })
    return { ok: true }
  }, ctx.db)
}
