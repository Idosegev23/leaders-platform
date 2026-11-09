import { listAgents, listCreators } from '@/lib/campaigns/services/creators'
import { listCampaigns } from '@/lib/campaigns/services/campaigns'
import { CreatorPool } from '@/components/campaigns/creator-pool'
import { load, pageCtx } from '../_server'

export const dynamic = 'force-dynamic'

export default async function CreatorsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const ctx = await pageCtx()
  const filters = Object.fromEntries(Object.entries({ q: searchParams.q, category: searchParams.category, platform: searchParams.platform, status: searchParams.status, page: searchParams.page }).filter(([, v]) => v))
  const campaignId = searchParams.campaign
  const [creators, agents, campaigns] = await Promise.all([
    load(() => listCreators(ctx, { ...filters, exclude_campaign_id: campaignId })),
    listAgents(ctx),
    listCampaigns(ctx, { page_size: 100 }),
  ])
  const manageable = campaigns.rows.filter((c) => !['closed', 'cancelled'].includes(c.status))
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">מאגר משפיענים</h1>
      <CreatorPool creators={JSON.parse(JSON.stringify(creators))} agents={agents} campaigns={manageable.map((c) => ({ id: c.id, name: c.name }))}
        initialCampaign={campaignId ?? ''} filters={filters as Record<string, string>} />
    </div>
  )
}
