import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSnapshot } from '@/lib/campaigns/services/reporting'
import { ReportView } from '@/components/campaigns/workspace/report-view'
import { PrintButton } from '@/components/campaigns/print-button'
import { loadPortal, portalCtx } from '../../_server'

export const dynamic = 'force-dynamic'

export default async function PortalReportPage({ params }: { params: { sid: string } }) {
  const ctx = await portalCtx()
  if (!ctx) redirect('/portal')
  const report = await loadPortal(() => getSnapshot(ctx, params.sid))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between print:hidden"><Link href="/portal" className="text-xs text-wizard-text-secondary hover:underline">← חזרה</Link><PrintButton /></div>
      <div className="rounded-2xl border border-wizard-border bg-white p-4"><ReportView report={JSON.parse(JSON.stringify(report))} /></div>
    </div>
  )
}
