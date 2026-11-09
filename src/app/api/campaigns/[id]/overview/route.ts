import { internal } from '@/lib/campaigns/http'
import { campaignOverview } from '@/lib/campaigns/services/overview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => campaignOverview(ctx, p.id))
