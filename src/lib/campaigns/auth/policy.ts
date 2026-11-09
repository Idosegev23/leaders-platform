/**
 * Authorization. Every service function resolves the record it is about to
 * touch through one of these helpers, which scope the lookup by the actor in
 * SQL — first by ORGANIZATION (tenant), then by role/assignment. Ids sent by
 * the browser are only lookup keys inside that scope. A record outside the
 * actor's scope is reported as "not found" so ids cannot be probed, including
 * across organizations.
 *
 * Internal levels per campaign (within the actor's active organization):
 *   manage  = org admin, the campaign owner, or a member with role manager
 *   operate = the above plus members with role staff (tasks, shipments,
 *             comments, viewing). Staff cannot approve, invite, change money
 *             or close.
 *
 * Portal (invitation) scopes, always inside the grant's organization and, if
 * the grant names a campaign, inside that campaign:
 *   client  → campaigns of their client
 *   creator → their own participations
 *   agent   → participations of creators assigned to them (active assignment,
 *             within the agent's talent agency)
 *   agency  → participations of every creator the talent agency represents
 * Only participations that were already invited are ever visible to the
 * influencer side.
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
  orgId: string
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

export function requireOrgAdmin(actor: Actor): InternalActor {
  const a = requireInternal(actor)
  if (a.role !== 'admin') throw forbidden('פעולה זו שמורה למנהלי הארגון')
  return a
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
      where c.id = $1 and c.organization_id = $3`,
    [campaignId, actor.userId, actor.orgId],
  )
  if (!row) throw notFound('הקמפיין')
  let level: CampaignLevel | null = null
  if (actor.role === 'admin' || row.owner_user_id === actor.userId || row.member_role === 'manager') level = 'manage'
  else if (row.member_role === 'staff') level = 'operate'
  if (!level) throw notFound('הקמפיין')
  if (need === 'manage' && level !== 'manage') throw forbidden('פעולה זו שמורה למנהלת הקמפיין')
  return {
    campaignId: row.id, clientId: row.client_id, status: row.status, ownerUserId: row.owner_user_id,
    currency: row.currency, name: row.name, level, orgId: actor.orgId,
  }
}

/**
 * SQL predicate (alias c = cm_campaigns) limiting campaigns to the internal
 * actor's scope: always their organization; admins see all of it, others
 * what they own or were added to.
 */
export function internalCampaignScope(actor: InternalActor, userParam: string, orgParam: string): string {
  // the user param is still referenced so callers bind the same parameter list for every role
  if (actor.role === 'admin') return `c.organization_id = ${orgParam} and ${userParam}::uuid is not null`
  return `c.organization_id = ${orgParam} and (c.owner_user_id = ${userParam}
    or exists (select 1 from cm_campaign_members mm where mm.campaign_id = c.id and mm.user_id = ${userParam}))`
}

// ── Portal scope ───────────────────────────────────────────────────────────

/**
 * SQL predicate (alias p = cm_participations) for participations an
 * influencer-side grant may see. Binds three parameters: the organization,
 * the grant's campaign (may be null = all) and the subject id from
 * portalSubjectId().
 */
export function portalParticipationScope(actor: PortalActor, orgParam: string, campaignParam: string, subjectParam: string): string {
  const base = `p.organization_id = ${orgParam} and (${campaignParam}::uuid is null or p.campaign_id = ${campaignParam}::uuid)
    and p.participation_status <> 'not_invited'`
  switch (actor.grantKind) {
    case 'creator':
      return `${base} and p.creator_id = ${subjectParam}`
    case 'agent':
      return `${base} and exists (
        select 1 from cm_agent_creators ac
          join cm_agents a on a.id = ac.agent_id
          join cm_creators cr on cr.id = ac.creator_id
         where ac.agent_id = ${subjectParam} and ac.creator_id = p.creator_id and ac.active
           and (a.talent_agency_id is null or a.talent_agency_id = cr.talent_agency_id))`
    case 'agency':
      return `${base} and exists (select 1 from cm_creators cr where cr.id = p.creator_id and cr.talent_agency_id = ${subjectParam})`
    default:
      return `false and ${subjectParam}::uuid is null`
  }
}

/** The creator / agent / talent agency id the portal scope is bound to. */
export function portalSubjectId(actor: PortalActor): string | null {
  switch (actor.grantKind) {
    case 'creator': return actor.creatorId
    case 'agent': return actor.agentId
    case 'agency': return actor.talentAgencyId
    default: return null
  }
}

