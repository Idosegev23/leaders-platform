/**
 * Invitations (portal grants) for the brand side (client representatives)
 * and the influencer side (creators, agents, talent agencies). A grant names
 * one campaign, or — all_campaigns — every campaign of that client / creator /
 * agent / agency inside the organization, now and in the future.
 *
 * The raw invite link is returned ONCE to the person who created it (to share
 * by hand); only its hash is stored. System emails carry their own fresh,
 * short-lived link.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Ctx, PortalKind } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { forbidden, invalid, notFound } from '../errors'
import { canCreateCampaigns, requireCampaign, requireInternal } from '../auth/policy'
import { issueToken, hashSecret } from '../portal/access'
import { rateLimit } from '../rate-limit'
import { sendTo } from '../jobs/automation'
import { normalizeEmail, parseInput, zOptText, zRequiredText } from '../validation'

export const GRANT_DEFAULT_DAYS = 120
export const ORG_WIDE_GRANT_DAYS = 365

export const createGrantSchema = z.object({
  kind: z.enum(['client', 'creator', 'agent', 'agency']),
  client_id: z.string().uuid().optional(),
  creator_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
  talent_agency_id: z.string().uuid().optional(),
  recipient_name: zRequiredText(200),
  recipient_email: zOptText(200),
  send_email: z.boolean().default(false),
  /** every campaign of the subject in the organization, instead of just this one */
  all_campaigns: z.boolean().default(false),
})

export interface CreatedGrant { grantId: string; inviteUrl: string; expiresAt: Date }

const KIND_HE: Record<PortalKind, string> = { client: 'נציג/ת לקוח', creator: 'יוצר/ת', agent: 'סוכן/ת', agency: 'סוכנות' }

/**
 * Create a grant inside the actor's organization. campaignId (optional) is the
 * campaign the invitation is created from; with all_campaigns the grant is not
 * limited to it. The subject is always validated against the organization (and
 * the campaign when one is given) — never taken on trust from the request.
 */
