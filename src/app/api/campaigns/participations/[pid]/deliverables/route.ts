import { internal, readJson } from '@/lib/campaigns/http'
import { createDeliverable } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => createDeliverable(ctx, p.pid, await readJson(req)), { status: 201 })
