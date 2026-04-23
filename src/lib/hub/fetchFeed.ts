import type { SupabaseClient } from '@supabase/supabase-js'
import type { HubEvent } from './types'

type LinkRow = {
  id: string
  token: string
  created_by_email: string
  created_by_name: string | null
  client_name: string | null
  client_email: string | null
  status: string
  metadata: Record<string, unknown> | null
  created_at: string
  opened_at: string | null
  completed_at: string | null
  updated_at: string
  document_types: { slug: string; name: string; target_url: string } | { slug: string; name: string; target_url: string }[] | null
}

type LeadRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  website: string | null
  source: string | null
  status: string
  assigned_to_email: string | null
  created_at: string
  updated_at: string
  contacted_at: string | null
  converted_at: string | null
}

type FormRow = {
  id: string
  share_token: string
  status: string
  title: string | null
  active_editors_count: number
  updated_at: string
}

type MeetingRow = {
  form_id: string
  client_name: string | null
  updated_at: string
  forms: FormRow | FormRow[] | null
}

type DocumentRow = {
  id: string
  title: string | null
  type: string | null
  status: string | null
  user_id: string
  created_at: string
  updated_at: string
}

type ActivityLogRow = {
  id: string
  form_id: string
  user_email: string
  user_name: string | null
  action_type: 'save_draft' | 'submit'
  created_at: string
}

function pickOne<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function briefHref(row: LinkRow): string {
  const dt = pickOne(row.document_types)
  return dt?.target_url ? `${dt.target_url}?token=${row.token}` : '/dashboard'
}

function leadsToEvents(rows: LeadRow[]): HubEvent[] {
  return rows.map((r) => {
    const ts = r.converted_at ?? r.contacted_at ?? r.updated_at
    const kind: HubEvent['kind'] =
      r.status === 'converted' ? 'lead_converted'
      : r.status === 'contacted' || r.status === 'qualified' ? 'lead_contacted'
      : 'lead_new'

    const subtitleParts: string[] = []
    if (r.source) subtitleParts.push(r.source)
    if (r.phone) subtitleParts.push(r.phone)
    if (r.website) subtitleParts.push(r.website)

    return {
      id: `lead:${r.id}`,
      kind,
      source_table: 'leads',
      source_id: r.id,
      title: r.name,
      subtitle: subtitleParts.join(' · ') || null,
      actor_email: r.assigned_to_email,
      actor_name: null,
      href: null,
      status: r.status,
      timestamp: ts,
    }
  })
}

function linksToEvents(rows: LinkRow[]): HubEvent[] {
  return rows.map((r) => {
    const dt = pickOne(r.document_types)
    const progress = (r.metadata as { progress?: { step: number; total: number; updated_at?: string } } | null)?.progress ?? null

    let kind: HubEvent['kind'] = 'brief_sent'
    let subtitle: string | null = dt?.name ?? null
    let ts = r.created_at

    if (r.status === 'completed') {
      kind = 'brief_completed'
      subtitle = 'הבריף הושלם'
      ts = r.completed_at ?? r.updated_at
    } else if (progress && r.status === 'opened') {
      kind = 'brief_progress'
      subtitle = `בריף · שלב ${progress.step}/${progress.total}`
      ts = progress.updated_at ?? r.updated_at
    } else if (r.status === 'opened') {
      kind = 'brief_opened'
      subtitle = `${dt?.name ?? 'בריף'} · נפתח`
      ts = r.opened_at ?? r.updated_at
    } else {
      kind = 'brief_sent'
      subtitle = `${dt?.name ?? 'בריף'} · נשלח`
      ts = r.created_at
    }

    return {
      id: `link:${r.id}`,
      kind,
      source_table: 'document_links',
      source_id: r.id,
      title: r.client_name || r.client_email || dt?.name || 'לינק',
      subtitle,
      actor_email: r.created_by_email,
      actor_name: r.created_by_name,
      href: briefHref(r),
      status: r.status,
      timestamp: ts,
      progress,
    }
  })
}

