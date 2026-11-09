import { describe, expect, it } from 'vitest'
import { summarizeBudget } from './budget'
import { csvCell, toCsv } from './csv'
import { formatMoney, parseMoney, toDecimal } from './money'
import { computeReportMetrics, formatRate, type ReportDeliverable } from './report-metrics'
import {
  CAMPAIGN_MACHINE, DELIVERABLE_MACHINE, PARTICIPATION_MACHINE, SELECTION_MACHINE, assertTransition, canTransition,
} from './state-machines'
import { formatDateTime, jerusalemDate, jerusalemLocalToUtc, jerusalemOffsetMinutes, toJerusalemInput } from './time'

describe('money', () => {
  it('parses exactly without floats', () => {
    expect(parseMoney('0.10')).toBe(BigInt(10))
    expect(parseMoney('1,234.5')).toBe(BigInt(123450))
    expect(parseMoney('0.1')! + parseMoney('0.2')!).toBe(BigInt(30))
    expect(toDecimal(BigInt(123456))).toBe('1234.56')
    expect(formatMoney(BigInt(123456789), 'ILS')).toBe('₪1,234,567.89')
    expect(() => parseMoney('12.345')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
    expect(parseMoney('')).toBeNull()
  })
})

describe('budget (test 20: a commitment and the expense replacing it are not double counted)', () => {
  it('counts each line once, in its current status', () => {
    const lines = [
      { amount: '10000.00', status: 'committed' as const, category: 'influencers' as const },
      // the same cost item after it was paid: status moved in place to actual
      { amount: '5000.00', status: 'actual' as const, category: 'influencers' as const },
      { amount: '2000.00', status: 'planned' as const, category: 'production' as const },
      { amount: '9999.00', status: 'cancelled' as const, category: 'misc' as const },
    ]
    const s = summarizeBudget('20000', lines)
    expect(s.committed).toBe(BigInt(1_000_000))
    expect(s.actual).toBe(BigInt(500_000))
    expect(s.exposure).toBe(BigInt(1_500_000))
    expect(s.available).toBe(BigInt(500_000))
    expect(s.availableAfterPlanned).toBe(BigInt(300_000))
    expect(s.overrun).toBe(BigInt(0))
    expect(s.byCategory.misc).toEqual({ planned: BigInt(0), committed: BigInt(0), actual: BigInt(0) })
  })

  it('reports overrun and handles a missing approved budget', () => {
    const s = summarizeBudget('1000', [{ amount: '1500', status: 'actual', category: 'shipping' }])
    expect(s.overrun).toBe(BigInt(50_000))
    expect(s.available).toBe(-BigInt(50_000))
    const n = summarizeBudget(null, [{ amount: '1', status: 'committed', category: 'misc' }])
    expect(n.available).toBeNull()
    expect(n.overrun).toBe(BigInt(0))
  })
})

describe('state machines', () => {
  it('campaign cannot jump from draft to closed', () => {
    expect(canTransition(CAMPAIGN_MACHINE, 'draft', 'closed')).toBe(false)
    expect(() => assertTransition(CAMPAIGN_MACHINE, 'closed', 'active', 'קמפיין')).toThrow(/לא ניתן/)
  })
  it('client approval of a creator is separate from the creator accepting', () => {
    expect(canTransition(SELECTION_MACHINE, 'client_review', 'approved')).toBe(true)
    expect(canTransition(PARTICIPATION_MACHINE, 'not_invited', 'accepted')).toBe(false)
    expect(canTransition(PARTICIPATION_MACHINE, 'invited', 'accepted')).toBe(true)
  })
  it('content cannot skip review or be verified before it is reported', () => {
    expect(canTransition(DELIVERABLE_MACHINE, 'submitted', 'approved')).toBe(false)
    expect(canTransition(DELIVERABLE_MACHINE, 'approved', 'publication_verified')).toBe(false)
    expect(canTransition(DELIVERABLE_MACHINE, 'publication_verified', 'submitted')).toBe(false)
  })
})

describe('time zone Asia/Jerusalem', () => {
  it('uses +2 in winter and +3 in summer', () => {
    expect(jerusalemOffsetMinutes(new Date('2026-01-15T10:00:00Z'))).toBe(120)
    expect(jerusalemOffsetMinutes(new Date('2026-07-15T10:00:00Z'))).toBe(180)
  })
  it('round-trips wall clock times across the year', () => {
    for (const local of ['2026-01-15T09:30', '2026-07-15T23:59', '2026-10-30T00:00', '2026-03-31T12:00']) {
      expect(toJerusalemInput(jerusalemLocalToUtc(local))).toBe(local)
    }
  })
  it('converts summer and winter evenings correctly', () => {
    expect(jerusalemLocalToUtc('2026-07-15T20:00').toISOString()).toBe('2026-07-15T17:00:00.000Z')
    expect(jerusalemLocalToUtc('2026-12-15T20:00').toISOString()).toBe('2026-12-15T18:00:00.000Z')
    // 23:30 Israel on Jan 1 is still Jan 1 there, though Dec 31 21:30 UTC
    expect(jerusalemDate(new Date('2026-01-01T21:30:00Z'))).toBe('2026-01-01')
    expect(formatDateTime('2026-07-15T17:00:00Z')).toContain('20:00')
  })
  it('handles the DST transition days without throwing and monotonically', () => {
    // scan every hour of 2026 to find both transition points and check sanity
    let changes = 0
    let prev = jerusalemOffsetMinutes(new Date('2026-01-01T00:00:00Z'))
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000) {
      const off = jerusalemOffsetMinutes(new Date(t))
      if (off !== prev) changes++
      prev = off
    }
    expect(changes).toBe(2)
  })
  it('moves a nonexistent spring-forward time past the gap and picks summer time for the repeated hour', () => {
    // 2026-03-27 02:00 → 03:00 and 2026-10-25 02:00 → 01:00 in Israel
    expect(toJerusalemInput(jerusalemLocalToUtc('2026-03-27T02:30'))).toBe('2026-03-27T03:30')
    expect(jerusalemLocalToUtc('2026-10-25T01:30').toISOString()).toBe('2026-10-24T22:30:00.000Z')
  })
})

