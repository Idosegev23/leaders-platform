import { internal, readJson } from '@/lib/campaigns/http'
import { createOrgGrant, listOrgGrants } from '@/lib/campaigns/services/grants'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ grants: await listOrgGrants(ctx) }))
// Invitation covering every campaign of the subject. The URL is returned once.
export const POST = internal(async (ctx, req) => createOrgGrant(ctx, await readJson(req)), { status: 201 })
