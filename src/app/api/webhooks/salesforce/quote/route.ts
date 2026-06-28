import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  mapSalesforceQuoteToPriceQuoteData,
  notifySalesforceQuote,
  type SalesforceQuotePayload,
} from '@/lib/salesforce/quote'
import { generatePriceQuotePages } from '@/templates/price-quote/price-quote-template'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { sendGmailViaServiceAccount } from '@/lib/gmail'
import { buildSignatureRequestEmail } from '@/lib/signatures/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

function authorize(request: Request): boolean {
  const secret = process.env.SALESFORCE_WEBHOOK_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(auth.slice(7).trim()), Buffer.from(secret))
  } catch {
    return false
  }
}

/**
 * Salesforce → Hub : create a signable price quote.
 *
 * Maps the quote payload to PriceQuoteData, renders the PDF via the existing
 * price-quote template, creates a signature_request, uploads the PDF to Drive
 * with a public link, emails the client the /sign/{token} form from info@, and
 * pushes `quote.pending_signature` back to Salesforce. The subsequent
 * `quote.opened` / `quote.signed` events fire from the signature endpoints.
 *
 * Auth: Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>.
 * Body: the SF quote payload + optional `send_email` (default true).
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: SalesforceQuotePayload & { send_email?: boolean }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const projectId = (body.project_id || '').trim()
  const customerName = (body.customer_name || '').trim()
  const customerEmail = (body.customer_email || '').trim()
  const contract = body.contracts?.[0]
  const sendEmail = body.send_email !== false

  const missing: string[] = []
  if (!projectId) missing.push('project_id')
  if (!customerName) missing.push('customer_name')
  if (!customerEmail) missing.push('customer_email')
  if (!contract) missing.push('contracts[0]')
  if (missing.length) {
    return NextResponse.json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }
  if (!EMAIL_RE.test(customerEmail)) {
    return NextResponse.json({ ok: false, error: 'customer_email is not a valid email' }, { status: 400 })
  }

  const sb = service()

  // Pull `platform` from the matching brief (same project_id).
  let platform = ''
  try {
    const { data: brief } = await sb
      .from('document_links')
      .select('metadata')
      .eq('metadata->>source', 'salesforce')
      .eq('metadata->>salesforce_ref', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const platforms = (brief?.metadata as { submission_data?: { platforms?: unknown } } | null)
      ?.submission_data?.platforms
    if (Array.isArray(platforms)) platform = platforms.join(', ')
    else if (typeof platforms === 'string') platform = platforms
  } catch { /* non-fatal */ }

  const quoteData = mapSalesforceQuoteToPriceQuoteData(body, platform)
  const title = contract!.name || `הצעת מחיר – ${customerName}`

  // Render the PDF via the existing price-quote template.
  let pdfBuffer: Buffer
  try {
    const pages = generatePriceQuotePages(quoteData, appBaseUrl())
    pdfBuffer = await generateMultiPagePdf(pages, { format: 'A4', title, brandName: customerName })
  } catch (e) {
    console.error('[salesforce-quote] PDF generation failed:', e)
    return NextResponse.json({ ok: false, error: `PDF generation failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  // Upload to Drive (public link — uploadBufferToDriveFolder shares anyone-reader).
  let uploaded: { id: string; viewLink: string }
  try {
    const res = await uploadBufferToDriveFolder({
      folderId: DRIVE_ANCHORS.BRIEFS_SENT,
      fileName: `${title} (טיוטה).pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    })
    uploaded = { id: res.id, viewLink: res.viewLink }
  } catch (e) {
    console.error('[salesforce-quote] Drive upload failed:', e)
    return NextResponse.json({ ok: false, error: `Drive upload failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  const serviceSender = (process.env.BRIEF_DEFAULT_SENDER_EMAIL || '').trim() || 'info@ldrsgroup.com'

  // Create the signature request. payload snapshots the quote_data (so the sign
  // endpoint regenerates the signed PDF from the template) + project_id (so the
  // opened/signed events know which Salesforce project to push back to).
  const { data: sigReq, error: insErr } = await sb
    .from('signature_requests')
    .insert({
      title,
      recipient_email: customerEmail,
      recipient_name: customerName,
      pdf_drive_file_id: uploaded.id,
      pdf_drive_folder_id: DRIVE_ANCHORS.BRIEFS_SENT,
      pdf_drive_view_link: uploaded.viewLink,
      created_by_email: serviceSender,
      created_by_name: 'Leaders',
      cc_emails: [],
      status: 'pending',
      payload: { source: 'salesforce-quote', project_id: projectId, quote_data: quoteData },
    })
    .select('id, token')
    .single()
  if (insErr || !sigReq) {
    console.error('[salesforce-quote] signature_request insert failed:', insErr)
    return NextResponse.json({ ok: false, error: insErr?.message || 'Failed to create signature request' }, { status: 500 })
  }

  const signLink = `${appBaseUrl()}/sign/${sigReq.token}`

  // Email the client the signature form from info@ via the service account.
  let mailDelivery: 'sent' | 'skipped' | 'failed' = 'skipped'
  let mailError: string | null = null
  if (!sendEmail) {
    mailError = 'send_email=false'
  } else {
    try {
      await sendGmailViaServiceAccount({
        from: serviceSender,
        fromName: 'Leaders',
        to: customerEmail,
        subject: `מסמך לחתימה: ${title} — Leaders`,
        html: buildSignatureRequestEmail({
          recipientName: customerName,
          senderName: 'Leaders',
          title,
          signLink,
          message: null,
        }),
      })
      mailDelivery = 'sent'
    } catch (e) {
      mailDelivery = 'failed'
      mailError = e instanceof Error ? e.message : String(e)
      console.error('[salesforce-quote] email send failed:', mailError)
    }
  }

  // Push pending_signature back to Salesforce.
  await notifySalesforceQuote(projectId, 'quote.pending_signature', {
    token: sigReq.token,
    sign_url: signLink,
    quote_pdf_link: uploaded.viewLink,
  })

  return NextResponse.json(
    {
      ok: true,
      token: sigReq.token,
      status: 'pending_signature',
      sign_url: signLink,
      quote_pdf_link: uploaded.viewLink,
      project_id: projectId,
      mail_delivery: mailDelivery,
      mail_error: mailError,
    },
    { status: 200 },
  )
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    purpose: 'Salesforce → Hub price-quote creation. POST a quote payload (event: quote.ready).',
    required_fields: ['project_id', 'customer_name', 'customer_email', 'contracts[0]'],
  })
}
