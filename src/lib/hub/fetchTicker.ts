import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recent activity_log rows for the marquee ticker. Filtered to events
 * that are worth displaying (skip obvious noise like bare `taskUpdated`
 * right after a `taskStatusUpdated`).
 */

export type TickerItem = {
  id: string
  source: string
  action_type: string
  summary: string | null
  entity_type: string | null
  entity_id: string | null
  source_ref: string | null
  actor_name: string | null
  created_at: string
  href: string | null
}

const ACTION_PRIORITIES: Record<string, number> = {
  taskStatusUpdated:   10,
  taskAssigneeUpdated: 9,
  taskMoved:           8,
  taskDueDateUpdated:  8,
  taskCommentPosted:   8,
  taskCreated:         7,
  taskDeleted:         6,
  lead_status_changed: 10,
  lead_assigned:       8,
  clickup_pushed:      3,
  clickup_push_failed: 9,
  taskPriorityUpdated: 5,
  taskTagUpdated:      4,
  taskUpdated:         2,
}

function hrefFor(entity_type: string | null, entity_id: string | null): string | null {
  if (!entity_id) return null
  switch (entity_type) {
    case 'lead':          return `/leads/${entity_id}`
    case 'document_link': return `/dashboard`
    case 'form':          return `/inner-meeting`
    default:              return null
  }
}

export async function fetchTickerItems(
  supabase: SupabaseClient,
  limit = 30,
): Promise<TickerItem[]> {
  const { data } = await supabase
    .from('activity_log')
    .select('id, source, action_type, summary, entity_type, entity_id, source_ref, actor_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  const rows = (data ?? []) as Omit<TickerItem, 'href'>[]

  // Drop noisy `taskUpdated` rows that land within 2s of a higher-signal event on the same task.
  const seenByRef = new Map<string, { at: number; priority: number }>()
  const filtered: Omit<TickerItem, 'href'>[] = []
  for (const r of rows) {
    const ref = r.source_ref ?? r.id
    const priority = ACTION_PRIORITIES[r.action_type] ?? 1
    const at = new Date(r.created_at).getTime()
    const prev = seenByRef.get(ref)
    if (prev && Math.abs(prev.at - at) < 2500 && prev.priority >= priority) {
      continue // duplicate/noisy — keep the earlier, higher-signal one
    }
    seenByRef.set(ref, { at, priority })
    filtered.push(r)
  }

  return filtered.slice(0, limit).map((r) => ({
    ...r,
    href: hrefFor(r.entity_type, r.entity_id),
  }))
}
