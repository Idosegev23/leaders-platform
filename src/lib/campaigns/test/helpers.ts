/**
 * Test fixtures for the campaigns integration suite. Everything goes to the
 * local test database; messages go to an in-memory transport; files to a
 * temporary directory. No real recipients are ever contacted.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { Ctx, InternalActor, InternalRole, PortalActor } from '../context'
import { LocalStorage } from '../storage/local'
import { TransportError, type MessageTransport, type OutgoingMessage, type SendResult } from '../messaging/transport'
import { redeemToken, resolvePortalSession } from '../portal/access'

export const TEST_DB_URL = process.env.CAMPAIGNS_TEST_DATABASE_URL || 'postgres://postgres@localhost:54329/leaders_test'

export function testPool(): Pool {
  return new Pool({ connectionString: TEST_DB_URL, max: 5 })
}

export class FakeTransport implements MessageTransport {
  readonly name = 'fake'
  sent: OutgoingMessage[] = []
  mode: 'ok' | 'fail' | 'permanent' | 'timeout' = 'ok'
  async send(m: OutgoingMessage): Promise<SendResult> {
    if (this.mode === 'fail') throw new TransportError('provider 503', true)
    if (this.mode === 'permanent') throw new TransportError('invalid recipient', false)
    if (this.mode === 'timeout') throw new TransportError('timeout', true, true)
    this.sent.push(m)
    return { outcome: 'sent', provider: 'fake', providerMessageId: `fake-${this.sent.length}` }
  }
}

export interface World {
  pool: Pool
  transport: FakeTransport
  storage: LocalStorage
  ctx: (actor: Ctx['actor'], now?: Date) => Ctx
}

export function makeWorld(pool: Pool): World {
  const transport = new FakeTransport()
  const storage = new LocalStorage({ root: mkdtempSync(path.join(tmpdir(), 'cm-test-')), baseUrl: 'http://test.local', secret: 'test-secret' })
  return {
    pool, transport, storage,
    ctx: (actor, now = new Date()) => ({ db: pool, actor, now, deps: { storage, transport, baseUrl: 'http://test.local' } }),
  }
}

export interface Org { id: string; name: string }

/** A tenant. hub = Leaders-style organization that may link Hub briefs/contracts. */
export async function makeOrg(pool: Pool, name = `Org ${randomUUID().slice(0, 6)}`, opts: { hub?: boolean } = {}): Promise<Org> {
  const slug = `t-${randomUUID().slice(0, 12)}`
  const { rows } = await pool.query<{ id: string }>(`insert into cm_organizations (name, slug, settings) values ($1,$2,$3) returning id`,
    [name, slug, { hub_integration: !!opts.hub }])
  return { id: rows[0].id, name }
}

const defaultOrgs = new WeakMap<Pool, Promise<Org>>()
/** The organization most tests run in (Leaders-like, Hub integration on). */
export function defaultOrg(pool: Pool): Promise<Org> {
  if (!defaultOrgs.has(pool)) defaultOrgs.set(pool, makeOrg(pool, 'Leaders (test)', { hub: true }))
  return defaultOrgs.get(pool)!
}

/** A staff account with an active membership in `org` (default org when omitted). 'none' = account without membership. */
export async function makeUser(pool: Pool, role: InternalRole | 'none', name = `user-${randomUUID().slice(0, 6)}`, org?: Org): Promise<InternalActor> {
  const o = org ?? (await defaultOrg(pool))
  const email = `${name.replace(/\s+/g, '.')}-${randomUUID().slice(0, 6)}@example.test`
  const { rows } = await pool.query<{ id: string }>(`insert into cm_accounts (email, full_name) values ($1,$2) returning id`, [email, name])
  const id = rows[0].id
  if (role !== 'none') await pool.query(`insert into cm_memberships (organization_id, account_id, role) values ($1,$2,$3)`, [o.id, id, role])
  return { kind: 'internal', userId: id, email, name, orgId: o.id, orgName: o.name, role: role === 'none' ? 'staff' : role }
}

/** Add an existing account to another organization (same person, second tenant). */
export async function addMembership(pool: Pool, actor: InternalActor, org: Org, role: InternalRole): Promise<InternalActor> {
  await pool.query(`insert into cm_memberships (organization_id, account_id, role) values ($1,$2,$3)`, [org.id, actor.userId, role])
  return { ...actor, orgId: org.id, orgName: org.name, role }
}

export async function makeClient(pool: Pool, name = `Client ${randomUUID().slice(0, 6)}`, org?: Org): Promise<string> {
  const o = org ?? (await defaultOrg(pool))
  const { rows } = await pool.query<{ id: string }>(`insert into cm_clients (organization_id, name) values ($1,$2) returning id`, [o.id, name])
  return rows[0].id
}

export async function makeBrief(pool: Pool, clientName: string): Promise<string> {
  const { rows: t } = await pool.query<{ id: string }>(`select id from document_types where slug = 'client-brief'`)
  const { rows } = await pool.query<{ id: string }>(
    `insert into document_links (token, document_type_id, created_by_email, client_name, status, metadata)
     values ($1,$2,'x@example.test',$3,'completed',$4) returning id`,
    [randomUUID(), t[0].id, clientName, { submission_data: { clientName, productService: 'נעלי ריצה', campaignGoalTypes: ['מודעות'], campaignLaunchDate: '2026-11-01', budget: '200 אלף' } }])
  return rows[0].id
}

export function tokenFromInvite(inviteUrl: string): string {
  return new URL(inviteUrl).hash.replace(/^#/, '').split('&').find((p) => p.startsWith('t='))!.slice(2)
}

/** Turn an invite URL (…/portal/enter#t=TOKEN) into a portal actor, as the browser would. */
export async function portalFromInvite(pool: Pool, inviteUrl: string, now = new Date()): Promise<PortalActor> {
  const { sessionSecret } = await redeemToken(pool, tokenFromInvite(inviteUrl), now)
  const actor = await resolvePortalSession(pool, sessionSecret, now)
  if (!actor) throw new Error('session did not resolve')
  return actor
}

export const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
