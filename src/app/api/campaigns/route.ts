import { idempotent, internal, readJson, searchParams } from '@/lib/campaigns/http'
import { createCampaign, listCampaigns } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, req) => listCampaigns(ctx, searchParams(req)))
export const POST = internal(async (ctx, req) => {
  const body = await readJson(req)
  return idempotent(req, ctx, 'campaign.create', () => createCampaign(ctx, body))
})
