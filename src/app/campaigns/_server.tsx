/** Server-side helpers shared by the internal campaigns pages. */
import { notFound, redirect } from 'next/navigation'
import { DomainError } from '@/lib/campaigns/errors'
import type { Ctx, InternalActor } from '@/lib/campaigns/context'
import { ctxFor, currentInternalActor, devAuthEnabled, moduleEnabled } from '@/lib/campaigns/runtime'

export async function pageCtx(): Promise<Ctx & { actor: InternalActor }> {
  if (!moduleEnabled()) notFound()
  const actor = await currentInternalActor()
  if (!actor) redirect(devAuthEnabled() ? '/campaigns/dev-login' : '/login?redirect=/campaigns')
  return ctxFor(actor) as Ctx & { actor: InternalActor }
}

/** Run a service call for a page: not-found → 404 page, permission → message. */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof DomainError && (e.code === 'NOT_FOUND' || e.code === 'MODULE_DISABLED')) notFound()
    throw e
  }
}

export function PermissionDenied({ message }: { message?: string }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
      <h1 className="text-lg font-bold text-rose-900">אין הרשאה</h1>
      <p className="mt-2 text-sm text-rose-900">{message ?? 'אין לך הרשאה לצפות בדף זה. אם זו טעות, פנו למנהל המערכת.'}</p>
    </div>
  )
}
