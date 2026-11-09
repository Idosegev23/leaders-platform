import { internal } from '@/lib/campaigns/http'
import { completeUpload } from '@/lib/campaigns/services/assets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => completeUpload(ctx, p.assetId))
