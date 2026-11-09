import { internal, readJson } from '@/lib/campaigns/http'
import { getCreator, updateCreator } from '@/lib/campaigns/services/creators'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, _req, p) => getCreator(ctx, p.cid))
export const PATCH = internal(async (ctx, req, p) => updateCreator(ctx, p.cid, await readJson(req)))
