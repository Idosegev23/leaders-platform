import { internal, searchParams } from '@/lib/campaigns/http'
import { searchBriefs } from '@/lib/campaigns/services/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, req) => ({ briefs: await searchBriefs(ctx, searchParams(req).q) }))
