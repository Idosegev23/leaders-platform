/**
 * External access (clients, creators, agents) without accounts.
 *
 * - A grant says who (recipient), what role, which campaign and which entity.
 * - A token is a 256-bit random secret. Only sha256(token) is stored. Tokens
 *   are single-use: redeeming one atomically marks it used and opens a
 *   session. Invite tokens live 14 days, a login link
 *   requested from /portal/login 1 hour, a link inside a reminder email 72 hours.
 * - The session secret lives only in an httpOnly cookie; the DB keeps its hash.
 *   Every request re-checks session expiry/revocation AND the grant's status
 *   and expiry, so revoking a grant cuts access immediately.
 *
 * Identity: possession of a link sent to the recipient. This is not strong
 * identity verification and not a legal signature; the UI and audit log say so.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Queryable } from '../db'
import { one } from '../db'
import type { PortalActor } from '../context'
import { DomainError } from '../errors'

export const INVITE_TTL_DAYS = 14
export const LOGIN_TTL_MINUTES = 60
export const SESSION_TTL_DAYS = 7
export const SESSION_COOKIE = 'cm_portal'

export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSecret(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

export async function issueToken(
  db: Queryable, grantId: string, purpose: 'invite' | 'login', now: Date, createdBy: string | null, ttlMs?: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSecret()
  const defaultTtl = purpose === 'invite' ? INVITE_TTL_DAYS * 86_400_000 : LOGIN_TTL_MINUTES * 60_000
  const expiresAt = new Date(now.getTime() + (ttlMs ?? defaultTtl))
  await db.query(
    `insert into cm_portal_tokens (grant_id, token_hash, purpose, expires_at, created_by) values ($1,$2,$3,$4,$5)`,
    [grantId, hashSecret(token), purpose, expiresAt, createdBy],
  )
  return { token, expiresAt }
}

const DENIED = () => new DomainError('UNAUTHENTICATED', 'הקישור אינו בתוקף. ייתכן שכבר נעשה בו שימוש, שפג תוקפו או שבוטל. אפשר לבקש קישור כניסה חדש.')

/**
 * Exchange a token for a session. Atomic: two concurrent redemptions of the
 * same token cannot both succeed.
 */
export async function redeemToken(db: Queryable, rawToken: string, now: Date): Promise<{ sessionSecret: string; expiresAt: Date; grantId: string }> {
  if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 100) throw DENIED()
  const tok = await one<{ id: string; grant_id: string }>(db,
    `update cm_portal_tokens t set used_at = $2
       from cm_portal_grants g
      where t.token_hash = $1 and t.grant_id = g.id
        and t.used_at is null and t.revoked_at is null and t.expires_at > $2
        and g.status = 'active' and g.expires_at > $2
      returning t.id, t.grant_id`,
    [hashSecret(rawToken), now],
  )
  if (!tok) throw DENIED()
  const sessionSecret = newSecret()
  const grant = await one<{ expires_at: Date }>(db, `select expires_at from cm_portal_grants where id = $1`, [tok.grant_id])
  const cap = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000)
  const expiresAt = grant && grant.expires_at < cap ? grant.expires_at : cap
  await db.query(
    `insert into cm_portal_sessions (grant_id, session_hash, token_id, expires_at, last_seen_at) values ($1,$2,$3,$4,$5)`,
    [tok.grant_id, hashSecret(sessionSecret), tok.id, expiresAt, now],
  )
  await db.query(`update cm_portal_grants set last_entered_at = $2 where id = $1`, [tok.grant_id, now])
  return { sessionSecret, expiresAt, grantId: tok.grant_id }
}

export async function resolvePortalSession(db: Queryable, sessionSecret: string | undefined | null, now: Date): Promise<PortalActor | null> {
  if (!sessionSecret || sessionSecret.length < 20 || sessionSecret.length > 100) return null
  const row = await one<{
    session_id: string; grant_id: string; kind: 'client' | 'creator' | 'agent'; campaign_id: string
    client_id: string | null; creator_id: string | null; agent_id: string | null; recipient_name: string; last_seen_at: Date | null
  }>(db,
    `select s.id as session_id, g.id as grant_id, g.kind, g.campaign_id, g.client_id, g.creator_id, g.agent_id,
            g.recipient_name, s.last_seen_at
       from cm_portal_sessions s join cm_portal_grants g on g.id = s.grant_id
      where s.session_hash = $1 and s.revoked_at is null and s.expires_at > $2
        and g.status = 'active' and g.expires_at > $2`,
    [hashSecret(sessionSecret), now],
  )
  if (!row) return null
  if (!row.last_seen_at || now.getTime() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query(`update cm_portal_sessions set last_seen_at = $2 where id = $1`, [row.session_id, now])
  }
  return {
    kind: 'portal', sessionId: row.session_id, grantId: row.grant_id, grantKind: row.kind, campaignId: row.campaign_id,
    clientId: row.client_id, creatorId: row.creator_id, agentId: row.agent_id, name: row.recipient_name,
  }
}

export async function endPortalSession(db: Queryable, sessionSecret: string, now: Date): Promise<void> {
  await db.query(`update cm_portal_sessions set revoked_at = $2 where session_hash = $1 and revoked_at is null`, [hashSecret(sessionSecret), now])
}
