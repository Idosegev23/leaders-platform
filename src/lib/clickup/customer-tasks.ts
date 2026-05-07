/**
 * Customer-list & kickoff-task operations on ClickUp.
 *
 * The "Leaders Customers" folder (id 901512796092) under the LEADERS space
 * is the canonical place for per-client lists. Each list collects every
 * task the agency does for that client across the lifecycle (brief →
 * kickoff → creative → presentation → launch → reports).
 *
 * Public helpers:
 *   listCustomerLists()                  — for the kickoff form dropdown
 *   findOrCreateCustomerList({ name })   — used at kickoff time
 *   resolveUserIdsByEmail(emails)        — picked-roles → ClickUp user ids
 *   createKickoffTasks({ ... })          — the cascade
 */

const CLICKUP_BASE = 'https://api.clickup.com/api/v2'

// Pinned IDs (confirmed live against the LEADERS workspace).
export const LEADERS_CUSTOMERS_FOLDER_ID = '901512796092'
export const LEADERS_SPACE_ID = '90152286934'

// Custom field id of "URL" on customer lists. Used to attach the Drive
// folder link of the per-client workspace to every kickoff task we create.
const URL_FIELD_ID = 'b7d377b7-5323-4a24-81ff-045040889eb2'

function token(): string {
  const t = process.env.CLICKUP_API_KEY
  if (!t) throw new Error('CLICKUP_API_KEY is not set')
  return t
}

async function cuFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token(),
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ClickUp ${res.status} ${path}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/* ───────────────── Customer lists ───────────────── */

export interface CustomerList {
  id: string
  name: string
  task_count?: number
}

/** Fetch all lists currently inside the Leaders Customers folder. */
export async function listCustomerLists(): Promise<CustomerList[]> {
  const res = await cuFetch<{ lists: Array<{ id: string; name: string; task_count?: number }> }>(
    `/folder/${LEADERS_CUSTOMERS_FOLDER_ID}/list`,
  )
  return (res.lists || []).map((l) => ({ id: l.id, name: l.name, task_count: l.task_count }))
}

/**
 * Get-or-create a customer list under the Leaders Customers folder.
 * Matches by case-insensitive trimmed name.
 */
export async function findOrCreateCustomerList(params: {
  name: string
}): Promise<{ id: string; name: string; created: boolean }> {
  const target = params.name.trim()
  if (!target) throw new Error('Customer list name is required')
  const lists = await listCustomerLists()
  const match = lists.find((l) => l.name.trim().toLowerCase() === target.toLowerCase())
  if (match) return { id: match.id, name: match.name, created: false }
  const res = await cuFetch<{ id: string; name: string }>(
    `/folder/${LEADERS_CUSTOMERS_FOLDER_ID}/list`,
    {
      method: 'POST',
      body: JSON.stringify({ name: target }),
    },
  )
  return { id: res.id, name: res.name, created: true }
}

/* ───────────────── Email → user_id mapping ───────────────── */

interface ClickUpMember {
  user: { id: number; email: string; username?: string | null }
}

let memberCache: { fetchedAt: number; byEmail: Map<string, number> } | null = null
const MEMBER_CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour

async function teamId(): Promise<string> {
  const cached = process.env.CLICKUP_TEAM_ID
  if (cached) return cached
  const res = await cuFetch<{ teams: Array<{ id: string; name: string }> }>('/team')
  const team = res.teams?.[0]
  if (!team) throw new Error('No ClickUp team accessible to this token')
  return team.id
}

async function getMembers(): Promise<Map<string, number>> {
  if (memberCache && Date.now() - memberCache.fetchedAt < MEMBER_CACHE_TTL_MS) {
    return memberCache.byEmail
  }
  const tid = await teamId()
  const res = await cuFetch<{ teams: Array<{ members: ClickUpMember[] }> }>('/team')
  const team = res.teams?.find((t) => 'id' in t) // any team works; we just need members
  const members = team?.members || []
  void tid
  const byEmail = new Map<string, number>()
  for (const m of members) {
    const email = m.user?.email?.toLowerCase()
    if (email && typeof m.user.id === 'number') byEmail.set(email, m.user.id)
  }
  memberCache = { fetchedAt: Date.now(), byEmail }
  return byEmail
}

/** Resolve a batch of emails to ClickUp user ids. Unknown emails are dropped. */
export async function resolveUserIdsByEmail(emails: string[]): Promise<{
  byEmail: Map<string, number>
  unresolved: string[]
}> {
  const all = await getMembers()
  const byEmail = new Map<string, number>()
  const unresolved: string[] = []
  for (const raw of emails) {
    const email = raw?.trim().toLowerCase()
    if (!email) continue
    const id = all.get(email)
    if (id) byEmail.set(email, id)
    else unresolved.push(email)
  }
  return { byEmail, unresolved }
}

/* ───────────────── Kickoff task creation ───────────────── */

export type RoleKey =
  | 'creativeWriter'
  | 'presenter'
  | 'presentationMaker'
  | 'accountManager'
  | 'mediaPerson'

export const ROLE_HEBREW_LABEL: Record<RoleKey, string> = {
  creativeWriter:    'קריאייטיב',
  presenter:         'מציג',
  presentationMaker: 'מצגת',
  accountManager:    'אקאונט',
  mediaPerson:       'מדיה',
}

