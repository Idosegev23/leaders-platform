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

export async function makeUser(pool: Pool, role: InternalRole | 'none', name = `user-${randomUUID().slice(0, 6)}`): Promise<InternalActor> {
  const id = randomUUID()
  const email = `${name}-${id.slice(0, 6)}@example.test`
  await pool.query(`insert into auth.users (id, email) values ($1,$2)`, [id, email])
  await pool.query(`insert into users (id, email, full_name, role) values ($1,$2,$3,$4)`, [id, email, name, role === 'admin' ? 'admin' : 'user'])
  if (role !== 'none' && role !== 'admin') await pool.query(`insert into cm_staff_roles (user_id, role) values ($1,$2)`, [id, role])
  return { kind: 'internal', userId: id, email, name, role: role === 'none' ? 'staff' : role }
}

export async function makeClient(pool: Pool, name = `Client ${randomUUID().slice(0, 6)}`): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`insert into clients (name) values ($1) returning id`, [name])
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

/** Turn an invite URL (…/portal/enter#t=TOKEN) into a portal actor, as the browser would. */
export async function portalFromInvite(pool: Pool, inviteUrl: string, now = new Date()): Promise<PortalActor> {
  const token = new URL(inviteUrl).hash.replace(/^#/, '').split('&').find((p) => p.startsWith('t='))!.slice(2)
  const { sessionSecret } = await redeemToken(pool, token, now)
  const actor = await resolvePortalSession(pool, sessionSecret, now)
  if (!actor) throw new Error('session did not resolve')
  return actor
}

export function tokenFromInvite(inviteUrl: string): string {
  return new URL(inviteUrl).hash.replace(/^#/, '').split('&').find((p) => p.startsWith('t='))!.slice(2)
}

export const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
