/**
 * GET /api/drive/sync-closed-briefs
 *
 * Scans the "נסגר" folder in Drive for client briefs that someone manually
 * moved there (the agency's signal that the brief is reviewed + accepted).
 * For each newly-detected client, creates a full workspace under "ניהול
 * לקוח" with the 7 standard subfolders, and emails management.
 *
 * Two callers:
 *   1. The cron in vercel.json (runs periodically). Bearer token gate via
 *      CRON_SECRET when the env var is set.
 *   2. A manual button (future) inside Leaders × OS — auth via the user's
 *      Supabase session.
 *
 * Idempotent: if a workspace with the client's name already exists under
 * "ניהול לקוח", we reuse it. So running the scan repeatedly doesn't
 * create duplicates and doesn't re-email management.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function isAuthorized(request: Request, hasUser: boolean): boolean {
  // Cron path: Bearer CRON_SECRET.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get('authorization') ?? ''
    if (header === `Bearer ${secret}`) return true
  }
  // Manual path: any logged-in user.
  return hasUser
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, !!user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tag = `[sync-closed-briefs:${Date.now().toString(36)}]`
  console.log(`${tag} start (caller=${user?.email || 'cron'})`)

  try {
    const { scanClosedBriefsAndCreateWorkspaces } = await import(
      '@/lib/google-drive/client-folders'
    )
    const result = await scanClosedBriefsAndCreateWorkspaces()
    console.log(
      `${tag} scanned=${result.scanned} created=${result.created.length} reused=${result.reused.length} failed=${result.failed.length}`,
    )

    // Email management for each NEWLY created workspace — silent for reused
    // ones so we don't spam every cron run.
    if (result.created.length > 0) {
      try {
        const { sendToManagement } = await import('@/lib/gmail/management')
        for (const entry of result.created) {
          await sendToManagement({
            senderEmail: user?.email || undefined,
            senderName: user?.user_metadata?.full_name ?? user?.email ?? 'Leaders × OS',
            subject: `📁 תיק לקוח חדש נפתח — ${entry.clientName}`,
            html: buildWorkspaceCreatedHtml({
              clientName: entry.clientName,
              workspaceLink: entry.webViewLink,
              triggeredByEmail: user?.email || null,
            }),
          })
        }
        console.log(`${tag} mgmt mail sent for ${result.created.length} newly created workspaces`)
      } catch (e) {
        console.warn(`${tag} mgmt mail error (non-fatal):`, e instanceof Error ? e.message : e)
      }
    }

    // Stamp activity_log per newly created workspace.
    if (result.created.length > 0) {
      try {
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const service = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        )
        await Promise.all(
          result.created.map((entry) =>
            service.from('activity_log').insert({
              source: 'drive_sync',
              action_type: 'client_workspace_created',
              summary: `נפתח תיק לקוח חדש: ${entry.clientName}`,
              entity_type: 'drive_folder',
              entity_id: entry.workspaceId,
              actor_email: user?.email || null,
              actor_name: user?.user_metadata?.full_name ?? null,
              payload: {
                client_name: entry.clientName,
                workspace_drive_folder_id: entry.workspaceId,
                workspace_drive_folder_link: entry.webViewLink,
              },
            }),
          ),
        )
      } catch (e) {
        console.warn(`${tag} activity_log error (non-fatal):`, e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      created: result.created,
      reused_count: result.reused.length,
      failed: result.failed,
    })
  } catch (e) {
    console.error(`${tag} fatal:`, e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 },
    )
  }
}

function buildWorkspaceCreatedHtml(opts: {
  clientName: string
  workspaceLink: string
  triggeredByEmail: string | null
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;">תיק לקוח חדש נפתח</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 12px;"><strong>${esc(opts.clientName)}</strong> הועבר לתיקיית "נסגר", ובהתאם פתחנו לו תיק לקוח מלא ב-Drive עם 7 תת-תיקיות (הסכמים / טבלאות שליטה / מדיה / משפיענים / סושיאל / תוכן מהלקוח / קריאטיב).</p>
      <p style="margin:24px 0;"><a href="${opts.workspaceLink}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9999px;font-weight:600;display:inline-block;">פתח את תיקיית הלקוח</a></p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:12px;color:#888;margin:0;">הצעד הבא: לפתוח טופס התנעה ב-Leaders × OS ולבחור את ${esc(opts.clientName)} מרשימת הלקוחות.</p>
      ${opts.triggeredByEmail ? `<p style="font-size:11px;color:#ccc;margin:8px 0 0;">סנכרון בידי ${esc(opts.triggeredByEmail)}</p>` : ''}
    </div></body></html>`
}
