/**
 * Local development only: sign in as one of the locally seeded users.
 * Disabled unless CAMPAIGNS_DEV_AUTH=true, NODE_ENV is not production and the
 * database is on localhost (see devAuthEnabled). No password exists.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPool, many } from '@/lib/campaigns/db'
import { DEV_USER_COOKIE, devAuthEnabled } from '@/lib/campaigns/runtime'
import { assertSameOrigin, errorResponse, readJson } from '@/lib/campaigns/http'
import { parseInput } from '@/lib/campaigns/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  if (!devAuthEnabled()) return new Response('not found', { status: 404 })
  const users = await many(getPool(), `select u.id, u.full_name, u.email, case when u.role = 'admin' then 'admin' else r.role end as role
    from users u left join cm_staff_roles r on r.user_id = u.id where u.role = 'admin' or r.role is not null order by u.full_name`)
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  if (!devAuthEnabled()) return new Response('not found', { status: 404 })
  try {
    assertSameOrigin(req)
    const { user_id } = parseInput(z.object({ user_id: z.string().uuid() }), await readJson(req))
    const res = NextResponse.json({ ok: true })
    res.cookies.set(DEV_USER_COOKIE, user_id, { httpOnly: true, sameSite: 'lax', path: '/' })
    return res
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(DEV_USER_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
