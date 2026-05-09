/**
 * Shared "send a client brief" pipeline.
 *
 * Two callers today:
 *   - POST /api/links             (user clicks "Send" in /send/client-brief)
 *   - ClickUp webhook trigger     (user changes lead status to "📤 שלח בריף")
 *
 * Both must produce identical results: a document_link row, a Drive
 * folder under "בריפים ראשוניים", and a Gmail to the client from the
 * sender's mailbox.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendGmailEmail } from '@/lib/gmail'
import { ensureClientBriefSentFolder } from '@/lib/google-drive/client-folders'

export interface SendClientBriefInput {
  clientName: string
  clientEmail: string
  /** Sender's @ldrsgroup email — used as the Gmail "from" address. */
  senderEmail: string
  /** Display name on the email. */
  senderName: string
  /** OAuth refresh token for the sender (must have gmail.send scope). */
  senderRefreshToken: string
  /** When set, the new document_link is associated with this lead. */
  leadId?: string | null
  /** Optional language for the email body. Default: 'he'. */
  language?: 'he' | 'en'
  /** Caller-id prefix for logging. */
  callerTag?: string
  /**
   * When set, reuse this existing document_link instead of inserting a
   * new one. Used by /api/links which already created the link with its
   * own user-scoped insert (so the row has the right RLS attribution).
   */
  existingLink?: { id: string; token: string }
}

export interface SendClientBriefResult {
  linkId: string
  token: string
  fullLink: string
  driveFolderId: string | null
  driveFolderLink: string | null
  mailDelivery: 'sent' | 'failed'
  mailError: string | null
}

/** Resolve the public origin we use to build outbound links. */
function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

export async function sendClientBrief(
  input: SendClientBriefInput,
): Promise<SendClientBriefResult> {
  const tag = input.callerTag || `[brief-send:${Date.now().toString(36)}]`
  const isEnglish = input.language === 'en'

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Resolve the document_type id for client-brief.
  const { data: docType } = await service
    .from('document_types')
    .select('id, slug, target_url, flow_type, name')
    .eq('slug', 'client-brief')
    .single()
  if (!docType) {
    throw new Error('client-brief document_type missing — run the hub schema migration')
  }

  // 1. Resolve the document_link — either reuse the one the caller already
  //    created (preserves RLS attribution for /api/links) or insert fresh.
  let linkRow: { id: string; token: string }
  if (input.existingLink) {
    linkRow = input.existingLink
    console.log(`${tag} reusing existing link (${linkRow.id})`)
  } else {
    const { data: created, error: linkErr } = await service
      .from('document_links')
      .insert({
        document_type_id: docType.id,
        created_by_email: input.senderEmail,
        created_by_name: input.senderName,
        client_email: input.clientEmail,
        client_name: input.clientName,
        lead_id: input.leadId || null,
        metadata: {},
      })
      .select('id, token')
      .single()
    if (linkErr || !created) {
      throw new Error(`Failed to create document_link: ${linkErr?.message || 'unknown'}`)
    }
    linkRow = created
    console.log(`${tag} link created (${linkRow.id})`)
  }

  const fullLink = `${appBaseUrl()}${docType.target_url}?token=${linkRow.token}`

  // 2. Drive folder. Best-effort — Gmail still goes out even if Drive fails.
  let driveFolderId: string | null = null
  let driveFolderLink: string | null = null
  try {
    const folder = await ensureClientBriefSentFolder({ clientName: input.clientName })
    driveFolderId = folder.id
    driveFolderLink = folder.webViewLink
    await service
      .from('document_links')
      .update({
        metadata: {
          brief_drive_folder_id: folder.id,
          brief_drive_folder_link: folder.webViewLink,
        },
      })
      .eq('id', linkRow.id)
    console.log(`${tag} drive folder ready: ${folder.id}`)
  } catch (e) {
    console.warn(`${tag} drive folder failed (non-fatal):`, e instanceof Error ? e.message : e)
  }

  // 3. Gmail. If this fails the whole "send" failed from the user's POV —
  //    return mailDelivery=failed and let the caller decide what to do.
  let mailDelivery: 'sent' | 'failed' = 'failed'
  let mailError: string | null = null
  try {
    const subject = isEnglish
      ? `Brief — ${input.clientName} × Leaders`
      : `בריף ל-${input.clientName} × Leaders`
    const html = isEnglish
      ? buildBriefEmailEn({ clientName: input.clientName, link: fullLink, senderName: input.senderName })
      : buildBriefEmailHe({ clientName: input.clientName, link: fullLink, senderName: input.senderName })
    await sendGmailEmail({
      refreshToken: input.senderRefreshToken,
      from: input.senderEmail,
      fromName: input.senderName,
      to: input.clientEmail,
      subject,
      html,
    })
    mailDelivery = 'sent'
    console.log(`${tag} mail sent to ${input.clientEmail}`)
  } catch (e) {
    mailError = e instanceof Error ? e.message : String(e)
    console.error(`${tag} mail send failed:`, mailError)
  }

  // 4. activity_log — only when there's a lead so the dashboard ticker
  //    can attribute the event to it.
  if (input.leadId) {
    try {
      await service.from('activity_log').insert({
        source: 'leaders_ui',
        action_type: 'client_brief_sent',
        summary: `${input.senderName} שלח בריף ל-${input.clientName}`,
        entity_type: 'lead',
        entity_id: input.leadId,
        actor_email: input.senderEmail,
        actor_name: input.senderName,
        payload: {
          document_link_id: linkRow.id,
          token: linkRow.token,
          drive_folder_link: driveFolderLink,
          mail_delivery: mailDelivery,
        },
      })
    } catch (e) {
      console.warn(`${tag} activity_log failed (non-fatal):`, e instanceof Error ? e.message : e)
    }
  }

  return {
    linkId: linkRow.id,
    token: linkRow.token,
    fullLink,
    driveFolderId,
    driveFolderLink,
    mailDelivery,
    mailError,
  }
}

/* ───────────────── Email templates ───────────────── */

function buildBriefEmailHe(opts: { clientName: string; link: string; senderName: string }): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo','Helvetica Neue',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3;">היי ${escapeHtml(opts.clientName)},</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 12px;">תודה שאתם איתנו. כדי להתחיל, יש למלא את הבריף הראשוני בקישור:</p>
      <p style="margin:24px 0;"><a href="${opts.link}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9999px;font-weight:600;display:inline-block;">פתח את הבריף</a></p>
      <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 0;">זה לוקח כ-15 דקות. אפשר לחזור ולהמשיך מאותה הנקודה — מה שמילאת נשמר אוטומטית.</p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:13px;color:#666;margin:0;">${escapeHtml(opts.senderName)} • Leaders</p>
    </div></body></html>`
}

function buildBriefEmailEn(opts: { clientName: string; link: string; senderName: string }): string {
  return `<!DOCTYPE html><html dir="ltr" lang="en"><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.3;">Hi ${escapeHtml(opts.clientName)},</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 12px;">Thanks for being with us. To get started, please fill out the brief at this link:</p>
      <p style="margin:24px 0;"><a href="${opts.link}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9999px;font-weight:600;display:inline-block;">Open the brief</a></p>
      <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 0;">It takes about 15 minutes. You can come back and continue where you left off — your answers save automatically.</p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:13px;color:#666;margin:0;">${escapeHtml(opts.senderName)} • Leaders</p>
    </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
