/**
 * POST /api/price-quotes/[id]/publish
 *
 * The ONLY route that creates a revision. Freezes the current draft as revision
 * N+1 and sends it for signature. Ordered per spec §5 so there is never a moment
 * with two live signing links for one deal:
 *
 *   1. 422 if the signature page (page 4) is disabled.
 *   2. Cancel the prior live request FIRST (conditional on pending/opened).
 *   3. Freeze revision N+1 (data = draft snapshot, template_version).
 *   4. Render the PDF from the FROZEN revision, not the request body.
 *   5. Upload to Drive as the sender (their own OAuth token).
 *   6. Create the signature_request bound to quote_revision_id.
 *   7. Email the client.
 *   8. Fill revision artifact columns + advance the quote.
 *
 * Headers: X-Google-Access-Token (sender's live Drive token).
 * Body: { drive_folder_id, drive_folder_name?, recipient_email, recipient_name?, message? }
 *
 * UNTESTED against live Drive/Gmail here — must pass the manual runbook against
 * an approved test contact before it is trusted.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { priceQuoteService } from '@/lib/price-quotes/service'
import { generatePriceQuotePages } from '@/templates/price-quote/price-quote-template'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { uploadBufferToDriveAsUser } from '@/lib/google-drive/client'
import { sendGmailEmail } from '@/lib/gmail'
import { buildSignatureRequestEmail } from '@/lib/signatures/email'
import type { PriceQuoteData } from '@/types/price-quote'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const TEMPLATE_VERSION = 'v1-2026-07'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const authed = await createServerClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = request.headers.get('x-google-access-token')
  if (!accessToken) {
    return NextResponse.json(
      { error: 'חסר טוקן Drive. נדרשת התחברות מחדש עם Google.' },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    drive_folder_id?: string
    drive_folder_name?: string | null
    recipient_email?: string
    recipient_name?: string | null
    message?: string | null
  } | null
  if (!body?.drive_folder_id || !body.recipient_email) {
    return NextResponse.json({ error: 'drive_folder_id ו-recipient_email נדרשים' }, { status: 400 })
  }

  const svc = priceQuoteService()

  // Load the quote + its draft.
  const { data: quote, error: qErr } = await svc
    .from('price_quotes')
    .select('id, quote_number, title, draft_data, published_count, current_revision_id')
    .eq('id', params.id)
    .maybeSingle()
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!quote) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const draft = quote.draft_data as PriceQuoteData

  // 1. page 4 (signature) must be enabled.
  if (draft.enabledPages && draft.enabledPages[4] === false) {
    return NextResponse.json(
      { error: 'לא ניתן לשלוח לחתימה: עמוד החתימה (עמוד 4) מבוטל בהצעה.' },
      { status: 422 },
    )
  }

  const nextRevisionNumber = (quote.published_count ?? 0) + 1

  // 2. Cancel the prior live request FIRST (conditional on status).
  let priorRequestId: string | null = null
  if (quote.current_revision_id) {
    const { data: priorRev } = await svc
      .from('price_quote_revisions')
      .select('signature_request_id')
      .eq('id', quote.current_revision_id)
      .maybeSingle()
    priorRequestId = priorRev?.signature_request_id ?? null
    if (priorRequestId) {
      await svc
        .from('signature_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: `superseded by revision ${nextRevisionNumber}`,
        })
        .eq('id', priorRequestId)
        .in('status', ['pending', 'opened']) // only cancel a still-live one
    }
  }

  // 3. Freeze revision N+1 with the draft snapshot.
  const revNumber = `${quote.quote_number} · גרסה ${nextRevisionNumber}`
  const frozenData: PriceQuoteData = {
    ...draft,
    quoteNumber: quote.quote_number,
    revisionNumber: nextRevisionNumber,
    quoteId: quote.id,
  }
  const { data: revision, error: rErr } = await svc
    .from('price_quote_revisions')
    .insert({
      quote_id: quote.id,
      revision_number: nextRevisionNumber,
      data: frozenData,
      template_version: TEMPLATE_VERSION,
      published_by_email: user.email,
      supersedes_revision_id: quote.current_revision_id,
    })
    .select('id')
    .single()
  if (rErr || !revision) {
    return NextResponse.json({ error: rErr?.message ?? 'freeze failed' }, { status: 500 })
  }

  // 4. Render the PDF from the FROZEN revision (not the request body).
  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  let pdfBuffer: Buffer
  try {
    const pages = generatePriceQuotePages(frozenData, origin)
    pdfBuffer = await generateMultiPagePdf(pages, {
      format: 'A4',
      title: `הצעת מחיר - ${frozenData.clientName}`,
      brandName: frozenData.clientName,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `יצירת PDF נכשלה: ${e instanceof Error ? e.message : e}` },
      { status: 500 },
    )
  }

  // 5. Upload to Drive as the sender.
  let uploaded: { id: string; viewLink: string }
  try {
    uploaded = await uploadBufferToDriveAsUser({
      accessToken,
      folderId: body.drive_folder_id,
      fileName: `${quote.title} — גרסה ${nextRevisionNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    })
  } catch (e) {
    return NextResponse.json(
      { error: `העלאה ל-Drive נכשלה: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    )
  }

  // 6. Create the signature request bound to this revision.
  const { data: sigReq, error: sErr } = await svc
    .from('signature_requests')
    .insert({
      title: quote.title,
      pdf_drive_file_id: uploaded.id,
      pdf_drive_folder_id: body.drive_folder_id,
      pdf_drive_view_link: uploaded.viewLink,
      recipient_email: body.recipient_email,
      recipient_name: body.recipient_name ?? null,
      created_by_email: user.email,
      cc_emails: [],
      status: 'pending',
      payload: { source: 'price-quote', quote_data: frozenData },
      quote_revision_id: revision.id,
      parent_signature_request_id: priorRequestId,
    })
    .select('id, token')
    .single()
  if (sErr || !sigReq) {
    return NextResponse.json({ error: sErr?.message ?? 'signature request failed' }, { status: 500 })
  }

  const signLink = `${origin}/sign/${sigReq.token}`

  // 7. Email the client (best-effort — a send failure doesn't roll back the DB).
  const { data: tok } = await svc
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle()
  const refreshToken = (tok as { refresh_token?: string } | null)?.refresh_token
  if (refreshToken) {
    try {
      await sendGmailEmail({
        refreshToken,
        from: user.email,
        fromName: 'Leaders',
        to: body.recipient_email,
        subject: `מסמך לחתימה: ${quote.title} — Leaders`,
        html: buildSignatureRequestEmail({
          recipientName: body.recipient_name ?? null,
          senderName: 'Leaders',
          title: quote.title,
          signLink,
          message: body.message ?? null,
        }),
      })
    } catch (e) {
      console.error('[publish] gmail send failed:', e)
    }
  }

  // 8. Fill revision artifacts + advance the quote (one NULL->value each, per the
  //    immutability trigger).
  await svc
    .from('price_quote_revisions')
    .update({
      signature_request_id: sigReq.id,
      signature_token: sigReq.token,
      pdf_drive_file_id: uploaded.id,
      pdf_drive_view_link: uploaded.viewLink,
    })
    .eq('id', revision.id)

  if (priorRequestId && quote.current_revision_id) {
    await svc
      .from('price_quote_revisions')
      .update({ superseded_by_revision_id: revision.id, superseded_at: new Date().toISOString() })
      .eq('id', quote.current_revision_id)
  }

  await svc
    .from('price_quotes')
    .update({ current_revision_id: revision.id, published_count: nextRevisionNumber })
    .eq('id', quote.id)

  return NextResponse.json({
    ok: true,
    revision_number: nextRevisionNumber,
    revision_label: revNumber,
    signature_token: sigReq.token,
    sign_link: signLink,
    drive_link: uploaded.viewLink,
    superseded_prior: Boolean(priorRequestId),
  })
}
