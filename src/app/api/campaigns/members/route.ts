import { internal, readJson } from '@/lib/campaigns/http'
import { inviteMember, listMembers } from '@/lib/campaigns/services/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ members: await listMembers(ctx) }))
// The invite URL is returned once (also emailed) and never stored.
export const POST = internal(async (ctx, req) => inviteMember(ctx, await readJson(req)), { status: 201 })
