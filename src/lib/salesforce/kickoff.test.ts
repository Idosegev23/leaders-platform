import { describe, it, expect } from 'vitest'
import { buildKickoffTasksPayload } from './kickoff'

const deadlines = {
  creative: '2026-10-20',
  internal: '2026-10-22',
  client: '2026-10-25',
}

describe('buildKickoffTasksPayload', () => {
  it('builds one task per picked role with name, assignee name + email and due date', () => {
    const tasks = buildKickoffTasksPayload({
      meetingDate: '2026-10-12',
      prefixWithDate: false,
      deadlines,
      picks: [
        { key: 'creativeWriter', email: 'Dana@leaders.co.il', name: 'Dana Levi', hebrewName: 'דנה לוי' },
        { key: 'accountManager', email: 'yoav@leaders.co.il', name: 'Yoav Bogin' },
      ],
    })
    expect(tasks).toEqual([
      { task_name: 'קריאייטיב', assignee_name: 'דנה לוי', assignee_email: 'dana@leaders.co.il', due_date: '2026-10-20' },
      { task_name: 'אקאונט', assignee_name: 'Yoav Bogin', assignee_email: 'yoav@leaders.co.il', due_date: '2026-10-25' },
    ])
  })

  it('applies the same role → deadline rule as the ClickUp tasks', () => {
    const due = (
      key: 'creativeWriter' | 'presenter' | 'presentationMaker' | 'accountManager' | 'mediaPerson',
      d: { creative?: string; internal?: string; client?: string } = deadlines,
    ) =>
      buildKickoffTasksPayload({
        meetingDate: '2026-10-12',
        prefixWithDate: false,
        deadlines: d,
        picks: [{ key, email: 'a@leaders.co.il', name: 'A' }],
      })[0].due_date
    expect(due('creativeWriter')).toBe('2026-10-20')
    expect(due('presentationMaker')).toBe('2026-10-20')
    expect(due('mediaPerson')).toBe('2026-10-22')
    expect(due('presenter')).toBe('2026-10-25')
    // presenter / accountManager fall back to the internal deadline
    expect(due('presenter', { internal: '2026-10-22' })).toBe('2026-10-22')
  })

  it('sends due_date null when the role has no deadline', () => {
    const [t] = buildKickoffTasksPayload({
      meetingDate: '2026-10-12',
      prefixWithDate: false,
      deadlines: {},
      picks: [{ key: 'creativeWriter', email: 'a@leaders.co.il', name: 'A' }],
    })
    expect(t.due_date).toBeNull()
  })

  it('prefixes the task name with the meeting date exactly like ClickUp does for existing lists', () => {
    const [t] = buildKickoffTasksPayload({
      meetingDate: '2026-10-12',
      prefixWithDate: true,
      deadlines,
      picks: [{ key: 'presenter', email: 'a@leaders.co.il', name: 'A' }],
    })
    expect(t.task_name).toBe('12/10 — מציג')
  })

  it('normalizes a full ISO timestamp deadline to YYYY-MM-DD', () => {
    const [t] = buildKickoffTasksPayload({
      meetingDate: '2026-10-12',
      prefixWithDate: false,
      deadlines: { creative: '2026-10-20T00:00:00.000Z' },
      picks: [{ key: 'creativeWriter', email: 'a@leaders.co.il', name: 'A' }],
    })
    expect(t.due_date).toBe('2026-10-20')
  })

  it('returns an empty list when there are no picks', () => {
    expect(
      buildKickoffTasksPayload({ meetingDate: '2026-10-12', prefixWithDate: false, deadlines, picks: [] }),
    ).toEqual([])
  })
})
