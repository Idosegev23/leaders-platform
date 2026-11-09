import { internal, readJson } from '@/lib/campaigns/http'
import { addBudgetLine, getBudget } from '@/lib/campaigns/services/budget'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// bigint → string for JSON
const ser = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))
export const GET = internal(async (ctx, _req, p) => ser(await getBudget(ctx, p.id)))
export const POST = internal(async (ctx, req, p) => addBudgetLine(ctx, p.id, await readJson(req)), { status: 201 })
