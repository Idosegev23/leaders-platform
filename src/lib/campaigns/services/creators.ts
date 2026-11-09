/**
 * Influencer side of an organization:
 *   talent agency → represents creators (cm_creators.talent_agency_id)
 *   agent         → a person at the agency, handles the creators assigned to
 *                   them (cm_agent_creators)
 *   creator       → the operational card. Besti remains the source for the
 *                   creator account; a Besti id is a manual external reference.
 * Duplicates are checked per organization: two agencies may each have the same
 * creator on their own books.
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
  talent_agency_id: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  agent_id: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  categories: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  internal_notes: zOptText(5000),
  social_accounts: z.array(socialSchema).max(10).default([]),
  besti_account_id: zOptText(100),
})

export interface DuplicateHit { creator_id: string; display_name: string; reason: string }

export async function findDuplicates(db: Queryable, orgId: string, c: { email: string | null; phone: string | null; social: { platform: string; handle: string; external_user_id?: string | null }[] }, excludeId?: string): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = []
  const push = (rows: { id: string; display_name: string }[], reason: string) =>
    rows.forEach((r) => { if (r.id !== excludeId && !hits.some((h) => h.creator_id === r.id && h.reason === reason)) hits.push({ creator_id: r.id, display_name: r.display_name, reason }) })
  if (c.email) push(await many(db, `select id, display_name from cm_creators where organization_id = $1 and lower(email) = $2`, [orgId, c.email]), 'דוא"ל זהה')
  if (c.phone) push(await many(db, `select id, display_name from cm_creators where organization_id = $1 and phone = $2`, [orgId, c.phone]), 'טלפון זהה')
  for (const s of c.social) {
    push(await many(db, `select c.id, c.display_name from cm_creator_social_accounts a join cm_creators c on c.id = a.creator_id
       where a.organization_id = $1 and a.platform = $2 and (lower(a.handle) = lower($3) or ($4::text is not null and a.external_user_id = $4))`,
      [orgId, s.platform, s.handle, s.external_user_id ?? null]), `חשבון ${s.platform} @${s.handle}`)
  }
  return hits
}

async function assertAgency(db: Queryable, orgId: string, agencyId: string | null | undefined) {
  if (agencyId && !(await one(db, `select 1 from cm_talent_agencies where id = $1 and organization_id = $2`, [agencyId, orgId]))) throw invalid('סוכנות הכישרונות לא נמצאה')
}

/** An agent may handle a creator only within the creator's talent agency (or an independent agent). */
async function assertAgentForCreator(db: Queryable, orgId: string, agentId: string, creatorAgencyId: string | null) {
  const a = await one<{ talent_agency_id: string | null }>(db, `select talent_agency_id from cm_agents where id = $1 and organization_id = $2`, [agentId, orgId])
  if (!a) throw invalid('הסוכן לא נמצא')
  if (a.talent_agency_id && a.talent_agency_id !== creatorAgencyId) throw invalid('הסוכן שייך לסוכנות אחרת מזו שמייצגת את היוצר')
}

export async function createCreator(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(creatorSchema, input)
  return withTx((tx) => createCreatorTx(tx, ctx, v), ctx.db)
}

