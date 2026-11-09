import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDeliverable } from '@/lib/campaigns/services/deliverables'
import { PortalDeliverable } from '@/components/campaigns/portal/deliverable'
import { loadPortal, portalCtx } from '../../_server'

export const dynamic = 'force-dynamic'

export default async function PortalDeliverablePage({ params }: { params: { did: string } }) {
  const ctx = await portalCtx()
  if (!ctx) redirect('/portal')
  const data = await loadPortal(() => getDeliverable(ctx, params.did))
  return (
    <div className="space-y-3">
      <Link href="/portal" className="text-xs text-wizard-text-secondary hover:underline">← חזרה</Link>
      <PortalDeliverable data={JSON.parse(JSON.stringify(data))} role={ctx.actor.grantKind} />
    </div>
  )
}
