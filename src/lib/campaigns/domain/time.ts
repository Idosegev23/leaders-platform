/**
 * Business time zone: Asia/Jerusalem. Moments are stored as timestamptz (UTC);
 * these helpers convert to and from wall-clock time in Israel, DST included.
 */
export const BUSINESS_TZ = 'Asia/Jerusalem'

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function wallParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** Offset of Israel from UTC at instant `d`, in minutes (+120 winter, +180 summer). */
export function jerusalemOffsetMinutes(d: Date): number {
  const w = wallParts(d)
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
}

/**
 * "2026-03-27T10:00" (Israel wall clock) → UTC Date.
 * A time that does not exist (the hour skipped when DST starts) is moved
 * forward by the gap; an ambiguous time (the repeated hour when DST ends)
 * resolves to the first occurrence (summer time).
 */
export function jerusalemLocalToUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim())
  if (!m) throw new Error(`bad local datetime "${local}"`)
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi, s)
  // Try the summer offset first so the ambiguous hour resolves to its first occurrence.
  for (const off of [180, 120]) {
    const cand = new Date(naive - off * 60_000)
    if (jerusalemOffsetMinutes(cand) === off) {
      const w = wallParts(cand)
      if (w.h === h && w.mi === mi && w.d === d) return cand
    }
  }
  // Nonexistent local time (spring-forward gap): interpret with the pre-gap
  // offset, which lands just after the gap.
  return new Date(naive - 120 * 60_000)
}

/** Business date (YYYY-MM-DD) of an instant, in Israel. */
export function jerusalemDate(d: Date): string {
  const w = wallParts(d)
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`
}

/** UTC instant → value for <input type="datetime-local"> in Israel time. */
export function toJerusalemInput(d: Date | string | null): string {
  if (!d) return ''
  const w = wallParts(new Date(d))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${w.y}-${p(w.mo)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}`
}

const dtFmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: BUSINESS_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const dFmt = new Intl.DateTimeFormat('he-IL', { timeZone: BUSINESS_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return dtFmt.format(new Date(d))
}

/** For a business `date` column ("2026-11-01") or an instant. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-')
    return `${day}.${m}.${y}`
  }
  return dFmt.format(new Date(d))
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000)
}
