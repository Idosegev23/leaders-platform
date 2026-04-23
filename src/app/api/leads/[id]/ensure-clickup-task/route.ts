import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClickUpLeadTask } from '@/lib/clickup/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Idempotent: ensure this lead has a linked ClickUp task.
 *
 * Called by:
 *  - Supabase pg_net trigger on `leads` INSERT (the primary path)
 *  - Manual retry button in the admin UI (future)
 *
 * Security: LEADS_TRIGGER_SECRET env var. The pg trigger sends it as
 * `X-Trigger-Secret`. If the env var is not set, any caller is allowed
 * (dev convenience).
 */

function authorized(request: Request): boolean {
  const secret = process.env.LEADS_TRIGGER_SECRET
  if (!secret) return true
  return request.headers.get('x-trigger-secret') === secret
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, name, phone, email, website, source, notes, metadata')
    .eq('id', id)
    .maybeSingle()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const existingTaskId = (lead.metadata as { task_id?: string } | null)?.task_id
  if (existingTaskId) {
    return NextResponse.json({ ok: true, already_linked: true, task_id: existingTaskId })
  }

  const descLines = [
    `ליד חדש מ-leaders-platform`,
    lead.email    ? `אימייל: ${lead.email}`     : null,
    lead.phone    ? `טלפון: ${lead.phone}`       : null,
    lead.website  ? `אתר: ${lead.website}`       : null,
    lead.source   ? `מקור: ${lead.source}`       : null,
    lead.notes    ? `הערות: ${lead.notes}`       : null,
    `Lead ID: ${lead.id}`,
  ].filter(Boolean) as string[]

  const result = await createClickUpLeadTask({
    name: lead.name,
    description: descLines.join('\n'),
  })

  if (!result.ok) {
    await supabase.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: 'clickup_task_create_failed',
      summary: `יצירת משימה ב-ClickUp נכשלה: ${result.error}`,
      entity_type: 'lead',
      entity_id: lead.id,
      payload: { error: result.error },
    })
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  const newMeta = {
    ...((lead.metadata as Record<string, unknown>) ?? {}),
    task_id: result.id,
    clickup_url: result.url,
    task_created_at: new Date().toISOString(),
  }

  await supabase.from('leads').update({ metadata: newMeta }).eq('id', lead.id)

  await supabase.from('activity_log').insert({
    source: 'leaders_ui',
    source_ref: result.id,
    action_type: 'clickup_task_created',
    summary: `נוצרה משימת ClickUp עבור ${lead.name}`,
    entity_type: 'lead',
    entity_id: lead.id,
    payload: { task_id: result.id, url: result.url },
  })

  return NextResponse.json({ ok: true, task_id: result.id, url: result.url })
}
