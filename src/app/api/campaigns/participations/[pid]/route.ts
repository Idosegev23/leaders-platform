import { internal, readJson } from '@/lib/campaigns/http'
import { updateParticipationTerms } from '@/lib/campaigns/services/participations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const PATCH = internal(async (ctx, req, p) => updateParticipationTerms(ctx, p.pid, await readJson(req)))
