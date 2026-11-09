import { internal, readJson } from '@/lib/campaigns/http'
import { participationAction } from '@/lib/campaigns/services/participations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => participationAction(ctx, p.pid, await readJson(req)))
