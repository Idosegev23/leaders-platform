import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { fetchBriefEnvelopeByToken } from '@/lib/salesforce/outbound'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Salesforce pull mode: GET the full brief envelope by token.
 *
 *   GET /api/webhooks/salesforce/brief/{token}
 *   Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>
 *
 * Returns the SAME envelope shape we push on completion (see
 * src/lib/salesforce/outbound.ts). Use this if Salesforce prefers to poll
 * instead of receiving our push. While the brief is unfinished,
 * `submission_data` is null and `status` is pending/opened.
 */

function authorize(request: Request): boolean {
  const secret = process.env.SALESFORCE_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[salesforce-brief-pull] SALESFORCE_WEBHOOK_SECRET not set — accepting unauthenticated request (test mode)')
    return true
  }
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(auth.slice(7).trim()), Buffer.from(secret))
  } catch {
    return false
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await params
  const envelope = await fetchBriefEnvelopeByToken(token)
  if (!envelope) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(envelope)
}
