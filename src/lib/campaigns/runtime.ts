/**
 * Server runtime wiring: who is calling, and with which dependencies.
 * Used by route handlers and server components; never imported by client code.
 */
import { cookies } from 'next/headers'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { getPool, one } from './db'
import type { Ctx, Deps, InternalActor, PortalActor } from './context'
import { resolvePortalSession, SESSION_COOKIE } from './portal/access'
import {
  ACTIVE_ORG_COOKIE, STAFF_SESSION_COOKIE, actorFor, bridgeHubUser, isPlatformAdmin, loadMemberships, resolveAccountSession,
  type Account, type Membership,
} from './auth/accounts'
import { LocalStorage } from './storage/local'
import { SupabaseStorage } from './storage/supabase'
import type { StorageProvider } from './storage/provider'
import { transportFromEnv } from './messaging/transport'
import { PRODUCT } from './brand'
import { DomainError } from './errors'

export const DEV_USER_COOKIE = 'cm_dev_user'

export function moduleEnabled(): boolean {
  return process.env.CAMPAIGNS_MODULE_ENABLED === 'true'
}

/** Leaders staff may sign in with their Hub (Google) session. */
export function hubLoginEnabled(): boolean {
  return process.env.CAMPAIGNS_HUB_LOGIN === 'true' && !!process.env.NEXT_PUBLIC_SUPABASE_URL
}

export function selfSignupEnabled(): boolean {
  return process.env.BRIEFLOW_SELF_SIGNUP === 'true'
}

/**
 * Local development login. Only when ALL hold: explicit flag, not a
 * production build, and the database is on localhost. No password: it picks
 * one of the locally seeded accounts.
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

export interface StaffState {
  account: Account | null
  memberships: Membership[]
  actor: InternalActor | null
  platformAdmin: boolean
}

/** Who is signed in on the staff side, and in which organizations. */
export async function currentStaff(): Promise<StaffState> {
  const pool = getPool()
  const now = new Date()
  let account: Account | null = null
  if (devAuthEnabled()) {
    const id = cookies().get(DEV_USER_COOKIE)?.value
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      account = await one<Account>(pool, `select id, email, full_name from cm_accounts where id = $1 and status = 'active'`, [id])
    }
  }
  if (!account) account = await resolveAccountSession(pool, cookies().get(STAFF_SESSION_COOKIE)?.value, now)
  if (!account && hubLoginEnabled()) {
    try {
      const supabase = await createSupabaseServer()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) account = await bridgeHubUser(pool, { id: user.id, email: user.email })
    } catch {
      // Hub auth unavailable: fall through to "not signed in"
    }
  }
  if (!account) return { account: null, memberships: [], actor: null, platformAdmin: false }
  const memberships = await loadMemberships(pool, account.id)
  const actor = actorFor(account, memberships, cookies().get(ACTIVE_ORG_COOKIE)?.value)
  return { account, memberships, actor, platformAdmin: isPlatformAdmin(account.email) }
}

/** null = not signed in; throws FORBIDDEN when signed in but not a member of any organization. */
export async function currentInternalActor(): Promise<InternalActor | null> {
  const s = await currentStaff()
  if (!s.account) return null
  if (!s.actor) throw new DomainError('FORBIDDEN', `החשבון אינו חבר באף ארגון פעיל ב-${PRODUCT.name}. פנו למנהל הארגון שלכם.`)
  return s.actor
}

export async function currentPortalActor(now = new Date()): Promise<PortalActor | null> {
  const secret = cookies().get(SESSION_COOKIE)?.value
  return resolvePortalSession(getPool(), secret, now)
}

export function ctxFor(actor: Ctx['actor'], now = new Date()): Ctx {
  return { db: getPool(), actor, now, deps: deps() }
}
