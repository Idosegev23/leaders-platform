import { portal } from '@/lib/campaigns/http'
import { getAssetUrl } from '@/lib/campaigns/services/assets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal((ctx, _req, p) => getAssetUrl(ctx, p.assetId))
