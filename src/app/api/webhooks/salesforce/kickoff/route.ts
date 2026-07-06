import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Salesforce → Hub : create a kickoff (inner-meeting / פגישת התנעה) form.
 *
 * Salesforce calls this when a project reaches the kickoff-meeting stage. It
 * sends the project + client name; we create a DRAFT inner-meeting form with
 * the client name pre-filled and the `salesforce_ref` stashed on
 * `forms.metadata`, then return the fill URL:
 *     {appBaseUrl}/inner-meeting?form=<share_token>
 *
 * The form is filled by the internal Leaders team (account manager + creative),
 * so the link sits behind the normal employee auth — no public route needed.
 * On completion, /api/inner-meeting/complete pushes `kickoff.completed` back to
 * Salesforce (see src/lib/salesforce/kickoff.ts).
 *
 * Idempotent by salesforce_ref: if an OPEN (draft) kickoff already exists for
 * the project, its existing link is returned instead of creating a duplicate.
 * A completed kickoff does not reopen — that falls through to a fresh form.
 *
 * Auth: shared secret in SALESFORCE_WEBHOOK_SECRET (same as the brief webhook).
 *   - Primary:   Authorization: Bearer <secret>
 *   - Hardening: x-signature: HMAC-SHA256(rawBody, secret)  (either passes)
 *   - Unset → accept everything (MVP/test mode) and warn.
 */

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
    console.warn('[salesforce-kickoff] SALESFORCE_WEBHOOK_SECRET not set — accepting unauthenticated request (test mode)')
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

interface CreateKickoffBody {
  salesforce_ref?: string
  /** Alias for salesforce_ref — the quote webhook uses this field name. */
  project_id?: string
  project_name?: string
  client_name?: string
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Inbound diagnostics: header presence (never the secret) + body preview,
  // so we can see exactly what Salesforce sends, including failing requests.
  console.log('[salesforce-kickoff] inbound POST ' + JSON.stringify({
    hasAuthorization: !!request.headers.get('authorization'),
    hasXSignature: !!request.headers.get('x-signature'),
    contentType: request.headers.get('content-type'),
    bodyLength: rawBody.length,
    bodyPreview: rawBody.slice(0, 2000),
  }))

  if (!authorize(request, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateKickoffBody
  try {
    body = JSON.parse(rawBody) as CreateKickoffBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const salesforceRef = (body.salesforce_ref || body.project_id || '').trim()
  const projectName = (body.project_name || '').trim()
  const clientName = (body.client_name || '').trim()

  const missing: string[] = []
  if (!salesforceRef) missing.push('salesforce_ref')
  if (!clientName) missing.push('client_name')
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }

  const sb = service()
  const base = appBaseUrl()

  // Idempotency: reuse an existing OPEN (draft) kickoff for this project.
  const { data: existing } = await sb
    .from('forms')
    .select('id, share_token')
    .eq('type', 'inner_meeting')
    .eq('status', 'draft')
    .eq('metadata->>salesforce_ref', salesforceRef)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let shareToken: string
  let reused: boolean

  if (existing?.share_token) {
    shareToken = existing.share_token as string
    reused = true
    console.log(`[salesforce-kickoff] reusing existing draft ${existing.id} for ref=${salesforceRef}`)
  } else {
    // Create the form (client name → title + metadata) …
    const { data: form, error: formErr } = await sb
      .from('forms')
      .insert({
        type: 'inner_meeting',
        status: 'draft',
        title: clientName,
        metadata: {
          source: 'salesforce',
          salesforce_ref: salesforceRef,
          ...(projectName ? { project_name: projectName } : {}),
        },
      })
      .select('id, share_token')
      .single()
    if (formErr || !form) {
      console.error('[salesforce-kickoff] forms insert failed:', formErr)
      return NextResponse.json({ ok: false, error: formErr?.message || 'Failed to create form' }, { status: 500 })
    }

    // … and its inner_meeting_forms payload (client_name drives the pre-fill).
    const { error: innerErr } = await sb
      .from('inner_meeting_forms')
      .insert({ form_id: form.id, client_name: clientName })
    if (innerErr) {
      console.error('[salesforce-kickoff] inner_meeting_forms insert failed:', innerErr)
      // Roll back the orphaned form so a retry can cleanly recreate the pair.
      await sb.from('forms').delete().eq('id', form.id)
      return NextResponse.json({ ok: false, error: innerErr.message }, { status: 500 })
    }
    shareToken = form.share_token as string
    reused = false
    console.log(`[salesforce-kickoff] created form ${form.id} for ref=${salesforceRef}`)
  }

  const kickoffUrl = `${base}/inner-meeting?form=${shareToken}`

  // Push kickoff.document_ready back to Salesforce with the fill link, so the
  // project record gets the kickoff URL. Awaited (Vercel kills the function on
  // response) + best-effort (never throws). Fires on create AND reuse — the
  // form's share_token is the idempotency `token`, so Salesforce dedups.
  try {
    const { notifySalesforceKickoff } = await import('@/lib/salesforce/kickoff')
    const result = await notifySalesforceKickoff(salesforceRef, 'kickoff.document_ready', {
      token: shareToken,
      kickoff_document_url: kickoffUrl,
    })
    if (result.delivered) console.log('[salesforce-kickoff] document_ready push delivered')
    else if (result.reason !== 'no_url') console.warn(`[salesforce-kickoff] document_ready push not delivered: ${result.reason}`)
  } catch (e) {
    console.warn('[salesforce-kickoff] document_ready push error:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json(
    { ok: true, token: shareToken, kickoff_url: kickoffUrl, salesforce_ref: salesforceRef, reused },
    // 200 (not 201): some Salesforce Apex callouts only read the response body
    // when statusCode == 200 (same reason as the brief webhook).
    { status: 200 },
  )
}

/** Health/info probe. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    purpose: 'Salesforce → Hub kickoff (inner-meeting) creation. POST a kickoff payload.',
    required_fields: ['salesforce_ref (or project_id)', 'client_name'],
    optional_fields: ['project_name'],
    auth: 'Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET> (or x-signature HMAC-SHA256)',
  })
}
