import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { LEAD_STATUS_TO_CLICKUP, updateClickUpTaskStatus, type LeadStatus } from '@/lib/clickup/client'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: readonly LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'rejected'] as const

/**
 * PATCH /api/leads/{id}
 * Body: { status?, assigned_to_email?, notes? }
 * Requires an authenticated Leaders employee session.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    status?: string
    assigned_to_email?: string | null
    notes?: string | null
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as LeadStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'contacted' || body.status === 'qualified') {
      patch.contacted_at = new Date().toISOString()
    }
    if (body.status === 'converted') {
      patch.converted_at = new Date().toISOString()
    }
  }

  if (body.assigned_to_email !== undefined) patch.assigned_to_email = body.assigned_to_email
  if (body.notes !== undefined) patch.notes = body.notes

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No-op' }, { status: 400 })
  }

  // Use service role so RLS/ownership rules don't block the update.
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: updated, error } = await service
    .from('leads')
    .update(patch)
    .eq('id', id)
    .select('id, name, status, metadata')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort outbound sync to ClickUp + self-log.
  if (updated) {
    const logRows: Array<{
      source: string
      action_type: string
      summary: string
      entity_type: string
      entity_id: string
      actor_email: string
      actor_name: string | null
      payload: Record<string, unknown>
    }> = []

    const actorName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null
    const taskId = (updated.metadata as { task_id?: string } | null)?.task_id

    if (body.status) {
      logRows.push({
        source: 'leaders_ui',
        action_type: 'lead_status_changed',
        summary: `${actorName ?? 'משתמש'} שינה סטטוס ליד ל־"${body.status}"`,
        entity_type: 'lead',
        entity_id: id,
        actor_email: user.email,
        actor_name: actorName,
        payload: { status: body.status, from: 'leaders_ui' },
      })

      // Push to ClickUp if this lead is linked to a task.
      if (taskId) {
        const clickupStatus = LEAD_STATUS_TO_CLICKUP[body.status as LeadStatus]
        if (clickupStatus) {
          const res = await updateClickUpTaskStatus(taskId, clickupStatus)
          logRows.push({
            source: 'leaders_ui',
            action_type: res.ok ? 'clickup_pushed' : 'clickup_push_failed',
            summary: res.ok
              ? `סטטוס ClickUp עודכן ל־"${clickupStatus}"`
              : `נכשל עדכון ClickUp: ${res.error ?? 'unknown'}`,
            entity_type: 'lead',
            entity_id: id,
            actor_email: user.email,
            actor_name: actorName,
            payload: { task_id: taskId, clickup_status: clickupStatus, error: res.error ?? null },
          })
        }
      }
    }

    if (body.assigned_to_email !== undefined) {
      logRows.push({
        source: 'leaders_ui',
        action_type: 'lead_assigned',
        summary: body.assigned_to_email
          ? `${actorName ?? 'משתמש'} הקצה את הליד ל־${body.assigned_to_email.split('@')[0]}`
          : `${actorName ?? 'משתמש'} שחרר את הקצאת הליד`,
        entity_type: 'lead',
        entity_id: id,
        actor_email: user.email,
        actor_name: actorName,
        payload: { assigned_to_email: body.assigned_to_email },
      })
    }

    if (logRows.length > 0) {
      await service.from('activity_log').insert(logRows)
    }
  }

  return NextResponse.json({ ok: true })
}
