import type { Pool } from 'pg'
import type { MessageTransport } from './messaging/transport'
import type { StorageProvider } from './storage/provider'

export type InternalRole = 'admin' | 'manager' | 'staff'

/** A signed-in staff member acting inside ONE organization (the active one). */
export interface InternalActor {
  kind: 'internal'
  /** cm_accounts.id */
  userId: string
  email: string
  name: string
  orgId: string
  orgName: string
  /** role in the active organization */
  role: InternalRole
  /** may create organizations (BRIEFLOW_PLATFORM_ADMINS); grants no data access by itself */
  platformAdmin?: boolean
}

export type PortalKind = 'client' | 'creator' | 'agent' | 'agency'

/** An external person holding an invitation (no account). */
export interface PortalActor {
  kind: 'portal'
  sessionId: string
  grantId: string
  grantKind: PortalKind
  orgId: string
  orgName: string
  /** null = every campaign the subject takes part in */
  campaignId: string | null
  clientId: string | null
  creatorId: string | null
  agentId: string | null
  talentAgencyId: string | null
  name: string
}

export interface SystemActor {
  kind: 'system'
}

export type Actor = InternalActor | PortalActor | SystemActor

export interface Deps {
  storage: StorageProvider
  transport: MessageTransport
  /** Absolute origin used in messages, e.g. https://hub.example.com */
  baseUrl: string
}

export interface Ctx {
  db: Pool
  actor: Actor
  now: Date
  deps: Deps
}

const PORTAL_KIND_HE: Record<PortalKind, string> = { client: 'לקוח', creator: 'יוצר', agent: 'סוכן', agency: 'סוכנות' }

export function actorLabel(a: Actor): string {
  if (a.kind === 'internal') return a.name || a.email
  if (a.kind === 'portal') return `${a.name} (${PORTAL_KIND_HE[a.grantKind]}, דרך הזמנה)`
  return 'מערכת'
}

export function actorIds(a: Actor): { userId: string | null; grantId: string | null } {
  return {
    userId: a.kind === 'internal' ? a.userId : null,
    grantId: a.kind === 'portal' ? a.grantId : null,
  }
}

export function actorOrgId(a: Actor): string | null {
  return a.kind === 'system' ? null : a.orgId
}
