/** Manual shipment tracking. The address is visible to the internal team and the creator only. */
import { z } from 'zod'
import type { Ctx } from '../context'
import { one, withTx } from '../db'
import { audit } from '../audit'
import { invalid, notFound, versionConflict } from '../errors'
import { requireCampaign } from '../auth/policy'
import { parseInput, zOptBusinessDateTime, zOptText, zOptUrl } from '../validation'

export const shipmentSchema = z.object({
  expected_version: z.number().int().positive().nullable().optional(),
  status: z.enum(['not_required', 'required', 'preparing', 'shipped', 'delivered', 'exception']),
  carrier_name: zOptText(100),
  tracking_number: zOptText(100),
  tracking_url: zOptUrl,
  shipping_address: zOptText(500),
  dispatched_at: zOptBusinessDateTime,
  delivered_at: zOptBusinessDateTime,
  notes: zOptText(2000),
})

export async function getShipment(ctx: Ctx, participationId: string) {
  const p = await one<{ campaign_id: string }>(ctx.db, `select campaign_id from cm_participations where id = $1`, [participationId])
  if (!p) throw notFound('ההשתתפות')
  await requireCampaign(ctx.db, ctx, p.campaign_id, 'operate')
  return one(ctx.db, `select id, status, carrier_name, tracking_number, tracking_url, shipping_address, dispatched_at, delivered_at, notes, version, updated_at
    from cm_shipments where participation_id = $1`, [participationId])
}

export async function upsertShipment(ctx: Ctx, participationId: string, input: unknown) {
  const v = parseInput(shipmentSchema, input)
  if (v.status === 'exception' && !v.notes) throw invalid('חריגה במשלוח מחייבת הערה')
  return withTx(async (tx) => {
    const p = await one<{ campaign_id: string }>(tx, `select campaign_id from cm_participations where id = $1`, [participationId])
    if (!p) throw notFound('ההשתתפות')
    await requireCampaign(tx, ctx, p.campaign_id, 'operate')
    const cur = await one<{ id: string; version: number; dispatched_at: Date | null; delivered_at: Date | null }>(tx,
      `select id, version, dispatched_at, delivered_at from cm_shipments where participation_id = $1 for update`, [participationId])
    if (cur && v.expected_version !== cur.version) throw versionConflict()
    const dispatched = v.dispatched_at ?? cur?.dispatched_at ?? (['shipped', 'delivered'].includes(v.status) ? ctx.now : null)
    const delivered = v.delivered_at ?? cur?.delivered_at ?? (v.status === 'delivered' ? ctx.now : null)
    if (dispatched && delivered && new Date(delivered) < new Date(dispatched)) throw invalid('מועד המסירה מוקדם ממועד המשלוח')
    const userId = ctx.actor.kind === 'internal' ? ctx.actor.userId : null
    const row = await one<{ id: string; version: number }>(tx,
      `insert into cm_shipments (participation_id, status, carrier_name, tracking_number, tracking_url, shipping_address, dispatched_at, delivered_at, notes, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (participation_id) do update set status = excluded.status, carrier_name = excluded.carrier_name,
         tracking_number = excluded.tracking_number, tracking_url = excluded.tracking_url, shipping_address = excluded.shipping_address,
         dispatched_at = excluded.dispatched_at, delivered_at = excluded.delivered_at, notes = excluded.notes,
         updated_by = excluded.updated_by, version = cm_shipments.version + 1
       returning id, version`,
      [participationId, v.status, v.carrier_name, v.tracking_number, v.tracking_url ?? null, v.shipping_address, dispatched, delivered, v.notes, userId])
    await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'shipment', entityId: row!.id, action: 'shipment.updated',
      summary: `סטטוס משלוח: ${v.status}`, changes: { status: v.status, carrier_name: v.carrier_name, tracking_number: v.tracking_number } })
    return row
  }, ctx.db)
}
