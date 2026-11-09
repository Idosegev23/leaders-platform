import { internal, readJson } from '@/lib/campaigns/http'
import { updateMember } from '@/lib/campaigns/services/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const PATCH = internal(async (ctx, req, p) => updateMember(ctx, p.accountId, await readJson(req)))
