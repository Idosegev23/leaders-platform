'use client'

import * as React from 'react'
import { api } from '../client-api'
import { Btn, Dialog, Field, Notice, Panel, TextArea, useAction } from '../ui'
import { ReportView } from './report-view'
import { formatDateTime } from '@/lib/campaigns/domain/time'
import type { CampaignReport } from '@/lib/campaigns/services/reporting'

type Snapshot = { id: string; audience: string; summary_notes: string | null; created_at: string; published_to_client_at: string | null; created_by_name: string | null }

export function ReportTab({ campaignId, report, snapshots, manage }: { campaignId: string; report: CampaignReport; snapshots: Snapshot[]; manage: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const { busy, run } = useAction()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/campaigns/${campaignId}/report/csv`} className="inline-flex h-10 items-center rounded-xl border border-wizard-border bg-white px-4 text-sm font-medium hover:bg-brand-pearl">ייצוא CSV</a>
        <a href={`/campaigns/${campaignId}/report/print`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl border border-wizard-border bg-white px-4 text-sm font-medium hover:bg-brand-pearl">תצוגת הדפסה</a>
        {manage && <Btn onClick={() => setOpen(true)}>פרסום דוח ללקוח</Btn>}
      </div>
      <Panel><ReportView report={report} /></Panel>
      {snapshots.length > 0 && (
        <Panel title="דוחות שנשמרו">
          <ul className="space-y-1 text-sm">
            {snapshots.map((s) => (
              <li key={s.id}>
                {formatDateTime(s.created_at)} · {s.audience === 'client' ? 'גרסת לקוח' : 'פנימי'} · {s.created_by_name ?? ''}
                {s.published_to_client_at ? ' · פורסם ללקוח' : ''}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="פרסום דוח ללקוח">
        <div className="space-y-3">
          <Notice>הלקוח יראה עותק קבוע של הדוח נכון לרגע זה, ללא תקציב, שכר והערות פנימיות. עדכונים מאוחרים יותר יחייבו פרסום חוזר.</Notice>
          <Field label="הערות סיכום (יוצגו ללקוח)" htmlFor="rep-notes"><TextArea id="rep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Btn busy={busy} onClick={async () => { if (await run(() => api(`/api/campaigns/${campaignId}/report/snapshots`, { body: { audience: 'client', summary_notes: notes, publish_to_client: true } }), { success: 'הדוח פורסם ללקוח' })) setOpen(false) }}>פרסום</Btn>
            <Btn tone="secondary" onClick={() => setOpen(false)}>ביטול</Btn>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
