import { internal, readJson } from '@/lib/campaigns/http'
import { internalContentDecision } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => internalContentDecision(ctx, p.did, await readJson(req)))
