/**
 * Postgres access for the campaigns module.
 *
 * Why `pg` and not the Supabase client: business operations here span several
 * rows (submit a version + close a task + enqueue a job + audit) and need one
 * transaction and row locks. PostgREST cannot do that without moving the rules
 * into SQL functions. The connection is server-only; the cm_ tables are
 * revoked from anon/authenticated, and authorization is enforced in
 * auth/policy.ts before any query that reads or changes a record.
 *
 * Production: CAMPAIGNS_DATABASE_URL = the Supabase pooler URL in transaction
 * mode (port 6543). node-postgres uses unnamed statements, which is
 * compatible with transaction pooling.
 */
import { Pool, type PoolClient, type QueryResultRow } from 'pg'

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const url = process.env.CAMPAIGNS_DATABASE_URL
  if (!url) throw new Error('CAMPAIGNS_DATABASE_URL is not configured')
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.CAMPAIGNS_DB_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  })
  pool.on('error', (e) => console.error('[campaigns/db] idle client error:', e.message))
  return pool
}

/** For tests: point the module at a specific database. */
export function setPoolForTests(p: Pool | null) {
  pool = p
}

export async function withTx<T>(fn: (tx: PoolClient) => Promise<T>, db: Pool = getPool()): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function one<R extends QueryResultRow>(db: Queryable, text: string, params?: unknown[]): Promise<R | null> {
  const { rows } = await db.query<R>(text, params)
  return rows[0] ?? null
}

export async function many<R extends QueryResultRow>(db: Queryable, text: string, params?: unknown[]): Promise<R[]> {
  const { rows } = await db.query<R>(text, params)
  return rows
}

/** Postgres error code helper (unique_violation = 23505, check = 23514, fk = 23503). */
export function pgCode(e: unknown): string | undefined {
  return typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : undefined
}

export function pgConstraint(e: unknown): string | undefined {
  return typeof e === 'object' && e && 'constraint' in e ? String((e as { constraint: unknown }).constraint) : undefined
}
