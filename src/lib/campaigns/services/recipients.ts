/**
 * Who receives an operational message. Internal: the campaign owner (and the
 * assigned reviewer where relevant). External: active, unexpired portal grants
 * with an email for the campaign and the entity concerned.
 */
import type { Queryable } from '../db'
import { many, one } from '../db'

export interface Recipient {
  audience: 'internal' | 'client' | 'creator' | 'agent'
  userId: string | null
  grantId: string | null
  email: string
  name: string
}

export async function ownerRecipient(db: Queryable, campaignId: string): Promise<Recipient | null> {
  const r = await one<{ id: string; email: string; full_name: string }>(db,
    `select u.id, u.email, u.full_name from cm_campaigns c join users u on u.id = c.owner_user_id where c.id = $1`, [campaignId])
  return r ? { audience: 'internal', userId: r.id, grantId: null, email: r.email, name: r.full_name } : null
}

export async function userRecipient(db: Queryable, userId: string | null): Promise<Recipient | null> {
  if (!userId) return null
  const r = await one<{ id: string; email: string; full_name: string }>(db, `select id, email, full_name from users where id = $1`, [userId])
  return r ? { audience: 'internal', userId: r.id, grantId: null, email: r.email, name: r.full_name } : null
}

export async function clientRecipients(db: Queryable, campaignId: string, now: Date): Promise<Recipient[]> {
  const rows = await many<{ id: string; recipient_email: string; recipient_name: string }>(db,
    `select g.id, g.recipient_email, g.recipient_name from cm_portal_grants g join cm_campaigns c on c.id = g.campaign_id
      where g.campaign_id = $1 and g.kind = 'client' and g.client_id = c.client_id
        and g.status = 'active' and g.expires_at > $2 and g.recipient_email is not null`, [campaignId, now])
  return rows.map((r) => ({ audience: 'client', userId: null, grantId: r.id, email: r.recipient_email, name: r.recipient_name }))
}

/** The creator's own grant plus the representing agent's grant, if any. */
export async function participationRecipients(db: Queryable, participationId: string, now: Date): Promise<Recipient[]> {
  const rows = await many<{ id: string; kind: 'creator' | 'agent'; recipient_email: string; recipient_name: string }>(db,
    `select g.id, g.kind, g.recipient_email, g.recipient_name
       from cm_participations p
       join cm_portal_grants g on g.campaign_id = p.campaign_id and g.status = 'active' and g.expires_at > $2
        and g.recipient_email is not null
        and ((g.kind = 'creator' and g.creator_id = p.creator_id)
          or (g.kind = 'agent' and g.agent_id = p.agent_id
              and exists (select 1 from cm_agent_creators ac where ac.agent_id = p.agent_id and ac.creator_id = p.creator_id and ac.active)))
      where p.id = $1`, [participationId, now])
  return rows.map((r) => ({ audience: r.kind, userId: null, grantId: r.id, email: r.recipient_email, name: r.recipient_name }))
}
