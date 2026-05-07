/**
 * GET /api/clients/with-completed-brief
 *
 * Returns the list of clients who completed the client-brief form, for the
 * kickoff (inner-meeting) form's "select client" dropdown. Each entry
 * carries:
 *   - client_name / client_email — for display + auto-fill of meeting fields
 *   - link_token — to fetch the original brief content if needed
 *   - submission_data — the actual brief answers, ready to pre-fill the
 *     kickoff form so the team isn't typing the same fields twice
 *   - workspace_drive_folder_link — link to the per-client Drive workspace
 *   - completed_at — for sorting (most recent first)
 *
 * Auth: requires a logged-in employee. We don't restrict by `created_by_email`
 * because kickoff meetings are a team activity — anyone in management can
 * pick up any completed brief.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional ?since=<ISO> to limit how far back we look. Default 6 months —
  // anything older is unlikely to be the subject of a kickoff today.
  const url = new URL(request.url)
  const sinceParam = url.searchParams.get('since')
  const since =
    sinceParam ||
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString()

  // Resolve the client-brief document_type id once.
  const { data: docType } = await supabase
    .from('document_types')
    .select('id')
    .eq('slug', 'client-brief')
    .single()
  if (!docType) {
    return NextResponse.json({ error: 'client-brief document type missing' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('document_links')
    .select('id, token, client_name, client_email, completed_at, metadata, lead_id')
    .eq('document_type_id', docType.id)
    .eq('status', 'completed')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(100)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    id: string
    token: string
    client_name: string | null
    client_email: string | null
    completed_at: string | null
    metadata: Record<string, unknown> | null
    lead_id: string | null
  }
  const rows = (data || []) as Row[]

  // Dedupe by client_email (lowercase) — same client may have been sent
  // multiple briefs over time. Keep the most recent.
  const seen = new Set<string>()
  const unique = rows.filter((r) => {
    const key = (r.client_email || r.client_name || r.token).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const clients = unique.map((r) => ({
    link_id: r.id,
    link_token: r.token,
    lead_id: r.lead_id,
    client_name: r.client_name,
    client_email: r.client_email,
    completed_at: r.completed_at,
    submission_data: (r.metadata?.submission_data as Record<string, unknown> | undefined) ?? null,
    workspace_drive_folder_id:
      (r.metadata?.workspace_drive_folder_id as string | undefined) ?? null,
    workspace_drive_folder_link:
      (r.metadata?.workspace_drive_folder_link as string | undefined) ?? null,
  }))

  return NextResponse.json({ clients, count: clients.length })
}
