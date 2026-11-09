import { portal, readJson } from '@/lib/campaigns/http'
import { clientContentDecision } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal(async (ctx, req, p) => clientContentDecision(ctx, p.did, await readJson(req)))
