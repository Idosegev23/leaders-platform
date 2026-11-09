import { internal } from '@/lib/campaigns/http'
import { revokeGrant } from '@/lib/campaigns/services/grants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => revokeGrant(ctx, p.grantId))
