/**
 * Israeli Business Days Calculator
 *
 * Adds N business days to a date, skipping:
 * - Friday (yom shishi)
 * - Saturday (Shabbat)
 * - Israeli public holidays (hardcoded for 2025-2027)
 *
 * Holidays are based on Hebrew calendar dates (approximate Gregorian).
 */

/** Israeli public holidays — Gregorian dates for 2025-2027 */
const ISRAELI_HOLIDAYS: Set<string> = new Set([
  // 2025
  '2025-04-13', '2025-04-14', // Pesach
  '2025-04-19', '2025-04-20', // Pesach end
  '2025-05-02',                // Yom HaZikaron
  '2025-05-03',                // Yom HaAtzmaut
  '2025-06-02',                // Shavuot
  '2025-09-23', '2025-09-24', // Rosh Hashana
  '2025-10-02',                // Yom Kippur
  '2025-10-07', '2025-10-08', // Sukkot
  '2025-10-14',                // Simchat Torah
  // 2026
  '2026-04-02', '2026-04-03', // Pesach
  '2026-04-08', '2026-04-09', // Pesach end
  '2026-04-22',                // Yom HaZikaron
  '2026-04-23',                // Yom HaAtzmaut
  '2026-05-22',                // Shavuot
  '2026-09-12', '2026-09-13', // Rosh Hashana
  '2026-09-21',                // Yom Kippur
  '2026-09-26', '2026-09-27', // Sukkot
  '2026-10-03',                // Simchat Torah
  // 2027
  '2027-03-23', '2027-03-24', // Pesach
  '2027-03-29', '2027-03-30', // Pesach end
  '2027-04-11',                // Yom HaZikaron
  '2027-04-12',                // Yom HaAtzmaut
  '2027-05-12',                // Shavuot
  '2027-10-02', '2027-10-03', // Rosh Hashana
  '2027-10-11',                // Yom Kippur
  '2027-10-16', '2027-10-17', // Sukkot
  '2027-10-23',                // Simchat Torah
])

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function isFridayOrSaturday(d: Date): boolean {
  const day = d.getDay()
  return day === 5 || day === 6 // Friday=5, Saturday=6
}

function isHoliday(d: Date): boolean {
  return ISRAELI_HOLIDAYS.has(formatDate(d))
}

function isBusinessDay(d: Date): boolean {
  return !isFridayOrSaturday(d) && !isHoliday(d)
}

/**
 * Add N business days to a date.
 * Skips Fridays, Saturdays, and Israeli holidays.
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate)
  let added = 0

  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) {
      added++
    }
  }

  return result
}

/**
 * Format a date as Israeli-friendly string.
 * Example: "יום ראשון, 3 באפריל 2026"
 */
export function formatIsraeliDate(d: Date): string {
  const days = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${days[d.getDay()]}, ${d.getDate()} ב${months[d.getMonth()]} ${d.getFullYear()}`
}
