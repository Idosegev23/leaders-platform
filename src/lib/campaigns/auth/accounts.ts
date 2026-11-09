/**
 * Staff identity for Brieflow (any agency), independent of the Leaders Hub
 * login:
 *  - sign-in by single-use email link (only sha256 of the link is stored);
 *    login links live 30 minutes, invitations 7 days, sign-up confirmations 24h
 *  - a session cookie (random secret, hash stored, 14 days)
 *  - optional bridge: a signed-in Leaders Hub (Google) user is matched to the
 *    account with the same, Google-verified email
 * An account acts inside one organization at a time (the "active" one), and
 * only through an active membership there.
 */
import type { Queryable } from '../db'
import { many, one } from '../db'
import type { InternalActor, InternalRole } from '../context'
import { DomainError } from '../errors'
import { hashSecret, newSecret } from '../portal/access'
import { rateLimit } from '../rate-limit'
import { normalizeEmail } from '../validation'
import { randomUUID } from 'node:crypto'

export const STAFF_SESSION_COOKIE = 'cm_session'
export const ACTIVE_ORG_COOKIE = 'cm_org'
export const STAFF_SESSION_DAYS = 14
const TTL_MS = { login: 30 * 60_000, invite: 7 * 86_400_000, signup: 24 * 3_600_000 } as const

export type LoginPurpose = keyof typeof TTL_MS

export interface Account { id: string; email: string; full_name: string }
export interface Membership { orgId: string; orgName: string; orgSlug: string; role: InternalRole }

