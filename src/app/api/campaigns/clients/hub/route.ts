import { internal, searchParams } from '@/lib/campaigns/http'
import { searchHubClients } from '@/lib/campaigns/services/clients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, req) => ({ clients: await searchHubClients(ctx, searchParams(req).q) }))
