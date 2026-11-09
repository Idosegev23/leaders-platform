import { internal } from '@/lib/campaigns/http'
import { listCampaignDeliverables } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ deliverables: await listCampaignDeliverables(ctx, p.id) }))
