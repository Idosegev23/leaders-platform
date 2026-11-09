import { internal, readJson } from '@/lib/campaigns/http'
import { createTalentAgency, listTalentAgencies } from '@/lib/campaigns/services/creators'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ agencies: await listTalentAgencies(ctx) }))
export const POST = internal(async (ctx, req) => createTalentAgency(ctx, await readJson(req)), { status: 201 })
