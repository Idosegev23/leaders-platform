/**
 * Route-handler helpers: one error envelope, one auth path, CSRF origin check,
 * no-store caching, idempotency keys for create-type requests.
 *
 * Response shape: success → 2xx with the payload; failure → { error: { code, message, details? } }
 * with the matching status. A 200 is only ever returned when the business
 * operation actually happened.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { DomainError } from './errors'
import type { Ctx, InternalActor, PortalActor } from './context'
import { ctxFor, currentInternalActor, currentPortalActor, moduleEnabled } from './runtime'
import { one, getPool } from './db'
import { rateLimit } from './rate-limit'
import { PRODUCT } from '@/lib/campaigns/brand'

const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }

export function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } })
}

export function errorResponse(e: unknown) {
  if (e instanceof DomainError) {
    return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status)
  }
  // Never leak raw database/driver errors to users.
  console.error('[campaigns/api] unexpected error:', e instanceof Error ? `${e.name}: ${e.message}` : e)
  return json({ error: { code: 'INTERNAL', message: 'אירעה שגיאה בשרת. הפעולה לא נשמרה; נסו שוב בעוד רגע.' } }, 500)
}

/** Mutations must come from our own origin (cookies are SameSite=Lax as a second line). */
export function assertSameOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
  const origin = req.headers.get('origin')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!origin || !host) throw new DomainError('FORBIDDEN', 'בקשה ממקור לא מוכר')
  try {
    if (new URL(origin).host !== host) throw new Error()
  } catch {
    throw new DomainError('FORBIDDEN', 'בקשה ממקור לא מוכר')
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  if (!req.headers.get('content-type')?.includes('application/json')) return {}
  try {
    return await req.json()
  } catch {
    throw new DomainError('VALIDATION', 'גוף הבקשה אינו JSON תקין')
  }
}

type Params = Record<string, string>
type Handler<A> = (ctx: Ctx & { actor: A }, req: NextRequest, params: Params) => Promise<unknown>
type Route = { params: Params }

/** Internal (agency staff) endpoint. */
export function internal(fn: Handler<InternalActor>, opts: { status?: number } = {}) {
  return async (req: NextRequest, route?: Route) => {
    try {
      if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', `${PRODUCT.name} כבוי`)
      assertSameOrigin(req)
      const actor = await currentInternalActor()
      if (!actor) throw new DomainError('UNAUTHENTICATED', 'נדרשת התחברות')
      const ctx = ctxFor(actor) as Ctx & { actor: InternalActor }
      const out = await fn(ctx, req, route?.params ?? {})
      return out instanceof Response ? out : json(out, opts.status ?? 200)
    } catch (e) {
      return errorResponse(e)
    }
  }
}

/** Portal (client / creator / agent) endpoint. */
export function portal(fn: Handler<PortalActor>, opts: { status?: number } = {}) {
  return async (req: NextRequest, route?: Route) => {
    try {
      if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
      assertSameOrigin(req)
      const actor = await currentPortalActor()
      if (!actor) throw new DomainError('UNAUTHENTICATED', 'פג תוקף הכניסה. היכנסו שוב דרך הקישור שקיבלתם או בקשו קישור חדש.')
      // Every external endpoint is rate limited: per grant, generous for normal use.
      await rateLimit(getPool(), `portal:${actor.grantId}`, req.method === 'GET' ? 600 : 120, 600)
      const ctx = ctxFor(actor) as Ctx & { actor: PortalActor }
      const out = await fn(ctx, req, route?.params ?? {})
      return out instanceof Response ? out : json(out, opts.status ?? 200)
    } catch (e) {
      return errorResponse(e)
    }
  }
}

/**
 * Replays the stored response for a repeated Idempotency-Key from the same
 * actor and scope (double submit). Without a key the request runs normally.
 */
export async function idempotent(req: NextRequest, ctx: Ctx, scope: string, run: () => Promise<unknown>): Promise<Response> {
  const key = req.headers.get('idempotency-key')
  if (!key) return json(await run(), 201)
  if (key.length > 100) throw new DomainError('VALIDATION', 'Idempotency-Key ארוך מדי')
  const actor = ctx.actor.kind === 'internal' ? `u:${ctx.actor.userId}` : ctx.actor.kind === 'portal' ? `g:${ctx.actor.grantId}` : 'system'
  const hashed = createHash('sha256').update(key).digest('hex')
  const prev = await one<{ response_status: number; response_body: unknown }>(getPool(),
    `select response_status, response_body from cm_idempotency_keys where actor = $1 and scope = $2 and key = $3`, [actor, scope, hashed])
  if (prev) return json(prev.response_body, prev.response_status, { 'idempotent-replay': 'true' })
  const body = await run()
  await getPool().query(
    `insert into cm_idempotency_keys (key, actor, scope, response_status, response_body) values ($1,$2,$3,201,$4) on conflict do nothing`,
    [hashed, actor, scope, body])
  return json(body, 201)
}

export function searchParams(req: NextRequest): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries())
}

/** Hash of the caller address for rate-limit buckets (raw IPs are not stored). */
export function clientKey(req: NextRequest): string {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.ip || 'unknown'
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}
