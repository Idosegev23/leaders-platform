/** Server-side helpers shared by the signed-in Brieflow pages. */
import { notFound, redirect } from 'next/navigation'
import { DomainError } from '@/lib/campaigns/errors'
import type { Ctx, InternalActor } from '@/lib/campaigns/context'
import { ctxFor, currentStaff, moduleEnabled } from '@/lib/campaigns/runtime'

export async function pageCtx(): Promise<Ctx & { actor: InternalActor }> {
  if (!moduleEnabled()) notFound()
  const s = await currentStaff()
  if (!s.account) redirect('/campaigns/login')
  // Signed in but not a member anywhere: a platform admin manages organizations;
  // anyone else sees the message rendered by the layout.
  if (!s.actor) {
    if (s.platformAdmin) redirect('/campaigns/platform')
    throw new DomainError('FORBIDDEN', 'החשבון אינו חבר באף ארגון פעיל')
  }
  return ctxFor(s.actor) as Ctx & { actor: InternalActor }
}

/** Run a service call for a page: not-found → 404 page. */
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
      <p className="mt-2 text-sm text-rose-900">{message ?? 'אין לך הרשאה לצפות בדף זה. אם זו טעות, פנו למנהל הארגון.'}</p>
    </div>
  )
}
