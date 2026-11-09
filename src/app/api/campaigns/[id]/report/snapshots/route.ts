import { internal, readJson } from '@/lib/campaigns/http'
import { createReportSnapshot, listReportSnapshots } from '@/lib/campaigns/services/reporting'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ snapshots: await listReportSnapshots(ctx, p.id) }))
export const POST = internal(async (ctx, req, p) => createReportSnapshot(ctx, p.id, await readJson(req)), { status: 201 })