function meetingsToEvents(
  rows: MeetingRow[],
  lastLogByFormId: Map<string, ActivityLogRow>,
): HubEvent[] {
  return rows
    .map((r): HubEvent | null => {
      const form = pickOne(r.forms)
      if (!form) return null

      const lastLog = lastLogByFormId.get(form.id) ?? null
      const editors = form.active_editors_count ?? 0

      let kind: HubEvent['kind']
      let subtitle: string | null

      if (form.status === 'completed') {
        kind = 'kickoff_submitted'
        subtitle = 'פגישת התנעה · הושלמה'
      } else if (editors > 0) {
        kind = 'kickoff_editing'
        subtitle = `פגישת התנעה · ${editors} עורכים כרגע`
      } else {
        kind = 'kickoff_draft'
        subtitle = 'פגישת התנעה · טיוטה'
      }

      return {
        id: `form:${form.id}`,
        kind,
        source_table: 'forms',
        source_id: form.id,
        title: r.client_name || form.title || 'פגישת התנעה',
        subtitle,
        actor_email: lastLog?.user_email ?? null,
        actor_name: lastLog?.user_name ?? null,
        href: `/inner-meeting?token=${form.share_token}`,
        status: editors > 0 ? 'editing' : (form.status ?? 'draft'),
        timestamp: r.updated_at,
        active_editors: editors,
      }
    })
    .filter((x): x is HubEvent => x !== null)
}

function documentsToEvents(
  rows: DocumentRow[],
  userById: Map<string, { full_name: string | null; email: string | null }>,
): HubEvent[] {
  return rows.map((r): HubEvent => {
    const owner = userById.get(r.user_id) ?? null
    const isQuote = r.type === 'quote'
    const typeLabel = isQuote ? 'הצעת מחיר' : 'מצגת קריאייטיבית'
    const href = isQuote ? `/price-quote?id=${r.id}` : `/edit/${r.id}`

    const kind: HubEvent['kind'] =
      r.status === 'completed' || r.status === 'generated' ? 'document_completed' : 'document_created'

    return {
      id: `doc:${r.id}`,
      kind,
      source_table: 'documents',
      source_id: r.id,
      title: r.title || '(ללא שם)',
      subtitle: typeLabel + (r.status ? ` · ${r.status}` : ''),
      actor_email: owner?.email ?? null,
      actor_name: owner?.full_name ?? null,
      href,
      status: r.status ?? 'draft',
      timestamp: r.updated_at,
    }
  })
}

/**
 * Unified feed fetcher. Best-effort: any missing table returns []
 * so the dashboard still renders if one source is empty / errors.
 */
export async function fetchHubFeed(
  supabase: SupabaseClient,
  limit = 30,
): Promise<HubEvent[]> {
  const perSource = Math.min(20, limit)

  const [leadsRes, linksRes, meetingsRes, docsRes] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, phone, email, website, source, status, assigned_to_email, created_at, updated_at, contacted_at, converted_at')
      .order('updated_at', { ascending: false })
      .limit(perSource),
    supabase
      .from('document_links')
      .select('id, token, created_by_email, created_by_name, client_name, client_email, status, metadata, created_at, opened_at, completed_at, updated_at, document_types(slug, name, target_url)')
      .order('updated_at', { ascending: false })
      .limit(perSource),
    supabase
      .from('inner_meeting_forms')
      .select('form_id, client_name, updated_at, forms(id, share_token, status, title, active_editors_count, updated_at)')
      .order('updated_at', { ascending: false })
      .limit(perSource),
    supabase
      .from('documents')
      .select('id, title, type, status, user_id, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(perSource),
  ])

  // Secondary lookups: last activity log per form, and user display names for documents.
  const formIds = (meetingsRes.data ?? [])
    .map((m) => pickOne((m as MeetingRow).forms)?.id)
    .filter((x): x is string => !!x)

  const userIds = Array.from(
    new Set((docsRes.data ?? []).map((d) => (d as DocumentRow).user_id).filter(Boolean)),
  )

  const [logsRes, usersRes] = await Promise.all([
    formIds.length
      ? supabase
          .from('form_activity_logs')
          .select('id, form_id, user_email, user_name, action_type, created_at')
          .in('form_id', formIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as ActivityLogRow[] }),
    userIds.length
      ? supabase.from('users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ])

  const lastLogByFormId = new Map<string, ActivityLogRow>()
  for (const log of (logsRes.data ?? []) as ActivityLogRow[]) {
    if (!lastLogByFormId.has(log.form_id)) lastLogByFormId.set(log.form_id, log)
  }

  const userById = new Map<string, { full_name: string | null; email: string | null }>()
  for (const u of (usersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    userById.set(u.id, { full_name: u.full_name, email: u.email })
  }

  const events: HubEvent[] = [
    ...leadsToEvents((leadsRes.data ?? []) as LeadRow[]),
    ...linksToEvents((linksRes.data ?? []) as LinkRow[]),
    ...meetingsToEvents((meetingsRes.data ?? []) as MeetingRow[], lastLogByFormId),
    ...documentsToEvents((docsRes.data ?? []) as DocumentRow[], userById),
  ]

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return events.slice(0, limit)
}
