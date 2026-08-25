import { describe, it, expect } from 'vitest'
import { mapSalesforceQuoteToPriceQuoteData, type SalesforceQuotePayload } from './quote'

/** Minimal SF payload with one contract; `kpi` overrides the CPV/exposures pair. */
function payload(kpi: { cpv: unknown; estimated_exposures: unknown }): SalesforceQuotePayload {
  return {
    event: 'quote.ready',
    project_id: '006Ad000001AbCdEFG',
    project_name: 'קמפיין קיץ',
    customer_name: 'נטורל גלואו',
    customer_email: 'maya@naturalglow.co.il',
    contact_name: 'מאיה כהן',
    services_description: null,
    contracts: [
      {
        name: 'הסכם לקוח',
        start_date: '2026-07-01',
        end_date: '2026-09-30',
        including_influencers: true,
        services: [],
        ...kpi,
      },
    ],
  } as unknown as SalesforceQuotePayload
}

describe('mapSalesforceQuoteToPriceQuoteData — KPI', () => {
  it('leaves CPV and exposures blank when Salesforce sends null', () => {
    const { kpi } = mapSalesforceQuoteToPriceQuoteData(
      payload({ cpv: null, estimated_exposures: null }),
      '',
    )
    expect(kpi.cpv).toBe('')
    expect(kpi.estimatedImpressions).toBe('')
  })

  it('leaves CPV and exposures blank when the fields are absent', () => {
    const { kpi } = mapSalesforceQuoteToPriceQuoteData(
      payload({ cpv: undefined, estimated_exposures: undefined }),
      '',
    )
    expect(kpi.cpv).toBe('')
    expect(kpi.estimatedImpressions).toBe('')
  })

  it('leaves CPV and exposures blank for the empty string', () => {
    const { kpi } = mapSalesforceQuoteToPriceQuoteData(
      payload({ cpv: '', estimated_exposures: '' }),
      '',
    )
    expect(kpi.cpv).toBe('')
    expect(kpi.estimatedImpressions).toBe('')
  })

  it('still maps real values, including a legitimate zero', () => {
    const { kpi } = mapSalesforceQuoteToPriceQuoteData(
      payload({ cpv: 0.18, estimated_exposures: 700000 }),
      '',
    )
    expect(kpi.cpv).toBe('0.18')
    expect(kpi.estimatedImpressions).toBe('700000')

    const zero = mapSalesforceQuoteToPriceQuoteData(
      payload({ cpv: 0, estimated_exposures: 0 }),
      '',
    )
    expect(zero.kpi.cpv).toBe('0')
    expect(zero.kpi.estimatedImpressions).toBe('0')
  })
})
