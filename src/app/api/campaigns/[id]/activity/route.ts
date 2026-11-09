import { internal, searchParams } from '@/lib/campaigns/http'
import { campaignActivity } from '@/lib/campaigns/services/overview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, req, p) => campaignActivity(ctx, p.id, searchParams(req)))
