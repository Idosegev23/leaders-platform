import { internal } from '@/lib/campaigns/http'
import { retryJob } from '@/lib/campaigns/services/overview'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => retryJob(ctx, p.jobId))
