/**
 * Server runtime wiring: who is calling, and with which dependencies.
 * Used by route handlers and server components; never imported by client code.
 */
import { cookies } from 'next/headers'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { getPool } from './db'
import { one } from './db'
import type { Ctx, Deps, InternalActor, InternalRole, PortalActor } from './context'
import { resolvePortalSession, SESSION_COOKIE } from './portal/access'
import { LocalStorage } from './storage/local'
import { SupabaseStorage } from './storage/supabase'
import type { StorageProvider } from './storage/provider'
import { transportFromEnv } from './messaging/transport'
import { DomainError } from './errors'
import { PRODUCT } from '@/lib/campaigns/brand'

export const DEV_USER_COOKIE = 'cm_dev_user'

export function moduleEnabled(): boolean {
  return process.env.CAMPAIGNS_MODULE_ENABLED === 'true'
}

/**
 * Local development login. Only when ALL hold: explicit flag, not a
 * production build, and the database is on localhost. There is no password:
 * it picks one of the locally seeded users.
 */
export function devAuthEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.CAMPAIGNS_DEV_AUTH !== 'true') return false
  const url = process.env.CAMPAIGNS_DATABASE_URL || ''
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

let storage: StorageProvider | null = null
export function getStorage(): StorageProvider {
  if (storage) return storage
  storage = process.env.CAMPAIGNS_STORAGE === 'supabase' ? new SupabaseStorage() : new LocalStorage({ baseUrl: '' })
  return storage
}

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function deps(): Deps {
  return { storage: getStorage(), transport: transportFromEnv(), baseUrl: appBaseUrl() }
}

async function loadInternal(userId: string): Promise<InternalActor | null> {
  const u = await one<{ id: string; email: string; full_name: string; role: string; is_active: boolean; cm_role: InternalRole | null }>(getPool(),
    `select u.id, u.email, u.full_name, u.role::text as role, u.is_active, r.role as cm_role
       from users u left join cm_staff_roles r on r.user_id = u.id where u.id = $1`, [userId])
  if (!u || !u.is_active) return null
  const role: InternalRole | null = u.role === 'admin' ? 'admin' : u.cm_role
  if (!role) return null
  return { kind: 'internal', userId: u.id, email: u.email, name: u.full_name || u.email, role }
}

/** null = not signed in; throws FORBIDDEN when signed in but without a campaigns role. */
export async function currentInternalActor(): Promise<InternalActor | null> {
  if (devAuthEnabled()) {
    const id = cookies().get(DEV_USER_COOKIE)?.value
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null
    return loadInternal(id)
  }
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const actor = await loadInternal(user.id)
  if (!actor) throw new DomainError('FORBIDDEN', `אין לך הרשאה ל-${PRODUCT.name}. פנו למנהל המערכת.`)
  return actor
}

export async function currentPortalActor(now = new Date()): Promise<PortalActor | null> {
  const secret = cookies().get(SESSION_COOKIE)?.value
  return resolvePortalSession(getPool(), secret, now)
}

export function ctxFor(actor: Ctx['actor'], now = new Date()): Ctx {
  return { db: getPool(), actor, now, deps: deps() }
}
