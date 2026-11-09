import type { Queryable } from './db'
import { DomainError } from './errors'

/**
 * Fixed-window limiter stored in Postgres (no Redis in the Hub). One atomic
 * upsert per call. Buckets are hashed identifiers (never raw tokens or IPs).
 */
export async function rateLimit(db: Queryable, bucket: string, limit: number, windowSeconds: number, now = new Date()): Promise<void> {
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000)
  const { rows } = await db.query<{ count: number }>(
    `insert into cm_rate_limits (bucket, window_start, count) values ($1, $2, 1)
     on conflict (bucket, window_start) do update set count = cm_rate_limits.count + 1
     returning count`,
    [bucket, windowStart],
  )
  if ((rows[0]?.count ?? 0) > limit) {
    throw new DomainError('RATE_LIMITED', 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.')
  }
}
