import { describe, it, expect } from 'vitest'
import {
  kickoffDocName,
  renderKickoffHtml,
  type KickoffDocPayload,
  type UploadKickoffDocInput,
} from './upload-kickoff-doc'

function payload(over: Partial<KickoffDocPayload> = {}): KickoffDocPayload {
  return {
    clientName: 'נטורל גלואו',
    meetingDate: '2026-07-01',
    participants: [{ name: 'Noa Sabagi', hebrewName: 'נועה סבגי', email: 'noa@leaders.co.il' }],
    creativeWriter: [{ name: 'Yoav Bogin', hebrewName: 'יואב בוגין', email: 'yoav@leaders.co.il' }],
    presenter: [],
    presentationMaker: [],
    accountManager: [],
    aboutBrand: 'מותג טיפוח טבעי',
    targetAudiences: 'נשים 28-45',
    goals: 'מודעות',
    insight: 'תובנה',
    strategy: 'אסטרטגיה',
    creative: 'קריאייטיב',
    creativeDeadline: '2026-07-10',
    internalDeadline: '2026-07-12',
    clientDeadline: '2026-07-15',
    ...over,
  }
}

const input = (over: Partial<UploadKickoffDocInput> = {}): UploadKickoffDocInput => ({
  payload: payload(),
  senderName: 'נועה סבגי',
  senderEmail: 'noa@leaders.co.il',
  completedAt: '2026-07-02T10:30:00.000Z',
  ...over,
})

describe('kickoffDocName', () => {
  it('is stable for the same client and day, so re-submits reuse one doc', () => {
    expect(kickoffDocName('נטורל גלואו', '2026-07-02T10:30:00.000Z'))
      .toBe('פגישת התנעה — נטורל גלואו — 2026-07-02')
    expect(kickoffDocName('נטורל גלואו', '2026-07-02T23:05:00.000Z'))
      .toBe(kickoffDocName('נטורל גלואו', '2026-07-02T10:30:00.000Z'))
  })
})

describe('renderKickoffHtml', () => {
  it('includes the client name, filled fields and the team', () => {
    const html = renderKickoffHtml(input())
    expect(html).toContain('נטורל גלואו')
    expect(html).toContain('על המותג')
    expect(html).toContain('מותג טיפוח טבעי')
    expect(html).toContain('יואב בוגין (yoav@leaders.co.il)')
  })

  it('omits empty optional fields instead of printing blank labels', () => {
    const html = renderKickoffHtml(input())
    // Not supplied in the fixture:
    expect(html).not.toContain('אסטרטגיית מדיה')
    expect(html).not.toContain('דוגמת משפיענים')
    expect(html).not.toContain('חלוקת תקציב')
    // Roles with no pick produce no row:
    expect(html).not.toContain('מציג/ה')
  })

  it('escapes HTML so client free-text cannot break the document', () => {
    const html = renderKickoffHtml(
      input({ payload: payload({ aboutBrand: '<script>alert("x")</script> & co' }) }),
    )
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co')
    expect(html).not.toContain('<script>')
  })

  it('renders dates in Hebrew locale and never prints "Invalid Date"', () => {
    const html = renderKickoffHtml(input({ payload: payload({ clientDeadline: '' }) }))
    expect(html).not.toContain('Invalid Date')
    expect(html).not.toContain('דדליין ללקוח')
  })
})
