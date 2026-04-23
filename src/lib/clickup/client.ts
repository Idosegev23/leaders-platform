/**
 * Thin ClickUp API client. Used for outbound calls from leaders-platform
 * to ClickUp (e.g. push lead.status → task.status when a lead changes here).
 *
 * Inbound traffic (ClickUp webhook → us) lives in /api/webhooks/clickup.
 */

const CLICKUP_BASE = 'https://api.clickup.com/api/v2'

function token(): string {
  const t = process.env.CLICKUP_API_KEY
  if (!t) throw new Error('CLICKUP_API_KEY is not set')
  return t
}

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'

// Maps our lead lifecycle to the ClickUp statuses defined on the leads list.
// Kept narrow on purpose — any unmapped status simply does not push to ClickUp.
export const LEAD_STATUS_TO_CLICKUP: Record<LeadStatus, string> = {
  new:       'Open',
  contacted: 'ליד אחרי שיחה',
  qualified: 'ליד אחרי פגישה',
  converted: 'ליד אחרי הצעת מחיר',
  rejected:  'done',
}

// Reverse map — ClickUp status → our lead status. We intentionally do NOT
// auto-map "ליד לפני שיחה" (intermediate, leaves lead at current status)
// or "done" (ambiguous: could be converted OR rejected — human decides).
export const CLICKUP_STATUS_TO_LEAD: Record<string, LeadStatus> = {
  'Open':               'new',
  'open':               'new',
  'ליד אחרי שיחה':     'contacted',
  'ליד אחרי פגישה':    'qualified',
  'ליד אחרי הצעת מחיר': 'converted',
}

export async function updateClickUpTaskStatus(
  taskId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${CLICKUP_BASE}/task/${taskId}`, {
      method: 'PUT',
      headers: {
        Authorization: token(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `ClickUp ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Leads list in the LEADERS workspace where new-lead tasks should go.
// Exposed as an env for safe override in non-prod.
export const LEADS_CLICKUP_LIST_ID =
  process.env.CLICKUP_LEADS_LIST_ID ?? '901509407870'

export async function createClickUpLeadTask(params: {
  name: string
  description: string
  listId?: string
}): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  const listId = params.listId ?? LEADS_CLICKUP_LIST_ID
  try {
    const res = await fetch(`${CLICKUP_BASE}/list/${listId}/task`, {
      method: 'POST',
      headers: {
        Authorization: token(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        description: params.description,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `ClickUp ${res.status}: ${body.slice(0, 200)}` }
    }
    const data = (await res.json()) as { id: string; url: string }
    return { ok: true, id: data.id, url: data.url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
