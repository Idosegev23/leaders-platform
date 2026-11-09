import { internal } from '@/lib/campaigns/http'
import { closeCheck } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ issues: await closeCheck(ctx, p.id) }))
