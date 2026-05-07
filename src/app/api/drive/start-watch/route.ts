/**
 * POST /api/drive/start-watch
 *
 * Registers a Drive push-notification channel for the LEADERS Shared
 * Drive. Idempotent — running it again deactivates the previous channel
 * and registers a fresh one (the renew cron uses this same path).
 *
 * Auth: any logged-in employee. Manual one-time setup OR cron retrigger.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { startDriveWatch } from '@/lib/google-drive/watch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Cron path: Bearer CRON_SECRET. Manual path: any logged-in user.
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const isCron = secret && auth === `Bearer ${secret}`
  if (!isCron && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await startDriveWatch()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[/api/drive/start-watch] failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Watch registration failed' },
      { status: 500 },
    )
  }
}
