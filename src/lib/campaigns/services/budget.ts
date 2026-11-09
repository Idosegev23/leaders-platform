import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx } from '../db'
import { audit } from '../audit'
import { invalid, notFound, precondition, versionConflict } from '../errors'
import { requireCampaign } from '../auth/policy'
import { BUDGET_CATEGORIES, BUDGET_TRANSITIONS, summarizeBudget, type BudgetStatus } from '../domain/budget'
import { parseAmount, toDecimal } from '../domain/money'
import { parseInput, zMoney, zOptText, zRequiredText, zVersion } from '../validation'

export async function getBudget(ctx: Ctx, campaignId: string) {
  const acc = await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  const camp = await one<{ approved_budget: string | null; currency: string; amounts_include_vat: boolean }>(ctx.db,
    `select approved_budget::text, currency, amounts_include_vat from cm_campaigns where id = $1`, [campaignId])
  const lines = await many<{ id: string; category: (typeof BUDGET_CATEGORIES)[number]; description: string; amount: string; status: BudgetStatus
    source: string; participation_id: string | null; creator_name: string | null; source_reference: string | null; version: number; updated_at: Date }>(ctx.db,
    `select b.id, b.category, b.description, b.amount::text, b.status, b.source, b.participation_id, cr.display_name as creator_name,
            b.source_reference, b.version, b.updated_at
       from cm_budget_lines b left join cm_participations p on p.id = b.participation_id left join cm_creators cr on cr.id = p.creator_id
      where b.campaign_id = $1 order by b.category, b.created_at`, [campaignId])
  const summary = summarizeBudget(camp!.approved_budget, lines)
  return { currency: camp!.currency, amountsIncludeVat: camp!.amounts_include_vat, approvedBudget: camp!.approved_budget, lines, summary, accessLevel: acc.level }
}

export const budgetLineSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES),
  description: zRequiredText(300),
  amount: zMoney,
  status: z.enum(['planned', 'committed', 'actual']).default('planned'),
  source_reference: zOptText(300),
})

export async function addBudgetLine(ctx: Ctx, campaignId: string, input: unknown) {
  const acc = await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const v = parseInput(budgetLineSchema, input)
  const amount = parseAmount(v.amount)
  return withTx(async (tx) => {
    const l = await one<{ id: string }>(tx,
      `insert into cm_budget_lines (campaign_id, category, description, amount, currency, status, source_reference, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [campaignId, v.category, v.description, toDecimal(amount), acc.currency, v.status, v.source_reference,
        ctx.actor.kind === 'internal' ? ctx.actor.userId : null])
    await audit(tx, ctx, { campaignId, entityType: 'budget_line', entityId: l!.id, action: 'budget.line_added',
      summary: `נוספה שורת תקציב "${v.description}"`, changes: { amount: toDecimal(amount), status: v.status, category: v.category } })
    return { id: l!.id }
  }, ctx.db)
}

export const updateBudgetLineSchema = z.object({
  expected_version: zVersion,
  status: z.enum(['planned', 'committed', 'actual', 'cancelled']).optional(),
  amount: zMoney.optional(),
  description: zRequiredText(300).optional(),
  source_reference: zOptText(300),
})

/**
 * Status moves the SAME row (planned → committed → actual). When a commitment
 * is paid, its row becomes actual (optionally with the final amount); it is
 * never re-entered as a second row, so it is never counted twice.
 */
export async function updateBudgetLine(ctx: Ctx, lineId: string, input: unknown) {
  const v = parseInput(updateBudgetLineSchema, input)
  return withTx(async (tx) => {
    const l = await one<{ campaign_id: string; status: BudgetStatus; version: number; source: string; amount: string }>(tx,
      `select campaign_id, status, version, source, amount::text from cm_budget_lines where id = $1 for update`, [lineId])
    if (!l) throw notFound('שורת התקציב')
    await requireCampaign(tx, ctx, l.campaign_id, 'manage')
    if (l.version !== v.expected_version) throw versionConflict()
    const sets: string[] = []
    const params: unknown[] = [lineId]
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (v.status && v.status !== l.status) {
      if (!BUDGET_TRANSITIONS[l.status].includes(v.status)) throw invalid(`לא ניתן להעביר שורה מ-${l.status} ל-${v.status}`)
      if (l.source === 'participation_fee' && v.status !== 'actual') {
        throw precondition('שורת שכר יוצר מתעדכנת מתוך ההשתתפות. כאן אפשר רק לסמן אותה כהוצאה בפועל.')
      }
      set('status', v.status)
    }
    if (v.amount !== undefined) {
      if (l.source === 'participation_fee' && (v.status ?? l.status) !== 'actual') throw precondition('את סכום שכר היוצר מעדכנים בתנאי ההשתתפות')
      if (l.status === 'actual' && !v.status) throw precondition('הוצאה בפועל נעולה לעריכה. לתיקון יש לבטל ולהוסיף שורה חדשה.')
      set('amount', toDecimal(parseAmount(v.amount)))
    }
    if (v.description) set('description', v.description)
    if ('source_reference' in ((input ?? {}) as object)) set('source_reference', v.source_reference)
    if (!sets.length) return { id: lineId, version: l.version }
    const r = await one<{ version: number }>(tx, `update cm_budget_lines set ${sets.join(', ')}, version = version + 1 where id = $1 returning version`, params)
    if (v.status === 'actual' && l.source === 'participation_fee') {
      await tx.query(`update cm_participations set payment_status = 'paid_manual', version = version + 1 where id = (select participation_id from cm_budget_lines where id = $1)`, [lineId])
    }
    await audit(tx, ctx, { campaignId: l.campaign_id, entityType: 'budget_line', entityId: lineId, action: 'budget.line_updated',
      summary: v.status && v.status !== l.status ? `שורת תקציב עברה מ-${l.status} ל-${v.status}` : 'שורת תקציב עודכנה',
      changes: { from_status: l.status, to_status: v.status, from_amount: l.amount, to_amount: v.amount } })
    return { id: lineId, version: r!.version }
  }, ctx.db)
}
