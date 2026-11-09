import { internal } from '@/lib/campaigns/http'
import { startReview } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => startReview(ctx, p.did))