export async function createGrantTx(tx: Queryable, ctx: Ctx, campaignId: string | null, input: z.infer<typeof createGrantSchema>): Promise<CreatedGrant> {
  const actor = requireInternal(ctx.actor)
  const org = actor.orgId
  const camp = campaignId
    ? await one<{ client_id: string; name: string; end_date: string | null }>(tx,
        `select client_id, name, to_char(end_date,'YYYY-MM-DD') as end_date from cm_campaigns where id = $1 and organization_id = $2`, [campaignId, org])
    : null
  if (campaignId && !camp) throw notFound('הקמפיין')
  const scopedCampaign = input.all_campaigns ? null : campaignId
  if (!campaignId && !input.all_campaigns) throw invalid('הזמנה שלא מתוך קמפיין חייבת להיות לכל הקמפיינים')
  const email = normalizeEmail(input.recipient_email)
  if (input.send_email && !email) throw invalid('לשליחה בדוא"ל צריך כתובת דוא"ל')

  let clientId: string | null = null, creatorId: string | null = null, agentId: string | null = null, agencyId: string | null = null
  switch (input.kind) {
    case 'client':
      clientId = camp ? camp.client_id : input.client_id ?? null // from a campaign: never taken from the request
      if (!clientId || !(await one(tx, `select 1 from cm_clients where id = $1 and organization_id = $2`, [clientId, org]))) throw invalid('הלקוח לא נמצא')
      break
    case 'creator':
      if (!input.creator_id) throw invalid('חסר יוצר')
      if (campaignId && !(await one(tx, `select 1 from cm_participations where campaign_id = $1 and creator_id = $2`, [campaignId, input.creator_id]))) throw invalid('היוצר אינו משתתף בקמפיין')
      if (!(await one(tx, `select 1 from cm_creators where id = $1 and organization_id = $2`, [input.creator_id, org]))) throw invalid('היוצר לא נמצא')
      creatorId = input.creator_id
      break
    case 'agent':
      if (!input.agent_id) throw invalid('חסר סוכן')
      if (!(await one(tx, `select 1 from cm_agents where id = $1 and organization_id = $2`, [input.agent_id, org]))) throw invalid('הסוכן לא נמצא')
      if (campaignId && !(await one(tx, `select 1 from cm_participations p join cm_agent_creators ac on ac.creator_id = p.creator_id and ac.active
          where p.campaign_id = $1 and ac.agent_id = $2`, [campaignId, input.agent_id]))) throw invalid('לסוכן אין יוצרים בקמפיין זה')
      agentId = input.agent_id
      break
    case 'agency':
      if (!input.talent_agency_id) throw invalid('חסרה סוכנות')
      if (!(await one(tx, `select 1 from cm_talent_agencies where id = $1 and organization_id = $2`, [input.talent_agency_id, org]))) throw invalid('הסוכנות לא נמצאה')
      if (campaignId && !(await one(tx, `select 1 from cm_participations p join cm_creators c on c.id = p.creator_id
          where p.campaign_id = $1 and c.talent_agency_id = $2`, [campaignId, input.talent_agency_id]))) throw invalid('לסוכנות אין יוצרים בקמפיין זה')
      agencyId = input.talent_agency_id
      break
  }

  const days = scopedCampaign ? GRANT_DEFAULT_DAYS : ORG_WIDE_GRANT_DAYS
  const endish = scopedCampaign && camp?.end_date ? new Date(`${camp.end_date}T00:00:00Z`).getTime() + 60 * 86_400_000 : 0
  const expiresAt = new Date(Math.max(ctx.now.getTime() + days * 86_400_000, endish))
  const g = await one<{ id: string }>(tx,
    `insert into cm_portal_grants (organization_id, kind, campaign_id, client_id, creator_id, agent_id, talent_agency_id,
        recipient_name, recipient_email, expires_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [org, input.kind, scopedCampaign, clientId, creatorId, agentId, agencyId, input.recipient_name, email, expiresAt, actor.userId])
  const { token } = await issueToken(tx, g!.id, 'invite', ctx.now, actor.userId)
  const what = scopedCampaign ? `לקמפיין "${camp!.name}"` : `לקמפיינים של ${actor.orgName}`
  if (input.send_email && email) {
    await sendTo(tx, [{ audience: input.kind, userId: null, grantId: g!.id, email, name: input.recipient_name }], {
      campaignId: scopedCampaign, organizationId: org, key: `grant:${g!.id}:invite`, correlationId: randomUUID(),
      subject: `הזמנה ${what}`,
      body: input.kind === 'client'
        ? `שלום ${input.recipient_name},\nהוזמנת לאשר משפיענים ותכנים ${what}.`
        : `שלום ${input.recipient_name},\nהוזמנת ${what}. בפורטל אפשר לראות את התנאים והתוצרים, לאשר השתתפות ולהגיש תוכן.`,
      internalPath: null, portalPath: '/portal',
    }, ctx.now)
  }
  await audit(tx, ctx, { campaignId: scopedCampaign, entityType: 'portal_grant', entityId: g!.id, action: 'grant.created',
    summary: `נוצרה הזמנה (${KIND_HE[input.kind]}${scopedCampaign ? '' : ', כל הקמפיינים'}) עבור ${input.recipient_name}`,
    changes: { kind: input.kind, send_email: input.send_email, all_campaigns: !scopedCampaign } })
  return { grantId: g!.id, inviteUrl: `${ctx.deps.baseUrl}/portal/enter#t=${token}`, expiresAt }
}

export async function createGrant(ctx: Ctx, campaignId: string, input: unknown): Promise<CreatedGrant> {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const v = parseInput(createGrantSchema, input)
  return withTx((tx) => createGrantTx(tx, ctx, campaignId, v), ctx.db)
}

/** Organization-level invitation (all campaigns), e.g. from a talent agency or client page. */
export async function createOrgGrant(ctx: Ctx, input: unknown): Promise<CreatedGrant> {
  const actor = requireInternal(ctx.actor)
  if (!canCreateCampaigns(actor)) throw forbidden('יצירת הזמנה לכל הקמפיינים שמורה למנהלות ולמנהלי הארגון')
  const v = parseInput(createGrantSchema, { ...(input as object), all_campaigns: true })
  return withTx((tx) => createGrantTx(tx, ctx, null, v), ctx.db)
}

const GRANT_COLUMNS = `g.id, g.kind, g.campaign_id, g.recipient_name, g.recipient_email, g.status, g.expires_at, g.last_entered_at, g.created_at,
  cr.display_name as creator_name, a.display_name as agent_name, ta.name as agency_name, cl.name as client_name,
  (select count(*)::int from cm_portal_sessions s where s.grant_id = g.id) as sessions`
const GRANT_JOINS = `left join cm_creators cr on cr.id = g.creator_id left join cm_agents a on a.id = g.agent_id
  left join cm_talent_agencies ta on ta.id = g.talent_agency_id left join cm_clients cl on cl.id = g.client_id`

/** Grants of this campaign plus organization-wide grants that cover it. */
export async function listGrants(ctx: Ctx, campaignId: string) {
  const acc = await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  return many(ctx.db,
    `select ${GRANT_COLUMNS} from cm_portal_grants g ${GRANT_JOINS}
      where g.organization_id = $2 and (g.campaign_id = $1 or (g.campaign_id is null and (
             (g.kind = 'client' and g.client_id = $3)
          or (g.kind = 'creator' and exists (select 1 from cm_participations p where p.campaign_id = $1 and p.creator_id = g.creator_id))
          or (g.kind = 'agent' and exists (select 1 from cm_participations p join cm_agent_creators ac on ac.creator_id = p.creator_id and ac.active
                                            where p.campaign_id = $1 and ac.agent_id = g.agent_id))
          or (g.kind = 'agency' and exists (select 1 from cm_participations p join cm_creators c on c.id = p.creator_id
                                            where p.campaign_id = $1 and c.talent_agency_id = g.talent_agency_id)))))
      order by g.created_at desc`, [campaignId, acc.orgId, acc.clientId])
}

/** All grants of the organization (managers). */
export async function listOrgGrants(ctx: Ctx) {
  const actor = requireInternal(ctx.actor)
  if (!canCreateCampaigns(actor)) throw forbidden()
  return many(ctx.db, `select ${GRANT_COLUMNS}, c.name as campaign_name from cm_portal_grants g ${GRANT_JOINS}
    left join cm_campaigns c on c.id = g.campaign_id where g.organization_id = $1 order by g.created_at desc limit 500`, [actor.orgId])
}

async function loadGrantForManage(ctx: Ctx, grantId: string) {
  const actor = requireInternal(ctx.actor)
  const g = await one<{ campaign_id: string | null }>(ctx.db, `select campaign_id from cm_portal_grants where id = $1 and organization_id = $2`, [grantId, actor.orgId])
  if (!g) throw notFound('ההזמנה')
  if (g.campaign_id) await requireCampaign(ctx.db, ctx, g.campaign_id, 'manage')
  else if (!canCreateCampaigns(actor)) throw forbidden()
  return g
}

export async function revokeGrant(ctx: Ctx, grantId: string) {
  const g = await loadGrantForManage(ctx, grantId)
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    await tx.query(`update cm_portal_grants set status = 'revoked', revoked_at = $2, revoked_by = $3 where id = $1`, [grantId, ctx.now, actor.userId])
    await tx.query(`update cm_portal_tokens set revoked_at = $2 where grant_id = $1 and revoked_at is null and used_at is null`, [grantId, ctx.now])
    await tx.query(`update cm_portal_sessions set revoked_at = $2 where grant_id = $1 and revoked_at is null`, [grantId, ctx.now])
    await audit(tx, ctx, { campaignId: g.campaign_id, entityType: 'portal_grant', entityId: grantId, action: 'grant.revoked', summary: 'ההזמנה בוטלה וכל הכניסות הפעילות נותקו' })
    return { ok: true }
  }, ctx.db)
}

