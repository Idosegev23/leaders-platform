import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/links
 * Create a new document_link. Body: { slug, client_email?, client_name? }
 * Requires authenticated employee session.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slug, client_email, client_name, metadata } = body as {
    slug?: string
    client_email?: string | null
    client_name?: string | null
    metadata?: Record<string, unknown>
  }
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const { data: docType, error: typeErr } = await supabase
    .from('document_types')
    .select('id, target_url, flow_type, name')
    .eq('slug', slug)
    .single()
  if (typeErr || !docType) {
    return NextResponse.json({ error: 'Unknown document type' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('document_links')
    .insert({
      document_type_id: docType.id,
      created_by_email: user.email,
      created_by_name: user.user_metadata?.full_name ?? user.email,
      client_email: client_email || null,
      client_name: client_name || null,
      metadata: {
        created_by_avatar: user.user_metadata?.avatar_url ?? null,
        ...(metadata ?? {}),
      },
    })
    .select('*, document_types(slug, name, target_url, flow_type)')
    .single()

  if (error) {
    console.error('Error creating link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const fullLink =
    docType.flow_type === 'external'
      ? docType.target_url
      : `${origin}${docType.target_url}?token=${data.token}`

  return NextResponse.json({ ...data, full_link: fullLink })
}

/**
 * GET /api/links?slug=<slug>  — list caller's links, optionally filtered by type.
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get('slug')

  let query = supabase
    .from('document_links')
    .select('*, document_types(slug, name, icon, target_url)')
    .eq('created_by_email', user.email)
    .order('created_at', { ascending: false })
    .limit(100)

  if (slug) {
    const { data: dt } = await supabase.from('document_types').select('id').eq('slug', slug).single()
    if (dt?.id) query = query.eq('document_type_id', dt.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
