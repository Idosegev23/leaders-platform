import { internal, readJson } from '@/lib/campaigns/http'
import { getCampaign, updateCampaign } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => getCampaign(ctx, p.id))
export const PATCH = internal(async (ctx, req, p) => updateCampaign(ctx, p.id, await readJson(req)))
