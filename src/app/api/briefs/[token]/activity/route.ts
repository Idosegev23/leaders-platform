/**
 * GET /api/briefs/[token]/activity
 * Return the timeline of events for a brief: send, open, reminder,
 * submit, outcome. Drawn from activity_log filtered to this brief's
 * document_link_id (and the lead's id, if linked).
 *
 * Used by the BriefsList accordion to lazy-load each timeline on
 * expand, so the main list query stays light.
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'

type ActivityEvent = {
  id: string
  action_type: string
  summary: string
  actor_name: string | null
  actor_email: string | null
  created_at: string
  payload: Record<string, unknown> | null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!isDevMode) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: link } = await service
    .from('document_links')
    .select('id, lead_id, status, created_at, opened_at, completed_at, metadata')
    .eq('token', token)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  // Pull every activity_log row attached to this brief OR its linked lead.
  // We use entity_id IN (...) — Postgres handles the dedupe on the join in
  // application code so we can keep the query simple.
  const ids = [link.id, link.lead_id].filter(Boolean) as string[]
  const { data: rows } = await service
    .from('activity_log')
    .select('id, action_type, summary, actor_name, actor_email, created_at, payload')
    .in('entity_id', ids)
    .order('created_at', { ascending: true })
    .limit(100)

  const events: ActivityEvent[] = (rows || []) as ActivityEvent[]

  // Synthesize "system" events that don't always reach activity_log:
  // - send (created_at)
  // - open (opened_at)
  // - submit (completed_at)
  // These help when the link existed before we started logging.
  const synthetic: ActivityEvent[] = []
  const hasAction = (t: string) => events.some(e => e.action_type === t)

  if (!hasAction('client_brief_sent') && link.created_at) {
    synthetic.push({
      id: `sys-sent-${link.id}`,
      action_type: 'client_brief_sent',
      summary: 'הבריף נשלח',
      actor_name: null,
      actor_email: null,
      created_at: link.created_at,
      payload: null,
    })
  }
  if (!hasAction('client_brief_opened') && link.opened_at) {
    synthetic.push({
      id: `sys-opened-${link.id}`,
      action_type: 'client_brief_opened',
      summary: 'הלקוח פתח את הבריף',
      actor_name: null,
      actor_email: null,
      created_at: link.opened_at,
      payload: null,
    })
  }
  if (!hasAction('client_brief_completed') && link.completed_at) {
    synthetic.push({
      id: `sys-completed-${link.id}`,
      action_type: 'client_brief_completed',
      summary: 'הבריף הוגש',
      actor_name: null,
      actor_email: null,
      created_at: link.completed_at,
      payload: null,
    })
  }

  const all = [...events, ...synthetic].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  return NextResponse.json({ events: all })
}
