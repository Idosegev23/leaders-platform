/**
 * POST /api/briefs/reminders/bulk
 *
 * Fire the per-brief reminder route for a list of tokens, serially with
 * a small delay between calls so Gmail doesn't rate-limit. Returns per-
 * token result so the UI can show which succeeded vs. which were on
 * cooldown / had no Gmail token / etc.
 *
 * Body: { tokens: string[] }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DELAY_MS = 600

export async function POST(request: Request) {
  if (!isDevMode) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const tokens = (body as { tokens?: unknown }).tokens
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return NextResponse.json({ error: 'tokens[] is required' }, { status: 400 })
  }
  if (tokens.length > 50) {
    return NextResponse.json({ error: 'max 50 tokens per batch' }, { status: 400 })
  }

  // Reuse the single-reminder route by calling it locally. Avoids duplicating
  // the cooldown / auth / gmail send logic. Cookie forwarding keeps the
  // session intact so the inner POST passes its own auth check.
  const cookie = request.headers.get('cookie') || ''
  const origin = new URL(request.url).origin

  const results: Array<{
    token: string
    ok: boolean
    status?: number
    error?: string
    cooldown_hours_left?: number
  }> = []

  for (const raw of tokens) {
    const token = String(raw)
    try {
      const r = await fetch(`${origin}/api/briefs/${encodeURIComponent(token)}/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({}),
      })
      const data = await r.json().catch(() => ({}))
      results.push({
        token,
        ok: r.ok,
        status: r.status,
        error: r.ok ? undefined : (data.message || data.error || 'failed'),
        cooldown_hours_left: data.cooldown_hours_left,
      })
    } catch (e) {
      results.push({ token, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    // Tiny gap so Gmail doesn't 429 on a burst.
    await new Promise(res => setTimeout(res, DELAY_MS))
  }

  const sent = results.filter(r => r.ok).length
  const skipped = results.filter(r => !r.ok && r.status === 429).length
  const failed = results.filter(r => !r.ok && r.status !== 429).length

  return NextResponse.json({ ok: true, sent, skipped, failed, results })
}
