import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from '@/lib/campaigns/http'
import { getPool } from '@/lib/campaigns/db'
import { requestStaffLoginLink } from '@/lib/campaigns/auth/accounts'
import { moduleEnabled } from '@/lib/campaigns/runtime'
import { parseInput } from '@/lib/campaigns/validation'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Always the same answer, whether or not the address belongs to a member. */
export async function POST(req: NextRequest) {
  try {
    if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
    assertSameOrigin(req)
    const { email } = parseInput(z.object({ email: z.string().max(200) }), await readJson(req))
    await requestStaffLoginLink(getPool(), email, new Date(), clientKey(req))
    return json({ ok: true, message: 'אם הכתובת שייכת לחשבון פעיל, יישלח אליה קישור כניסה בדקות הקרובות.' }, 202)
  } catch (e) {
    return errorResponse(e)
  }
}
