/**
 * CSV export that opens correctly in Excel with Hebrew:
 *  - UTF-8 with BOM, CRLF line endings
 *  - RFC 4180 quoting (quotes doubled; fields with , " CR LF quoted)
 *  - formula-injection guard: a TEXT cell starting with = + - @ tab or CR is
 *    prefixed with an apostrophe. Numbers are written as numbers, untouched.
 */
export type CsvCell = string | number | bigint | boolean | null | undefined

const DANGEROUS = /^[=+\-@\t\r]/

export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'boolean') return v ? 'כן' : 'לא'
  let s = String(v)
  if (DANGEROUS.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
