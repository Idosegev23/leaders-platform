import { internal, readJson } from '@/lib/campaigns/http'
import { createShortlist, listShortlists } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ shortlists: await listShortlists(ctx, p.id) }))
export const POST = internal(async (ctx, req, p) => createShortlist(ctx, p.id, await readJson(req)), { status: 201 })
