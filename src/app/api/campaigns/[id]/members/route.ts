import { internal, readJson } from '@/lib/campaigns/http'
import { listMembers, setMember } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ members: await listMembers(ctx, p.id) }))
export const POST = internal(async (ctx, req, p) => setMember(ctx, p.id, await readJson(req)))
