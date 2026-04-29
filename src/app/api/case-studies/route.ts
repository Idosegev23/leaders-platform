import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/case-studies — list (admin only)
 * POST /api/case-studies — upsert one (admin only)
 */
export async function GET() {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await service
    .from('case_studies')
    .select('*')
    .order('year', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: Request) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Partial<{
    id: string
    brand_name: string
    industry: string
    year: number
    brief_summary: string
    approach: string
    deliverables: string
    results: Record<string, unknown>
    thumbnail_url: string
    hero_image_url: string
    is_public: boolean
    is_featured: boolean
  }> | null

  if (!body?.brand_name || !body?.industry || !body?.year || !body?.brief_summary) {
    return NextResponse.json(
      { error: 'brand_name, industry, year, brief_summary are required' },
      { status: 400 },
    )
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const row = {
    brand_name: body.brand_name,
    industry: body.industry,
    year: body.year,
    brief_summary: body.brief_summary,
    approach: body.approach ?? null,
    deliverables: body.deliverables ?? null,
    results: body.results ?? {},
    thumbnail_url: body.thumbnail_url ?? null,
    hero_image_url: body.hero_image_url ?? null,
    is_public: body.is_public ?? true,
    is_featured: body.is_featured ?? false,
    created_by_email: user.email,
  }
  const { data, error } = body.id
    ? await service.from('case_studies').update(row).eq('id', body.id).select('*').single()
    : await service.from('case_studies').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
