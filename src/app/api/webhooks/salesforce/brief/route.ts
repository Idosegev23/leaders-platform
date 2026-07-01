import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendClientBrief } from '@/lib/brief/send'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Salesforce → Hub : create a client brief.
 *
 * Salesforce calls this when a project moves to "New brief". We create a
 * `client-brief` document_link, (optionally) email the client the brief URL
 * from a Leaders mailbox, and return the token + URL. The `salesforce_ref`
 * we receive is stored on the link and echoed back on completion (see
 * src/lib/salesforce/outbound.ts) so Salesforce can correlate records 1:1.
 *
 * Auth: shared secret in SALESFORCE_WEBHOOK_SECRET.
 *   - Primary:   Authorization: Bearer <secret>
 *   - Hardening: x-signature: HMAC-SHA256(rawBody, secret)  (either passes)
 *   - If the env var is unset we accept everything (MVP/test mode) and warn.
 *
 * Sender mailbox: brief emails go out from a real Leaders mailbox (Gmail).
 *   1. `sender_email` from the payload, if that user connected Gmail.
 *   2. else BRIEF_DEFAULT_SENDER_EMAIL (a connected fallback mailbox).
 *   3. else no token → link is still created, mail_delivery="skipped", and
 *      the agency can send `brief_url` manually.
 */

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

function timingSafeEq(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/** Verify the shared secret. Bearer token OR HMAC signature both accepted. */
function authorize(request: Request, rawBody: string): boolean {
  const secret = process.env.SALESFORCE_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[salesforce-brief] SALESFORCE_WEBHOOK_SECRET not set — accepting unauthenticated request (test mode)')
    return true
  }
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    return timingSafeEq(auth.slice(7).trim(), secret)
  }
  const sig = request.headers.get('x-signature')
  if (sig) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    return timingSafeEq(sig, expected)
  }
  return false
}

