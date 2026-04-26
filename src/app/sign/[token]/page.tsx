import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import SignClient from './SignClient'

export const dynamic = 'force-dynamic'

type Req = {
  id: string
  token: string
  title: string
  status: 'pending' | 'opened' | 'signed' | 'expired' | 'cancelled'
  recipient_email: string
  recipient_name: string | null
  pdf_drive_view_link: string | null
  signed_pdf_drive_view_link: string | null
  signed_at: string | null
  signer_name: string | null
  expires_at: string
  created_by_email: string
  created_by_name: string | null
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase
    .from('signature_requests')
    .select(
      'id, token, title, status, recipient_email, recipient_name, pdf_drive_view_link, signed_pdf_drive_view_link, signed_at, signer_name, expires_at, created_by_email, created_by_name',
    )
    .eq('token', token)
    .maybeSingle()

  if (error || !data) notFound()
  const req = data as Req

  // Bump status: pending → opened
  if (req.status === 'pending') {
    await supabase
      .from('signature_requests')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('token', token)
    req.status = 'opened'
  }

  const isExpired = new Date(req.expires_at).getTime() < Date.now()

  return (
    <SignClient
      token={req.token}
      title={req.title}
      status={isExpired && req.status !== 'signed' ? 'expired' : req.status}
      recipientEmail={req.recipient_email}
      recipientName={req.recipient_name}
      pdfViewLink={req.pdf_drive_view_link}
      signedPdfViewLink={req.signed_pdf_drive_view_link}
      signedAt={req.signed_at}
      signerName={req.signer_name}
      senderName={req.created_by_name ?? req.created_by_email}
    />
  )
}
