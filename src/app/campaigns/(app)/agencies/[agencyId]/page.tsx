import Link from 'next/link'
import { getTalentAgency } from '@/lib/campaigns/services/creators'
import { AgencyDetail } from '@/components/campaigns/agencies'
import { load, pageCtx } from '../../_server'

export const dynamic = 'force-dynamic'

export default async function AgencyPage({ params }: { params: { agencyId: string } }) {
  const ctx = await pageCtx()
  const agency = await load(() => getTalentAgency(ctx, params.agencyId))
  return (
    <div className="space-y-4">
      <Link href="/campaigns/agencies" className="text-xs text-wizard-text-secondary hover:underline">← כל הסוכנויות</Link>
      <AgencyDetail agency={JSON.parse(JSON.stringify(agency))} canInvite={ctx.actor.role !== 'staff'} />
    </div>
  )
}
