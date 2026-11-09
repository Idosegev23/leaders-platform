import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, errorResponse, json, readJson } from '@/lib/campaigns/http'
import { getPool } from '@/lib/campaigns/db'
import { setOrganizationStatus } from '@/lib/campaigns/services/admin'
import { currentStaff, moduleEnabled } from '@/lib/campaigns/runtime'
import { parseInput } from '@/lib/campaigns/validation'
import { DomainError } from '@/lib/campaigns/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: { orgId: string } }) {
  try {
    if (!moduleEnabled()) throw new DomainError('MODULE_DISABLED', 'השירות אינו זמין')
    assertSameOrigin(req)
    const s = await currentStaff()
    if (!s.account) throw new DomainError('UNAUTHENTICATED', 'נדרשת התחברות')
    const { status } = parseInput(z.object({ status: z.enum(['active', 'suspended']) }), await readJson(req))
    return json(await setOrganizationStatus(getPool(), s.account, params.orgId, status))
  } catch (e) {
    return errorResponse(e)
  }
}
