/**
 * Client details collected on the signing page of a Salesforce quote and pushed
 * to Salesforce inside `quote.signed` (`client_details`), so the account card
 * can be updated when the signed agreement arrives.
 *
 * The registered company name and company number reuse the signer's existing
 * "שם החברה" / "ח.פ." inputs; payment terms come from the quote, not the client.
 */

export interface ContactInput {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface ClientDetailsInput {
  commercial_name?: string | null
  address?: string | null
  marketing_manager?: ContactInput | null
  invoice_recipient?: ContactInput | null
}

export interface RegisteredCompany {
  company?: string | null
  hp?: string | null
}

export interface SalesforceContact {
  name: string | null
  email: string | null
  phone: string | null
}

export interface SalesforceClientDetails {
  commercial_name: string | null
  registered_company_name: string
  company_number: string
  address: string
  marketing_manager: SalesforceContact | null
  invoice_recipient: SalesforceContact
  payment_terms: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const clean = (v?: string | null): string => (v ?? '').trim()
const orNull = (v?: string | null): string | null => clean(v) || null
const digits = (v?: string | null): string => clean(v).replace(/\D/g, '')

/**
 * Required: registered name, company number (8-9 digits), address, and the
 * invoice recipient's name + valid email + phone. Optional: commercial name and
 * marketing manager — but an email that is given must be valid.
 * Returns a Hebrew message for the signer, or null when everything is fine.
 */
export function validateClientDetails(
  input: ClientDetailsInput | null | undefined,
  registered: RegisteredCompany,
): string | null {
  if (!clean(registered.company)) return 'יש להזין את שם החברה כפי שהוא רשום ברשם החברות'
  const hp = digits(registered.hp)
  if (hp.length < 8 || hp.length > 9) return 'יש להזין ח.פ. תקין (8–9 ספרות)'
  if (!clean(input?.address)) return 'יש להזין כתובת'

  const inv = input?.invoice_recipient
  if (!clean(inv?.name)) return 'יש להזין שם נמען החשבוניות'
  if (!EMAIL_RE.test(clean(inv?.email))) return 'יש להזין מייל תקין לנמען החשבוניות'
  if (digits(inv?.phone).length < 7) return 'יש להזין טלפון לנמען החשבוניות'

  const mkt = input?.marketing_manager
  if (clean(mkt?.email) && !EMAIL_RE.test(clean(mkt?.email))) {
    return 'המייל של מנהל/ת השיווק אינו תקין'
  }
  return null
}

/** "תנאי התשלום הינם שוטף +45" → "שוטף +45"; anything else is passed through. */
function shortPaymentTerms(text: string): string {
  const m = text.match(/שוטף\s*\+?\s*\d+/)
  return m ? m[0].replace(/\s+/g, ' ').replace(/שוטף\s*\+?\s*/, 'שוטף +') : text.trim()
}

function contact(c?: ContactInput | null): SalesforceContact | null {
  const out = { name: orNull(c?.name), email: orNull(c?.email), phone: orNull(c?.phone) }
  return out.name || out.email || out.phone ? out : null
}

/** Call only after validateClientDetails passed. */
export function buildClientDetails(
  input: ClientDetailsInput,
  registered: RegisteredCompany,
  paymentTermsText: string,
): SalesforceClientDetails {
  return {
    commercial_name: orNull(input.commercial_name),
    registered_company_name: clean(registered.company),
    company_number: digits(registered.hp),
    address: clean(input.address),
    marketing_manager: contact(input.marketing_manager),
    invoice_recipient: contact(input.invoice_recipient) as SalesforceContact,
    payment_terms: shortPaymentTerms(paymentTermsText),
  }
}
