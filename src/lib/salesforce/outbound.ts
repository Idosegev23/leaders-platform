/**
 * Salesforce outbound sync (Hub → Salesforce).
 *
 * One canonical "brief envelope" shape, built from a `document_links` row,
 * used by BOTH delivery mechanisms so Salesforce sees the exact same payload
 * either way:
 *   - PUSH: notifySalesforceBriefCompleted() — fired from the brief-completion
 *           cascade when a client submits (or abandons) a brief.
 *   - PULL: fetchBriefEnvelopeByToken() — served by
 *           GET /api/webhooks/salesforce/brief/{token} for polling.
 *
 * Both no-op gracefully when the integration env vars are unset, so this is
 * safe to ship before the Salesforce side is wired.
 *
 * Env vars:
 *   SALESFORCE_BRIEF_WEBHOOK_URL  — where we POST completed briefs. Unset → push is skipped.
 *   SALESFORCE_OUTBOUND_SECRET    — sent as `Authorization: Bearer <secret>` if set.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface BriefEnvelope {
  event: 'brief.completed' | 'brief.failed' | 'brief.opened' | 'brief.pending'
  salesforce_ref: string | null
  token: string
  document_type: string
  status: string
  language: 'he' | 'en'
  client_name: string | null
  client_email: string | null
  created_by_email: string | null
  created_by_name: string | null
  created_at: string | null
  opened_at: string | null
  completed_at: string | null
  brief_drive_doc_link: string | null
  submission_data: Record<string, unknown> | null
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function statusToEvent(status: string | null): BriefEnvelope['event'] {
  switch (status) {
    case 'completed': return 'brief.completed'
    case 'failed': return 'brief.failed'
    case 'opened': return 'brief.opened'
    default: return 'brief.pending'
  }
}

// Shape of the joined row we read. `document_types` comes back as an object
// (single FK) but Supabase types it loosely, so we keep it permissive.
interface LinkRow {
  token: string
  status: string | null
  client_name: string | null
  client_email: string | null
  created_by_email: string | null
  created_by_name: string | null
  created_at: string | null
  opened_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown> | null
  document_types?: { slug?: string } | { slug?: string }[] | null
}

function docSlug(row: LinkRow): string {
  const dt = row.document_types
  if (Array.isArray(dt)) return dt[0]?.slug ?? 'client-brief'
  return dt?.slug ?? 'client-brief'
}

/** Map a document_links row to the canonical envelope Salesforce receives. */
export function buildBriefEnvelope(row: LinkRow): BriefEnvelope {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  return {
    event: statusToEvent(row.status),
    salesforce_ref: (meta.salesforce_ref as string | undefined) ?? null,
    token: row.token,
    document_type: docSlug(row),
    status: row.status ?? 'pending',
    language: meta.language === 'en' ? 'en' : 'he',
    client_name: row.client_name,
    client_email: row.client_email,
    created_by_email: row.created_by_email,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    opened_at: row.opened_at,
    completed_at: row.completed_at,
    brief_drive_doc_link: (meta.brief_drive_doc_link as string | undefined) ?? null,
    submission_data: (meta.submission_data as Record<string, unknown> | undefined) ?? null,
  }
}

const ENVELOPE_COLUMNS =
  'token, status, client_name, client_email, created_by_email, created_by_name, created_at, opened_at, completed_at, metadata, document_types(slug)'

/** Read a single brief link by token and return its envelope (or null). */
export async function fetchBriefEnvelopeByToken(token: string): Promise<BriefEnvelope | null> {
  const { data } = await service()
    .from('document_links')
    .select(ENVELOPE_COLUMNS)
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  return buildBriefEnvelope(data as unknown as LinkRow)
}

export interface OutboundResult {
  delivered: boolean
  reason?: string
  status?: number
}

/**
 * Lean payload Salesforce actually maps (per the Jun-9 spec with Yoav): brief
 * name + services (each separate) + platforms (joined text) + the brief's
 * Google Doc exported to PDF (base64). `projectId` = the salesforce_ref we
 * received on create; `token` is the idempotency key.
 */
