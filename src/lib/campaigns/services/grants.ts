/**
 * Invitations (portal grants) for client representatives, creators and agents.
 * The raw invite link is returned ONCE to the manager who created it (to
 * share by hand, e.g. WhatsApp); only its hash is stored. Emails sent by the
 * system carry their own fresh, short-lived link.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { invalid, notFound } from '../errors'
import { requireCampaign, requireInternal } from '../auth/policy'
import { issueToken, hashSecret } from '../portal/access'
import { rateLimit } from '../rate-limit'
import { sendTo } from '../jobs/automation'
import { normalizeEmail, parseInput, zOptText, zRequiredText } from '../validation'
import { randomUUID } from 'node:crypto'
import { PRODUCT } from '@/lib/campaigns/brand'

export const GRANT_DEFAULT_DAYS = 120

export const createGrantSchema = z.object({
  kind: z.enum(['client', 'creator', 'agent']),
  creator_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
  recipient_name: zRequiredText(200),
  recipient_email: zOptText(200),
  send_email: z.boolean().default(false),
})

export interface CreatedGrant { grantId: string; inviteUrl: string; expiresAt: Date }

export async function createGrantTx(tx: Queryable, ctx: Ctx, campaignId: string, input: z.infer<typeof createGrantSchema>): Promise<CreatedGrant> {
  const actor = requireInternal(ctx.actor)
  const camp = await one<{ client_id: string; name: string; end_date: string | null }>(tx,
    `select client_id, name, to_char(end_date,'YYYY-MM-DD') as end_date from cm_campaigns where id = $1`, [campaignId])
  if (!camp) throw notFound('הקמפיין')
  const email = normalizeEmail(input.recipient_email)
  if (input.send_email && !email) throw invalid('לשליחה בדוא"ל צריך כתובת דוא"ל')
  let clientId: string | null = null, creatorId: string | null = null, agentId: string | null = null
  if (input.kind === 'client') {
    clientId = camp.client_id // never taken from the request
  } else if (input.kind === 'creator') {
    if (!input.creator_id) throw invalid('חסר יוצר')
    const p = await one(tx, `select 1 from cm_participations where campaign_id = $1 and creator_id = $2`, [campaignId, input.creator_id])
    if (!p) throw invalid('היוצר אינו משתתף בקמפיין')
    creatorId = input.creator_id
  } else {
    if (!input.agent_id) throw invalid('חסר סוכן')
    const p = await one(tx, `select 1 from cm_participations p join cm_agent_creators ac on ac.agent_id = p.agent_id and ac.creator_id = p.creator_id and ac.active
      where p.campaign_id = $1 and p.agent_id = $2`, [campaignId, input.agent_id])
    if (!p) throw invalid('הסוכן אינו מייצג אף משתתף בקמפיין')
    agentId = input.agent_id
  }
  const endish = camp.end_date ? new Date(`${camp.end_date}T00:00:00Z`).getTime() + 60 * 86_400_000 : 0
  const expiresAt = new Date(Math.max(ctx.now.getTime() + GRANT_DEFAULT_DAYS * 86_400_000, endish))
  const g = await one<{ id: string }>(tx,
    `insert into cm_portal_grants (kind, campaign_id, client_id, creator_id, agent_id, recipient_name, recipient_email, expires_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [input.kind, campaignId, clientId, creatorId, agentId, input.recipient_name, email, expiresAt, actor.userId])
  const { token } = await issueToken(tx, g!.id, 'invite', ctx.now, actor.userId)
  if (input.send_email && email) {
    await sendTo(tx, [{ audience: input.kind, userId: null, grantId: g!.id, email, name: input.recipient_name }], {
      campaignId, key: `grant:${g!.id}:invite`, correlationId: randomUUID(),
      subject: `הזמנה לקמפיין "${camp.name}" — ${PRODUCT.name}`,
      body: input.kind === 'client'
        ? `שלום ${input.recipient_name},\nהוזמנת לאשר משפיענים ותכנים בקמפיין "${camp.name}".`
        : `שלום ${input.recipient_name},\nהוזמנת להצטרף לקמפיין "${camp.name}". בפורטל אפשר לראות את התנאים והתוצרים, לאשר השתתפות ולהגיש תוכן.`,
      internalPath: null, portalPath: '/portal',
    }, ctx.now)
  }
  await audit(tx, ctx, { campaignId, entityType: 'portal_grant', entityId: g!.id, action: 'grant.created',
    summary: `נוצרה הזמנה (${input.kind}) עבור ${input.recipient_name}`, changes: { kind: input.kind, send_email: input.send_email } })
  return { grantId: g!.id, inviteUrl: `${ctx.deps.baseUrl}/portal/enter#t=${token}`, expiresAt }
}

export async function createGrant(ctx: Ctx, campaignId: string, input: unknown): Promise<CreatedGrant> {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const v = parseInput(createGrantSchema, input)
  return withTx((tx) => createGrantTx(tx, ctx, campaignId, v), ctx.db)
}

export async function listGrants(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  return many(ctx.db,
    `select g.id, g.kind, g.recipient_name, g.recipient_email, g.status, g.expires_at, g.last_entered_at, g.created_at,
            cr.display_name as creator_name, a.display_name as agent_name,
            (select count(*)::int from cm_portal_sessions s where s.grant_id = g.id) as sessions
       from cm_portal_grants g left join cm_creators cr on cr.id = g.creator_id left join cm_agents a on a.id = g.agent_id
      where g.campaign_id = $1 order by g.created_at desc`, [campaignId])
}

async function loadGrantForManage(ctx: Ctx, grantId: string) {
  const g = await one<{ campaign_id: string }>(ctx.db, `select campaign_id from cm_portal_grants where id = $1`, [grantId])
  if (!g) throw notFound('ההזמנה')
  await requireCampaign(ctx.db, ctx, g.campaign_id, 'manage')
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
  const grants = await many<{ id: string; campaign_id: string; kind: 'client' | 'creator' | 'agent'; recipient_name: string; campaign_name: string }>(db,
    `select g.id, g.campaign_id, g.kind, g.recipient_name, c.name as campaign_name
       from cm_portal_grants g join cm_campaigns c on c.id = g.campaign_id
      where lower(g.recipient_email) = $1 and g.status = 'active' and g.expires_at > $2 and c.status not in ('cancelled')`, [email, now])
  for (const g of grants) {
    await sendTo(db, [{ audience: g.kind, userId: null, grantId: g.id, email, name: g.recipient_name }], {
      campaignId: g.campaign_id, key: `login:${g.id}:${now.getTime()}`, correlationId: randomUUID(),
      subject: `קישור כניסה לקמפיין "${g.campaign_name}"`,
      body: `שלום ${g.recipient_name},\nזה קישור הכניסה שביקשת. הוא תקף לשימוש אחד.`,
      internalPath: null, portalPath: '/portal',
    }, now)
  }
}
