import { internal } from '@/lib/campaigns/http'
import { getTalentAgency } from '@/lib/campaigns/services/creators'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => getTalentAgency(ctx, p.agencyId))
