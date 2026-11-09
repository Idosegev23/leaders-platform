import { internal } from '@/lib/campaigns/http'
import { reissueGrant } from '@/lib/campaigns/services/grants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => reissueGrant(ctx, p.grantId))
