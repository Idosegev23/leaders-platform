import { internal } from '@/lib/campaigns/http'
import { briefPrefill } from '@/lib/campaigns/services/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => briefPrefill(ctx, p.bid))
