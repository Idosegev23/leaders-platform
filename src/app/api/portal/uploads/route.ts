import { portal, readJson } from '@/lib/campaigns/http'
import { createUploadIntent } from '@/lib/campaigns/services/assets'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = portal(async (ctx, req) => createUploadIntent(ctx, await readJson(req)), { status: 201 })
