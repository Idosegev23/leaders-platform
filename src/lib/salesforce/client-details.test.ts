import { describe, it, expect } from 'vitest'
import { buildClientDetails, validateClientDetails, type ClientDetailsInput } from './client-details'

const registered = { company: 'בדיקה בע"מ', hp: '514000000' }

const full: ClientDetailsInput = {
  commercial_name: 'בדיקה מסחרי',
  address: 'רחוב הבדיקות 1, תל אביב',
  marketing_manager: { name: 'נועה', email: 'noa@example.com', phone: '050-000-0000' },
  invoice_recipient: { name: 'יואב', email: 'yoav@example.com', phone: '050-000-0001' },
}

describe('validateClientDetails', () => {
  it('accepts a complete set', () => {
    expect(validateClientDetails(full, registered)).toBeNull()
  })

  it('accepts a set without the optional commercial name and marketing manager', () => {
    expect(
      validateClientDetails({ address: full.address, invoice_recipient: full.invoice_recipient }, registered),
    ).toBeNull()
  })

  it.each([
    ['the registered company name', { company: '  ', hp: registered.hp }, full],
    ['the company number', { company: registered.company, hp: '' }, full],
    ['the address', registered, { ...full, address: '' }],
    ['the invoice recipient', registered, { ...full, invoice_recipient: null }],
    ['the invoice recipient name', registered, { ...full, invoice_recipient: { ...full.invoice_recipient, name: '' } }],
    ['the invoice recipient phone', registered, { ...full, invoice_recipient: { ...full.invoice_recipient, phone: '' } }],
  ])('rejects a missing %s', (_label, reg, input) => {
    expect(validateClientDetails(input as ClientDetailsInput, reg)).toEqual(expect.any(String))
  })

  it('rejects an invalid invoice email', () => {
    expect(
      validateClientDetails({ ...full, invoice_recipient: { ...full.invoice_recipient, email: 'nope' } }, registered),
    ).toEqual(expect.any(String))
  })

  it('rejects a marketing manager email that is present but invalid', () => {
    expect(
      validateClientDetails({ ...full, marketing_manager: { name: 'נועה', email: 'bad' } }, registered),
    ).toEqual(expect.any(String))
  })

  it('rejects a company number that is not 8-9 digits', () => {
    expect(validateClientDetails(full, { company: registered.company, hp: '12ab' })).toEqual(expect.any(String))
  })
})

describe('buildClientDetails', () => {
  it('maps the form to the Salesforce shape and shortens the payment terms', () => {
    expect(buildClientDetails(full, registered, 'תנאי התשלום הינם שוטף +45')).toEqual({
      commercial_name: 'בדיקה מסחרי',
      registered_company_name: 'בדיקה בע"מ',
      company_number: '514000000',
      address: 'רחוב הבדיקות 1, תל אביב',
      marketing_manager: { name: 'נועה', email: 'noa@example.com', phone: '050-000-0000' },
      invoice_recipient: { name: 'יואב', email: 'yoav@example.com', phone: '050-000-0001' },
      payment_terms: 'שוטף +45',
    })
  })

  it('uses null for the optional parts that were left empty', () => {
    const out = buildClientDetails(
      { address: 'x', commercial_name: '  ', marketing_manager: { name: '', email: '', phone: '' }, invoice_recipient: full.invoice_recipient },
      registered,
      'שוטף +30',
    )
    expect(out.commercial_name).toBeNull()
    expect(out.marketing_manager).toBeNull()
    expect(out.payment_terms).toBe('שוטף +30')
  })

  it('falls back to the full sentence when the terms are not in the usual form', () => {
    const out = buildClientDetails(full, registered, 'מזומן במעמד החתימה')
    expect(out.payment_terms).toBe('מזומן במעמד החתימה')
  })
})