export interface SalesforceBriefPayload {
  projectId: string | null
  token: string
  briefName: string | null
  services: string[]
  platforms: string
  briefPdf: { fileName: string; contentType: 'application/pdf'; base64: string } | null
}

/**
 * Export the brief's Google Doc as a PDF buffer — same content/design as the
 * Doc, just PDF. Best-effort; returns null on failure. The doc was created by
 * this app (createDriveClient / drive.file scope), so export is permitted.
 */
async function exportBriefDocAsPdf(docId: string): Promise<Buffer | null> {
  try {
    const { createDriveClient } = await import('@/lib/google-drive/client')
    const drive = await createDriveClient()
    const res = await drive.files.export(
      { fileId: docId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  } catch (e) {
    console.warn('[salesforce] brief PDF export failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Push a completed brief to Salesforce: the lean data payload + the brief's
 * Google Doc as PDF. Best-effort: never throws. Fires only for completed
 * briefs; no-ops when SALESFORCE_BRIEF_WEBHOOK_URL is unset. The second arg is
 * accepted for caller back-compat but unused (we only push completed briefs).
 */
export async function notifySalesforceBriefCompleted(
  token: string,
  _eventOverride?: string,
): Promise<OutboundResult> {
  const tag = `[salesforce-push:${token.slice(0, 8)}]`
  const url = process.env.SALESFORCE_BRIEF_WEBHOOK_URL
  if (!url) {
    console.log(`${tag} SALESFORCE_BRIEF_WEBHOOK_URL not set — skipping push`)
    return { delivered: false, reason: 'no_url' }
  }

  const { data: row } = await service()
    .from('document_links')
    .select('token, status, client_name, metadata')
    .eq('token', token)
    .maybeSingle()
  if (!row) {
    console.warn(`${tag} link not found — nothing to push`)
    return { delivered: false, reason: 'link_not_found' }
  }
  if (row.status !== 'completed') {
    console.log(`${tag} status=${row.status} (not completed) — skipping push`)
    return { delivered: false, reason: 'not_completed' }
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const sub = (meta.submission_data ?? {}) as Record<string, unknown>
  const services = Array.isArray(sub.services) ? (sub.services as string[]) : []
  const platforms = Array.isArray(sub.platforms)
    ? (sub.platforms as string[]).join(', ')
    : typeof sub.platforms === 'string' ? (sub.platforms as string) : ''

  // Export the existing brief Google Doc as PDF (same content/design, as PDF).
  let briefPdf: SalesforceBriefPayload['briefPdf'] = null
  const docId = meta.brief_drive_doc_id as string | undefined
  if (docId) {
    const pdf = await exportBriefDocAsPdf(docId)
    if (pdf) {
      briefPdf = {
        fileName: `בריף — ${row.client_name ?? 'לקוח'}.pdf`,
        contentType: 'application/pdf',
        base64: pdf.toString('base64'),
      }
    }
  } else {
    console.warn(`${tag} no brief_drive_doc_id on metadata — sending without PDF`)
  }

  const payload: SalesforceBriefPayload = {
    projectId: (meta.salesforce_ref as string | undefined) ?? null,
    token: row.token,
    briefName: row.client_name ?? null,
    services,
    platforms,
    briefPdf,
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const sfToken = process.env.SALESFORCE_OUTBOUND_TOKEN
  if (sfToken) headers['X-SF-Token'] = sfToken
  else if (process.env.SALESFORCE_OUTBOUND_SECRET) headers['Authorization'] = `Bearer ${process.env.SALESFORCE_OUTBOUND_SECRET}`

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`${tag} non-2xx from Salesforce: ${res.status} ${body.slice(0, 300)}`)
      return { delivered: false, reason: 'non_2xx', status: res.status }
    }
    console.log(`${tag} delivered (pdf=${briefPdf ? 'yes' : 'no'}) → ${res.status}`)
    return { delivered: true, status: res.status }
  } catch (e) {
    console.warn(`${tag} push failed:`, e instanceof Error ? e.message : e)
    return { delivered: false, reason: 'fetch_threw' }
  }
}
