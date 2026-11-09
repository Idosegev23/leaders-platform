import { portal, readJson } from '@/lib/campaigns/http'
import { clientShortlistDecision } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal(async (ctx, req, p) => clientShortlistDecision(ctx, p.iid, await readJson(req)))
