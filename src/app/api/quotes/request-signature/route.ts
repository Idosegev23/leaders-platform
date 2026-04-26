import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  parseDriveFolderId,
  uploadBufferToDriveFolder,
  verifyDriveFolderWritable,
} from '@/lib/google-drive/client'
import { sendGmailEmail } from '@/lib/gmail'
import { buildSignatureRequestEmail } from '@/lib/signatures/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/quotes/request-signature
 * Body: { title, recipient_email, recipient_name?, drive_folder, pdf_base64, message?, lead_id? }
 *
 * Creates a signature_requests row, uploads the original PDF to the
 * sender's chosen Drive folder, then mails the recipient a sign link.
 */
export async function POST(request: Request) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string
    recipient_email?: string
    recipient_name?: string | null
    drive_folder?: string          // URL or id
    pdf_base64?: string             // base64-encoded PDF bytes
    message?: string | null
    lead_id?: string | null
  } | null

  if (!body?.title || !body.recipient_email || !body.drive_folder || !body.pdf_base64) {
    return NextResponse.json(
      { error: 'Missing required fields (title, recipient_email, drive_folder, pdf_base64)' },
      { status: 400 },
    )
  }

  const folderId = parseDriveFolderId(body.drive_folder)
  if (!folderId) {
    return NextResponse.json({ error: 'לא הצלחנו לזהות את התיקיה ב-Drive מהקישור שסיפקת' }, { status: 400 })
  }

  const folderCheck = await verifyDriveFolderWritable(folderId)
  if (!folderCheck.ok) {
    return NextResponse.json({ error: folderCheck.error }, { status: 400 })
  }

  const pdfBuffer = Buffer.from(body.pdf_base64, 'base64')
  if (pdfBuffer.length < 100) {
    return NextResponse.json({ error: 'PDF buffer is empty or too small' }, { status: 400 })
  }

  const senderName = user.user_metadata?.full_name ?? user.email.split('@')[0] ?? user.email

  // Upload original PDF to Drive
  let uploaded: { id: string; viewLink: string }
  try {
    uploaded = await uploadBufferToDriveFolder({
      folderId,
      fileName: `${body.title} (טיוטה).pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 })
  }

  // Insert signature_requests row
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: req, error: insertErr } = await service
    .from('signature_requests')
    .insert({
      title: body.title,
      lead_id: body.lead_id ?? null,
      pdf_data: pdfBuffer,
      pdf_drive_file_id: uploaded.id,
      pdf_drive_folder_id: folderId,
      pdf_drive_view_link: uploaded.viewLink,
      recipient_email: body.recipient_email,
      recipient_name: body.recipient_name ?? null,
      created_by_email: user.email,
      created_by_name: senderName,
      cc_emails: defaultCcs(),
      status: 'pending',
    })
    .select('id, token')
    .single()

  if (insertErr || !req) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Insert failed' },
      { status: 500 },
    )
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const signLink = `${origin}/sign/${req.token}`

  // Email the recipient
  const refreshToken = await getCreatorRefreshToken(service, user.id)
  if (refreshToken) {
    try {
      await sendGmailEmail({
        refreshToken,
        from: user.email,
        fromName: senderName,
        to: body.recipient_email,
        subject: `מסמך לחתימה: ${body.title} — Leaders`,
        html: buildSignatureRequestEmail({
          recipientName: body.recipient_name ?? null,
          senderName,
          title: body.title,
          signLink,
          message: body.message ?? null,
        }),
      })
    } catch (e) {
      console.error('[request-signature] gmail send failed:', e)
    }
  }

  // Activity log on the lead (if provided) so the timeline shows this event.
  if (body.lead_id) {
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: 'signature_request_sent',
      summary: `${senderName} שלח הצעת מחיר לחתימה ל־${body.recipient_name ?? body.recipient_email}`,
      entity_type: 'lead',
      entity_id: body.lead_id,
      actor_email: user.email,
      actor_name: senderName,
      payload: { signature_request_id: req.id, token: req.token, drive_file_id: uploaded.id },
    })
  }

  return NextResponse.json({
    ok: true,
    token: req.token,
    sign_link: signLink,
    drive_link: uploaded.viewLink,
  })
}

function defaultCcs(): string[] {
  return (process.env.QUOTE_NOTIFICATION_EMAILS || 'roei@ldrsgroup.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function getCreatorRefreshToken(
  service: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await service
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { refresh_token?: string } | null)?.refresh_token ?? null
}
