import { internal, readJson } from '@/lib/campaigns/http'
import { addMetrics } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => addMetrics(ctx, p.did, await readJson(req)), { status: 201 })
