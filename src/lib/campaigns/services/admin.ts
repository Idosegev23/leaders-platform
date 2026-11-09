/**
 * Organization administration (org admins) and platform administration
 * (BRIEFLOW_PLATFORM_ADMINS: may create organizations; sees no campaign data
 * unless also a member). Invitation links are returned once and also emailed.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, pgCode, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, forbidden, invalid, notFound } from '../errors'
import { requireInternal, requireOrgAdmin } from '../auth/policy'
import { issueLoginToken, isPlatformAdmin, queueStaffLinkEmail } from '../auth/accounts'
import { PRODUCT } from '../brand'
import { normalizeEmail, parseInput, zRequiredText, zUuid } from '../validation'

const ROLE = z.enum(['admin', 'manager', 'staff'])

export async function listMembers(ctx: Ctx) {
  const actor = requireOrgAdmin(ctx.actor)
  return many<{ account_id: string; full_name: string; email: string; role: string; status: string; last_login_at: Date | null }>(ctx.db,
    `select a.id as account_id, a.full_name, a.email, m.role, m.status, a.last_login_at
       from cm_memberships m join cm_accounts a on a.id = m.account_id
      where m.organization_id = $1 order by m.status, a.full_name`, [actor.orgId])
}

/** Find or create the account for an email (accounts are global; memberships are per organization). */
async function ensureAccount(db: Queryable, email: string, fullName: string): Promise<string> {
  const existing = await one<{ id: string }>(db, `select id from cm_accounts where lower(email) = $1`, [email])
  if (existing) return existing.id
  const a = await one<{ id: string }>(db, `insert into cm_accounts (email, full_name) values ($1,$2) returning id`, [email, fullName])
  return a!.id
}

export const inviteMemberSchema = z.object({ email: zRequiredText(200), full_name: zRequiredText(200), role: ROLE })

export async function inviteMember(ctx: Ctx, input: unknown): Promise<{ accountId: string; inviteUrl: string }> {
  const actor = requireOrgAdmin(ctx.actor)
  const v = parseInput(inviteMemberSchema, input)
  const email = normalizeEmail(v.email)!
  return withTx(async (tx) => {
    const accountId = await ensureAccount(tx, email, v.full_name)
    const m = await one<{ status: string }>(tx, `select status from cm_memberships where organization_id = $1 and account_id = $2`, [actor.orgId, accountId])
    if (m?.status === 'active') throw new DomainError('CONFLICT', 'המשתמש כבר חבר פעיל בארגון')
    await tx.query(`insert into cm_memberships (organization_id, account_id, role, status, invited_by) values ($1,$2,$3,'invited',$4)
      on conflict (organization_id, account_id) do update set role = excluded.role, status = 'invited', invited_by = excluded.invited_by`,
      [actor.orgId, accountId, v.role, actor.userId])
    const token = await issueLoginToken(tx, accountId, 'invite', ctx.now, actor.orgId)
    await queueStaffLinkEmail(tx, { accountId, email, name: v.full_name, purpose: 'invite', orgId: actor.orgId, orgName: actor.orgName }, ctx.now)
    await audit(tx, ctx, { campaignId: null, entityType: 'membership', entityId: accountId, action: 'member.invited',
      summary: `${v.full_name} הוזמן/ה לארגון בתפקיד ${v.role}` })
    return { accountId, inviteUrl: `${ctx.deps.baseUrl}/campaigns/enter#t=${token}` }
  }, ctx.db)
}

export async function updateMember(ctx: Ctx, accountId: string, input: unknown) {
  const actor = requireOrgAdmin(ctx.actor)
  const v = parseInput(z.object({ role: ROLE.optional(), status: z.enum(['active', 'disabled']).optional() }), input)
  if (accountId === actor.userId) throw invalid('אי אפשר לשנות את התפקיד או ההרשאה של עצמך')
  return withTx(async (tx) => {
    const m = await one<{ role: string; status: string }>(tx, `select role, status from cm_memberships where organization_id = $1 and account_id = $2 for update`,
      [actor.orgId, accountId])
    if (!m) throw notFound('החבר בארגון')
    if (v.status === 'active' && m.status === 'invited') throw invalid('המשתמש עדיין לא קיבל את ההזמנה')
    await tx.query(`update cm_memberships set role = coalesce($3, role), status = coalesce($4, status) where organization_id = $1 and account_id = $2`,
      [actor.orgId, accountId, v.role ?? null, v.status ?? null])
    if (v.status === 'disabled') {
      // End the person's sessions only if they have no other active membership.
      const other = await one(tx, `select 1 from cm_memberships where account_id = $1 and status = 'active' and organization_id <> $2`, [accountId, actor.orgId])
      if (!other) await tx.query(`update cm_account_sessions set revoked_at = $2 where account_id = $1 and revoked_at is null`, [accountId, ctx.now])
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'membership', entityId: accountId, action: 'member.updated',
      summary: v.status === 'disabled' ? 'הגישה לארגון הושבתה' : `התפקיד עודכן ל-${v.role ?? m.role}` })
    return { ok: true }
  }, ctx.db)
}

