import { internal, readJson } from '@/lib/campaigns/http'
import { submitVersion } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => submitVersion(ctx, p.did, await readJson(req)), { status: 201 })