interface CreateBriefBody {
  salesforce_ref?: string
  client_name?: string
  client_email?: string
  language?: string
  sender_email?: string | null
  sender_name?: string | null
  personal_note?: string | null
  /** Default true. Set false to create the link without emailing the client. */
  send_email?: boolean
  /** QA/test flag: skip the management-notification email on completion. */
  suppress_mgmt_mail?: boolean
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Inbound diagnostics: log which auth headers arrived (presence only, never
  // the secret value) + a body preview, so we can see exactly what Salesforce
  // sends — including requests that fail auth/validation.
  console.log('[salesforce-brief] inbound POST ' + JSON.stringify({
    hasAuthorization: !!request.headers.get('authorization'),
    hasXSignature: !!request.headers.get('x-signature'),
    hasXSfToken: !!request.headers.get('x-sf-token'),
    contentType: request.headers.get('content-type'),
    bodyLength: rawBody.length,
    bodyPreview: rawBody.slice(0, 2000),
  }))

  if (!authorize(request, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateBriefBody
  try {
    body = JSON.parse(rawBody) as CreateBriefBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const salesforceRef = (body.salesforce_ref || '').trim()
  const clientName = (body.client_name || '').trim()
  const clientEmail = (body.client_email || '').trim()
  const language: 'he' | 'en' = body.language === 'en' ? 'en' : 'he'
  const personalNote = (body.personal_note || '').trim().slice(0, 2000) || null
  const sendEmail = body.send_email !== false // default true

  const missing: string[] = []
  if (!salesforceRef) missing.push('salesforce_ref')
  if (!clientName) missing.push('client_name')
  if (!clientEmail) missing.push('client_email')
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }
  if (!EMAIL_RE.test(clientEmail)) {
    return NextResponse.json({ ok: false, error: 'client_email is not a valid email' }, { status: 400 })
  }

  const sb = service()

  // Resolve document_type for client-brief.
  const { data: docType, error: typeErr } = await sb
    .from('document_types')
    .select('id, slug, target_url')
    .eq('slug', 'client-brief')
    .single()
  if (typeErr || !docType) {
    return NextResponse.json(
      { ok: false, error: 'client-brief document_type missing — run the hub schema migration' },
      { status: 500 },
    )
  }

  // Brief emails go out from the shared info@ mailbox via the service account
  // (domain-wide delegation) — no per-user OAuth needed. Set via
  // BRIEF_DEFAULT_SENDER_EMAIL (e.g. info@ldrsgroup.com).
  const serviceSender = (process.env.BRIEF_DEFAULT_SENDER_EMAIL || '').trim()
  // created_by_email is NOT NULL — attribute to the requested sender, else the
  // shared service mailbox, else a safe fallback.
  const createdByEmail =
    (body.sender_email || '').trim() || serviceSender || 'salesforce-integration@ldrsgroup.com'
  const createdByName = (body.sender_name || '').trim() || 'Leaders'

  // Best-effort: auto-link to an existing lead by email so the completion
  // cascade can sync ClickUp / the lead timeline.
  let leadId: string | null = null
  const { data: matchedLead } = await sb
    .from('leads')
    .select('id')
    .ilike('email', clientEmail)
    .limit(1)
    .maybeSingle()
  if (matchedLead?.id) leadId = matchedLead.id as string

  // Create the link. salesforce_ref + source live in metadata; the
  // completion cascade reads them back.
  const { data: created, error: insErr } = await sb
    .from('document_links')
    .insert({
      document_type_id: docType.id,
      created_by_email: createdByEmail,
      created_by_name: createdByName,
      client_email: clientEmail,
      client_name: clientName,
      lead_id: leadId,
      metadata: {
        source: 'salesforce',
        salesforce_ref: salesforceRef,
        language,
        ...(personalNote ? { personal_note: personalNote } : {}),
        ...(body.suppress_mgmt_mail === true ? { suppress_mgmt_mail: true } : {}),
      },
    })
    .select('id, token')
    .single()
  if (insErr || !created) {
    console.error('[salesforce-brief] insert failed:', insErr)
    return NextResponse.json({ ok: false, error: insErr?.message || 'Failed to create link' }, { status: 500 })
  }

  const briefUrl = `${appBaseUrl()}${docType.target_url}?token=${created.token}`

  // Send the brief link to the client from the shared info@ mailbox via the
  // service account. Reuses the shared pipeline (email template + activity_log).
  let mailDelivery: 'sent' | 'skipped' | 'failed' = 'skipped'
  let mailError: string | null = null
  if (!sendEmail) {
    mailError = 'send_email=false'
  } else if (!serviceSender) {
    mailError = 'no_default_sender_configured'
    console.warn('[salesforce-brief] BRIEF_DEFAULT_SENDER_EMAIL not set — link created, email skipped')
  } else {
    try {
      const result = await sendClientBrief({
        clientName,
        clientEmail,
        senderEmail: serviceSender,
        senderName: createdByName,
        useServiceAccount: true,
        leadId,
        language,
        personalNote,
        existingLink: { id: created.id, token: created.token },
        callerTag: `[salesforce-brief:${created.token.slice(0, 8)}]`,
      })
      mailDelivery = result.mailDelivery
      mailError = result.mailError
    } catch (e) {
      mailDelivery = 'failed'
      mailError = e instanceof Error ? e.message : String(e)
      console.error('[salesforce-brief] sendClientBrief threw:', mailError)
    }
  }

  // Record the mail outcome on the link so delivery is verifiable later.
  try {
    const { data: cur } = await sb.from('document_links').select('metadata').eq('id', created.id).maybeSingle()
    await sb
      .from('document_links')
      .update({ metadata: { ...((cur?.metadata as Record<string, unknown>) || {}), mail_delivery: mailDelivery, mail_error: mailError } })
      .eq('id', created.id)
  } catch { /* non-fatal */ }

  return NextResponse.json(
    {
      ok: true,
      token: created.token,
      brief_url: briefUrl,
      status: 'pending',
      salesforce_ref: salesforceRef,
      linked_lead_id: leadId,
      mail_delivery: mailDelivery,
      mail_error: mailError,
    },
    // 200 (not 201): some Salesforce Apex callouts only read the response body
    // when statusCode == 200, so 201 made the response look "empty" to them.
    { status: 200 },
  )
}

/** Health/info probe. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    purpose: 'Salesforce → Hub brief creation. POST a brief payload (see salesforce-hub-integration.md).',
    required_fields: ['salesforce_ref', 'client_name', 'client_email'],
    auth: 'Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET> (or x-signature HMAC-SHA256)',
  })
}
