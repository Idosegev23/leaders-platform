import { portal } from '@/lib/campaigns/http'
import { completeUpload } from '@/lib/campaigns/services/assets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal((ctx, _req, p) => completeUpload(ctx, p.assetId))
