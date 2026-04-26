import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/signatures/{token}
 * Public — used by the signature page to fetch metadata + the original
 * PDF for preview, and to bump status from 'pending' → 'opened' on first view.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase
    .from('signature_requests')
    .select(
      'id, token, title, recipient_email, recipient_name, status, pdf_drive_view_link, signed_pdf_drive_view_link, signed_at, signer_name, expires_at, created_at, created_by_email, created_by_name',
    )
    .eq('token', token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (new Date(data.expires_at).getTime() < Date.now() && data.status !== 'signed') {
    await supabase.from('signature_requests').update({ status: 'expired' }).eq('token', token)
    return NextResponse.json({ ...data, status: 'expired' })
  }

  if (data.status === 'pending') {
    await supabase
      .from('signature_requests')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('token', token)
  }

  return NextResponse.json(data)
}