/** Positional params for portalParticipationScope, starting at $start. */
export function portalScopeParams(actor: PortalActor): unknown[] {
  return [actor.orgId, actor.campaignId, portalSubjectId(actor)]
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
      where p.id = $1 and ${portalParticipationScope(actor, '$2', '$3', '$4')}`,
    [participationId, ...portalScopeParams(actor)],
  )
  if (!row) throw notFound('ההשתתפות')
  return row
}

/** SQL predicate (alias c = cm_campaigns) for the campaigns a client grant covers. Binds org, client, campaign. */
export function clientCampaignScope(orgParam: string, clientParam: string, campaignParam: string): string {
  return `c.organization_id = ${orgParam} and c.client_id = ${clientParam}
    and (${campaignParam}::uuid is null or c.id = ${campaignParam}::uuid)`
}

export async function requirePortalDeliverable(db: Queryable, actor: PortalActor, deliverableId: string) {
  if (!isUuid(deliverableId)) throw notFound('התוצר')
  if (actor.grantKind === 'client') {
    // Clients see a deliverable once any version of it was released to them
    // (passed internal approval). It stays visible afterwards so that acting
    // on a version that was since replaced gets a clear conflict.
    const row = await one<{ id: string; participation_id: string; campaign_id: string; status: string; current_version_id: string | null }>(db,
      `select d.id, d.participation_id, d.campaign_id, d.status, d.current_version_id
         from cm_deliverables d join cm_campaigns c on c.id = d.campaign_id
        where d.id = $1 and ${clientCampaignScope('$2', '$3', '$4')}
          and d.status <> 'cancelled'
          and exists (select 1 from cm_approval_decisions a where a.target_type = 'content_version'
                       and a.campaign_id = d.campaign_id and a.approval_stage = 'internal' and a.decision = 'approved'
                       and a.target_id in (select v.id from cm_content_versions v where v.deliverable_id = d.id))`,
      [deliverableId, actor.orgId, actor.clientId, actor.campaignId],
    )
    if (!row) throw notFound('התוצר')
    return row
  }
  const row = await one<{ id: string; participation_id: string; campaign_id: string; status: string; current_version_id: string | null }>(db,
    `select d.id, d.participation_id, d.campaign_id, d.status, d.current_version_id
       from cm_deliverables d join cm_participations p on p.id = d.participation_id
      where d.id = $1 and ${portalParticipationScope(actor, '$2', '$3', '$4')}`,
    [deliverableId, ...portalScopeParams(actor)],
  )
  if (!row) throw notFound('התוצר')
  return row
}

/**
 * Client grants: the campaign must be in the grant's organization, belong to
 * the grant's client and be covered by the grant (checked, never assumed).
 */
export async function requireClientCampaign(db: Queryable, actor: PortalActor, campaignId?: string | null) {
  if (actor.grantKind !== 'client') throw notFound('הקמפיין')
  const id = campaignId ?? actor.campaignId
  if (!id || !isUuid(id)) throw notFound('הקמפיין')
  const row = await one<{ id: string; name: string; status: string; client_id: string }>(db,
    `select c.id, c.name, c.status, c.client_id from cm_campaigns c where c.id = $4 and ${clientCampaignScope('$1', '$2', '$3')}`,
    [actor.orgId, actor.clientId, actor.campaignId, id],
  )
  if (!row) throw notFound('הקמפיין')
  return row
}

/** Leaders-only: may this organization link Hub briefs and contracts? */
export async function orgHasHub(db: Queryable, orgId: string): Promise<boolean> {
  const r = await one<{ hub: boolean }>(db, `select coalesce((settings->>'hub_integration')::boolean, false) as hub from cm_organizations where id = $1`, [orgId])
  return !!r?.hub
}

/** SQL boolean: account (param) is an active member of org (param), optionally with one of the roles. */
export function activeMemberSql(accountParam: string, orgParam: string, roles?: InternalActor['role'][]): string {
  return `exists (select 1 from cm_memberships mb join cm_accounts ac on ac.id = mb.account_id
    where mb.account_id = ${accountParam} and mb.organization_id = ${orgParam} and mb.status = 'active' and ac.status = 'active'
    ${roles ? `and mb.role in (${roles.map((r) => `'${r}'`).join(',')})` : ''})`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}
