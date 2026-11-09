import { portal } from '@/lib/campaigns/http'
import { portalParticipations } from '@/lib/campaigns/services/deliverables'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal((ctx) => portalParticipations(ctx))
