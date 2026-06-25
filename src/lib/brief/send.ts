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
import { sendGmailEmail, sendGmailViaServiceAccount } from '@/lib/gmail'

export interface SendClientBriefInput {
  clientName: string
  clientEmail: string
  /** Sender's @ldrsgroup email — used as the Gmail "from" address. */
  senderEmail: string
  /** Display name on the email. */
  senderName: string
  /**
   * OAuth refresh token for the sender (must have gmail.send scope).
   * Optional when `useServiceAccount` is true (service-account impersonation).
   */
  senderRefreshToken?: string | null
  /**
   * Send via the service account impersonating `senderEmail` (domain-wide
   * delegation) instead of a per-user OAuth refresh token. Used for shared
   * mailboxes like info@ldrsgroup.com that nobody logs into.
   */
  useServiceAccount?: boolean
  /** When set, the new document_link is associated with this lead. */
  leadId?: string | null
  /** Optional language for the email body. Default: 'he'. */
  language?: 'he' | 'en'
  /** Caller-id prefix for logging. */
  callerTag?: string
  /**
   * Free-text "personal note" the BD-person typed in /send/client-brief.
   * If set, rendered as a block inside the email between the greeting and
   * the CTA. Caller is responsible for any AI-polishing — this helper
   * does not refine the text.
   */
  personalNote?: string | null
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

  // No Drive folder is created at send time. Per-client folders for every
  // outgoing link generated clutter inside "בריפים ראשוניים" with empty
  // shells for clients who never end up filling the form. Instead, the
  // brief's Google Doc lands directly under BRIEFS_SENT on submission
  // (see runClientBriefCascade in /api/links/[token]/route.ts) and only
  // gets a real on-disk presence once the client actually has data to
  // hand back.
  const driveFolderId: string | null = null
  const driveFolderLink: string | null = null

  // 3. Gmail. If this fails the whole "send" failed from the user's POV —
  //    return mailDelivery=failed and let the caller decide what to do.
  let mailDelivery: 'sent' | 'failed' = 'failed'
  let mailError: string | null = null
  try {
    const subject = isEnglish
      ? `Brief — ${input.clientName} × Leaders`
      : `בריף ל-${input.clientName} × Leaders`
    const personalNote = (input.personalNote || '').trim() || null
    const html = isEnglish
      ? buildBriefEmailEn({ clientName: input.clientName, link: fullLink, senderName: input.senderName, personalNote })
      : buildBriefEmailHe({ clientName: input.clientName, link: fullLink, senderName: input.senderName, personalNote })
    if (input.useServiceAccount) {
      await sendGmailViaServiceAccount({
        from: input.senderEmail,
        fromName: input.senderName,
        to: input.clientEmail,
        subject,
        html,
      })
    } else {
      if (!input.senderRefreshToken) {
        throw new Error('senderRefreshToken required when useServiceAccount is not set')
      }
      await sendGmailEmail({
        refreshToken: input.senderRefreshToken,
        from: input.senderEmail,
        fromName: input.senderName,
        to: input.clientEmail,
        subject,
        html,
      })
    }
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

/**
 * Render a free-text note as a series of paragraphs. Empty lines split
 * paragraphs; single newlines become <br>. Inline links are NOT auto-
 * linked — clients should paste real URLs into the textarea if they
 * want a link.
 */
function renderNoteParagraphs(note: string): string {
  const blocks = note
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
  return blocks
    .map(
      (b) =>
        `<p style="font-size:15px;line-height:1.75;margin:0 0 12px;color:#1a1a2e;">${escapeHtml(b).replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
}

function buildBriefEmailHe(opts: {
  clientName: string
  link: string
  senderName: string
  personalNote?: string | null
}): string {
  const noteHtml = opts.personalNote
    ? `<div style="background:#faf8f4;border-inline-start:3px solid #c9b27a;padding:14px 16px;margin:0 0 22px;border-radius:4px;">${renderNoteParagraphs(opts.personalNote)}</div>`
    : ''
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="rtl" style="margin:0;padding:0;background:#f5f3ef;font-family:'Heebo','Helvetica Neue',Arial,sans-serif;color:#1a1a2e;">
  <div dir="rtl" style="padding:32px 16px;">
    <div dir="rtl" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;text-align:right;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;direction:ltr;text-align:right;unicode-bidi:plaintext;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.35;color:#1a1a2e;">היי ${escapeHtml(opts.clientName)},</h1>
      <p style="font-size:15px;line-height:1.75;margin:0 0 18px;color:#1a1a2e;">תודה שאתם איתנו. כדי שנוכל להתחיל לעבוד, נשמח שתמלאו את הבריף הראשוני — זה הבסיס שעליו נבנה את כל המהלך.</p>
      ${noteHtml}
      <div style="text-align:center;margin:28px 0 24px;">
        <a href="${opts.link}" style="background:#1a1a2e;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9999px;font-weight:600;display:inline-block;font-size:15px;">פתח את הבריף ←</a>
      </div>
      <p style="font-size:13px;color:#777;line-height:1.65;margin:0;">המילוי לוקח כ‑15 דקות. אפשר לחזור ולהמשיך — מה שמילאתם נשמר אוטומטית.</p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0 16px;">
      <p style="font-size:13px;color:#777;margin:0;">${escapeHtml(opts.senderName)} • Leaders</p>
    </div>
  </div>
</body></html>`
}

function buildBriefEmailEn(opts: {
  clientName: string
  link: string
  senderName: string
  personalNote?: string | null
}): string {
  const noteHtml = opts.personalNote
    ? `<div style="background:#faf8f4;border-inline-start:3px solid #c9b27a;padding:14px 16px;margin:0 0 22px;border-radius:4px;">${renderNoteParagraphs(opts.personalNote)}</div>`
    : ''
  return `<!DOCTYPE html><html dir="ltr" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="ltr" style="margin:0;padding:0;background:#f5f3ef;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;">
  <div dir="ltr" style="padding:32px 16px;">
    <div dir="ltr" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;text-align:left;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.35;color:#1a1a2e;">Hi ${escapeHtml(opts.clientName)},</h1>
      <p style="font-size:15px;line-height:1.75;margin:0 0 18px;color:#1a1a2e;">Thanks for being with us. To get started, please fill out the initial brief — it's the foundation we'll build everything else on.</p>
      ${noteHtml}
      <div style="text-align:center;margin:28px 0 24px;">
        <a href="${opts.link}" style="background:#1a1a2e;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9999px;font-weight:600;display:inline-block;font-size:15px;">Open the brief →</a>
      </div>
      <p style="font-size:13px;color:#777;line-height:1.65;margin:0;">It takes about 15 minutes. You can come back any time — your answers save automatically.</p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0 16px;">
      <p style="font-size:13px;color:#777;margin:0;">${escapeHtml(opts.senderName)} • Leaders</p>
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
