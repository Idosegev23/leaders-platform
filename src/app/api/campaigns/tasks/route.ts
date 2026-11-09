import { internal, searchParams } from '@/lib/campaigns/http'
import { listTasks } from '@/lib/campaigns/services/tasks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, req) => listTasks(ctx, searchParams(req)))
