import { portal, readJson } from '@/lib/campaigns/http'
import { addComment } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal(async (ctx, req, p) => addComment(ctx, p.did, await readJson(req)), { status: 201 })
