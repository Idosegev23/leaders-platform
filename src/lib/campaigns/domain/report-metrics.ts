/**
 * Report formulas (pure, no I/O). Documented in docs/campaigns/architecture.md.
 *
 * Relevance: a deliverable counts for a deadline when it is not cancelled and
 * its deadline falls inside [periodStart, min(periodEnd, asOf)]. Deadlines in
 * the future are not yet relevant. Cancelled deliverables are reported as a
 * separate count and never enter a denominator.
 *
 * On-time submission  = first submission exists, no breach was ever recorded,
 *                       and first submission ≤ the deadline.
 * On-time publication = publication verified, actual publication time known,
 *                       no breach recorded, and actual time ≤ the deadline.
 *                       A verified publication without a known time is
 *                       "missing data", never a success.
 * Rate with denominator 0 → null ("לא רלוונטי").
 * Breach timestamps are written once and never cleared, so moving a deadline
 * after the fact cannot erase a late submission.
 */

export const METRIC_NAMES = ['views', 'impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'clicks'] as const
export type MetricName = (typeof METRIC_NAMES)[number]

export const HE_METRIC: Record<MetricName, string> = {
  views: 'צפיות', impressions: 'חשיפות (impressions)', reach: 'Reach (טווח הגעה)', likes: 'לייקים',
  comments: 'תגובות', shares: 'שיתופים', saves: 'שמירות', clicks: 'קליקים',
}

export interface MetricValue { name: MetricName; value: number; capturedAt: Date; sourceType: string; hasEvidence: boolean }

export interface ReportDeliverable {
  id: string
  status: string
  submissionDueAt: Date | null
  publicationDueAt: Date | null
  firstSubmittedAt: Date | null
  submissionBreachedAt: Date | null
  publicationBreachedAt: Date | null
  publication: null | {
    verificationStatus: 'reported' | 'verified' | 'rejected'
    actualPublishedAt: Date | null
    reportedPublishedAt: Date | null
  }
  /** Latest observation per metric name (absence = missing, not zero). */
  metrics: MetricValue[]
}

export interface ApprovalTimeline {
  submittedAt: Date
  internalDecidedAt: Date | null
  internalApproved: boolean
  clientDecidedAt: Date | null
  superseded: boolean
}

export interface Period { start: Date | null; end: Date | null; asOf: Date }

export interface ReportMetrics {
  planned: number
  cancelled: number
  active: number
  submitted: number
  approved: number
  publicationReported: number
  publicationVerified: number
  submission: { due: number; onTime: number; late: number; notSubmittedOverdue: number; rate: number | null }
  publication: { due: number; verifiedOnTime: number; verifiedLate: number; awaitingVerification: number; missingTime: number; notPublished: number; rate: number | null }
  coverage: { published: number; withMetrics: number; rate: number | null }
  totals: Record<MetricName, { sum: number; deliverables: number }>
  waits: {
    internal: { decided: number; avgHours: number | null; pending: number; maxPendingHours: number | null }
    client: { decided: number; avgHours: number | null; pending: number; maxPendingHours: number | null }
  }
}

export const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d)

const inPeriod = (t: Date | null, p: Period) => {
  if (!t) return false
  const end = p.end && p.end < p.asOf ? p.end : p.asOf
  return (!p.start || t >= p.start) && t <= end
}

const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000

function waitStats(items: { from: Date; to: Date | null }[], asOf: Date) {
  const decided = items.filter((i) => i.to)
  const pending = items.filter((i) => !i.to)
  const avg = decided.length ? decided.reduce((s, i) => s + hours(i.from, i.to as Date), 0) / decided.length : null
  const maxPending = pending.length ? Math.max(...pending.map((i) => hours(i.from, asOf))) : null
  return { decided: decided.length, avgHours: avg, pending: pending.length, maxPendingHours: maxPending }
}

const APPROVED_OR_LATER = new Set(['approved', 'publication_reported', 'publication_verified'])

export function computeReportMetrics(deliverables: ReportDeliverable[], timelines: ApprovalTimeline[], p: Period): ReportMetrics {
  const active = deliverables.filter((d) => d.status !== 'cancelled')

  const subDue = active.filter((d) => inPeriod(d.submissionDueAt, p))
  const subOnTime = subDue.filter(
    (d) => d.firstSubmittedAt && !d.submissionBreachedAt && d.firstSubmittedAt <= (d.submissionDueAt as Date),
  )
  const notSubmittedOverdue = subDue.filter((d) => !d.firstSubmittedAt)

  const pubDue = active.filter((d) => inPeriod(d.publicationDueAt, p))
  const verified = (d: ReportDeliverable) => d.status === 'publication_verified' && d.publication?.verificationStatus === 'verified'
  const pubOnTime = pubDue.filter(
    (d) => verified(d) && d.publication?.actualPublishedAt && !d.publicationBreachedAt &&
      d.publication.actualPublishedAt <= (d.publicationDueAt as Date),
  )
  const pubMissingTime = pubDue.filter((d) => verified(d) && !d.publication?.actualPublishedAt)
  const pubLate = pubDue.filter((d) => verified(d) && d.publication?.actualPublishedAt && !pubOnTime.includes(d))
  const awaitingVerification = pubDue.filter((d) => d.status === 'publication_reported')
  const notPublished = pubDue.filter((d) => !d.publication)

  const published = active.filter((d) => d.publication && d.publication.verificationStatus !== 'rejected')
  const withMetrics = published.filter((d) => d.metrics.length > 0)

  const totals = Object.fromEntries(METRIC_NAMES.map((m) => [m, { sum: 0, deliverables: 0 }])) as ReportMetrics['totals']
  for (const d of active) {
    for (const m of d.metrics) {
      totals[m.name].sum += m.value
      totals[m.name].deliverables += 1
    }
  }

  const live = timelines.filter((t) => !t.superseded)
  const internalWaits = live.map((t) => ({ from: t.submittedAt, to: t.internalDecidedAt }))
  const clientWaits = live
    .filter((t) => t.internalApproved && t.internalDecidedAt)
    .map((t) => ({ from: t.internalDecidedAt as Date, to: t.clientDecidedAt }))

  return {
    planned: deliverables.length,
    cancelled: deliverables.length - active.length,
    active: active.length,
    submitted: active.filter((d) => d.firstSubmittedAt).length,
    approved: active.filter((d) => APPROVED_OR_LATER.has(d.status)).length,
    publicationReported: active.filter((d) => d.status === 'publication_reported').length,
    publicationVerified: active.filter(verified).length,
    submission: {
      due: subDue.length,
      onTime: subOnTime.length,
      late: subDue.length - subOnTime.length - notSubmittedOverdue.length,
      notSubmittedOverdue: notSubmittedOverdue.length,
      rate: rate(subOnTime.length, subDue.length),
    },
    publication: {
      due: pubDue.length,
      verifiedOnTime: pubOnTime.length,
      verifiedLate: pubLate.length,
      awaitingVerification: awaitingVerification.length,
      missingTime: pubMissingTime.length,
      notPublished: notPublished.length,
      rate: rate(pubOnTime.length, pubDue.length),
    },
    coverage: { published: published.length, withMetrics: withMetrics.length, rate: rate(withMetrics.length, published.length) },
    totals,
    waits: { internal: waitStats(internalWaits, p.asOf), client: waitStats(clientWaits, p.asOf) },
  }
}

export function formatRate(r: number | null): string {
  return r === null ? 'לא רלוונטי' : `${Math.round(r * 1000) / 10}%`
}
