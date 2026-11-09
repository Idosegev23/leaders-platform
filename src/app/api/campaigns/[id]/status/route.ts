import { internal, readJson } from '@/lib/campaigns/http'
import { changeCampaignStatus } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => changeCampaignStatus(ctx, p.id, await readJson(req)))