export interface RolePick {
  key: RoleKey
  email: string
  name?: string
  hebrewName?: string
}

export interface KickoffTaskInput {
  listId: string
  clientName: string
  meetingDate: string  // ISO YYYY-MM-DD
  driveFolderUrl?: string
  picks: RolePick[]
  briefDescriptionHtml: string  // The body of the email — reused as task description
  /** ms timestamps. Each role gets the most relevant deadline. */
  deadlines?: {
    creative?: number
    internal?: number
    client?: number
  }
  /**
   * ms timestamp for the task's start_date. Defaults to "tomorrow" (i.e.
   * 09:00 Asia/Jerusalem on the calendar day AFTER form submission). User
   * spec: tasks shouldn't show up as "do today" the moment the form is
   * submitted — they get a one-day grace.
   */
  startDate?: number
  /** Status to open with. ClickUp accepts the status name as a string. */
  initialStatus?: string  // default: 'backlog'
  /** Existing customer list? Prefix task names with the meeting date so old
   *  kickoff history is preserved. */
  prefixWithDate?: boolean
}

export interface KickoffTaskResult {
  role: RoleKey
  email: string
  taskId?: string
  taskUrl?: string
  status: 'created' | 'failed' | 'skipped_no_user'
  error?: string
}

/**
 * Create one ClickUp task per role-pick, each in the same customer list.
 * Best-effort per task — failures on one don't stop the others.
 */
export async function createKickoffTasks(
  input: KickoffTaskInput,
): Promise<KickoffTaskResult[]> {
  const initialStatus = input.initialStatus || 'backlog'
  const datePrefix = input.prefixWithDate
    ? `${formatHebDate(input.meetingDate)} — `
    : ''
  // start_date defaults to 09:00 Asia/Jerusalem of the next calendar day —
  // gives the team a one-day buffer between form submission and "task due".
  const startDate = input.startDate ?? nextMorning09Jerusalem()

  // Resolve all picked emails to user ids in one shot.
  const { byEmail } = await resolveUserIdsByEmail(input.picks.map((p) => p.email))

  // Pick the right deadline per role.
  function dueFor(role: RoleKey): number | undefined {
    const d = input.deadlines || {}
    if (role === 'creativeWriter' || role === 'presentationMaker') return d.creative
    if (role === 'mediaPerson') return d.internal
    if (role === 'presenter' || role === 'accountManager') return d.client || d.internal
    return undefined
  }

  const out: KickoffTaskResult[] = []
  for (const pick of input.picks) {
    const userId = byEmail.get(pick.email.toLowerCase())
    if (!userId) {
      out.push({ role: pick.key, email: pick.email, status: 'skipped_no_user' })
      continue
    }
    try {
      const due = dueFor(pick.key)
      const body: Record<string, unknown> = {
        name: `${datePrefix}${ROLE_HEBREW_LABEL[pick.key]}`,
        markdown_description: input.briefDescriptionHtml, // ClickUp renders Markdown; plain HTML mostly works
        assignees: [userId],
        status: initialStatus,
        notify_all: false,
        start_date: startDate,
        start_date_time: false,
        ...(due ? { due_date: due, due_date_time: false } : {}),
        ...(input.driveFolderUrl
          ? {
              custom_fields: [
                { id: URL_FIELD_ID, value: input.driveFolderUrl },
              ],
            }
          : {}),
      }
      const task = await cuFetch<{ id: string; url: string }>(
        `/list/${input.listId}/task`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      out.push({
        role: pick.key,
        email: pick.email,
        taskId: task.id,
        taskUrl: task.url,
        status: 'created',
      })
    } catch (e) {
      out.push({
        role: pick.key,
        email: pick.email,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return out
}

/**
 * 09:00 Asia/Jerusalem of the calendar day after "now" — used as default
 * start_date so tasks don't show as "do today" at the moment of form submit.
 *
 * Asia/Jerusalem is UTC+2 winter / UTC+3 summer. We compute via the Intl
 * formatter so DST is handled correctly without bringing in moment-tz.
 */
function nextMorning09Jerusalem(): number {
  const tz = 'Asia/Jerusalem'
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  // Build "tomorrow" in Jerusalem calendar terms.
  const local = new Date(Date.UTC(y, m - 1, d) + 86_400_000) // tomorrow @ 00:00 UTC
  // Snap to 09:00 LOCAL Jerusalem on that day. Compute the offset for that
  // calendar date (DST-aware) by inspecting the ICU output for that moment.
  const probe = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12, 0, 0))
  const offsetFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', hour12: false,
  })
  const localHourAtUtcNoon = Number(offsetFmt.format(probe))
  // If Jerusalem reads "14" at UTC 12 → offset is +2.
  // If Jerusalem reads "15" at UTC 12 → offset is +3 (DST).
  const offsetHours = localHourAtUtcNoon - 12
  const utc09 = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 9 - offsetHours, 0, 0),
  )
  return utc09.getTime()
}

function formatHebDate(iso: string): string {
  // YYYY-MM-DD → DD/MM
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso
  const [, mm, dd] = iso.match(/^(\d{4})-(\d{2})-(\d{2})/) || []
  return `${dd}/${mm}`
}
