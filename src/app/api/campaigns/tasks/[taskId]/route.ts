import { internal, readJson } from '@/lib/campaigns/http'
import { updateTask } from '@/lib/campaigns/services/tasks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const PATCH = internal(async (ctx, req, p) => updateTask(ctx, p.taskId, await readJson(req)))
