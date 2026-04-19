/**
 * Types for Price Quote (הצעת מחיר) generation
 */

export interface BudgetItem {
  service: string
  detail: string
  price?: string
}

export interface ContentMixItem {
  detail: string
  monthlyPerInfluencer: string
  total: string
}

export interface KPI {
  cpv: string
  estimatedImpressions: string
}

export interface PriceQuoteData {
  // Header fields (variable per quote)
  clientName: string
  campaignName: string
  date: string
  contactName: string

  // Selected services (checkboxes)
  selectedServiceIds: string[]

  // Budget table
  budgetItems: BudgetItem[]
  totalBudget: string // e.g. "90,000₪"

  // Content mix table
  contentMix: ContentMixItem[]

  // KPI table
  kpi: KPI

  // Deliverables page
  platform: string // e.g. "אינסטגרם / טיקטוק"
  contractPeriod: string // e.g. "מרץ 26"
  additionalNotes: string[] // extra deliverable-specific notes
}
