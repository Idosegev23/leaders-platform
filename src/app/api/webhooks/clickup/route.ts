import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * ClickUp webhook receiver.
 *
 * Receives any event from ClickUp webhooks configured in the workspace
 * (task status change, comment, assignee change, etc.), cross-references
 * the task_id against `leads.metadata.task_id` to link the event back to
 * a lead, and writes one row to `activity_log`. The dashboard ticker picks
 * it up via Supabase Realtime.
 *
 * Signature verification: ClickUp signs each delivery with HMAC-SHA256
 * using the secret chosen at webhook creation. If CLICKUP_WEBHOOK_SECRET
 * is set we verify; otherwise (MVP / test mode) we accept everything.
 */

type HistoryItem = {
  id?: string
  type?: number
  date?: string
  field?: string
  parent_id?: string
  data?: Record<string, unknown>
  source?: unknown
  user?: { id?: number; username?: string; email?: string; profilePicture?: string | null }
  before?: Record<string, unknown> | string | null
  after?: Record<string, unknown> | string | null
}

type ClickUpPayload = {
  event: string
  task_id?: string
  webhook_id?: string
  history_items?: HistoryItem[]
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET
  if (!secret) return true
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function pickActor(payload: ClickUpPayload): { email: string | null; name: string | null } {
  const user = payload.history_items?.find((h) => h.user?.email)?.user
  return {
    email: user?.email ?? null,
    name: user?.username ?? null,
  }
}

function buildSummary(payload: ClickUpPayload, actorName: string | null): string | null {
  const who = actorName ?? 'מישהו'
  const first = payload.history_items?.[0]

  const statusOf = (side: 'before' | 'after'): string | null => {
    const s = first?.[side]
    if (!s) return null
    if (typeof s === 'string') return s
    const status = (s as { status?: string }).status
    return typeof status === 'string' ? status : null
  }

  switch (payload.event) {
    case 'taskStatusUpdated': {
      const to = statusOf('after')
      return to ? `${who} שינה סטטוס ל־"${to}"` : `${who} עדכן סטטוס משימה`
    }
    case 'taskCommentPosted':
    case 'taskCommentUpdated':
      return `${who} הוסיף תגובה למשימה`
    case 'taskAssigneeUpdated':
      return `${who} שינה אחראי במשימה`
    case 'taskPriorityUpdated':
      return `${who} שינה עדיפות`
    case 'taskDueDateUpdated':
      return `${who} עדכן תאריך יעד`
    case 'taskMoved':
      return `${who} העביר משימה`
    case 'taskCreated':
      return 'משימה חדשה נוצרה'
    case 'taskDeleted':
      return 'המשימה נמחקה'
    case 'taskUpdated':
      return `${who} עדכן משימה`
    default:
      return `${payload.event}`
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-signature')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: ClickUpPayload
  try {
    payload = JSON.parse(rawBody) as ClickUpPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const taskId = payload.task_id ?? null

  // Cross-reference: which lead owns this ClickUp task?
  let entityType: string | null = null
  let entityId: string | null = null
  if (taskId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('metadata->>task_id', taskId)
      .maybeSingle()
    if (lead?.id) {
      entityType = 'lead'
      entityId = lead.id
    }
  }

  const actor = pickActor(payload)
  const summary = buildSummary(payload, actor.name)

  const { error } = await supabase.from('activity_log').insert({
    source: 'clickup',
    source_ref: taskId,
    action_type: payload.event,
    summary,
    entity_type: entityType,
    entity_id: entityId,
    actor_email: actor.email,
    actor_name: actor.name,
    payload,
  })

  if (error) {
    console.error('[clickup-webhook] activity_log insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    linked: entityType !== null,
    entity: entityType ? { type: entityType, id: entityId } : null,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    purpose: 'ClickUp webhook receiver. POST with a ClickUp webhook payload to record an event.',
  })
}
