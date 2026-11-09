import { idempotent, internal, readJson, searchParams } from '@/lib/campaigns/http'
import { createClient, searchClients } from '@/lib/campaigns/services/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, req) => ({ clients: await searchClients(ctx, searchParams(req).q) }))
export const POST = internal(async (ctx, req) => {
  const body = await readJson(req)
  return idempotent(req, ctx, 'client.create', () => createClient(ctx, body))
})
