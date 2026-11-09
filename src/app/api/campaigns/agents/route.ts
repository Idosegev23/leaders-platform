import { internal, readJson } from '@/lib/campaigns/http'
import { createAgent, listAgents } from '@/lib/campaigns/services/creators'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ agents: await listAgents(ctx) }))
export const POST = internal(async (ctx, req) => createAgent(ctx, await readJson(req)), { status: 201 })