export function platformAdminEmails(): string[] {
  return (process.env.BRIEFLOW_PLATFORM_ADMINS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export function isPlatformAdmin(email: string): boolean {
  return platformAdminEmails().includes(email.toLowerCase())
}

export async function issueLoginToken(db: Queryable, accountId: string, purpose: LoginPurpose, now: Date, orgId: string | null): Promise<string> {
  const token = newSecret()
  await db.query(
    `insert into cm_login_tokens (account_id, organization_id, purpose, token_hash, expires_at) values ($1,$2,$3,$4,$5)`,
    [accountId, orgId, purpose, hashSecret(token), new Date(now.getTime() + TTL_MS[purpose])],
  )
  return token
}

const DENIED = () => new DomainError('UNAUTHENTICATED', 'קישור הכניסה אינו בתוקף. ייתכן שכבר נעשה בו שימוש או שפג תוקפו. אפשר לבקש קישור חדש.')

/**
 * Redeem a sign-in link: atomic single use; activates an invited membership
 * (invite/signup); marks the email as verified; opens a session.
 */
export async function redeemLoginToken(db: Queryable, raw: string, now: Date) {
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 100) throw DENIED()
  const t = await one<{ account_id: string; organization_id: string | null; purpose: LoginPurpose }>(db,
    `update cm_login_tokens t set used_at = $2
       from cm_accounts a
      where t.token_hash = $1 and a.id = t.account_id and a.status = 'active'
        and t.used_at is null and t.revoked_at is null and t.expires_at > $2
      returning t.account_id, t.organization_id, t.purpose`,
    [hashSecret(raw), now])
  if (!t) throw DENIED()
  if (t.organization_id && (t.purpose === 'invite' || t.purpose === 'signup')) {
    await db.query(`update cm_memberships set status = 'active' where organization_id = $1 and account_id = $2 and status = 'invited'`,
      [t.organization_id, t.account_id])
  }
  await db.query(`update cm_accounts set email_verified_at = coalesce(email_verified_at, $2), last_login_at = $2 where id = $1`, [t.account_id, now])
  const memberships = await loadMemberships(db, t.account_id)
  const account = await one<Account>(db, `select id, email, full_name from cm_accounts where id = $1`, [t.account_id])
  if (!memberships.length && !isPlatformAdmin(account!.email)) throw DENIED()
  const sessionSecret = newSecret()
  const expiresAt = new Date(now.getTime() + STAFF_SESSION_DAYS * 86_400_000)
  await db.query(`insert into cm_account_sessions (account_id, session_hash, expires_at, last_seen_at) values ($1,$2,$3,$4)`,
    [t.account_id, hashSecret(sessionSecret), expiresAt, now])
  return { sessionSecret, expiresAt, accountId: t.account_id, orgId: t.organization_id }
}

export async function resolveAccountSession(db: Queryable, secret: string | undefined | null, now: Date): Promise<Account | null> {
  if (!secret || secret.length < 20 || secret.length > 100) return null
  const row = await one<Account & { session_id: string; last_seen_at: Date | null }>(db,
    `select a.id, a.email, a.full_name, s.id as session_id, s.last_seen_at
       from cm_account_sessions s join cm_accounts a on a.id = s.account_id
      where s.session_hash = $1 and s.revoked_at is null and s.expires_at > $2 and a.status = 'active'`,
    [hashSecret(secret), now])
  if (!row) return null
  if (!row.last_seen_at || now.getTime() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query(`update cm_account_sessions set last_seen_at = $2 where id = $1`, [row.session_id, now])
  }
  return { id: row.id, email: row.email, full_name: row.full_name }
}

export async function endAccountSession(db: Queryable, secret: string, now: Date) {
  await db.query(`update cm_account_sessions set revoked_at = $2 where session_hash = $1 and revoked_at is null`, [hashSecret(secret), now])
}

/** Leaders Hub bridge: Google-verified Hub user → Brieflow account with the same email. */
export async function bridgeHubUser(db: Queryable, hubUser: { id: string; email: string | null | undefined }): Promise<Account | null> {
  const byId = await one<Account>(db, `select id, email, full_name from cm_accounts where hub_user_id = $1 and status = 'active'`, [hubUser.id])
  if (byId) return byId
  if (!hubUser.email) return null
  const byEmail = await one<Account>(db,
    `update cm_accounts set hub_user_id = $1, email_verified_at = coalesce(email_verified_at, now())
      where lower(email) = lower($2) and hub_user_id is null and status = 'active'
      returning id, email, full_name`, [hubUser.id, hubUser.email])
  return byEmail
}

export async function loadMemberships(db: Queryable, accountId: string): Promise<Membership[]> {
  return many<Membership>(db,
    `select o.id as "orgId", o.name as "orgName", o.slug as "orgSlug", m.role
       from cm_memberships m join cm_organizations o on o.id = m.organization_id
      where m.account_id = $1 and m.status = 'active' and o.status = 'active'
      order by o.name`, [accountId])
}

/** Pick the active organization: the requested one if the account is a member, else the first. */
export function actorFor(account: Account, memberships: Membership[], preferredOrgId: string | null | undefined): InternalActor | null {
  const m = memberships.find((x) => x.orgId === preferredOrgId) ?? memberships[0]
  if (!m) return null
  return {
    kind: 'internal', userId: account.id, email: account.email, name: account.full_name,
    orgId: m.orgId, orgName: m.orgName, role: m.role, platformAdmin: isPlatformAdmin(account.email),
  }
}

/**
 * "Send me a sign-in link": same answer whether or not the address is known.
 * The link itself is minted when the message is sent (worker), never stored.
 */
export async function requestStaffLoginLink(db: Queryable, emailRaw: string, now: Date, clientKey: string): Promise<void> {
  await rateLimit(db, `staff-link:ip:${hashSecret(clientKey).slice(0, 32)}`, 10, 3600, now)
  let email: string | null
  try { email = normalizeEmail(emailRaw) } catch { return }
  if (!email) return
  await rateLimit(db, `staff-link:email:${hashSecret(email).slice(0, 32)}`, 5, 3600, now)
  const acc = await one<{ id: string; full_name: string }>(db, `select id, full_name from cm_accounts where lower(email) = $1 and status = 'active'`, [email])
  if (!acc) return
  const ms = await loadMemberships(db, acc.id)
  if (!ms.length && !isPlatformAdmin(email)) return
  await queueStaffLinkEmail(db, { accountId: acc.id, email, name: acc.full_name, purpose: 'login', orgId: null, orgName: null }, now)
}

/** Queue an email carrying a fresh sign-in link for a staff account. */
export async function queueStaffLinkEmail(db: Queryable, a: {
  accountId: string; email: string; name: string; purpose: LoginPurpose; orgId: string | null; orgName: string | null
}, now: Date) {
  const subject = a.purpose === 'invite' ? `הזמנה להצטרף ל-${a.orgName} ב-Brieflow`
    : a.purpose === 'signup' ? 'אישור כתובת הדוא״ל — Brieflow' : 'קישור כניסה ל-Brieflow'
  const body = a.purpose === 'invite' ? `שלום ${a.name},\nהוזמנת להצטרף לצוות ${a.orgName} ב-Brieflow. הקישור תקף ל-7 ימים ולשימוש אחד.`
    : a.purpose === 'signup' ? `שלום ${a.name},\nכדי להפעיל את החשבון של ${a.orgName}, יש לאשר את כתובת הדוא״ל. הקישור תקף ל-24 שעות.`
    : `שלום ${a.name},\nזה קישור הכניסה שביקשת. הוא תקף ל-30 דקות ולשימוש אחד.`
  await db.query(
    `insert into cm_notifications (organization_id, channel, audience, recipient_user_id, to_address, subject, body_text, link_path,
        login_link_purpose, idempotency_key, correlation_id, next_attempt_at)
     values ($1,'email','internal',$2,$3,$4,$5,'/campaigns',$6,$7,$8,$9)`,
    [a.orgId, a.accountId, a.email, subject, body, a.purpose, `staff-link:${a.purpose}:${a.accountId}:${now.getTime()}:${randomUUID()}`, randomUUID(), now])
}
