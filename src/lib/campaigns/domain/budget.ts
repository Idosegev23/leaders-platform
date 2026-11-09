/**
 * Budget arithmetic.
 *
 * A budget line is one cost item that moves planned → committed → actual (or
 * cancelled) IN PLACE. It is therefore counted exactly once, in the bucket of
 * its current status; a commitment that became an actual expense is no longer
 * a commitment. That is what keeps commitments and the expense that replaced
 * them from being counted twice.
 *
 *   planned      = Σ amount of planned lines (intent, not yet agreed)
 *   committed    = Σ amount of committed lines (agreed, not yet spent)
 *   actual       = Σ amount of actual lines (spent, recorded by hand)
 *   exposure     = committed + actual
 *   available    = approved − exposure            (what can still be committed)
 *   availableAfterPlanned = available − planned   (if every plan goes ahead)
 *   overrun      = max(0, exposure − approved)
 *
 * All values are integer minor units. Cancelled lines count nowhere.
 * Amounts are in the campaign currency; VAT treatment is the campaign's
 * `amounts_include_vat` flag and is only displayed, never computed.
 */
import { parseMoney } from './money'

export type BudgetStatus = 'planned' | 'committed' | 'actual' | 'cancelled'
export const BUDGET_CATEGORIES = ['influencers', 'production', 'shipping', 'rights', 'misc'] as const
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]

export const HE_CATEGORY: Record<BudgetCategory, string> = {
  influencers: 'משפיענים', production: 'הפקה', shipping: 'שילוח', rights: 'זכויות', misc: 'שונות',
}

export interface BudgetLineInput {
  amount: string | bigint
  status: BudgetStatus
  category: BudgetCategory
}

export interface BudgetBucket { planned: bigint; committed: bigint; actual: bigint }

export interface BudgetSummary extends BudgetBucket {
  approved: bigint | null
  exposure: bigint
  available: bigint | null
  availableAfterPlanned: bigint | null
  overrun: bigint
  byCategory: Record<BudgetCategory, BudgetBucket>
}

export const BUDGET_TRANSITIONS: Record<BudgetStatus, BudgetStatus[]> = {
  planned: ['committed', 'actual', 'cancelled'],
  committed: ['actual', 'cancelled', 'planned'],
  actual: [],
  cancelled: ['planned'],
}

const zero = (): BudgetBucket => ({ planned: BigInt(0), committed: BigInt(0), actual: BigInt(0) })

export function summarizeBudget(approvedBudget: string | bigint | null, lines: BudgetLineInput[]): BudgetSummary {
  const approved = typeof approvedBudget === 'bigint' ? approvedBudget : parseMoney(approvedBudget)
  const total = zero()
  const byCategory = Object.fromEntries(
    (['influencers', 'production', 'shipping', 'rights', 'misc'] as BudgetCategory[]).map((c) => [c, zero()]),
  ) as Record<BudgetCategory, BudgetBucket>

  for (const l of lines) {
    if (l.status === 'cancelled') continue
    const amt = typeof l.amount === 'bigint' ? l.amount : (parseMoney(l.amount) ?? BigInt(0))
    total[l.status] += amt
    byCategory[l.category][l.status] += amt
  }
  const exposure = total.committed + total.actual
  const available = approved === null ? null : approved - exposure
  return {
    ...total,
    approved,
    exposure,
    available,
    availableAfterPlanned: available === null ? null : available - total.planned,
    overrun: approved !== null && exposure > approved ? exposure - approved : BigInt(0),
    byCategory,
  }
}
