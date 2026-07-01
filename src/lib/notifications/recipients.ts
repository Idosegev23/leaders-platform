/**
 * Canonical recipient resolver for Leaders automated notifications.
 *
 * Single source of truth for "who gets emailed" per notification event.
 * Reuses the existing management-mail policy in src/lib/gmail/management.ts
 * (getManagementRecipients already reads MANAGEMENT_EMAILS/ADMIN_EMAILS,
 * validates addresses, lowercases, dedupes, and hard-blocks Eran Nizri).
 *
 * Hard rule: Eran (eran@ldrsgroup.com) is NEVER a recipient of any event.
 *
 * Test mode: when NOTIFICATIONS_TEST_MODE === 'true', every event resolves to
 * a single safe recipient (NOTIFICATIONS_TEST_RECIPIENT, default LDRS.CTO) so
 * live flows can be exercised without mailing real management.
 */

import { getManagementRecipients } from '@/lib/gmail/management'

export const LDRS = {
  ROEI: 'roei@ldrsgroup.com',
  NOA: 'noa@ldrsgroup.com',
  SHARON: 'sharon@ldrsgroup.com',
  CTO: 'cto@ldrsgroup.com',
  YOAV: 'yoav@ldrsgroup.com',
  ERAN: 'eran@ldrsgroup.com',
} as const

export type NotificationEvent =
  | 'inner_meeting_completed'
  | 'client_presentation_day_before'
  | 'second_meeting_day_before'

/** Normalise + dedupe + defensively strip Eran from any address list. */
function clean(addresses: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of addresses) {
    const a = (raw ?? '').toString().trim().toLowerCase()
    if (!a) continue
    if (a === LDRS.ERAN) continue // hard block, always
    if (seen.has(a)) continue
    seen.add(a)
    out.push(a)
  }
  return out
}

/**
 * Resolve the recipient list for a notification event.
 *
 *  - inner_meeting_completed        -> management recipients ∪ {ROEI}  (NOA already in management)
 *  - client_presentation_day_before -> {ROEI, SHARON}
 *  - second_meeting_day_before      -> {ROEI, NOA, SHARON}
 *
 * Eran is always filtered out. When NOTIFICATIONS_TEST_MODE === 'true' the
 * whole list is replaced with a single test recipient.
 */
export function getEventRecipients(event: NotificationEvent): string[] {
  let recipients: string[]
  switch (event) {
    case 'inner_meeting_completed':
      // Union of the existing management policy + Roei.
      recipients = clean([...getManagementRecipients(), LDRS.ROEI])
      break
    case 'client_presentation_day_before':
      recipients = clean([LDRS.ROEI, LDRS.SHARON])
      break
    case 'second_meeting_day_before':
      recipients = clean([LDRS.ROEI, LDRS.NOA, LDRS.SHARON])
      break
    default: {
      // Exhaustiveness guard — TS errors here if a new event is added.
      const _never: never = event
      throw new Error(`Unknown notification event: ${String(_never)}`)
    }
  }

  if (process.env.NOTIFICATIONS_TEST_MODE === 'true') {
    const test = (process.env.NOTIFICATIONS_TEST_RECIPIENT || LDRS.CTO)
      .toString()
      .trim()
      .toLowerCase()
    // Even the test recipient must never be Eran.
    return clean([test]).length ? clean([test]) : [LDRS.CTO]
  }

  return recipients
}