describe('CSV (test 24: Hebrew and dangerous input)', () => {
  it('escapes, keeps Hebrew, and defuses formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+972501234567')).toBe("'+972501234567")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell('שלום, "עולם"\nשורה')).toBe('"שלום, ""עולם""\nשורה"')
    expect(csvCell(null)).toBe('')
    const out = toCsv(['שם', 'ערך'], [['דנה', 3], ['=1+1', null]])
    expect(out.startsWith('\uFEFF')).toBe(true)
    expect(out).toBe('\uFEFFשם,ערך\r\nדנה,3\r\n\'=1+1,\r\n')
  })
})

const D = (iso: string) => new Date(iso)
const base = (over: Partial<ReportDeliverable>): ReportDeliverable => ({
  id: Math.random().toString(36),
  status: 'awaiting_submission',
  submissionDueAt: null, publicationDueAt: null, firstSubmittedAt: null,
  submissionBreachedAt: null, publicationBreachedAt: null, publication: null, metrics: [],
  ...over,
})

describe('report metrics (tests 21, 22, 23)', () => {
  const p = { start: D('2026-11-01T00:00:00Z'), end: D('2026-11-30T00:00:00Z'), asOf: D('2026-11-20T00:00:00Z') }

  it('denominator zero is "not relevant", not 0% or NaN', () => {
    const m = computeReportMetrics([], [], p)
    expect(m.submission.rate).toBeNull()
    expect(m.publication.rate).toBeNull()
    expect(m.coverage.rate).toBeNull()
    expect(formatRate(m.submission.rate)).toBe('לא רלוונטי')
  })

  it('cancelled deliverables never enter a denominator', () => {
    const m = computeReportMetrics([
      base({ status: 'cancelled', submissionDueAt: D('2026-11-05T10:00:00Z') }),
      base({ status: 'submitted', submissionDueAt: D('2026-11-05T10:00:00Z'), firstSubmittedAt: D('2026-11-04T10:00:00Z') }),
    ], [], p)
    expect(m.cancelled).toBe(1)
    expect(m.submission.due).toBe(1)
    expect(m.submission.rate).toBe(1)
  })

  it('future deadlines are not yet relevant', () => {
    const m = computeReportMetrics([base({ submissionDueAt: D('2026-11-25T10:00:00Z') })], [], p)
    expect(m.submission.due).toBe(0)
  })

  it('a recorded breach stays late even if the deadline was moved later (test 23)', () => {
    const m = computeReportMetrics([
      base({
        status: 'submitted',
        submissionDueAt: D('2026-11-10T10:00:00Z'), // moved from Nov 5 after it passed
        firstSubmittedAt: D('2026-11-08T10:00:00Z'),
        submissionBreachedAt: D('2026-11-05T10:00:00Z'),
      }),
    ], [], p)
    expect(m.submission.onTime).toBe(0)
    expect(m.submission.late).toBe(1)
  })

  it('missing metric is distinct from zero (test 21)', () => {
    const pub = { verificationStatus: 'verified' as const, actualPublishedAt: D('2026-11-06T10:00:00Z'), reportedPublishedAt: null }
    const zeroLikes = base({ status: 'publication_verified', publication: pub,
      metrics: [{ name: 'likes', value: 0, capturedAt: D('2026-11-07T00:00:00Z'), sourceType: 'manager_entered', hasEvidence: true }] })
    const missing = base({ status: 'publication_verified', publication: pub, metrics: [] })
    const m = computeReportMetrics([zeroLikes, missing], [], p)
    expect(m.totals.likes).toEqual({ sum: 0, deliverables: 1 })
    expect(m.totals.views).toEqual({ sum: 0, deliverables: 0 })
    expect(m.coverage).toEqual({ published: 2, withMetrics: 1, rate: 0.5 })
  })

  it('verified publication without actual time is missing data, not success', () => {
    const m = computeReportMetrics([
      base({ status: 'publication_verified', publicationDueAt: D('2026-11-10T00:00:00Z'),
        publication: { verificationStatus: 'verified', actualPublishedAt: null, reportedPublishedAt: D('2026-11-09T00:00:00Z') } }),
    ], [], p)
    expect(m.publication.verifiedOnTime).toBe(0)
    expect(m.publication.missingTime).toBe(1)
    expect(m.publication.rate).toBe(0)
  })

  it('computes approval waiting time from the timeline', () => {
    const m = computeReportMetrics([], [
      { submittedAt: D('2026-11-01T00:00:00Z'), internalDecidedAt: D('2026-11-01T10:00:00Z'), internalApproved: true, clientDecidedAt: D('2026-11-02T10:00:00Z'), superseded: false },
      { submittedAt: D('2026-11-19T00:00:00Z'), internalDecidedAt: null, internalApproved: false, clientDecidedAt: null, superseded: false },
      { submittedAt: D('2026-10-01T00:00:00Z'), internalDecidedAt: null, internalApproved: false, clientDecidedAt: null, superseded: true },
    ], p)
    expect(m.waits.internal).toEqual({ decided: 1, avgHours: 10, pending: 1, maxPendingHours: 24 })
    expect(m.waits.client).toEqual({ decided: 1, avgHours: 24, pending: 0, maxPendingHours: null })
  })
})
