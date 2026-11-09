import { idempotent, internal, readJson, searchParams } from '@/lib/campaigns/http'
import { createCreator, listCreators } from '@/lib/campaigns/services/creators'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, req) => listCreators(ctx, searchParams(req)))
export const POST = internal(async (ctx, req) => {
  const body = await readJson(req)
  return idempotent(req, ctx, 'creator.create', () => createCreator(ctx, body))
})