export const orgSettingsSchema = z.object({
  name: zRequiredText(200).optional(),
  sender_name: z.string().trim().max(100).optional().nullable(),
})

export async function getOrganization(ctx: Ctx) {
  const actor = requireInternal(ctx.actor)
  return one<{ id: string; name: string; slug: string; settings: Record<string, unknown>; created_at: Date }>(ctx.db,
    `select id, name, slug, settings, created_at from cm_organizations where id = $1`, [actor.orgId])
}

export async function updateOrganization(ctx: Ctx, input: unknown) {
  const actor = requireOrgAdmin(ctx.actor)
  const v = parseInput(orgSettingsSchema, input)
  return withTx(async (tx) => {
    await tx.query(`update cm_organizations set name = coalesce($2, name),
        settings = case when $3::boolean then jsonb_set(settings, '{sender_name}', to_jsonb($4::text)) else settings end
      where id = $1`, [actor.orgId, v.name ?? null, v.sender_name !== undefined, v.sender_name ?? null])
    await audit(tx, ctx, { campaignId: null, entityType: 'organization', entityId: actor.orgId, action: 'organization.updated', summary: 'הגדרות הארגון עודכנו' })
    return { ok: true }
  }, ctx.db)
}

// ── Platform (create organizations) ────────────────────────────────────────

function slugify(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return base.length >= 2 ? base : `org-${Math.random().toString(36).slice(2, 8)}`
}

export const createOrgSchema = z.object({
  name: zRequiredText(200),
  admin_email: zRequiredText(200),
  admin_name: zRequiredText(200),
})

/** Create an organization and invite its first admin. Platform admins, or self sign-up (signup=true). */
export async function createOrganization(db: Queryable, args: {
  input: unknown; byAccount: { id: string; email: string } | null; signup: boolean; now: Date; baseUrl: string
}): Promise<{ orgId: string; inviteUrl: string }> {
  if (!args.signup && !(args.byAccount && isPlatformAdmin(args.byAccount.email))) throw forbidden(`יצירת ארגון שמורה למנהלי ${PRODUCT.name}`)
  const v = parseInput(createOrgSchema, args.input)
  const email = normalizeEmail(v.admin_email)!
  let slug = slugify(v.name)
  if (await one(db, `select 1 from cm_organizations where slug = $1`, [slug])) slug = `${slug.slice(0, 33)}-${Math.random().toString(36).slice(2, 8)}`
  try {
    const org = await one<{ id: string }>(db, `insert into cm_organizations (name, slug, created_by) values ($1,$2,$3) returning id`,
      [v.name, slug, args.byAccount?.id ?? null])
    const accountId = await ensureAccount(db, email, v.admin_name)
    await db.query(`insert into cm_memberships (organization_id, account_id, role, status, invited_by) values ($1,$2,'admin','invited',$3)`,
      [org!.id, accountId, args.byAccount?.id ?? null])
    const purpose = args.signup ? 'signup' : 'invite'
    const token = await issueLoginToken(db, accountId, purpose, args.now, org!.id)
    await queueStaffLinkEmail(db, { accountId, email, name: v.admin_name, purpose, orgId: org!.id, orgName: v.name }, args.now)
    await db.query(`insert into cm_audit_events (organization_id, entity_type, entity_id, action, actor_type, actor_user_id, actor_label, summary)
      values ($1,'organization',$1,'organization.created',$2,$3,$4,$5)`,
      [org!.id, args.byAccount ? 'user' : 'system', args.byAccount?.id ?? null, args.byAccount?.email ?? 'הרשמה עצמית', `נוצר ארגון "${v.name}"`])
    return { orgId: org!.id, inviteUrl: `${args.baseUrl}/campaigns/enter#t=${token}` }
  } catch (e) {
    if (pgCode(e) === '23505') throw new DomainError('CONFLICT', 'ארגון בשם זה כבר קיים')
    throw e
  }
}

export async function listOrganizations(db: Queryable, byAccount: { email: string }) {
  if (!isPlatformAdmin(byAccount.email)) throw forbidden()
  return many<{ id: string; name: string; slug: string; status: string; members: number; campaigns: number; created_at: Date }>(db,
    `select o.id, o.name, o.slug, o.status, o.created_at,
            (select count(*)::int from cm_memberships m where m.organization_id = o.id and m.status = 'active') as members,
            (select count(*)::int from cm_campaigns c where c.organization_id = o.id) as campaigns
       from cm_organizations o order by o.created_at desc`)
}

export async function setOrganizationStatus(db: Queryable, byAccount: { email: string }, orgId: string, status: 'active' | 'suspended') {
  if (!isPlatformAdmin(byAccount.email)) throw forbidden()
  parseInput(zUuid, orgId)
  await db.query(`update cm_organizations set status = $2 where id = $1`, [orgId, status])
  return { ok: true }
}
