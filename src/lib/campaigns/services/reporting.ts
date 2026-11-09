/**
 * Summary report. Numbers come from domain/report-metrics.ts (pure, tested);
 * this file only loads data and shapes it per audience:
 *   internal → everything incl. budget and commitments
 *   client   → no fees, no budget, no internal notes
 * A client sees only a SNAPSHOT that a manager published, never live data.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { notFound } from '../errors'
import { requireCampaign, requireClientCampaign, requireInternal, requirePortal } from '../auth/policy'
import {
  HE_METRIC, METRIC_NAMES, computeReportMetrics, formatRate, type ApprovalTimeline, type MetricName, type ReportDeliverable, type ReportMetrics,
} from '../domain/report-metrics'
import { summarizeBudget, HE_CATEGORY, type BudgetCategory } from '../domain/budget'
import { formatMoney } from '../domain/money'
import { toCsv } from '../domain/csv'
import { formatDate, formatDateTime, jerusalemLocalToUtc } from '../domain/time'
import { heStatus } from '../domain/state-machines'
import { parseInput, zOptText } from '../validation'

export interface ReportRow {
  deliverableId: string; creatorName: string; title: string; platform: string; type: string; status: string
  submissionDueAt: string | null; firstSubmittedAt: string | null; submittedLate: boolean | null
  publicationDueAt: string | null; publishedUrl: string | null; actualPublishedAt: string | null; verification: string | null
  metrics: Partial<Record<MetricName, number>>; metricsSource: string | null; metricsCapturedAt: string | null
}

export interface CampaignReport {
  audience: 'internal' | 'client'
  generatedAt: string
  campaign: { id: string; name: string; clientName: string; status: string; startDate: string | null; endDate: string | null; currency: string; amountsIncludeVat: boolean }
  participants: { total: number; accepted: number; declined: number; cancelled: number }
  metrics: ReportMetrics
  rows: ReportRow[]
  budget: null | { approved: string | null; planned: string; committed: string; actual: string; exposure: string; available: string | null; overrun: string; byCategory: Record<string, { planned: string; committed: string; actual: string }> }
  exceptions: string[]
  summaryNotes: string | null
}

async function loadReport(db: Queryable, campaignId: string, audience: 'internal' | 'client', now: Date): Promise<CampaignReport> {
  const c = await one<{ id: string; name: string; client_name: string; status: string; start_date: string | null; end_date: string | null
    currency: string; amounts_include_vat: boolean; approved_budget: string | null; closed_with_exceptions: boolean; status_reason: string | null }>(db,
    `select c.id, c.name, cl.name as client_name, c.status, to_char(c.start_date,'YYYY-MM-DD') as start_date,
            to_char(c.end_date,'YYYY-MM-DD') as end_date, c.currency, c.amounts_include_vat, c.approved_budget::text,
            c.closed_with_exceptions, c.status_reason
       from cm_campaigns c join cm_clients cl on cl.id = c.client_id where c.id = $1`, [campaignId])
  if (!c) throw notFound('הקמפיין')
  const parts = await one<{ total: number; accepted: number; declined: number; cancelled: number }>(db,
    `select count(*) filter (where selection_status = 'approved')::int as total,
            count(*) filter (where participation_status in ('accepted','active','completed'))::int as accepted,
            count(*) filter (where participation_status = 'declined')::int as declined,
            count(*) filter (where participation_status = 'cancelled')::int as cancelled
       from cm_participations where campaign_id = $1`, [campaignId])
  const ds = await many<{
    id: string; creator_name: string; title: string; platform: string; type: string; status: string
    submission_due_at: Date | null; publication_due_at: Date | null; first_submitted_at: Date | null
    submission_breached_at: Date | null; publication_breached_at: Date | null
    published_url: string | null; verification_status: 'reported' | 'verified' | 'rejected' | null
    actual_published_at: Date | null; reported_published_at: Date | null
  }>(db,
    `select d.id, cr.display_name as creator_name, d.title, d.platform, d.type, d.status, d.submission_due_at, d.publication_due_at,
            d.first_submitted_at, d.submission_breached_at, d.publication_breached_at,
            pub.published_url, pub.verification_status, pub.actual_published_at, pub.reported_published_at
       from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
       left join cm_publications pub on pub.deliverable_id = d.id
      where d.campaign_id = $1 order by cr.display_name, d.submission_due_at nulls last`, [campaignId])
  // Latest observation per (deliverable, metric). Missing stays missing.
  const ms = await many<{ deliverable_id: string; metric_name: MetricName; metric_value: string; captured_at: Date; source_type: string; has_evidence: boolean }>(db,
    `select distinct on (deliverable_id, metric_name) deliverable_id, metric_name, metric_value::text, captured_at, source_type,
            evidence_asset_id is not null as has_evidence
       from cm_metric_observations where campaign_id = $1 order by deliverable_id, metric_name, captured_at desc, created_at desc`, [campaignId])
  const tl = await many<{ submitted_at: Date; internal_at: Date | null; internal_decision: string | null; client_at: Date | null; superseded: boolean }>(db,
    `select v.submitted_at,
            (select a.decided_at from cm_approval_decisions a where a.target_type = 'content_version' and a.target_id = v.id and a.approval_stage = 'internal') as internal_at,
            (select a.decision from cm_approval_decisions a where a.target_type = 'content_version' and a.target_id = v.id and a.approval_stage = 'internal') as internal_decision,
            (select a.decided_at from cm_approval_decisions a where a.target_type = 'content_version' and a.target_id = v.id and a.approval_stage = 'client') as client_at,
            (d.current_version_id is distinct from v.id and not exists (select 1 from cm_approval_decisions a where a.target_type = 'content_version' and a.target_id = v.id)) as superseded
       from cm_content_versions v join cm_deliverables d on d.id = v.deliverable_id where d.campaign_id = $1 and d.status <> 'cancelled'`, [campaignId])

  const reportDs: ReportDeliverable[] = ds.map((d) => ({
    id: d.id, status: d.status, submissionDueAt: d.submission_due_at, publicationDueAt: d.publication_due_at,
    firstSubmittedAt: d.first_submitted_at, submissionBreachedAt: d.submission_breached_at, publicationBreachedAt: d.publication_breached_at,
    publication: d.verification_status ? { verificationStatus: d.verification_status, actualPublishedAt: d.actual_published_at, reportedPublishedAt: d.reported_published_at } : null,
    metrics: ms.filter((m) => m.deliverable_id === d.id).map((m) => ({ name: m.metric_name, value: Number(m.metric_value), capturedAt: m.captured_at, sourceType: m.source_type, hasEvidence: m.has_evidence })),
  }))
  const timelines: ApprovalTimeline[] = tl.map((t) => ({
    submittedAt: t.submitted_at, internalDecidedAt: t.internal_at, internalApproved: t.internal_decision === 'approved', clientDecidedAt: t.client_at, superseded: t.superseded,
  }))
  const period = {
    start: c.start_date ? jerusalemLocalToUtc(`${c.start_date}T00:00:00`) : null,
    end: c.end_date ? jerusalemLocalToUtc(`${c.end_date}T23:59:59`) : null,
    asOf: now,
  }
  const metrics = computeReportMetrics(reportDs, timelines, period)

  const rows: ReportRow[] = ds.map((d) => {
    const mine = ms.filter((m) => m.deliverable_id === d.id)
    const latest = mine.reduce<Date | null>((acc, m) => (!acc || m.captured_at > acc ? m.captured_at : acc), null)
    return {
      deliverableId: d.id, creatorName: d.creator_name, title: d.title, platform: d.platform, type: d.type, status: d.status,
      submissionDueAt: d.submission_due_at?.toISOString() ?? null, firstSubmittedAt: d.first_submitted_at?.toISOString() ?? null,
      submittedLate: d.first_submitted_at ? !!d.submission_breached_at || (!!d.submission_due_at && d.first_submitted_at > d.submission_due_at) : null,
      publicationDueAt: d.publication_due_at?.toISOString() ?? null, publishedUrl: d.verification_status === 'rejected' ? null : d.published_url,
      actualPublishedAt: d.actual_published_at?.toISOString() ?? null, verification: d.verification_status,
      metrics: Object.fromEntries(mine.map((m) => [m.metric_name, Number(m.metric_value)])),
      metricsSource: Array.from(new Set(mine.map((m) => m.source_type))).join(', ') || null,
      metricsCapturedAt: latest?.toISOString() ?? null,
    }
  })

  let budget: CampaignReport['budget'] = null
  if (audience === 'internal') {
    const lines = await many<{ amount: string; status: 'planned' | 'committed' | 'actual' | 'cancelled'; category: BudgetCategory }>(db,
      `select amount::text, status, category from cm_budget_lines where campaign_id = $1`, [campaignId])
    const s = summarizeBudget(c.approved_budget, lines)
    const f = (v: bigint | null) => (v === null ? null : formatMoney(v, c.currency))
    budget = {
      approved: f(s.approved), planned: f(s.planned)!, committed: f(s.committed)!, actual: f(s.actual)!, exposure: f(s.exposure)!,
      available: f(s.available), overrun: f(s.overrun)!,
      byCategory: Object.fromEntries(Object.entries(s.byCategory).map(([k, b]) => [HE_CATEGORY[k as BudgetCategory], { planned: f(b.planned)!, committed: f(b.committed)!, actual: f(b.actual)! }])),
    }
  }

  const exceptions: string[] = []
  if (metrics.submission.late + metrics.submission.notSubmittedOverdue > 0) exceptions.push(`${metrics.submission.late + metrics.submission.notSubmittedOverdue} תוצרים הוגשו באיחור או לא הוגשו במועד`)
  if (metrics.publication.awaitingVerification > 0) exceptions.push(`${metrics.publication.awaitingVerification} פרסומים דווחו וטרם אומתו`)
  if (metrics.publication.missingTime > 0) exceptions.push(`${metrics.publication.missingTime} פרסומים מאומתים ללא מועד פרסום ידוע`)
  if (metrics.coverage.published > metrics.coverage.withMetrics) exceptions.push(`ל-${metrics.coverage.published - metrics.coverage.withMetrics} פרסומים אין נתוני ביצועים`)
  if (metrics.cancelled > 0) exceptions.push(`${metrics.cancelled} תוצרים בוטלו`)
  if (audience === 'internal' && budget && budget.overrun !== formatMoney(BigInt(0), c.currency)) exceptions.push(`חריגה מהתקציב: ${budget.overrun}`)
  if (c.closed_with_exceptions) exceptions.push(`הקמפיין נסגר עם חריגות: ${c.status_reason ?? ''}`)

  return {
    audience, generatedAt: now.toISOString(),
    campaign: { id: c.id, name: c.name, clientName: c.client_name, status: c.status, startDate: c.start_date, endDate: c.end_date, currency: c.currency, amountsIncludeVat: c.amounts_include_vat },
    participants: parts!, metrics, rows, budget, exceptions, summaryNotes: null,
  }
}

export async function getInternalReport(ctx: Ctx, campaignId: string): Promise<CampaignReport> {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  return loadReport(ctx.db, campaignId, 'internal', ctx.now)
}

export function reportToCsv(r: CampaignReport): string {
  const header = ['יוצר/ת', 'תוצר', 'פלטפורמה', 'סטטוס', 'מועד הגשה', 'הוגש לראשונה', 'הגשה באיחור', 'מועד פרסום', 'קישור פרסום',
    'פורסם בפועל', 'אימות', ...METRIC_NAMES.map((m) => HE_METRIC[m]), 'מקור הנתונים', 'נאסף ב']
  const rows = r.rows.map((x) => [
    x.creatorName, x.title, x.platform, heStatus(x.status), formatDateTime(x.submissionDueAt), formatDateTime(x.firstSubmittedAt),
    x.submittedLate === null ? '' : x.submittedLate ? 'כן' : 'לא', formatDateTime(x.publicationDueAt), x.publishedUrl ?? '',
    formatDateTime(x.actualPublishedAt), x.verification ? heStatus(x.verification) : '',
    // missing metric → empty cell, never 0
    ...METRIC_NAMES.map((m) => (x.metrics[m] === undefined ? null : x.metrics[m])),
    x.metricsSource ?? '', formatDateTime(x.metricsCapturedAt),
  ])
  const m = r.metrics
  const summary: (string | number | null)[][] = [
    [], ['סיכום'],
    ['קמפיין', r.campaign.name], ['לקוח', r.campaign.clientName], ['תקופה', `${formatDate(r.campaign.startDate)} – ${formatDate(r.campaign.endDate)}`],
    ['תוצרים מתוכננים', m.planned], ['בוטלו', m.cancelled], ['הוגשו', m.submitted], ['אושרו', m.approved], ['פרסום אומת', m.publicationVerified],
    ['שיעור הגשה בזמן', formatRate(m.submission.rate)], ['שיעור פרסום מאומת בזמן', formatRate(m.publication.rate)],
    ['כיסוי נתוני ביצועים', `${m.coverage.withMetrics}/${m.coverage.published} (${formatRate(m.coverage.rate)})`],
    ...(r.budget ? [['תקציב מאושר', r.budget.approved ?? '—'], ['התחייבויות פתוחות', r.budget.committed], ['הוצאות בפועל', r.budget.actual], ['יתרה זמינה', r.budget.available ?? '—']] : []),
    ['עודכן', formatDateTime(r.generatedAt)],
  ]
  return toCsv(header, [...rows, ...summary])
}

// ── Snapshots for the client ───────────────────────────────────────────────

export async function createReportSnapshot(ctx: Ctx, campaignId: string, input: unknown) {
  await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const actor = requireInternal(ctx.actor)
  const v = parseInput(z.object({ audience: z.enum(['internal', 'client']), summary_notes: zOptText(5000), publish_to_client: z.boolean().default(false) }), input)
  const report = await loadReport(ctx.db, campaignId, v.audience, ctx.now)
  report.summaryNotes = v.summary_notes
  return withTx(async (tx) => {
    const s = await one<{ id: string }>(tx,
      `insert into cm_report_snapshots (campaign_id, audience, data, summary_notes, created_by, published_to_client_at)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [campaignId, v.audience, report, v.summary_notes, actor.userId, v.audience === 'client' && v.publish_to_client ? ctx.now : null])
    await audit(tx, ctx, { campaignId, entityType: 'report', entityId: s!.id, action: 'report.snapshot_created',
      summary: v.audience === 'client' && v.publish_to_client ? 'דוח פורסם ללקוח' : `נשמר דוח (${v.audience === 'client' ? 'גרסת לקוח' : 'פנימי'})` })
    return { id: s!.id }
  }, ctx.db)
}

export async function listReportSnapshots(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  return many(ctx.db, `select s.id, s.audience, s.summary_notes, s.created_at, s.published_to_client_at, u.full_name as created_by_name
    from cm_report_snapshots s left join cm_accounts u on u.id = s.created_by where s.campaign_id = $1 order by s.created_at desc`, [campaignId])
}

export async function getSnapshot(ctx: Ctx, snapshotId: string): Promise<CampaignReport & { snapshotId: string }> {
  if (ctx.actor.kind === 'portal') {
    const actor = requirePortal(ctx.actor)
    const own = await one<{ campaign_id: string }>(ctx.db, `select campaign_id from cm_report_snapshots where id = $1`, [snapshotId])
    if (!own) throw notFound('הדוח')
    await requireClientCampaign(ctx.db, actor, own.campaign_id)
    const s = await one<{ id: string; data: CampaignReport }>(ctx.db,
      `select id, data from cm_report_snapshots where id = $1 and campaign_id = $2 and audience = 'client' and published_to_client_at is not null`,
      [snapshotId, own.campaign_id])
    if (!s) throw notFound('הדוח')
    return { ...s.data, snapshotId: s.id }
  }
  const s = await one<{ id: string; campaign_id: string; data: CampaignReport }>(ctx.db, `select id, campaign_id, data from cm_report_snapshots where id = $1`, [snapshotId])
  if (!s) throw notFound('הדוח')
  await requireCampaign(ctx.db, ctx, s.campaign_id, 'operate')
  return { ...s.data, snapshotId: s.id }
}

export async function clientPublishedReports(ctx: Ctx, campaignId?: string | null) {
  const actor = requirePortal(ctx.actor)
  const camp = await requireClientCampaign(ctx.db, actor, campaignId)
  return many<{ id: string; published_to_client_at: Date }>(ctx.db, `select id, published_to_client_at from cm_report_snapshots
    where campaign_id = $1 and audience = 'client' and published_to_client_at is not null order by published_to_client_at desc`, [camp.id])
}
