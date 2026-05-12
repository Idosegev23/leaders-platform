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

/** Which built-in sections appear in the rendered PDF. Defaults to all true. */
export interface SectionToggles {
  aboutLeaders: boolean
  services: boolean
  budget: boolean
  contentMix: boolean
  kpi: boolean
  deliverables: boolean
  paymentTerms: boolean
  declaration: boolean
  signature: boolean
}

export type CustomSectionStyle = 'orange' | 'dark'
export type CustomSectionType = 'bullets' | 'paragraphs'

/** Ad-hoc section added by the user. Rendered after the built-in sections on its page. */
export interface CustomSection {
  id: string
  page: 1 | 2 | 3 | 4
  style: CustomSectionStyle
  type: CustomSectionType
  title: string
  items: string[]
  enabled: boolean
}

export interface PaymentTerms {
  activation: string
  payment: string
}

/** Editable service entry on page 1's "ניהול שוטף" list. */
export interface QuoteService {
  id: string
  title: string
  description: string
  selected: boolean
}

export type PageIndex = 1 | 2 | 3 | 4

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

  // ── Modular controls (optional — default behaviour preserves the original quote)
  /** Per-section enable/disable. Missing keys default to true. */
  enabledSections?: Partial<SectionToggles>
  /** Editable "About Leaders" paragraphs (separated by blank lines). Falls back to the canned text. */
  aboutLeadersText?: string
  /** Editable services-section title (pill). */
  servicesTitle?: string
  /** Editable deliverables-section title (pill). */
  deliverablesTitle?: string
  /** Editable copy of the boilerplate legal terms. */
  legalTerms?: string[]
  /** Editable payment-terms bullets. */
  paymentTerms?: PaymentTerms
  /** Editable client declaration paragraph. */
  clientDeclarationText?: string
  /** Ad-hoc sections added by the user, addressed to a target page. */
  customSections?: CustomSection[]
  /** Per-page enable/disable. Disabled pages are omitted from the final PDF. */
  enabledPages?: Partial<Record<PageIndex, boolean>>
  /**
   * Editable, addable, removable services list shown on page 1.
   * When present (length > 0) this fully replaces the canned PRICE_QUOTE_SERVICES
   * + selectedServiceIds combo. `selected` controls which appear on the PDF.
   */
  services?: QuoteService[]
}
