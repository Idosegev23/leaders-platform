import { internal, readJson } from '@/lib/campaigns/http'
import { getOrganization, updateOrganization } from '@/lib/campaigns/services/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx) => getOrganization(ctx))
export const PATCH = internal(async (ctx, req) => updateOrganization(ctx, await readJson(req)))
