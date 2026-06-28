/**
 * Salesforce price-quote integration helpers.
 *
 * - Types for the inbound quote payload Salesforce sends (event: "quote.ready").
 * - mapSalesforceQuoteToPriceQuoteData(): SF payload -> our PriceQuoteData
 *   (drives the existing price-quote PDF template).
 * - notifySalesforceQuote(): outbound status push (pending_signature / opened /
 *   signed) back to Salesforce. Best-effort; no-ops when the env URL is unset.
 */

import type { PriceQuoteData } from '@/types/price-quote'
import {
  LEADERS_ABOUT_TEXT,
  LEGAL_TERMS,
  PAYMENT_TERMS,
  CLIENT_DECLARATION,
} from '@/lib/constants/price-quote-services'

/* ───────────────── Inbound payload types ───────────────── */

export interface SalesforceQuoteService {
  name: string
  type: string // "Ongoing" | "Once"
  price: number
  quantity: number
  comments: string | null
}

export interface SalesforceQuoteContract {
  name: string
  start_date: string
  end_date: string
  cpv: number
  estimated_exposures: number
  including_influencers: boolean
  services: SalesforceQuoteService[]
}

export interface SalesforceQuotePayload {
  event: string // "quote.ready"
  project_id: string
  project_name: string
  customer_name: string
  customer_email: string
  contact_name: string
  services_description: string | null
  contracts: SalesforceQuoteContract[]
}

/* ───────────────── Mapping ───────────────── */

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')}₪`

function typeLabel(t: string): string {
  if (t === 'Ongoing') return 'שוטף'
  if (t === 'Once') return 'חד-פעמי'
  return t
}

function formatPeriod(start: string, end: string): string {
  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    } catch {
      return d
    }
  }
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return fmt(start || end)
}

/**
 * Map the Salesforce quote payload to PriceQuoteData. `platform` is pulled from
 * the matching brief (same project_id) by the caller; pass '' if none.
 */
export function mapSalesforceQuoteToPriceQuoteData(
  p: SalesforceQuotePayload,
  platform: string,
): PriceQuoteData {
  const c = p.contracts?.[0]
  const services = c?.services ?? []
  const total = services.reduce((sum, s) => sum + s.price * (s.quantity || 1), 0)

  return {
    clientName: p.customer_name || '',
    campaignName: p.project_name || '',
    date: new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }),
    contactName: p.contact_name || '',
    selectedServiceIds: [],
    budgetItems: services.map((s) => ({
      service: s.name,
      detail: [typeLabel(s.type), (s.quantity || 1) > 1 ? `כמות ${s.quantity}` : '', s.comments || '']
        .filter(Boolean)
        .join(' · '),
      price: money(s.price * (s.quantity || 1)),
    })),
    totalBudget: money(total),
    contentMix: [],
    kpi: {
      cpv: c ? String(c.cpv) : '',
      estimatedImpressions: c ? String(c.estimated_exposures) : '',
    },
    platform: platform || '',
    contractPeriod: c ? formatPeriod(c.start_date, c.end_date) : '',
    additionalNotes: p.services_description ? [p.services_description] : [],
    // Descriptive sections use the canned defaults (Salesforce doesn't send these).
    aboutLeadersText: LEADERS_ABOUT_TEXT,
    servicesTitle: 'ניהול שוטף',
    deliverablesTitle: 'תוצרים ושירותים',
    legalTerms: [...LEGAL_TERMS],
    paymentTerms: { ...PAYMENT_TERMS },
    clientDeclarationText: CLIENT_DECLARATION,
    services: services.map((s, i) => ({
      id: `sf_${i}`,
      title: s.name,
      description: '',
      selected: true,
    })),
    enabledSections: {
      aboutLeaders: true,
      services: true,
      budget: true,
      contentMix: false, // SF doesn't send a content mix
      kpi: true,
      deliverables: true,
      paymentTerms: true,
      declaration: true,
      signature: true,
    },
    enabledPages: { 1: true, 2: true, 3: true, 4: true },
  }
}

/* ───────────────── Outbound status push ───────────────── */

export type SalesforceQuoteEvent =
  | 'quote.pending_signature'
  | 'quote.opened'
  | 'quote.signed'

export interface QuotePushResult {
  delivered: boolean
  reason?: string
  status?: number
}

/**
 * Push a quote status event to Salesforce. Best-effort: never throws.
 * Targets SALESFORCE_QUOTE_WEBHOOK_URL, falling back to the brief webhook URL
 * (Salesforce dispatches on `event`). Auth: X-SF-Token, else Bearer.
 */
export async function notifySalesforceQuote(
  projectId: string | null,
  event: SalesforceQuoteEvent,
  extra: Record<string, unknown> = {},
): Promise<QuotePushResult> {
  const tag = `[salesforce-quote-push:${event}]`
  const url = process.env.SALESFORCE_QUOTE_WEBHOOK_URL || process.env.SALESFORCE_BRIEF_WEBHOOK_URL
  if (!url) {
    console.log(`${tag} no webhook URL configured — skipping`)
    return { delivered: false, reason: 'no_url' }
  }

  const payload = { event, projectId, ...extra }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const sfToken = process.env.SALESFORCE_OUTBOUND_TOKEN
  if (sfToken) headers['X-SF-Token'] = sfToken
  else if (process.env.SALESFORCE_OUTBOUND_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.SALESFORCE_OUTBOUND_SECRET}`
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`${tag} non-2xx: ${res.status} ${body.slice(0, 200)}`)
      return { delivered: false, reason: 'non_2xx', status: res.status }
    }
    console.log(`${tag} delivered → ${res.status}`)
    return { delivered: true, status: res.status }
  } catch (e) {
    console.warn(`${tag} push failed:`, e instanceof Error ? e.message : e)
    return { delivered: false, reason: 'fetch_threw' }
  }
}