export async function createCreatorTx(tx: Queryable, ctx: Ctx, v: z.infer<typeof creatorSchema>): Promise<{ id: string }> {
  const actor = requireInternal(ctx.actor)
  const email = normalizeEmail(v.email)
  const phone = normalizePhone(v.phone)
  const social = v.social_accounts.map((s) => ({ ...s, handle: normalizeHandle(s.handle) }))
  const dups = await findDuplicates(tx, actor.orgId, { email, phone, social })
  if (dups.length) {
    throw new DomainError('CONFLICT', `יוצר דומה כבר קיים במאגר: ${dups.map((d) => `${d.display_name} (${d.reason})`).join(', ')}`, { duplicates: dups })
  }
  await assertAgency(tx, actor.orgId, v.talent_agency_id)
  if (v.agent_id) await assertAgentForCreator(tx, actor.orgId, v.agent_id, v.talent_agency_id ?? null)
  try {
    const c = await one<{ id: string }>(tx,
      `insert into cm_creators (organization_id, display_name, email, phone, talent_agency_id, categories, internal_notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [actor.orgId, v.display_name, email, phone, v.talent_agency_id ?? null, v.categories, v.internal_notes, actor.userId])
    for (const s of social) {
      await tx.query(`insert into cm_creator_social_accounts (organization_id, creator_id, platform, handle, external_user_id, profile_url, follower_count)
        values ($1,$2,$3,$4,$5,$6,$7)`, [actor.orgId, c!.id, s.platform, s.handle, s.external_user_id ?? null, s.profile_url ?? null, s.follower_count ?? null])
    }
    if (v.agent_id) await tx.query(`insert into cm_agent_creators (agent_id, creator_id) values ($1,$2) on conflict do nothing`, [v.agent_id, c!.id])
    if (v.besti_account_id) {
      await tx.query(`insert into cm_external_references (organization_id, entity_type, entity_id, system, external_type, external_id, linked_by)
        values ($1, 'creator', $2, 'besti', 'account', $3, $4)`, [actor.orgId, c!.id, v.besti_account_id, actor.userId])
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'creator', entityId: c!.id, action: 'creator.created', summary: `נוסף יוצר "${v.display_name}"` })
    return { id: c!.id }
  } catch (e) {
    if (pgCode(e) === '23505') throw new DomainError('CONFLICT', `יוצר עם פרטים זהים כבר קיים (${pgConstraint(e) ?? ''})`)
    throw e
  }
}

export const listCreatorsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  talent_agency_id: z.string().uuid().optional(),
  exclude_campaign_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
})

export async function listCreators(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(listCreatorsSchema, input)
  const params: unknown[] = [actor.orgId]
  const conds: string[] = ['c.organization_id = $1']
  if (v.q) {
    params.push(`%${v.q.replace(/^@/, '')}%`)
    conds.push(`(c.display_name ilike $${params.length} or coalesce(c.email,'') ilike $${params.length}
      or exists (select 1 from cm_creator_social_accounts a where a.creator_id = c.id and a.handle ilike $${params.length}))`)
  }
  if (v.category) { params.push(v.category); conds.push(`$${params.length} = any(c.categories)`) }
  if (v.platform) { params.push(v.platform); conds.push(`exists (select 1 from cm_creator_social_accounts a where a.creator_id = c.id and a.platform = $${params.length})`) }
  if (v.status) { params.push(v.status); conds.push(`c.status = $${params.length}`) }
  if (v.talent_agency_id) { params.push(v.talent_agency_id); conds.push(`c.talent_agency_id = $${params.length}`) }
  const where = conds.join(' and ')
  const total = await one<{ n: number }>(ctx.db, `select count(*)::int as n from cm_creators c where ${where}`, params)
  params.push(v.exclude_campaign_id ?? null, v.page_size, (v.page - 1) * v.page_size)
  const ex = `$${params.length - 2}::uuid`
  const rows = await many<{
    id: string; display_name: string; status: string; categories: string[]; agency_name: string | null; agent_names: string | null
    accounts: { platform: string; handle: string; follower_count: number | null }[]; in_campaign: boolean
  }>(ctx.db,
    `select c.id, c.display_name, c.status, c.categories, ta.name as agency_name,
            (select string_agg(a.display_name, ', ') from cm_agent_creators ac join cm_agents a on a.id = ac.agent_id
              where ac.creator_id = c.id and ac.active) as agent_names,
            coalesce((select json_agg(json_build_object('platform', s.platform, 'handle', s.handle, 'follower_count', s.follower_count) order by s.platform)
               from cm_creator_social_accounts s where s.creator_id = c.id), '[]') as accounts,
            (${ex} is not null and exists (select 1 from cm_participations p where p.creator_id = c.id and p.campaign_id = ${ex})) as in_campaign
       from cm_creators c left join cm_talent_agencies ta on ta.id = c.talent_agency_id
      where ${where}
      order by c.display_name
      limit $${params.length - 1} offset $${params.length}`, params)
  return { rows, total: total?.n ?? 0, page: v.page, pageSize: v.page_size }
}

export async function getCreator(ctx: Ctx, id: string) {
  const actor = requireInternal(ctx.actor)
  const c = await one<{
    id: string; display_name: string; email: string | null; phone: string | null; talent_agency_id: string | null; agency_name: string | null
    categories: string[]; status: string; internal_notes: string | null; version: number
  }>(ctx.db,
    `select c.id, c.display_name, c.email, c.phone, c.talent_agency_id, ta.name as agency_name, c.categories, c.status,
            c.internal_notes, c.version
       from cm_creators c left join cm_talent_agencies ta on ta.id = c.talent_agency_id
      where c.id = $1 and c.organization_id = $2`, [id, actor.orgId])
  if (!c) throw notFound('היוצר')
  const accounts = await many(ctx.db, `select id, platform, handle, external_user_id, profile_url, follower_count
    from cm_creator_social_accounts where creator_id = $1 order by platform`, [id])
  const agents = await many(ctx.db, `select a.id, a.display_name from cm_agent_creators ac join cm_agents a on a.id = ac.agent_id
    where ac.creator_id = $1 and ac.active order by a.display_name`, [id])
  const refs = await many(ctx.db, `select system, external_type, external_id, url from cm_external_references
    where entity_type = 'creator' and entity_id = $1 and organization_id = $2`, [id, actor.orgId])
  const history = await many(ctx.db,
    `select p.id as participation_id, c.id as campaign_id, c.name as campaign_name, c.status as campaign_status,
            p.selection_status, p.participation_status, p.agreed_fee::text, p.currency
       from cm_participations p join cm_campaigns c on c.id = p.campaign_id
      where p.creator_id = $1 and ${internalCampaignScope(actor, '$2', '$3')}
      order by c.created_at desc`, [id, actor.userId, actor.orgId])
  return { ...c, accounts, agents, external_references: refs, history }
}

export const updateCreatorSchema = creatorSchema.partial().extend({
  expected_version: zVersion,
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
})

export async function updateCreator(ctx: Ctx, id: string, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(updateCreatorSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const cur = await one<{ version: number; talent_agency_id: string | null }>(tx,
      `select version, talent_agency_id from cm_creators where id = $1 and organization_id = $2 for update`, [id, actor.orgId])
    if (!cur) throw notFound('היוצר')
    if (cur.version !== v.expected_version) throw versionConflict()
    const email = 'email' in raw ? normalizeEmail(v.email) : undefined
    const phone = 'phone' in raw ? normalizePhone(v.phone) : undefined
    const social = v.social_accounts?.map((s) => ({ ...s, handle: normalizeHandle(s.handle) }))
    const dups = await findDuplicates(tx, actor.orgId, { email: email ?? null, phone: phone ?? null, social: social ?? [] }, id)
    if (dups.length) throw new DomainError('CONFLICT', `פרטים אלה כבר שייכים ליוצר אחר: ${dups.map((d) => d.display_name).join(', ')}`, { duplicates: dups })
    if ('talent_agency_id' in raw) await assertAgency(tx, actor.orgId, v.talent_agency_id)
    const sets: string[] = []
    const params: unknown[] = [id]
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (v.display_name) set('display_name', v.display_name)
    if (email !== undefined) set('email', email)
    if (phone !== undefined) set('phone', phone)
    if ('talent_agency_id' in raw) set('talent_agency_id', v.talent_agency_id ?? null)
    if (v.categories) set('categories', v.categories)
    if ('internal_notes' in raw) set('internal_notes', v.internal_notes ?? null)
    if (v.status) set('status', v.status)
    const r = await one<{ version: number }>(tx, `update cm_creators set ${[...sets, 'version = version + 1'].join(', ')} where id = $1 returning version`, params)
    if (social) {
      await tx.query(`delete from cm_creator_social_accounts where creator_id = $1`, [id])
      for (const s of social) {
        await tx.query(`insert into cm_creator_social_accounts (organization_id, creator_id, platform, handle, external_user_id, profile_url, follower_count)
          values ($1,$2,$3,$4,$5,$6,$7)`, [actor.orgId, id, s.platform, s.handle, s.external_user_id ?? null, s.profile_url ?? null, s.follower_count ?? null])
      }
    }
    // Leaving an agency ends its agents' assignments to this creator.
    if ('talent_agency_id' in raw && (v.talent_agency_id ?? null) !== cur.talent_agency_id) {
      await tx.query(`update cm_agent_creators ac set active = false from cm_agents a
        where ac.agent_id = a.id and ac.creator_id = $1 and a.talent_agency_id is not null
          and a.talent_agency_id is distinct from $2::uuid`, [id, v.talent_agency_id ?? null])
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'creator', entityId: id, action: 'creator.updated', summary: 'כרטיס היוצר עודכן',
      changes: { fields: Object.keys(raw).filter((k) => k !== 'expected_version') } })
    return { id, version: r!.version }
  }, ctx.db)
}

// ── Talent agencies and agents ─────────────────────────────────────────────

export const talentAgencySchema = z.object({
  name: zRequiredText(200),
  email: zOptText(200),
  phone: zOptText(40),
  internal_notes: zOptText(2000),
})

export async function listTalentAgencies(ctx: Ctx) {
  const actor = requireInternal(ctx.actor)
  return many<{ id: string; name: string; email: string | null; creators: number; agents: number }>(ctx.db,
    `select ta.id, ta.name, ta.email,
            (select count(*)::int from cm_creators c where c.talent_agency_id = ta.id) as creators,
            (select count(*)::int from cm_agents a where a.talent_agency_id = ta.id) as agents
       from cm_talent_agencies ta where ta.organization_id = $1 order by ta.name`, [actor.orgId])
}

export async function createTalentAgency(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(talentAgencySchema, input)
  return withTx(async (tx) => {
    try {
      const a = await one<{ id: string }>(tx, `insert into cm_talent_agencies (organization_id, name, email, phone, internal_notes, created_by)
        values ($1,$2,$3,$4,$5,$6) returning id`, [actor.orgId, v.name, normalizeEmail(v.email), normalizePhone(v.phone), v.internal_notes, actor.userId])
      await audit(tx, ctx, { campaignId: null, entityType: 'talent_agency', entityId: a!.id, action: 'talent_agency.created', summary: `נוספה סוכנות "${v.name}"` })
      return { id: a!.id }
    } catch (e) {
      if (pgCode(e) === '23505') throw new DomainError('CONFLICT', 'סוכנות בשם זה כבר קיימת')
      throw e
    }
  }, ctx.db)
}

export async function getTalentAgency(ctx: Ctx, id: string) {
  const actor = requireInternal(ctx.actor)
  const a = await one<{ id: string; name: string; email: string | null; phone: string | null; internal_notes: string | null }>(ctx.db,
    `select id, name, email, phone, internal_notes from cm_talent_agencies where id = $1 and organization_id = $2`, [id, actor.orgId])
  if (!a) throw notFound('הסוכנות')
  const agents = await many(ctx.db, `select a.id, a.display_name, a.email,
      coalesce((select json_agg(json_build_object('id', c.id, 'name', c.display_name) order by c.display_name)
         from cm_agent_creators ac join cm_creators c on c.id = ac.creator_id where ac.agent_id = a.id and ac.active), '[]') as creators
    from cm_agents a where a.talent_agency_id = $1 order by a.display_name`, [id])
  const creators = await many(ctx.db, `select id, display_name from cm_creators where talent_agency_id = $1 order by display_name`, [id])
  return { ...a, agents, creators }
}

export const agentSchema = z.object({
  display_name: zRequiredText(200),
  talent_agency_id: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  email: zOptText(200),
  phone: zOptText(40),
  internal_notes: zOptText(2000),
  creator_ids: z.array(zUuid).max(200).default([]),
})

export async function listAgents(ctx: Ctx) {
  const actor = requireInternal(ctx.actor)
  return many<{ id: string; display_name: string; agency_name: string | null; talent_agency_id: string | null; creators: number }>(ctx.db,
    `select a.id, a.display_name, ta.name as agency_name, a.talent_agency_id,
            (select count(*)::int from cm_agent_creators ac where ac.agent_id = a.id and ac.active) as creators
       from cm_agents a left join cm_talent_agencies ta on ta.id = a.talent_agency_id
      where a.organization_id = $1 order by ta.name nulls last, a.display_name`, [actor.orgId])
}

export async function createAgent(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(agentSchema, input)
  const email = normalizeEmail(v.email)
  return withTx(async (tx) => {
    await assertAgency(tx, actor.orgId, v.talent_agency_id)
    if (email && (await one(tx, `select 1 from cm_agents where organization_id = $1 and lower(email) = $2`, [actor.orgId, email]))) {
      throw new DomainError('CONFLICT', 'סוכן עם כתובת דוא"ל זו כבר קיים')
    }
    const a = await one<{ id: string }>(tx, `insert into cm_agents (organization_id, talent_agency_id, display_name, email, phone, internal_notes, created_by)
      values ($1,$2,$3,$4,$5,$6,$7) returning id`, [actor.orgId, v.talent_agency_id ?? null, v.display_name, email, normalizePhone(v.phone), v.internal_notes, actor.userId])
    for (const cid of v.creator_ids) await assignTx(tx, actor.orgId, a!.id, cid, true)
    await audit(tx, ctx, { campaignId: null, entityType: 'agent', entityId: a!.id, action: 'agent.created', summary: `נוסף סוכן "${v.display_name}"` })
    return { id: a!.id }
  }, ctx.db)
}

async function assignTx(tx: Queryable, orgId: string, agentId: string, creatorId: string, active: boolean) {
  const cr = await one<{ talent_agency_id: string | null }>(tx, `select talent_agency_id from cm_creators where id = $1 and organization_id = $2`, [creatorId, orgId])
  if (!cr) throw notFound('היוצר')
  if (active) await assertAgentForCreator(tx, orgId, agentId, cr.talent_agency_id)
  else if (!(await one(tx, `select 1 from cm_agents where id = $1 and organization_id = $2`, [agentId, orgId]))) throw notFound('הסוכן')
  await tx.query(`insert into cm_agent_creators (agent_id, creator_id, active) values ($1,$2,$3)
    on conflict (agent_id, creator_id) do update set active = excluded.active`, [agentId, creatorId, active])
}

export async function setAgentCreator(ctx: Ctx, agentId: string, creatorId: string, active: boolean) {
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    await assignTx(tx, actor.orgId, agentId, creatorId, active)
    await audit(tx, ctx, { campaignId: null, entityType: 'agent', entityId: agentId, action: active ? 'agent.creator_assigned' : 'agent.creator_unassigned',
      summary: active ? 'יוצר הוקצה לסוכן' : 'הקצאת היוצר לסוכן בוטלה', changes: { creator_id: creatorId } })
    return { ok: true }
  }, ctx.db)
}
