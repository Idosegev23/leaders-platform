/**
 * Drive push-notification (webhook) management.
 *
 * Google Drive supports notifications via channels:
 *   POST /drive/v3/changes/watch
 *
 * We register one channel per Shared Drive. Drive sends an empty POST to
 * our webhook every time something changes anywhere in the drive — file
 * added, moved, renamed, trashed. The notification doesn't carry the
 * change details; we have to call `changes.list` with our stored page
 * token to learn what actually happened.
 *
 * Channels expire after ~7 days max. We renew via daily cron at
 * /api/cron/renew-drive-watch.
 */

import { createDriveClient } from './client'
import { DRIVE_ANCHORS } from './client-folders'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const MAX_CHANNEL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
// Renew when there's less than this remaining. Daily cron + 24h buffer = safe.
export const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000   // 24 hours

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function webhookUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://leaders-platform.vercel.app'
  return `${base.replace(/\/$/, '')}/api/drive/webhook`
}

/**
 * Register a new watch channel for the LEADERS Shared Drive. Stores the
 * channel + resource ids + initial pageToken in Supabase so the webhook
 * handler can validate inbound notifications and advance the changes
 * cursor. Returns the channel id + when it expires.
 */
export async function startDriveWatch(): Promise<{
  channelId: string
  resourceId: string
  expiresAt: string
  pageToken: string
}> {
  const drive = await createDriveClient()
  const driveId = DRIVE_ANCHORS.SHARED_DRIVE_ID

  // 1. Get the current changes start-page-token. All future changes will
  //    be retrievable from this point onward.
  const startToken = await drive.changes.getStartPageToken({
    driveId,
    supportsAllDrives: true,
  })
  const pageToken = startToken.data.startPageToken
  if (!pageToken) throw new Error('Drive returned no startPageToken')

  // 2. Register the watch channel. The token we send is echoed back in
  //    every notification's x-goog-channel-token header — we verify it.
  const channelId = randomUUID()
  const channelToken = randomUUID()  // shared-secret per channel
  const expirationMs = Date.now() + MAX_CHANNEL_LIFETIME_MS

  const watchRes = await drive.changes.watch({
    driveId,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageToken,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl(),
      token: channelToken,
      expiration: String(expirationMs),
    },
  })

  const resourceId = watchRes.data.resourceId
  if (!resourceId) throw new Error('Drive did not return resourceId for the watch channel')

  const expiresIso = new Date(
    watchRes.data.expiration ? Number(watchRes.data.expiration) : expirationMs,
  ).toISOString()

  // 3. Persist.
  const sb = service()
  // De-activate any existing rows so only one channel is "live" at a time.
  await sb.from('drive_watch_channels').update({ active: false }).eq('active', true)
  const { error } = await sb.from('drive_watch_channels').insert({
    channel_id: channelId,
    resource_id: resourceId,
    drive_id: driveId,
    token: channelToken,
    page_token: pageToken,
    expires_at: expiresIso,
    active: true,
  })
  if (error) throw new Error(`Failed to persist watch channel: ${error.message}`)

  console.log(
    `[drive-watch] registered channel ${channelId.slice(0, 8)}... expires ${expiresIso}`,
  )
  return { channelId, resourceId, expiresAt: expiresIso, pageToken }
}

/** Tell Drive to stop sending notifications for a channel. Best-effort. */
export async function stopDriveWatch(params: {
  channelId: string
  resourceId: string
}): Promise<void> {
  try {
    const drive = await createDriveClient()
    await drive.channels.stop({
      requestBody: { id: params.channelId, resourceId: params.resourceId },
    })
    console.log(`[drive-watch] stopped channel ${params.channelId.slice(0, 8)}...`)
  } catch (e) {
    // 404 is fine — channel already gone.
    console.warn(`[drive-watch] stop failed (ignoring):`, e instanceof Error ? e.message : e)
  }
}

/**
 * Validate an inbound webhook against our stored channel + token.
 * Drive doesn't sign the payload — only the channel id + the token we
 * chose at registration are presented as headers. We confirm both.
 */
export async function findActiveChannelByHeaders(headers: {
  channelId: string | null
  channelToken: string | null
}): Promise<{
  id: string
  channel_id: string
  resource_id: string
  drive_id: string
  page_token: string
  token: string
} | null> {
  if (!headers.channelId || !headers.channelToken) return null
  const sb = service()
  const { data } = await sb
    .from('drive_watch_channels')
    .select('id, channel_id, resource_id, drive_id, page_token, token, active')
    .eq('channel_id', headers.channelId)
    .eq('active', true)
    .maybeSingle()
  if (!data) return null
  if (data.token !== headers.channelToken) return null
  return data
}

