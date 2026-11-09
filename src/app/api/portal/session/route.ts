import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, clientKey, errorResponse, readJson } from '@/lib/campaigns/http'
import { getPool } from '@/lib/campaigns/db'
import { endPortalSession, redeemToken, SESSION_COOKIE } from '@/lib/campaigns/portal/access'
import { rateLimit } from '@/lib/campaigns/rate-limit'
import { moduleEnabled } from '@/lib/campaigns/runtime'
import { parseInput } from '@/lib/campaigns/validation'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Exchange an invitation/login token for a session cookie. POST only: email
 * link scanners that pre-fetch GET URLs cannot burn a single-use token, and
 * the token arrives from the URL fragment, so it is never in server logs.
 */
export async function POST(req: NextRequest) {
  try {
    if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
    assertSameOrigin(req)
    const now = new Date()
    await rateLimit(getPool(), `redeem:${clientKey(req)}`, 20, 600, now)
    const { token } = parseInput(z.object({ token: z.string().min(20).max(100) }), await readJson(req))
    const s = await redeemToken(getPool(), token, now)
    const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
    res.cookies.set(SESSION_COOKIE, s.sessionSecret, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: s.expiresAt,
    })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const secret = req.cookies.get(SESSION_COOKIE)?.value
    if (secret) await endPortalSession(getPool(), secret, new Date())
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
