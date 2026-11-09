import { portal } from '@/lib/campaigns/http'
import { getDeliverable } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal((ctx, _req, p) => getDeliverable(ctx, p.did))
