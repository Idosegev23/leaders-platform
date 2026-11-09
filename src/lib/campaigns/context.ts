import type { Pool } from 'pg'
import type { MessageTransport } from './messaging/transport'
import type { StorageProvider } from './storage/provider'

export type InternalRole = 'admin' | 'manager' | 'staff'

export interface InternalActor {
  kind: 'internal'
  userId: string
  email: string
  name: string
  role: InternalRole
}

export interface PortalActor {
  kind: 'portal'
  sessionId: string
  grantId: string
  grantKind: 'client' | 'creator' | 'agent'
  campaignId: string
  clientId: string | null
  creatorId: string | null
  agentId: string | null
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

export function actorLabel(a: Actor): string {
  if (a.kind === 'internal') return a.name || a.email
  if (a.kind === 'portal') {
    const k = a.grantKind === 'client' ? 'לקוח' : a.grantKind === 'creator' ? 'יוצר' : 'סוכן'
    return `${a.name} (${k}, דרך הזמנה)`
  }
  return 'מערכת'
}

export function actorIds(a: Actor): { userId: string | null; grantId: string | null } {
  return {
    userId: a.kind === 'internal' ? a.userId : null,
    grantId: a.kind === 'portal' ? a.grantId : null,
  }
}
