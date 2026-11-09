import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDeliverable } from '@/lib/campaigns/services/deliverables'
import { DeliverableWorkspace } from '@/components/campaigns/deliverable/workspace'
import { load, pageCtx } from '../../../_server'

export const dynamic = 'force-dynamic'

const ser = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export default async function DeliverablePage({ params }: { params: { id: string; did: string } }) {
  const ctx = await pageCtx()
  const data = await load(() => getDeliverable(ctx, params.did))
  if ((data.deliverable as { campaign_id: string }).campaign_id !== params.id) notFound()
  return (
    <div className="space-y-3">
      <Link href={`/campaigns/${params.id}?tab=deliverables`} className="text-xs text-wizard-text-secondary hover:underline">← חזרה לתוצרי הקמפיין</Link>
      <DeliverableWorkspace data={ser(data) as never} />
    </div>
  )
}
