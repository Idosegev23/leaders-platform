/**
 * Clients and briefs are owned elsewhere (Salesforce → Hub `clients`; briefs
 * in `document_links`). This module only searches them and, when a client is
 * missing, creates a local row marked as such. It never writes to Salesforce.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx } from '../db'
import { audit } from '../audit'
import { forbidden, notFound } from '../errors'
import { canCreateCampaigns, requireInternal } from '../auth/policy'
import { parseInput, zOptText, zRequiredText } from '../validation'

export async function searchClients(ctx: Ctx, q: string | undefined) {
  requireInternal(ctx.actor)
  const term = (q ?? '').trim().slice(0, 100)
  return many<{ id: string; name: string; name_hebrew: string | null; salesforce_account_id: string | null }>(ctx.db,
    `select cl.id, cl.name, cl.name_hebrew,
            (select r.external_id from cm_external_references r where r.entity_type = 'client' and r.entity_id = cl.id
               and r.system = 'salesforce' limit 1) as salesforce_account_id
       from clients cl
      where $1 = '' or cl.name ilike $2 or coalesce(cl.name_hebrew,'') ilike $2 or exists (select 1 from unnest(coalesce(cl.aliases,'{}')) a where a ilike $2)
      order by coalesce(cl.name_hebrew, cl.name) limit 30`, [term, `%${term}%`])
}

export const createClientSchema = z.object({
  name: zRequiredText(200),
  name_hebrew: zOptText(200),
  salesforce_account_id: zOptText(100),
})

export async function createLocalClient(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  if (!canCreateCampaigns(actor)) throw forbidden()
  const v = parseInput(createClientSchema, input)
  return withTx(async (tx) => {
    const dup = await one<{ id: string }>(tx, `select id from clients where lower(name) = lower($1) or lower(coalesce(name_hebrew,'')) = lower($1) limit 1`, [v.name])
    if (dup) return { id: dup.id, existing: true }
    const c = await one<{ id: string }>(tx,
      `insert into clients (name, name_hebrew, aliases, metadata) values ($1, $2, '{}', $3) returning id`,
      [v.name, v.name_hebrew, { created_by: 'campaigns', created_by_user_id: actor.userId, unverified: true }])
    if (v.salesforce_account_id) {
      await tx.query(`insert into cm_external_references (entity_type, entity_id, system, external_type, external_id, linked_by)
        values ('client', $1, 'salesforce', 'account', $2, $3) on conflict do nothing`, [c!.id, v.salesforce_account_id, actor.userId])
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'client', entityId: c!.id, action: 'client.created_locally',
      summary: `נוצר לקוח מקומי "${v.name}" (לא סונכרן ל-Salesforce)` })
    return { id: c!.id, existing: false }
  }, ctx.db)
}

export interface BriefOption {
  id: string; client_name: string | null; status: string; created_at: Date; completed_at: Date | null
  salesforce_ref: string | null
}

export async function searchBriefs(ctx: Ctx, q: string | undefined): Promise<BriefOption[]> {
  requireInternal(ctx.actor)
  const term = (q ?? '').trim().slice(0, 100)
  return many<BriefOption>(ctx.db,
    `select dl.id, dl.client_name, dl.status, dl.created_at, dl.completed_at, dl.metadata->>'salesforce_ref' as salesforce_ref
       from document_links dl join document_types dt on dt.id = dl.document_type_id
      where dt.slug = 'client-brief' and ($1 = '' or dl.client_name ilike $2)
      order by coalesce(dl.completed_at, dl.created_at) desc limit 30`, [term, `%${term}%`])
}

/**
 * Suggested campaign fields from a completed brief. Shown to the manager for
 * review; nothing is saved until she submits the form. The brief's budget is
 * free text, so it is shown as a hint and never copied into approved_budget.
 */
export async function briefPrefill(ctx: Ctx, briefId: string) {
  requireInternal(ctx.actor)
  const b = await one<{ client_name: string | null; status: string; metadata: Record<string, unknown> | null }>(ctx.db,
    `select dl.client_name, dl.status, dl.metadata from document_links dl join document_types dt on dt.id = dl.document_type_id
      where dl.id = $1 and dt.slug = 'client-brief'`, [briefId])
  if (!b) throw notFound('הבריף')
  const s = ((b.metadata ?? {}).submission_data ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string).trim() : '')
  const arr = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]).filter((x) => typeof x === 'string').join(', ') : '')
  const launch = str('campaignLaunchDate')
  return {
    brief_status: b.status,
    name: [str('clientName') || b.client_name, str('productService')].filter(Boolean).join(' — ') || null,
    description: [str('productDescription'), str('challenge') && `אתגר: ${str('challenge')}`].filter(Boolean).join('\n\n') || null,
    objectives: [arr('campaignGoalTypes'), str('campaignGoalsDescription'), str('desiredResponse') && `תגובה רצויה: ${str('desiredResponse')}`]
      .filter(Boolean).join('\n') || null,
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(launch) ? launch : null,
    budget_hint: str('budget') || null,
    platforms: arr('platforms') || null,
  }
}
