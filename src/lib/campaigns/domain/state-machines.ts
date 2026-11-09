/**
 * Allowed status transitions. The single source of the process rules: services
 * call assertTransition() before every status change, and the UI asks
 * nextStatuses() to decide which actions to offer.
 */
import { DomainError } from '../errors'

export const CAMPAIGN_STATUSES = ['draft', 'planning', 'recruiting', 'active', 'reporting', 'closed', 'cancelled'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const SELECTION_STATUSES = ['proposed', 'internal_review', 'client_review', 'approved', 'changes_requested', 'rejected', 'withdrawn'] as const
export type SelectionStatus = (typeof SELECTION_STATUSES)[number]

export const PARTICIPATION_STATUSES = ['not_invited', 'invited', 'accepted', 'declined', 'active', 'completed', 'cancelled'] as const
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number]

export const DELIVERABLE_STATUSES = [
  'awaiting_submission', 'submitted', 'internal_review', 'changes_requested', 'client_review',
  'approved', 'publication_reported', 'publication_verified', 'cancelled',
] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

type Machine<S extends string> = Record<S, readonly S[]>

export const CAMPAIGN_MACHINE: Machine<CampaignStatus> = {
  draft: ['planning', 'cancelled'],
  planning: ['draft', 'recruiting', 'cancelled'],
  recruiting: ['planning', 'active', 'cancelled'],
  active: ['reporting', 'cancelled'],
  reporting: ['active', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
}

// Who moves selection: shortlist creation (→ internal_review), the internal
// decision (→ client_review via send-to-client, or changes_requested/rejected),
// the client decision (→ approved/changes_requested/rejected). A revised
// candidate goes back to proposed and into the next shortlist version.
export const SELECTION_MACHINE: Machine<SelectionStatus> = {
  proposed: ['internal_review', 'withdrawn'],
  internal_review: ['client_review', 'changes_requested', 'rejected', 'withdrawn', 'proposed'],
  client_review: ['approved', 'changes_requested', 'rejected', 'withdrawn'],
  changes_requested: ['proposed', 'withdrawn'],
  approved: ['internal_review', 'withdrawn'],
  rejected: ['proposed'],
  withdrawn: ['proposed'],
}

// Client approval of the creator (selection) and the creator's own acceptance
// (participation) are separate machines on purpose.
export const PARTICIPATION_MACHINE: Machine<ParticipationStatus> = {
  not_invited: ['invited', 'cancelled'],
  invited: ['accepted', 'declined', 'cancelled'],
  accepted: ['active', 'invited', 'cancelled'],
  declined: ['invited', 'cancelled'],
  active: ['completed', 'invited', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const DELIVERABLE_MACHINE: Machine<DeliverableStatus> = {
  awaiting_submission: ['submitted', 'cancelled'],
  submitted: ['internal_review', 'client_review', 'changes_requested', 'submitted', 'cancelled'],
  internal_review: ['client_review', 'changes_requested', 'submitted', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'],
  client_review: ['approved', 'changes_requested', 'submitted', 'cancelled'],
  approved: ['publication_reported', 'submitted', 'cancelled'],
  publication_reported: ['publication_verified', 'approved', 'cancelled'],
  publication_verified: [],
  cancelled: [],
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return (m[from] ?? []).includes(to)
}

export function assertTransition<S extends string>(m: Machine<S>, from: S, to: S, label: string): void {
  if (!canTransition(m, from, to)) {
    throw new DomainError('INVALID_TRANSITION', `לא ניתן להעביר ${label} מ"${heStatus(from)}" ל"${heStatus(to)}"`, { from, to })
  }
}

export function nextStatuses<S extends string>(m: Machine<S>, from: S): readonly S[] {
  return m[from] ?? []
}

/** Deliverable states in which the creator may upload a new version. */
export const SUBMITTABLE: readonly DeliverableStatus[] = ['awaiting_submission', 'changes_requested', 'submitted', 'internal_review', 'client_review', 'approved']

/** Participation states in which deliverable work is allowed. */
export const WORKING_PARTICIPATION: readonly ParticipationStatus[] = ['accepted', 'active']

export const HE_STATUS: Record<string, string> = {
  draft: 'טיוטה', planning: 'תכנון', recruiting: 'גיוס משפיענים', active: 'פעיל', reporting: 'דיווח', closed: 'סגור', cancelled: 'בוטל',
  proposed: 'מוצע', internal_review: 'בבדיקה פנימית', client_review: 'ממתין ללקוח', approved: 'אושר',
  changes_requested: 'נדרשים שינויים', rejected: 'נדחה', withdrawn: 'הוסר',
  not_invited: 'טרם הוזמן', invited: 'הוזמן', accepted: 'אישר השתתפות', declined: 'סירב', completed: 'הושלם',
  awaiting_submission: 'ממתין להגשה', submitted: 'הוגש', publication_reported: 'דווח פרסום', publication_verified: 'פרסום אומת',
  open: 'פתוחה', in_progress: 'בטיפול', done: 'בוצעה',
  planned: 'מתוכנן', committed: 'התחייבות', actual: 'הוצאה בפועל',
  not_required: 'לא נדרש', required: 'נדרש', preparing: 'בהכנה', shipped: 'נשלח', delivered: 'נמסר', exception: 'חריגה',
  pending: 'ממתין', reported: 'דווח', verified: 'אומת',
}

export function heStatus(s: string): string {
  return HE_STATUS[s] ?? s
}
