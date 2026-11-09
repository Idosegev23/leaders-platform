import { internal, readJson } from '@/lib/campaigns/http'
import { reportPublication } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => reportPublication(ctx, p.did, await readJson(req)))
