import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Salesforce → Hub : price-quote endpoint.
 *
 * TEMPORARY capture stub. Right now it just authenticates, stores the raw
 * payload to activity_log (action_type='quote_payload_received') so we can see
 * the exact structure Salesforce sends, and returns 200. The full flow
 * (map → generate signable PDF → signature_requests → status push-backs) is
 * built once the payload contract is confirmed.
 *
 * Auth: same shared secret as the brief webhook — Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>.
 */
function authorize(request: Request): boolean {
  const secret = process.env.SALESFORCE_WEBHOOK_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(auth.slice(7).trim()), Buffer.from(secret))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    /* keep raw only */
  }
  console.log('[salesforce-quote] received payload:', rawBody.slice(0, 4000))

  try {
    const sb = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    await sb.from('activity_log').insert({
      source: 'salesforce',
      action_type: 'quote_payload_received',
      summary: 'Salesforce price-quote payload captured (stub)',
      payload: { raw: rawBody.slice(0, 16000), parsed },
    })
  } catch (e) {
    console.error('[salesforce-quote] store failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, received: true })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    purpose: 'Salesforce price-quote endpoint (capture stub — stores the payload for inspection).',
  })
}
