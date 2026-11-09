import { internal, readJson, searchParams } from '@/lib/campaigns/http'
import { createTask, listTasks } from '@/lib/campaigns/services/tasks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal((ctx, req, p) => listTasks(ctx, { ...searchParams(req), campaign_id: p.id }))
export const POST = internal(async (ctx, req, p) => createTask(ctx, p.id, await readJson(req)), { status: 201 })
