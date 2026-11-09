/**
 * Authorization. Every service function resolves the record it is about to
 * touch through one of these helpers, which scope the lookup by the actor in
 * SQL. Ids sent by the browser are only ever used as lookup keys inside that
 * scope, never trusted on their own. A record outside the actor's scope is
 * reported as "not found" so ids cannot be probed.
 *
 * Internal levels per campaign:
 *   manage  = module admin, the campaign owner, or a member with role manager
 *   operate = the above plus members with role staff (tasks, shipments,
 *             comments, viewing). Staff cannot approve, invite, change money
 *             or close.
 */
import type { Queryable } from '../db'
import { one } from '../db'
import type { Actor, Ctx, InternalActor, PortalActor } from '../context'
import { DomainError, forbidden, notFound } from '../errors'

export type CampaignLevel = 'manage' | 'operate'

export interface CampaignAccess {
  campaignId: string
  clientId: string
  status: string
  ownerUserId: string
  currency: string
  name: string
  level: CampaignLevel
}

export function requireInternal(actor: Actor): InternalActor {
  if (actor.kind !== 'internal') throw new DomainError('UNAUTHENTICATED', 'נדרשת התחברות עם חשבון הצוות')
  return actor
}

export function requirePortal(actor: Actor): PortalActor {
  if (actor.kind !== 'portal') throw new DomainError('UNAUTHENTICATED', 'נדרשת כניסה דרך קישור ההזמנה')
  return actor
}

export function canCreateCampaigns(actor: InternalActor): boolean {
  return actor.role === 'admin' || actor.role === 'manager'
}

export async function requireCampaign(db: Queryable, ctx: Pick<Ctx, 'actor'>, campaignId: string, need: CampaignLevel): Promise<CampaignAccess> {
  const actor = requireInternal(ctx.actor)
  if (!isUuid(campaignId)) throw notFound('הקמפיין')
  const row = await one<{
    id: string; client_id: string; status: string; owner_user_id: string; currency: string; name: string; member_role: string | null
  }>(db,
    `select c.id, c.client_id, c.status, c.owner_user_id, c.currency, c.name, m.role as member_role
       from cm_campaigns c
       left join cm_campaign_members m on m.campaign_id = c.id and m.user_id = $2
      where c.id = $1`,
    [campaignId, actor.userId],
  )
  if (!row) throw notFound('הקמפיין')
  let level: CampaignLevel | null = null
  if (actor.role === 'admin' || row.owner_user_id === actor.userId || row.member_role === 'manager') level = 'manage'
  else if (row.member_role === 'staff') level = 'operate'
  if (!level) throw notFound('הקמפיין')
  if (need === 'manage' && level !== 'manage') throw forbidden('פעולה זו שמורה למנהלת הקמפיין')
  return {
    campaignId: row.id, clientId: row.client_id, status: row.status, ownerUserId: row.owner_user_id,
    currency: row.currency, name: row.name, level,
  }
}

/** SQL predicate (alias c = cm_campaigns) limiting campaigns to the internal actor's scope. */
export function internalCampaignScope(actor: InternalActor, userParam: string): string {
  if (actor.role === 'admin') return 'true'
  return `(c.owner_user_id = ${userParam} or exists (select 1 from cm_campaign_members mm where mm.campaign_id = c.id and mm.user_id = ${userParam}))`
}

// ── Portal scope ───────────────────────────────────────────────────────────

/**
 * SQL predicate (alias p = cm_participations) for participations a creator or
 * agent grant may see: same campaign as the grant, already invited, and the
 * creator is theirs (creator) or represented by them (agent, active link).
 * Bind `campaignParam` to actor.campaignId and `subjectParam` to portalSubjectId(actor).
 */
export function portalParticipationScope(actor: PortalActor, campaignParam: string, subjectParam: string): string {
  const base = `p.campaign_id = ${campaignParam} and p.participation_status <> 'not_invited'`
  if (actor.grantKind === 'creator') return `${base} and p.creator_id = ${subjectParam}`
  if (actor.grantKind === 'agent') {
    return `${base} and p.agent_id = ${subjectParam}
      and exists (select 1 from cm_agent_creators ac where ac.agent_id = p.agent_id and ac.creator_id = p.creator_id and ac.active)`
  }
  return `false and ${subjectParam}::uuid is null`
}

/** The creator id (creator grant) or agent id (agent grant) the portal scope is bound to. */
export function portalSubjectId(actor: PortalActor): string | null {
  return actor.grantKind === 'creator' ? actor.creatorId : actor.grantKind === 'agent' ? actor.agentId : null
}

export interface PortalParticipation {
  id: string
  campaign_id: string
  creator_id: string
  agent_id: string | null
  participation_status: string
  selection_status: string
  terms_version: number
}

export async function requirePortalParticipation(db: Queryable, actor: PortalActor, participationId: string): Promise<PortalParticipation> {
  if (actor.grantKind === 'client') throw notFound('ההשתתפות')
  if (!isUuid(participationId)) throw notFound('ההשתתפות')
  const row = await one<PortalParticipation>(db,
    `select p.id, p.campaign_id, p.creator_id, p.agent_id, p.participation_status, p.selection_status, p.terms_version
       from cm_participations p
      where p.id = $1 and ${portalParticipationScope(actor, '$2', '$3')}`,
    [participationId, actor.campaignId, portalSubjectId(actor)],
  )
  if (!row) throw notFound('ההשתתפות')
  return row
}

export async function requirePortalDeliverable(db: Queryable, actor: PortalActor, deliverableId: string) {
  if (!isUuid(deliverableId)) throw notFound('התוצר')
  if (actor.grantKind === 'client') {
    // Clients see a deliverable once any version of it was released to them (passed
    // internal approval). It stays visible afterwards so that acting on a version
    // that was since replaced gets a clear conflict, not a vanished item.
    const row = await one<{ id: string; participation_id: string; campaign_id: string; status: string; current_version_id: string | null }>(db,
      `select d.id, d.participation_id, d.campaign_id, d.status, d.current_version_id
         from cm_deliverables d join cm_campaigns c on c.id = d.campaign_id
        where d.id = $1 and d.campaign_id = $2 and c.client_id = $3
          and d.status <> 'cancelled'
          and exists (select 1 from cm_approval_decisions a where a.target_type = 'content_version'
                       and a.campaign_id = d.campaign_id and a.approval_stage = 'internal' and a.decision = 'approved'
                       and a.target_id in (select v.id from cm_content_versions v where v.deliverable_id = d.id))`,
      [deliverableId, actor.campaignId, actor.clientId],
    )
    if (!row) throw notFound('התוצר')
    return row
  }
  const row = await one<{ id: string; participation_id: string; campaign_id: string; status: string; current_version_id: string | null }>(db,
    `select d.id, d.participation_id, d.campaign_id, d.status, d.current_version_id
       from cm_deliverables d join cm_participations p on p.id = d.participation_id
      where d.id = $1 and ${portalParticipationScope(actor, '$2', '$3')}`,
    [deliverableId, actor.campaignId, portalSubjectId(actor)],
  )
  if (!row) throw notFound('התוצר')
  return row
}

/** Client grants: the campaign must belong to the grant's client (checked again, not assumed). */
export async function requireClientCampaign(db: Queryable, actor: PortalActor) {
  if (actor.grantKind !== 'client') throw notFound('הקמפיין')
  const row = await one<{ id: string; name: string; status: string; client_id: string }>(db,
    `select id, name, status, client_id from cm_campaigns where id = $1 and client_id = $2`,
    [actor.campaignId, actor.clientId],
  )
  if (!row) throw notFound('הקמפיין')
  return row
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}
