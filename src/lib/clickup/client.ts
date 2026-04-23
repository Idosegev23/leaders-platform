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
