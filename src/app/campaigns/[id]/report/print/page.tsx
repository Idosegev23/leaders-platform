import { getInternalReport } from '@/lib/campaigns/services/reporting'
import { ReportView } from '@/components/campaigns/workspace/report-view'
import { PrintButton } from '@/components/campaigns/print-button'
import { load, pageCtx } from '../../../_server'

export const dynamic = 'force-dynamic'

export default async function ReportPrintPage({ params }: { params: { id: string } }) {
  const ctx = await pageCtx()
  const report = await load(() => getInternalReport(ctx, params.id))
  return (
    <div className="mx-auto max-w-4xl bg-white p-4 print:p-0">
      <div className="mb-4 flex justify-between print:hidden"><h1 className="text-xl font-bold">דוח סיכום (פנימי)</h1><PrintButton /></div>
      <ReportView report={JSON.parse(JSON.stringify(report))} />
    </div>
  )
}
