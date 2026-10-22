/**
 * Salesforce kickoff (inner-meeting / פגישת התנעה) outbound push.
 *
 * Two events go back to Salesforce, both writing the project's
 * "מסמך לפגישת התנעה" field:
 *
 *   1. `kickoff.document_ready` — fired the moment we create a kickoff form
 *      from a Salesforce request. `kickoff_document_url` is the
 *      /inner-meeting?form=<token> fill link (the blank template).
 *   2. `kickoff.completed` — fired from /api/inner-meeting/complete when the
 *      team submits the form. `kickoff_document_url` is the Google Doc of the
 *      filled kickoff, so the field ends up on the finished document.
 *      It also carries `tasks`: an array of { task_name, assignee_name,
 *      assignee_email, due_date } — one per role picked on the form, `[]` when
 *      none was picked.
 *
 * Best-effort: never throws, no-ops when no webhook URL is configured.
 *
 * Salesforce contract (their /apexrest/projectkickoff endpoint):
 *   { event, projectId, token, kickoff_document_url, ... }
 * `token` is the form's share_token — stable across both events, so Salesforce
 * can correlate them to one record. Salesforce must treat `kickoff.completed`
 * as an UPDATE of the same field, not a duplicate of the create event.
 *
 * Mirrors src/lib/salesforce/quote.ts's transport exactly (same auth header,
 * same failure handling) so Salesforce sees a consistent envelope.
 *
 * Env vars:
 *   SALESFORCE_KICKOFF_WEBHOOK_URL — where we POST. Falls back to
 *                                    SALESFORCE_BRIEF_WEBHOOK_URL (Salesforce
 *                                    dispatches on `event`). Unset → push skipped.
 *   SALESFORCE_OUTBOUND_TOKEN      — sent as `X-SF-Token: <token>` if set.
 *   SALESFORCE_OUTBOUND_SECRET     — else sent as `Authorization: Bearer <secret>`.
 */

import {
  kickoffTaskName,
  pickKickoffDeadline,
  type RolePick,
} from '@/lib/clickup/customer-tasks'

export type SalesforceKickoffEvent = 'kickoff.document_ready' | 'kickoff.completed'

export interface KickoffPushResult {
  delivered: boolean
  reason?: string
  status?: number
}

/** One entry of `tasks` in the `kickoff.completed` event. */
export interface KickoffTaskPayload {
  /** Exactly the name of the task created in ClickUp. */
  task_name: string
  /** Hebrew name when the form has one, else the Latin name. */
  assignee_name: string
  assignee_email: string
  /** YYYY-MM-DD, or null when the role has no deadline. */
  due_date: string | null
}

/**
 * Build the `tasks` array of the `kickoff.completed` event from the role
 * picks on the kickoff form. Name and deadline come from the same helpers the
 * ClickUp cascade uses, so Salesforce and ClickUp always agree.
 */
export function buildKickoffTasksPayload(input: {
  meetingDate: string
  prefixWithDate: boolean
  deadlines: { creative?: string; internal?: string; client?: string }
  picks: RolePick[]
}): KickoffTaskPayload[] {
  return input.picks.map((pick) => {
    const due = pickKickoffDeadline(pick.key, input.deadlines)
    return {
      task_name: kickoffTaskName(pick.key, input.meetingDate, input.prefixWithDate),
      assignee_name: pick.hebrewName || pick.name || pick.email,
      assignee_email: pick.email.toLowerCase(),
      due_date: due ? due.slice(0, 10) : null,
    }
  })
}

/**
 * Push a kickoff status event to Salesforce. `projectId` is the salesforce_ref
 * stashed on the form at creation; `extra` carries the form token + context.
 */
export async function notifySalesforceKickoff(
  projectId: string | null,
  event: SalesforceKickoffEvent,
  extra: Record<string, unknown> = {},
): Promise<KickoffPushResult> {
  const tag = `[salesforce-kickoff-push:${event}]`
  const url = process.env.SALESFORCE_KICKOFF_WEBHOOK_URL || process.env.SALESFORCE_BRIEF_WEBHOOK_URL
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
