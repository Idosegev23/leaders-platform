/** Platform admins (BRIEFLOW_PLATFORM_ADMINS): list and create organizations. */
import { type NextRequest } from 'next/server'
import { assertSameOrigin, errorResponse, json, readJson } from '@/lib/campaigns/http'
import { getPool, withTx } from '@/lib/campaigns/db'
import { createOrganization, listOrganizations } from '@/lib/campaigns/services/admin'
import { appBaseUrl, currentStaff, moduleEnabled } from '@/lib/campaigns/runtime'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function account() {
  if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
  const s = await currentStaff()
  if (!s.account) throw new DomainError('UNAUTHENTICATED', 'נדרשת התחברות')
  return s.account
}

export async function GET() {
  try {
    return json({ organizations: await listOrganizations(getPool(), await account()) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const acc = await account()
    const body = await readJson(req)
    const r = await withTx((tx) => createOrganization(tx, { input: body, byAccount: acc, signup: false, now: new Date(), baseUrl: appBaseUrl() }))
    return json(r, 201)
  } catch (e) {
    return errorResponse(e)
  }
}
