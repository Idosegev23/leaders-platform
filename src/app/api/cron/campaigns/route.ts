/**
 * Campaigns worker (Vercel cron, every 5 minutes): due jobs, the message
 * outbox, orphan-file cleanup, housekeeping. Requires CRON_SECRET in
 * production (Vercel sends it as a bearer token); refuses to run without it.
 */
import { type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getPool } from '@/lib/campaigns/db'
import { deps, getStorage, moduleEnabled } from '@/lib/campaigns/runtime'
import { runWorker } from '@/lib/campaigns/jobs/worker'
import { cleanupOrphanAssets } from '@/lib/campaigns/services/assets'
import { json } from '@/lib/campaigns/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(req: NextRequest) {
  if (!moduleEnabled()) return json({ skipped: 'module disabled' })
  if (!authorized(req)) return json({ error: { code: 'UNAUTHENTICATED', message: 'unauthorized' } }, 401)
  const pool = getPool()
  const now = new Date()
  const report = await runWorker(pool, deps(), now)
  const cleanup = await cleanupOrphanAssets(pool, getStorage(), now)
  await pool.query(`delete from cm_rate_limits where window_start < $1::timestamptz - interval '1 day'`, [now])
  await pool.query(`delete from cm_idempotency_keys where created_at < $1::timestamptz - interval '2 days'`, [now])
  const stuck = await pool.query<{ n: number }>(`select count(*)::int as n from cm_jobs where status = 'dead'`)
  const failedMsgs = await pool.query<{ n: number }>(`select count(*)::int as n from cm_notifications where status in ('dead','uncertain')`)
  console.log('[cron/campaigns]', JSON.stringify({ ...report, cleanup, dead_jobs: stuck.rows[0].n, failed_messages: failedMsgs.rows[0].n }))
  return json({ ...report, cleanup, dead_jobs: stuck.rows[0].n, failed_messages: failedMsgs.rows[0].n })
}
