import { internal, readJson } from '@/lib/campaigns/http'
import { updateBudgetLine } from '@/lib/campaigns/services/budget'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const PATCH = internal(async (ctx, req, p) => updateBudgetLine(ctx, p.lineId, await readJson(req)))
