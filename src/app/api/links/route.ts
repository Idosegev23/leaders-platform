import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/links
 * Create a new document_link. Body: { slug, client_email?, client_name?, lead_id? }
 * Requires authenticated employee session.
 *
 * If `lead_id` is supplied, the link is linked to that lead explicitly.
 * Otherwise, we try to auto-link by matching `client_email` against
 * `leads.email` (case-insensitive).
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slug, client_email, client_name, metadata, lead_id } = body as {
    slug?: string
    client_email?: string | null
    client_name?: string | null
    metadata?: Record<string, unknown>
    lead_id?: string | null
  }
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const { data: docType, error: typeErr } = await supabase
    .from('document_types')
    .select('id, slug, target_url, flow_type, name')
    .eq('slug', slug)
    .single()
  if (typeErr || !docType) {
    return NextResponse.json({ error: 'Unknown document type' }, { status: 404 })
  }

  // Resolve which lead this link belongs to: explicit > auto-match by email.
  let resolvedLeadId: string | null = lead_id ?? null
  if (!resolvedLeadId && client_email) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: matchedLead } = await service
      .from('leads')
      .select('id')
      .ilike('email', client_email)
      .limit(1)
      .maybeSingle()
    if (matchedLead?.id) resolvedLeadId = matchedLead.id
  }

  const { data, error } = await supabase
    .from('document_links')
    .insert({
      document_type_id: docType.id,
      created_by_email: user.email,
      created_by_name: user.user_metadata?.full_name ?? user.email,
      client_email: client_email || null,
      client_name: client_name || null,
      lead_id: resolvedLeadId,
      metadata: {
        created_by_avatar: user.user_metadata?.avatar_url ?? null,
        ...(metadata ?? {}),
      },
    })
    .select('*, document_types(slug, name, target_url, flow_type)')
    .single()

  if (error) {
    console.error('Error creating link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If the link is tied to a lead, stamp activity_log so the lead's
  // timeline picks it up (feeds ticker + /leads/[id]).
  if (resolvedLeadId) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const actorName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null
    await service.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: `${docType.name}_sent`,
      summary: `${actorName ?? 'משתמש'} שלח ${docType.name} ל־${client_name ?? client_email ?? 'לקוח'}`,
      entity_type: 'lead',
      entity_id: resolvedLeadId,
      actor_email: user.email,
      actor_name: actorName,
      payload: {
        document_link_id: data.id,
        document_type_slug: docType.name,
        token: data.token,
      },
    })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const fullLink =
    docType.flow_type === 'external'
      ? docType.target_url
      : `${origin}${docType.target_url}?token=${data.token}`

  // ─── Native side effects (replaces Make.com webhook) ───
  // For send_link rubrics with a client email, automatically:
  //   1. Create a per-client Drive folder under "בריפים ראשוניים"
  //   2. Email the client the form link from the sender's own Gmail
  // Both are best-effort. If they fail the link still returns successfully —
  // the user can copy the link from the response and send manually.
  let driveFolderId: string | null = null
  let mailDelivery: 'sent' | 'skipped' | 'failed' = 'skipped'
  let mailError: string | null = null
  if (
    docType.slug === 'client-brief' &&
    docType.flow_type === 'send_link' &&
    client_email &&
    client_name
  ) {
    // 1. Drive folder
    try {
      const { ensureClientBriefSentFolder } = await import(
        '@/lib/google-drive/client-folders'
      )
      const folder = await ensureClientBriefSentFolder({ clientName: client_name })
      driveFolderId = folder.id
      // Stamp the folder id on the link's metadata so the brief-completion
      // handler later can find and move the same folder.
      await supabase
        .from('document_links')
        .update({
          metadata: {
            ...(data.metadata || {}),
            brief_drive_folder_id: folder.id,
            brief_drive_folder_link: folder.webViewLink,
          },
        })
        .eq('id', data.id)
    } catch (e) {
      console.error('[/api/links] Drive folder creation failed (non-fatal):', e)
    }

    // 2. Gmail to client
    try {
      const service = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      const { data: tokenRow } = await service
        .from('user_google_tokens')
        .select('refresh_token')
        .eq('user_id', user.id)
        .single()
      if (!tokenRow?.refresh_token) {
        mailDelivery = 'skipped'
        mailError = 'no_refresh_token'
      } else {
        const { sendGmailEmail } = await import('@/lib/gmail')
        const senderName = user.user_metadata?.full_name ?? user.email
        const isEnglish = (metadata as { language?: string } | undefined)?.language === 'en'
        const subject = isEnglish
          ? `Brief — ${client_name} × Leaders`
          : `בריף ל-${client_name} × Leaders`
        const html = isEnglish
          ? buildBriefEmailEn({ clientName: client_name, link: fullLink, senderName })
          : buildBriefEmailHe({ clientName: client_name, link: fullLink, senderName })
        await sendGmailEmail({
          refreshToken: tokenRow.refresh_token,
          from: user.email,
          fromName: senderName,
          to: client_email,
          subject,
          html,
        })
        mailDelivery = 'sent'
      }
    } catch (e) {
      console.error('[/api/links] Gmail send failed (non-fatal):', e)
      mailDelivery = 'failed'
      mailError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json({
    ...data,
    full_link: fullLink,
    linked_lead_id: resolvedLeadId,
    drive_folder_id: driveFolderId,
    mail_delivery: mailDelivery,
    mail_error: mailError,
  })
}

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

/**
 * GET /api/links?slug=<slug>  — list caller's links, optionally filtered by type.
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get('slug')

  let query = supabase
    .from('document_links')
    .select('*, document_types(slug, name, icon, target_url)')
    .eq('created_by_email', user.email)
    .order('created_at', { ascending: false })
    .limit(100)

  if (slug) {
    const { data: dt } = await supabase.from('document_types').select('id').eq('slug', slug).single()
    if (dt?.id) query = query.eq('document_type_id', dt.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
