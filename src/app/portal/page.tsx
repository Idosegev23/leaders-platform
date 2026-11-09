import Link from 'next/link'
import { portalHome } from '@/lib/campaigns/services/portal'
import { ClientHome } from '@/components/campaigns/portal/client-home'
import { CreatorHome } from '@/components/campaigns/portal/creator-home'
import { loadPortal, portalCtx } from './_server'

export const dynamic = 'force-dynamic'

export default async function PortalHome() {
  const ctx = await portalCtx()
  if (!ctx) {
    return (
      <div className="space-y-3 rounded-2xl border border-wizard-border bg-white p-5">
        <h1 className="text-xl font-bold">נדרשת כניסה</h1>
        <p className="text-sm">כדי להיכנס, פתחו את קישור ההזמנה שקיבלתם, או בקשו קישור כניסה חדש.</p>
        <Link href="/portal/login" className="inline-block rounded-xl bg-brand-primary px-4 py-2 text-sm text-white">בקשת קישור כניסה</Link>
      </div>
    )
  }
  const home = await loadPortal(() => portalHome(ctx))
  const data = JSON.parse(JSON.stringify(home))
  return ctx.actor.grantKind === 'client' ? <ClientHome data={data} /> : <CreatorHome data={data} />
}
