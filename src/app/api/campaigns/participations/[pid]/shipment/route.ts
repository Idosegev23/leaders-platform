import { internal, readJson } from '@/lib/campaigns/http'
import { getShipment, upsertShipment } from '@/lib/campaigns/services/shipments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => ({ shipment: await getShipment(ctx, p.pid) }))
export const PUT = internal(async (ctx, req, p) => upsertShipment(ctx, p.pid, await readJson(req)))
