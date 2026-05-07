/**
 * POST /api/drive/webhook
 *
 * Drive push-notification receiver. Drive sends an empty POST every time
 * something in the watched Shared Drive changes. We:
 *   1. Validate the channel id + token via headers (no body to verify).
 *   2. Pull changes since our stored pageToken via changes.list.
 *   3. Filter for moves/additions into "נסגר" (BRIEFS_COMPLETED).
 *   4. If any matched, run scanClosedBriefsAndCreateWorkspaces — fully
 *      idempotent so duplicate notifications are harmless.
 *   5. Advance the pageToken so we don't replay these changes.
 *
 * Drive notifications are best-effort. We must respond fast (under ~5s
 * ideally) — if not, Drive retries. For heavy work we'd queue. Here the
 * scanner is light so we run it inline.
 *
 * Public endpoint — no Supabase auth. Authentication is via the channel
 * id + token shared secret we generated at start-watch time. Note: any
 * caller could spoof headers, but if they don't have the random UUID
 * token from start-watch they'll fail validation.
 */

import { NextResponse } from 'next/server'
import {
  findActiveChannelByHeaders,
  fetchChangesSince,
  advanceChannelToken,
  isChangeIntoClosedBriefs,
} from '@/lib/google-drive/watch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const startTs = Date.now()
  const headers = {
    channelId: request.headers.get('x-goog-channel-id'),
    channelToken: request.headers.get('x-goog-channel-token'),
    resourceState: request.headers.get('x-goog-resource-state'),
    messageNumber: request.headers.get('x-goog-message-number'),
  }

  // Drive sends a "sync" notification immediately after registration to
  // confirm the channel works — it doesn't represent a real change. ACK
  // it without doing any work.
  if (headers.resourceState === 'sync') {
    console.log(`[drive-webhook] sync ack — channel ${headers.channelId?.slice(0, 8)}...`)
    return NextResponse.json({ ok: true, sync: true })
  }

  const channel = await findActiveChannelByHeaders({
    channelId: headers.channelId,
    channelToken: headers.channelToken,
  })
  if (!channel) {
    console.warn(`[drive-webhook] unknown channel: id=${headers.channelId} (rejecting)`)
    return NextResponse.json({ error: 'Unknown channel' }, { status: 401 })
  }

  const tag = `[drive-webhook:${channel.channel_id.slice(0, 8)}]`

  try {
    // Drive notifications batch many changes into one ping. Fetch them all
    // since our last cursor.
    const { changes, newPageToken } = await fetchChangesSince({
      driveId: channel.drive_id,
      pageToken: channel.page_token,
    })
    console.log(`${tag} fetched ${changes.length} changes since last cursor`)

    const intoClosed = changes.filter(isChangeIntoClosedBriefs)
    if (intoClosed.length > 0) {
      console.log(
        `${tag} ${intoClosed.length} folder(s) entered נסגר: ${intoClosed
          .map((c) => c.file?.name || c.fileId)
          .join(', ')}`,
      )
      // Run the scanner. Idempotent — existing workspaces are reused;
      // genuinely new ones get the workspace + email + activity_log.
      const { scanClosedBriefsAndCreateWorkspaces } = await import(
        '@/lib/google-drive/client-folders'
      )
      const result = await scanClosedBriefsAndCreateWorkspaces()
      console.log(
        `${tag} scan: scanned=${result.scanned} created=${result.created.length} reused=${result.reused.length}`,
      )

      // Email management for each newly created workspace.
      if (result.created.length > 0) {
        try {
          const { sendToManagement } = await import('@/lib/gmail/management')
          for (const entry of result.created) {
            const html = buildHtml(entry.clientName, entry.webViewLink)
            await sendToManagement({
              subject: `📁 תיק לקוח חדש נפתח — ${entry.clientName}`,
              html,
            })
          }
        } catch (e) {
          console.warn(`${tag} mgmt mail error:`, e instanceof Error ? e.message : e)
        }
      }
    }

    // Always advance the cursor so we don't re-process the same changes
    // on the next ping (even if intoClosed was empty).
    await advanceChannelToken({
      channelDbId: channel.id,
      newPageToken,
    })

    console.log(`${tag} done in ${Date.now() - startTs}ms`)
    return NextResponse.json({ ok: true, processed: intoClosed.length })
  } catch (e) {
    console.error(`${tag} error:`, e instanceof Error ? e.message : e)
    // Return 200 anyway — Drive retries on non-2xx, which spams. Better
    // to silently swallow and rely on the cron + manual scan as backup.
    return NextResponse.json({ ok: false, error: 'processing_error' })
  }
}

function buildHtml(clientName: string, workspaceLink: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;">Leaders × OS · Drive Watch</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;">תיק לקוח חדש נפתח</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 12px;"><strong>${esc(clientName)}</strong> הועבר ל-"נסגר", ופתחנו לו תיק מלא ב-Drive עם 7 תת-תיקיות.</p>
      <p style="margin:24px 0;"><a href="${workspaceLink}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9999px;font-weight:600;display:inline-block;">פתח את תיקיית הלקוח</a></p>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:12px;color:#888;margin:0;">זוהה ע״י listener בזמן אמת (לא קרון).</p>
    </div></body></html>`
}
