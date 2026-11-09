import { notFound } from 'next/navigation'
import { DomainError } from '@/lib/campaigns/errors'
import type { Ctx, PortalActor } from '@/lib/campaigns/context'
import { ctxFor, currentPortalActor } from '@/lib/campaigns/runtime'

export async function portalCtx(): Promise<(Ctx & { actor: PortalActor }) | null> {
  const actor = await currentPortalActor()
  return actor ? (ctxFor(actor) as Ctx & { actor: PortalActor }) : null
}

export async function loadPortal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof DomainError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound()
    throw e
  }
}
