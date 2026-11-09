/** Self sign-up of a new organization (BRIEFLOW_SELF_SIGNUP=true). The admin confirms by email. */
import { type NextRequest } from 'next/server'
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from '@/lib/campaigns/http'
import { getPool, withTx } from '@/lib/campaigns/db'
import { createOrganization } from '@/lib/campaigns/services/admin'
import { rateLimit } from '@/lib/campaigns/rate-limit'
import { appBaseUrl, moduleEnabled, selfSignupEnabled } from '@/lib/campaigns/runtime'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    if (!moduleEnabled() || !selfSignupEnabled()) throw new DomainError('MODULE_DISABLED', 'הרשמה עצמית אינה פתוחה')
    assertSameOrigin(req)
    const now = new Date()
    await rateLimit(getPool(), `signup:${clientKey(req)}`, 5, 3600, now)
    const body = await readJson(req)
    // The confirmation link is emailed only; it is not returned to the browser.
    await withTx((tx) => createOrganization(tx, { input: body, byAccount: null, signup: true, now, baseUrl: appBaseUrl() }))
    return json({ ok: true, message: 'נשלח קישור לאישור כתובת הדוא״ל. החשבון יופעל אחרי האישור.' }, 202)
  } catch (e) {
    return errorResponse(e)
  }
}
