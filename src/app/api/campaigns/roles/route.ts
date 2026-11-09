import { internal, readJson } from '@/lib/campaigns/http'
import { listModuleUsers, setModuleRole } from '@/lib/campaigns/services/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ users: await listModuleUsers(ctx) }))
export const POST = internal(async (ctx, req) => setModuleRole(ctx, await readJson(req)))
