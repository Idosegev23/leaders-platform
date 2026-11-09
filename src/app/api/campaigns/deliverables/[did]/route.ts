import { internal, readJson } from '@/lib/campaigns/http'
import { getDeliverable, updateDeliverable } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => getDeliverable(ctx, p.did))
export const PATCH = internal(async (ctx, req, p) => updateDeliverable(ctx, p.did, await readJson(req)))
