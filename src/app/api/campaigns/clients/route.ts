import { internal, readJson, searchParams } from '@/lib/campaigns/http'
import { createLocalClient, searchClients } from '@/lib/campaigns/services/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, req) => ({ clients: await searchClients(ctx, searchParams(req).q) }))
export const POST = internal(async (ctx, req) => createLocalClient(ctx, await readJson(req)), { status: 201 })