/** New invite link; older unused links stop working. */
export async function reissueGrant(ctx: Ctx, grantId: string): Promise<{ inviteUrl: string }> {
  const g = await loadGrantForManage(ctx, grantId)
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    const cur = await one<{ status: string; expires_at: Date }>(tx, `select status, expires_at from cm_portal_grants where id = $1 for update`, [grantId])
    if (!cur || cur.status !== 'active') throw invalid('ההזמנה בוטלה. צרו הזמנה חדשה.')
    await tx.query(`update cm_portal_tokens set revoked_at = $2 where grant_id = $1 and revoked_at is null and used_at is null`, [grantId, ctx.now])
    if (new Date(cur.expires_at) <= ctx.now) {
      await tx.query(`update cm_portal_grants set expires_at = $2 where id = $1`, [grantId, new Date(ctx.now.getTime() + GRANT_DEFAULT_DAYS * 86_400_000)])
    }
    const { token } = await issueToken(tx, grantId, 'invite', ctx.now, actor.userId)
    await audit(tx, ctx, { campaignId: g.campaign_id, entityType: 'portal_grant', entityId: grantId, action: 'grant.reissued', summary: 'הונפק קישור הזמנה חדש' })
    return { inviteUrl: `${ctx.deps.baseUrl}/portal/enter#t=${token}` }
  }, ctx.db)
}

/**
 * Public: "send me a login link". Same answer whether or not the address is
 * known, so it cannot be used to discover who was invited.
 */
export async function requestLoginLink(db: Queryable, emailRaw: string, now: Date, clientKey: string): Promise<void> {
  await rateLimit(db, `login-link:ip:${hashSecret(clientKey).slice(0, 32)}`, 10, 3600, now)
  let email: string | null
  try { email = normalizeEmail(emailRaw) } catch { return }
  if (!email) return
  await rateLimit(db, `login-link:email:${hashSecret(email).slice(0, 32)}`, 3, 3600, now)
  const grants = await many<{ id: string; organization_id: string; campaign_id: string | null; kind: PortalKind; recipient_name: string; scope_name: string }>(db,
    `select g.id, g.organization_id, g.campaign_id, g.kind, g.recipient_name, coalesce(c.name, o.name) as scope_name
       from cm_portal_grants g join cm_organizations o on o.id = g.organization_id
       left join cm_campaigns c on c.id = g.campaign_id
      where lower(g.recipient_email) = $1 and g.status = 'active' and g.expires_at > $2 and o.status = 'active'
        and (c.id is null or c.status <> 'cancelled')`, [email, now])
  for (const g of grants) {
    await sendTo(db, [{ audience: g.kind, userId: null, grantId: g.id, email, name: g.recipient_name }], {
      campaignId: g.campaign_id, organizationId: g.organization_id, key: `login:${g.id}:${now.getTime()}`, correlationId: randomUUID(),
      subject: `קישור כניסה — ${g.scope_name}`,
      body: `שלום ${g.recipient_name},\nזה קישור הכניסה שביקשת. הוא תקף לשימוש אחד.`,
      internalPath: null, portalPath: '/portal',
    }, now)
  }
}
