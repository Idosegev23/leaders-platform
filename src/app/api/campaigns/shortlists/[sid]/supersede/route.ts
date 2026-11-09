import { internal, readJson } from '@/lib/campaigns/http'
import { supersedeShortlist } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => supersedeShortlist(ctx, p.sid, await readJson(req)))
