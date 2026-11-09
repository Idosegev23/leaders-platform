import { internal, readJson } from '@/lib/campaigns/http'
import { internalShortlistDecision } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => internalShortlistDecision(ctx, p.sid, p.iid, await readJson(req)))
