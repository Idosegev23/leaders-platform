/**
 * Money as integer minor units (agorot/cents) in bigint. Postgres numeric(14,2)
 * arrives as a string; it is parsed exactly, never through a float.
 */
import { invalid } from '../errors'

const RE = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/

export function parseMoney(input: string | number | null | undefined): bigint | null {
  if (input === null || input === undefined || input === '') return null
  const s = typeof input === 'number' ? input.toFixed(2) : String(input).trim().replace(/,/g, '')
  const m = RE.exec(s)
  if (!m) throw invalid(`סכום לא תקין: "${String(input)}". יש להזין מספר עם עד שתי ספרות אחרי הנקודה.`)
  const minor = BigInt(m[2]) * BigInt(100) + BigInt((m[3] ?? '').padEnd(2, '0') || '0')
  return m[1] ? -minor : minor
}

/** Strict: requires a non-negative amount. */
export function parseAmount(input: string | number): bigint {
  const v = parseMoney(input)
  if (v === null) throw invalid('חסר סכום')
  if (v < BigInt(0)) throw invalid('סכום לא יכול להיות שלילי')
  return v
}

/** Canonical decimal string for SQL numeric, e.g. BigInt(12345) → "123.45". */
export function toDecimal(minor: bigint): string {
  const neg = minor < BigInt(0)
  const abs = neg ? -minor : minor
  const whole = abs / BigInt(100)
  const frac = (abs % BigInt(100)).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

export function formatMoney(minor: bigint | null, currency: string): string {
  if (minor === null) return '—'
  const neg = minor < BigInt(0)
  const abs = neg ? -minor : minor
  const whole = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % BigInt(100)).toString().padStart(2, '0')
  const sym = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `
  return `${neg ? '-' : ''}${sym}${whole}.${frac}`
}
