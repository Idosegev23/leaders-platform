/** Switch the active organization (must be an active membership). */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, errorResponse, readJson } from '@/lib/campaigns/http'
import { ACTIVE_ORG_COOKIE } from '@/lib/campaigns/auth/accounts'
import { currentStaff, moduleEnabled } from '@/lib/campaigns/runtime'
import { parseInput } from '@/lib/campaigns/validation'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
    assertSameOrigin(req)
    const { organization_id } = parseInput(z.object({ organization_id: z.string().uuid() }), await readJson(req))
    const staff = await currentStaff()
    if (!staff.account) throw new DomainError('UNAUTHENTICATED', 'נדרשת התחברות')
    if (!staff.memberships.some((m) => m.orgId === organization_id)) throw new DomainError('NOT_FOUND', 'הארגון לא נמצא או שאין לך גישה אליו')
    const res = NextResponse.json({ ok: true })
    res.cookies.set(ACTIVE_ORG_COOKIE, organization_id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
