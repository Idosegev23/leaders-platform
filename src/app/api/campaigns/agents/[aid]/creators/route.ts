import { z } from 'zod'
import { internal, readJson } from '@/lib/campaigns/http'
import { setAgentCreator } from '@/lib/campaigns/services/creators'
import { parseInput } from '@/lib/campaigns/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => {
  const v = parseInput(z.object({ creator_id: z.string().uuid(), active: z.boolean() }), await readJson(req))
  return setAgentCreator(ctx, p.aid, v.creator_id, v.active)
})
