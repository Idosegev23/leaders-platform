/**
 * Clients belong to an organization (cm_clients). For the Leaders
 * organization (settings.hub_integration) the Hub's own client list and briefs
 * can be searched and linked; other organizations never see Hub data.
 * Nothing is written to Salesforce or the Hub.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, pgCode, withTx } from '../db'
import { audit } from '../audit'
import { DomainError, forbidden, notFound } from '../errors'
import { canCreateCampaigns, orgHasHub, requireInternal } from '../auth/policy'
import { parseInput, zOptText, zRequiredText } from '../validation'

export interface ClientRow { id: string; name: string; name_secondary: string | null; hub_client_id: string | null; salesforce_account_id: string | null; campaigns: number }

export async function searchClients(ctx: Ctx, q: string | undefined): Promise<ClientRow[]> {
  const actor = requireInternal(ctx.actor)
  const term = (q ?? '').trim().slice(0, 100)
  return many<ClientRow>(ctx.db,
    `select cl.id, cl.name, cl.name_secondary, cl.hub_client_id,
            (select r.external_id from cm_external_references r where r.entity_type = 'client' and r.entity_id = cl.id
               and r.system = 'salesforce' limit 1) as salesforce_account_id,
            (select count(*)::int from cm_campaigns c where c.client_id = cl.id) as campaigns
       from cm_clients cl
      where cl.organization_id = $1 and ($2 = '' or cl.name ilike $3 or coalesce(cl.name_secondary,'') ilike $3)
      order by cl.name limit 50`, [actor.orgId, term, `%${term}%`])
}

export const createClientSchema = z.object({
  name: zRequiredText(200),
  name_secondary: zOptText(200),
  notes: zOptText(2000),
  salesforce_account_id: zOptText(100),
  hub_client_id: z.string().uuid().optional().nullable(),
})

export async function createClient(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  if (!canCreateCampaigns(actor)) throw forbidden()
  const v = parseInput(createClientSchema, input)
  return withTx(async (tx) => {
    const dup = await one<{ id: string }>(tx, `select id from cm_clients where organization_id = $1 and lower(name) = lower($2)`, [actor.orgId, v.name])
    if (dup) return { id: dup.id, existing: true }
    if (v.hub_client_id) {
      if (!(await orgHasHub(tx, actor.orgId))) throw forbidden('קישור ללקוח ב-Hub זמין רק לארגון המחובר ל-Hub')
      if (!(await one(tx, `select 1 from clients where id = $1`, [v.hub_client_id]))) throw new DomainError('VALIDATION', 'הלקוח לא נמצא ב-Hub')
    }
    try {
      const c = await one<{ id: string }>(tx,
        `insert into cm_clients (organization_id, name, name_secondary, notes, hub_client_id, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
        [actor.orgId, v.name, v.name_secondary, v.notes, v.hub_client_id ?? null, actor.userId])
      if (v.salesforce_account_id) {
        await tx.query(`insert into cm_external_references (organization_id, entity_type, entity_id, system, external_type, external_id, linked_by)
          values ($1, 'client', $2, 'salesforce', 'account', $3, $4) on conflict do nothing`, [actor.orgId, c!.id, v.salesforce_account_id, actor.userId])
      }
      await audit(tx, ctx, { campaignId: null, entityType: 'client', entityId: c!.id, action: 'client.created', summary: `נוסף לקוח "${v.name}"` })
      return { id: c!.id, existing: false }
    } catch (e) {
      if (pgCode(e) === '23505') throw new DomainError('CONFLICT', 'לקוח בשם זה כבר קיים בארגון')
      throw e
    }
  }, ctx.db)
}

/** Leaders only: search the Hub's client list (to link, not to copy wholesale). */
export async function searchHubClients(ctx: Ctx, q: string | undefined) {
  const actor = requireInternal(ctx.actor)
  if (!(await orgHasHub(ctx.db, actor.orgId))) return []
  const term = (q ?? '').trim().slice(0, 100)
  return many<{ id: string; name: string; name_hebrew: string | null; linked: boolean }>(ctx.db,
    `select h.id, h.name, h.name_hebrew,
            exists (select 1 from cm_clients c where c.organization_id = $1 and c.hub_client_id = h.id) as linked
       from clients h
      where $2 = '' or h.name ilike $3 or coalesce(h.name_hebrew,'') ilike $3
      order by coalesce(h.name_hebrew, h.name) limit 30`, [actor.orgId, term, `%${term}%`])
}

export interface BriefOption {
  id: string; client_name: string | null; status: string; created_at: Date; completed_at: Date | null
  salesforce_ref: string | null
}

/** Leaders only: Hub client briefs. Other organizations attach a brief link instead. */
export async function searchBriefs(ctx: Ctx, q: string | undefined): Promise<BriefOption[]> {
  const actor = requireInternal(ctx.actor)
  if (!(await orgHasHub(ctx.db, actor.orgId))) return []
  const term = (q ?? '').trim().slice(0, 100)
  return many<BriefOption>(ctx.db,
    `select dl.id, dl.client_name, dl.status, dl.created_at, dl.completed_at, dl.metadata->>'salesforce_ref' as salesforce_ref
       from document_links dl join document_types dt on dt.id = dl.document_type_id
      where dt.slug = 'client-brief' and ($1 = '' or dl.client_name ilike $2)
      order by coalesce(dl.completed_at, dl.created_at) desc limit 30`, [term, `%${term}%`])
}

/**
 * Suggested campaign fields from a completed Hub brief. Shown to the manager
 * for review; nothing is saved until she submits. The brief's budget is free
 * text, so it is shown as a hint and never copied into approved_budget.
 */
export async function briefPrefill(ctx: Ctx, briefId: string) {
  const actor = requireInternal(ctx.actor)
  if (!(await orgHasHub(ctx.db, actor.orgId))) throw notFound('הבריף')
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
