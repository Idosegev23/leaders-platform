/**
 * GET /api/cron/renew-drive-watch
 *
 * Daily cron: looks for active Drive watch channels expiring in the
 * next 24 hours, stops them, and registers fresh ones. Drive channels
 * have a hard ~7-day lifetime — without renewal, push notifications
 * stop and we'd silently fall back to the 30-min poll cron.
 *
 * Auth: Bearer CRON_SECRET when set; otherwise public (dev convenience).
 */

import { NextResponse } from 'next/server'
import {
  listChannelsExpiringSoon,
  stopDriveWatch,
  startDriveWatch,
} from '@/lib/google-drive/watch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tag = `[renew-drive-watch:${Date.now().toString(36)}]`
  const results: Array<{
    channel_id: string
    action: 'renewed' | 'stop_failed' | 'start_failed'
    new_channel_id?: string
    error?: string
  }> = []

  try {
    const expiring = await listChannelsExpiringSoon()
    console.log(`${tag} ${expiring.length} channel(s) expiring in <24h`)

    if (expiring.length === 0) {
      // Nothing to do — but if there's NO active channel at all, register
      // one so we always have live coverage. (Bootstraps fresh deploys
      // without requiring a manual /start-watch call.)
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      const { count } = await sb
        .from('drive_watch_channels')
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
      if (!count) {
        try {
          const fresh = await startDriveWatch()
          results.push({ channel_id: '(none)', action: 'renewed', new_channel_id: fresh.channelId })
          console.log(`${tag} bootstrapped: ${fresh.channelId.slice(0, 8)}...`)
        } catch (e) {
          results.push({ channel_id: '(none)', action: 'start_failed', error: e instanceof Error ? e.message : String(e) })
        }
      }
      return NextResponse.json({ ok: true, expiring: 0, results })
    }

    for (const ch of expiring) {
      try {
        await stopDriveWatch({ channelId: ch.channel_id, resourceId: ch.resource_id })
      } catch (e) {
        results.push({
          channel_id: ch.channel_id,
          action: 'stop_failed',
          error: e instanceof Error ? e.message : String(e),
        })
        // Continue — Drive will eventually expire it on its own.
      }
      try {
        const fresh = await startDriveWatch()
        results.push({
          channel_id: ch.channel_id,
          action: 'renewed',
          new_channel_id: fresh.channelId,
        })
      } catch (e) {
        results.push({
          channel_id: ch.channel_id,
          action: 'start_failed',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return NextResponse.json({ ok: true, expiring: expiring.length, results })
  } catch (e) {
    console.error(`${tag} fatal:`, e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Renewal failed' },
      { status: 500 },
    )
  }
}
