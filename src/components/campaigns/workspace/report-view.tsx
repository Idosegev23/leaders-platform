/** Report body shared by the internal tab, the print view and the client portal (server- or client-rendered). */
import { HE_METRIC, METRIC_NAMES, formatRate } from '@/lib/campaigns/domain/report-metrics'
import { formatDate, formatDateTime } from '@/lib/campaigns/domain/time'
import { heStatus } from '@/lib/campaigns/domain/state-machines'
import type { CampaignReport } from '@/lib/campaigns/services/reporting'

const hrs = (h: number | null) => (h === null ? 'לא רלוונטי' : h < 48 ? `${Math.round(h)} שעות` : `${Math.round(h / 24)} ימים`)

export function ReportView({ report }: { report: CampaignReport }) {
  const m = report.metrics
  const shownMetrics = METRIC_NAMES.filter((n) => m.totals[n].deliverables > 0)
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h2 className="text-lg font-bold">{report.campaign.name}</h2>
        <p className="text-wizard-text-secondary">{report.campaign.clientName} · {formatDate(report.campaign.startDate)} – {formatDate(report.campaign.endDate)} · עודכן {formatDateTime(report.generatedAt)}</p>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="משתתפים (נבחרו)" value={report.participants.total} hint={`${report.participants.accepted} אישרו השתתפות`} />
        <Box label="תוצרים מתוכננים" value={m.planned} hint={`${m.cancelled} בוטלו`} />
        <Box label="הוגשו / אושרו" value={`${m.submitted} / ${m.approved}`} />
        <Box label="פרסום אומת" value={m.publicationVerified} hint={`${m.publicationReported} ממתינים לאימות`} />
        <Box label="הגשה בזמן" value={formatRate(m.submission.rate)} hint={`${m.submission.onTime} מתוך ${m.submission.due} שמועדם עבר`} />
        <Box label="פרסום מאומת בזמן" value={formatRate(m.publication.rate)} hint={`${m.publication.verifiedOnTime} מתוך ${m.publication.due}`} />
        <Box label="כיסוי נתוני ביצועים" value={formatRate(m.coverage.rate)} hint={`${m.coverage.withMetrics} מתוך ${m.coverage.published} פרסומים`} />
        <Box label="זמן ממוצע לאישור" value={hrs(m.waits.internal.avgHours)} hint={`לקוח: ${hrs(m.waits.client.avgHours)} · ממתינים: ${m.waits.internal.pending + m.waits.client.pending}`} />
      </section>

      {shownMetrics.length > 0 && (
        <section>
          <h3 className="mb-1 font-bold">ביצועים מצטברים</h3>
          <p className="mb-2 text-xs text-wizard-text-secondary">כל מדד מוצג בנפרד ואינו מאוחד עם מדד אחר (צפיות ≠ חשיפות ≠ Reach). Reach הוא סכום לפי פרסום ואינו ייחודי. נתון שלא הוזן אינו נספר כאפס.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shownMetrics.map((n) => <Box key={n} label={HE_METRIC[n]} value={m.totals[n].sum.toLocaleString('he-IL')} hint={`מתוך ${m.totals[n].deliverables} תוצרים עם נתון`} />)}
          </div>
        </section>
      )}

      {report.budget && (
        <section>
          <h3 className="mb-1 font-bold">תקציב (פנימי) · {report.campaign.amountsIncludeVat ? 'כולל מע״מ' : 'לפני מע״מ'}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Box label="מאושר" value={report.budget.approved ?? '—'} /><Box label="התחייבויות פתוחות" value={report.budget.committed} />
            <Box label="הוצאות בפועל" value={report.budget.actual} /><Box label="יתרה זמינה" value={report.budget.available ?? '—'} /><Box label="חריגה" value={report.budget.overrun} />
          </div>
        </section>
      )}

      {report.exceptions.length > 0 && (
        <section>
          <h3 className="mb-1 font-bold">חריגות ונתונים חסרים</h3>
          <ul className="list-disc pe-5">{report.exceptions.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </section>
      )}
      {report.summaryNotes && <section><h3 className="mb-1 font-bold">הערות סיכום</h3><p className="whitespace-pre-wrap">{report.summaryNotes}</p></section>}

      <section>
        <h3 className="mb-2 font-bold">לפי יוצר ותוצר</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="bg-brand-pearl/60 text-right">
              <tr>
                <th scope="col" className="p-1.5">יוצר/ת</th><th scope="col" className="p-1.5">תוצר</th><th scope="col" className="p-1.5">סטטוס</th>
                <th scope="col" className="p-1.5">הגשה</th><th scope="col" className="p-1.5">פרסום</th><th scope="col" className="p-1.5">קישור</th>
                {shownMetrics.map((n) => <th key={n} scope="col" className="p-1.5">{HE_METRIC[n]}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.deliverableId} className="border-t border-wizard-border">
                  <td className="p-1.5">{r.creatorName}</td><td className="p-1.5">{r.title}</td><td className="p-1.5">{heStatus(r.status)}</td>
                  <td className="p-1.5">{r.firstSubmittedAt ? `${formatDateTime(r.firstSubmittedAt)}${r.submittedLate ? ' (באיחור)' : ''}` : '—'}</td>
                  <td className="p-1.5">{r.actualPublishedAt ? formatDateTime(r.actualPublishedAt) : r.publishedUrl ? 'דווח, טרם אומת' : '—'}</td>
                  <td className="p-1.5">{r.publishedUrl ? <a className="text-brand-primary underline" href={r.publishedUrl} target="_blank" rel="noreferrer noopener">פתיחה</a> : '—'}</td>
                  {shownMetrics.map((n) => <td key={n} className="p-1.5">{r.metrics[n] === undefined ? <span className="text-wizard-text-tertiary">חסר</span> : r.metrics[n]!.toLocaleString('he-IL')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-xs text-wizard-text-secondary">
        <h3 className="mb-1 font-bold text-foreground">איך חושב</h3>
        <ul className="list-disc space-y-0.5 pe-5">
          <li>תוצר נכלל במדד מועד כשאינו מבוטל ומועדו בתוך תקופת הקמפיין ועד היום. מועדים עתידיים אינם נכללים עדיין.</li>
          <li>הגשה בזמן: הגשה ראשונה עד המועד, ללא איחור מתועד. איחור שנרשם נשאר גם אם המועד הוזז אחר כך.</li>
          <li>פרסום מאומת בזמן: פרסום שאומת ושעת הפרסום בפועל עד המועד. פרסום מאומת בלי שעה ידועה נספר כנתון חסר, לא כהצלחה.</li>
          <li>כשאין תוצרים רלוונטיים, מוצג &quot;לא רלוונטי&quot; במקום אחוז.</li>
          <li>זמני אישור מחושבים מהיסטוריית ההחלטות: מהגשה להחלטה פנימית, ומאישור פנימי להחלטת הלקוח.</li>
        </ul>
      </section>
    </div>
  )
}

function Box({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-wizard-border bg-white p-2.5 print:break-inside-avoid">
      <div className="text-xs text-wizard-text-secondary">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-wizard-text-secondary">{hint}</div>}
    </div>
  )
}
