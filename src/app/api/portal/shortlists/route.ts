import { portal } from '@/lib/campaigns/http'
import { clientShortlists } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal(async (ctx) => ({ shortlists: await clientShortlists(ctx) }))
