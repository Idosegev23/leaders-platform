import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const publicClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

/**
 * GET /api/links/{token}
 * Public — used by the client-facing form to fetch sender info and mark the
 * link as "opened". Returns null for client_email/name if not set.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase = publicClient()

  const { data, error } = await supabase
    .from('document_links')
    .select(`
      id, token, created_by_email, created_by_name, client_email, client_name,
      status, metadata, created_at, opened_at, completed_at,
      document_types (slug, name)
    `)
    .eq('token', token)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Bump status to opened on first view.
  if (data.status === 'pending') {
    await supabase
      .from('document_links')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('token', token)
  }

  return NextResponse.json({
    ...data,
    document_type: data.document_types,
  })
}

/**
 * PATCH /api/links/{token}
 * Body:
 *   - { status: 'opened' | 'completed' | 'archived' }
 *   - { progress: { step: number, total: number } }  // brief fill progress
 * 'archived' requires the creator's session. Other mutations are public
 * (the client-facing form doesn't have a Supabase session).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await request.json().catch(() => null) as {
    status?: 'opened' | 'completed' | 'archived'
    progress?: { step: number; total: number }
  } | null

  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { status, progress } = body

  if (status && !['opened', 'completed', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  if (status === 'archived') {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('document_links')
      .update({ status })
      .eq('token', token)
      .eq('created_by_email', user.email)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const supabase = publicClient()
  const patch: Record<string, unknown> = {}

  if (status) {
    patch.status = status
    if (status === 'opened')    patch.opened_at    = new Date().toISOString()
    if (status === 'completed') patch.completed_at = new Date().toISOString()
  }

  // Merge progress into metadata without clobbering other keys.
  if (progress && typeof progress.step === 'number' && typeof progress.total === 'number') {
    const { data: existing } = await supabase
      .from('document_links')
      .select('metadata')
      .eq('token', token)
      .maybeSingle()
    const currentMeta = (existing?.metadata as Record<string, unknown> | null) ?? {}
    patch.metadata = {
      ...currentMeta,
      progress: {
        step: progress.step,
        total: progress.total,
        updated_at: new Date().toISOString(),
      },
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No-op' }, { status: 400 })
  }

  const { error } = await supabase.from('document_links').update(patch).eq('token', token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
