import { portal, readJson } from '@/lib/campaigns/http'
import { respondToInvitation } from '@/lib/campaigns/services/participations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal(async (ctx, req, p) => respondToInvitation(ctx, p.pid, await readJson(req)))
