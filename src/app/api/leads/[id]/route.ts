import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'rejected'] as const
type LeadStatus = (typeof VALID_STATUSES)[number]

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

  const { error } = await service.from('leads').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
