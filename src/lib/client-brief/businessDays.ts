// Israeli holidays (Gregorian dates) for 2025-2027
// These shift yearly based on the Hebrew calendar — update as needed
const ISRAELI_HOLIDAYS: string[] = [
  // 2025
  '2025-03-14', // Purim
  '2025-04-13', // Pesach 1st day
  '2025-04-14', // Pesach 2nd day
  '2025-04-19', // Pesach 7th day
  '2025-05-01', // Yom HaZikaron
  '2025-05-02', // Yom Haatzmaut
  '2025-06-02', // Shavuot
  '2025-09-23', // Rosh Hashana 1
  '2025-09-24', // Rosh Hashana 2
  '2025-10-02', // Yom Kippur
  '2025-10-07', // Sukkot 1st day
  '2025-10-14', // Simchat Torah

  // 2026
  '2026-03-03', // Purim
  '2026-04-02', // Pesach 1st day
  '2026-04-03', // Pesach 2nd day
  '2026-04-08', // Pesach 7th day
  '2026-04-22', // Yom HaZikaron
  '2026-04-23', // Yom Haatzmaut
  '2026-05-22', // Shavuot
  '2026-09-12', // Rosh Hashana 1
  '2026-09-13', // Rosh Hashana 2
  '2026-09-21', // Yom Kippur
  '2026-09-26', // Sukkot 1st day
  '2026-10-03', // Simchat Torah

  // 2027
  '2027-03-23', // Purim
  '2027-04-22', // Pesach 1st day
  '2027-04-23', // Pesach 2nd day
  '2027-04-28', // Pesach 7th day
  '2027-05-12', // Yom HaZikaron
  '2027-05-13', // Yom Haatzmaut
  '2027-06-11', // Shavuot
  '2027-10-02', // Rosh Hashana 1
  '2027-10-03', // Rosh Hashana 2
  '2027-10-11', // Yom Kippur
  '2027-10-16', // Sukkot 1st day
  '2027-10-23', // Simchat Torah
]

const holidaySet = new Set(ISRAELI_HOLIDAYS)

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function isIsraeliBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  // Friday = 5, Saturday = 6 → not business days
  if (day === 5 || day === 6) return false
  // Check Israeli holidays
  if (holidaySet.has(toDateString(date))) return false
  return true
}

/**
 * Count Israeli business days between two dates (exclusive of both endpoints).
 * Business days = Sunday(0) through Thursday(4), excluding Israeli holidays.
 */
export function countBusinessDaysBetween(from: Date, to: Date): number {
  let count = 0
  const current = new Date(from)
  current.setUTCDate(current.getUTCDate() + 1) // start from next day

  while (current < to) {
    if (isIsraeliBusinessDay(current)) {
      count++
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return count
}

/**
 * Check if a date is older than N Israeli business days from now.
 */
export function isOlderThanNBusinessDays(date: Date, n: number): boolean {
  const now = new Date()
  return countBusinessDaysBetween(date, now) >= n
}
