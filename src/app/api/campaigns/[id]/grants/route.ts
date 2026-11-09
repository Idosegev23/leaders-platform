import { internal, readJson } from '@/lib/campaigns/http'
import { createGrant, listGrants } from '@/lib/campaigns/services/grants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ grants: await listGrants(ctx, p.id) }))
// The invite URL is returned once and never stored.
export const POST = internal(async (ctx, req, p) => createGrant(ctx, p.id, await readJson(req)), { status: 201 })
