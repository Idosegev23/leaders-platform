import { internal } from '@/lib/campaigns/http'
import { listStaff } from '@/lib/campaigns/services/campaigns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx) => ({ staff: await listStaff(ctx) }))
