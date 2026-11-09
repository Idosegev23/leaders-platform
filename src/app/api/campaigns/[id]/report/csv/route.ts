import { internal } from '@/lib/campaigns/http'
import { getInternalReport, reportToCsv } from '@/lib/campaigns/services/reporting'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = internal(async (ctx, _req, p) => {
  const report = await getInternalReport(ctx, p.id)
  const name = `campaign-report-${report.campaign.id.slice(0, 8)}.csv`
  return new Response(reportToCsv(report), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  })
})
