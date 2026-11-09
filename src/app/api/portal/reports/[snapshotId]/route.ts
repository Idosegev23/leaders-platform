import { portal } from '@/lib/campaigns/http'
import { getSnapshot } from '@/lib/campaigns/services/reporting'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = portal((ctx, _req, p) => getSnapshot(ctx, p.snapshotId))
