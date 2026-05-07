/**
 * GET /api/clickup/customers
 *
 * Returns the list of existing customer lists from the ClickUp
 * "Leaders Customers" folder. Used by the kickoff form's customer
 * picker so the team can either select an existing client or create
 * a brand new entry.
 *
 * Auth: requires a logged-in employee.
 *
 * Cache: 60s in-memory per Vercel function instance — tolerable
 * staleness in exchange for snappy form load.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listCustomerLists } from '@/lib/clickup/customer-tasks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

let cache: { fetchedAt: number; data: { id: string; name: string }[] } | null = null
const TTL_MS = 60 * 1000

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json({ customers: cache.data, cached: true })
  }
  try {
    const lists = await listCustomerLists()
    const data = lists
      .map((l) => ({ id: l.id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    cache = { fetchedAt: Date.now(), data }
    return NextResponse.json({ customers: data, cached: false })
  } catch (e) {
    console.error('[/api/clickup/customers] failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ClickUp fetch failed' },
      { status: 502 },
    )
  }
}
