import { portal } from '@/lib/campaigns/http'
import { portalHome } from '@/lib/campaigns/services/portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal((ctx) => portalHome(ctx))
