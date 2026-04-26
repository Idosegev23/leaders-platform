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

export interface PriceQuoteSignature {
  date: string                    // dd/mm/yyyy
  signer_name: string
  id_number?: string | null
  signer_role?: string | null
  company_name?: string | null
  company_hp?: string | null
  image_data_url?: string | null  // PNG of the drawn signature
  typed_name?: string | null      // fallback when no canvas signature
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

  // Signature (filled when regenerating the PDF after the client signed)
  signature?: PriceQuoteSignature | null
}
