import { internal } from '@/lib/campaigns/http'
import { sendShortlistToClient } from '@/lib/campaigns/services/shortlists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = internal((ctx, _req, p) => sendShortlistToClient(ctx, p.sid))