/**
 * Advance our pageToken cursor by calling Drive's changes.list. Returns
 * the list of changes (you decide what to do with them) plus the new
 * token to persist.
 */
export async function fetchChangesSince(params: {
  driveId: string
  pageToken: string
}): Promise<{ changes: ChangeEntry[]; newPageToken: string }> {
  const drive = await createDriveClient()
  const collected: ChangeEntry[] = []
  let pageToken: string | null = params.pageToken
  let newStartPageToken: string | null = null

  while (pageToken) {
    // The googleapis SDK's response type is deeply recursive; cast through
    // `unknown` so TS doesn't try to infer it. We type the fields we read.
    const res = (await drive.changes.list({
      pageToken,
      driveId: params.driveId,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields:
        'changes(fileId, removed, time, file(id, name, mimeType, parents, trashed)), nextPageToken, newStartPageToken',
    })) as unknown as {
      data: {
        changes?: Array<{
          fileId?: string | null
          removed?: boolean | null
          time?: string | null
          file?: {
            id?: string | null
            name?: string | null
            mimeType?: string | null
            parents?: string[] | null
            trashed?: boolean | null
          } | null
        }>
        nextPageToken?: string | null
        newStartPageToken?: string | null
      }
    }
    const data = res.data
    // Coerce the SDK's nullable types to our undefined-only ChangeEntry
    // shape — null is meaningful in the wire protocol, but for our filter
    // logic we treat null and missing the same way.
    const changes: ChangeEntry[] = (data.changes || []).map((c) => ({
      fileId: c.fileId || undefined,
      removed: c.removed || undefined,
      time: c.time || undefined,
      file: c.file
        ? {
            id: c.file.id || undefined,
            name: c.file.name || undefined,
            mimeType: c.file.mimeType || undefined,
            parents: c.file.parents || undefined,
            trashed: c.file.trashed || undefined,
          }
        : undefined,
    }))
    collected.push(...changes)
    if (data.nextPageToken) {
      pageToken = data.nextPageToken
    } else {
      newStartPageToken = data.newStartPageToken || params.pageToken
      break
    }
  }
  return { changes: collected, newPageToken: newStartPageToken || params.pageToken }
}

export interface ChangeEntry {
  fileId?: string
  removed?: boolean
  time?: string
  file?: {
    id?: string
    name?: string
    mimeType?: string
    parents?: string[]
    trashed?: boolean
  }
}

/** Persist the new pageToken + bump notification stats on the channel row. */
export async function advanceChannelToken(params: {
  channelDbId: string
  newPageToken: string
}): Promise<void> {
  const sb = service()
  // Read-modify-write the counter. Two concurrent webhook calls are
  // unlikely (Drive serialises within a channel), and an off-by-one here
  // is purely a stat — it never affects correctness.
  const { data } = await sb
    .from('drive_watch_channels')
    .select('notification_count')
    .eq('id', params.channelDbId)
    .maybeSingle()
  const next = (data?.notification_count || 0) + 1
  await sb
    .from('drive_watch_channels')
    .update({
      page_token: params.newPageToken,
      last_notified_at: new Date().toISOString(),
      notification_count: next,
    })
    .eq('id', params.channelDbId)
}

/** Filter Drive changes for "added/moved into the נסגר folder" events. */
export function isChangeIntoClosedBriefs(c: ChangeEntry): boolean {
  if (c.removed) return false
  if (!c.file) return false
  if (c.file.trashed) return false
  // Folders directly under "נסגר" are what we care about. Drive's `parents`
  // shows the *current* parent — if it's the closed-briefs folder, this is
  // either a brand new addition or a move-in.
  return (c.file.parents || []).includes(DRIVE_ANCHORS.BRIEFS_COMPLETED)
}

/** Shape used by the renew cron to find rows nearing expiration. */
export async function listChannelsExpiringSoon(thresholdMs = RENEWAL_THRESHOLD_MS): Promise<
  Array<{ id: string; channel_id: string; resource_id: string; expires_at: string }>
> {
  const sb = service()
  const cutoff = new Date(Date.now() + thresholdMs).toISOString()
  const { data } = await sb
    .from('drive_watch_channels')
    .select('id, channel_id, resource_id, expires_at')
    .eq('active', true)
    .lt('expires_at', cutoff)
  return data || []
}
