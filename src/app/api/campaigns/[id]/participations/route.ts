import { internal, readJson } from '@/lib/campaigns/http'
import { addCreatorsToCampaign, listCampaignParticipations } from '@/lib/campaigns/services/participations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ participations: await listCampaignParticipations(ctx, p.id) }))
export const POST = internal(async (ctx, req, p) => addCreatorsToCampaign(ctx, p.id, await readJson(req)), { status: 201 })
