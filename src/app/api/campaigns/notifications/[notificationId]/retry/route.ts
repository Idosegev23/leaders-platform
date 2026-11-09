import { internal, readJson } from '@/lib/campaigns/http'
import { retryNotification } from '@/lib/campaigns/services/overview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal(async (ctx, req, p) => retryNotification(ctx, p.notificationId, await readJson(req)))
