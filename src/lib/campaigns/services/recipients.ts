/**
 * Who receives an operational message. Internal: the campaign owner (and the
 * assigned reviewer where relevant). External: active, unexpired portal grants
 * with an email that cover the campaign — either named for it or for all
 * campaigns of their subject — inside the campaign's organization.
 */
import type { Queryable } from '../db'
import { many, one } from '../db'

export interface Recipient {
  audience: 'internal' | 'client' | 'creator' | 'agent' | 'agency'
  userId: string | null
  grantId: string | null
  email: string
  name: string
}

export async function ownerRecipient(db: Queryable, campaignId: string): Promise<Recipient | null> {
  const r = await one<{ id: string; email: string; full_name: string }>(db,
    `select u.id, u.email, u.full_name from cm_campaigns c join cm_accounts u on u.id = c.owner_user_id
      where c.id = $1 and u.status = 'active'`, [campaignId])
  return r ? { audience: 'internal', userId: r.id, grantId: null, email: r.email, name: r.full_name } : null
}

export async function userRecipient(db: Queryable, userId: string | null): Promise<Recipient | null> {
  if (!userId) return null
  const r = await one<{ id: string; email: string; full_name: string }>(db,
    `select id, email, full_name from cm_accounts where id = $1 and status = 'active'`, [userId])
  return r ? { audience: 'internal', userId: r.id, grantId: null, email: r.email, name: r.full_name } : null
}

const COVERS = `(g.campaign_id is null or g.campaign_id = c.id)`

export async function clientRecipients(db: Queryable, campaignId: string, now: Date): Promise<Recipient[]> {
  const rows = await many<{ id: string; recipient_email: string; recipient_name: string }>(db,
    `select g.id, g.recipient_email, g.recipient_name from cm_campaigns c
       join cm_portal_grants g on g.organization_id = c.organization_id and g.kind = 'client' and g.client_id = c.client_id and ${COVERS}
      where c.id = $1 and g.status = 'active' and g.expires_at > $2 and g.recipient_email is not null`, [campaignId, now])
  return rows.map((r) => ({ audience: 'client', userId: null, grantId: r.id, email: r.recipient_email, name: r.recipient_name }))
}

/** The creator's own grant, the assigned agents' grants and the talent agency's grant. */
export async function participationRecipients(db: Queryable, participationId: string, now: Date): Promise<Recipient[]> {
  const rows = await many<{ id: string; kind: 'creator' | 'agent' | 'agency'; recipient_email: string; recipient_name: string }>(db,
    `select g.id, g.kind, g.recipient_email, g.recipient_name
       from cm_participations p
       join cm_campaigns c on c.id = p.campaign_id
       join cm_creators cr on cr.id = p.creator_id
       join cm_portal_grants g on g.organization_id = p.organization_id and ${COVERS}
        and g.status = 'active' and g.expires_at > $2 and g.recipient_email is not null
        and ((g.kind = 'creator' and g.creator_id = p.creator_id)
          or (g.kind = 'agent' and exists (select 1 from cm_agent_creators ac join cm_agents a on a.id = ac.agent_id
               where ac.agent_id = g.agent_id and ac.creator_id = p.creator_id and ac.active
                 and (a.talent_agency_id is null or a.talent_agency_id = cr.talent_agency_id)))
          or (g.kind = 'agency' and g.talent_agency_id = cr.talent_agency_id))
      where p.id = $1`, [participationId, now])
  return rows.map((r) => ({ audience: r.kind, userId: null, grantId: r.id, email: r.recipient_email, name: r.recipient_name }))
}
