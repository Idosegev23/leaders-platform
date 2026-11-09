/**
 * Staff sign-in: exchange a single-use link (from the URL fragment, sent by
 * POST) for a session cookie; DELETE signs out.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, clientKey, errorResponse, readJson } from '@/lib/campaigns/http'
import { getPool } from '@/lib/campaigns/db'
import { ACTIVE_ORG_COOKIE, STAFF_SESSION_COOKIE, endAccountSession, redeemLoginToken } from '@/lib/campaigns/auth/accounts'
import { rateLimit } from '@/lib/campaigns/rate-limit'
import { DEV_USER_COOKIE, moduleEnabled } from '@/lib/campaigns/runtime'
import { parseInput } from '@/lib/campaigns/validation'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }

export async function POST(req: NextRequest) {
  try {
    if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
    assertSameOrigin(req)
    const now = new Date()
    await rateLimit(getPool(), `staff-redeem:${clientKey(req)}`, 20, 600, now)
    const { token } = parseInput(z.object({ token: z.string().min(20).max(100) }), await readJson(req))
    const s = await redeemLoginToken(getPool(), token, now)
    const res = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
    res.cookies.set(STAFF_SESSION_COOKIE, s.sessionSecret, { ...cookieOpts, expires: s.expiresAt })
    if (s.orgId) res.cookies.set(ACTIVE_ORG_COOKIE, s.orgId, { ...cookieOpts, expires: s.expiresAt })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const secret = req.cookies.get(STAFF_SESSION_COOKIE)?.value
    if (secret) await endAccountSession(getPool(), secret, new Date())
    const res = NextResponse.json({ ok: true })
    for (const c of [STAFF_SESSION_COOKIE, ACTIVE_ORG_COOKIE, DEV_USER_COOKIE]) res.cookies.set(c, '', { path: '/', maxAge: 0 })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
