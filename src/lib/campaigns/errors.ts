/**
 * Domain errors. Every service throws these; route handlers map them to HTTP.
 * Messages are Hebrew and safe to show. Raw database errors never reach the user.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'STALE_TARGET'
  | 'INVALID_TRANSITION'
  | 'PRECONDITION_FAILED'
  | 'RATE_LIMITED'
  | 'MODULE_DISABLED'
  | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  STALE_TARGET: 409,
  INVALID_TRANSITION: 409,
  PRECONDITION_FAILED: 409,
  RATE_LIMITED: 429,
  MODULE_DISABLED: 404,
  INTERNAL: 500,
}

export class DomainError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.status = STATUS[code]
    this.details = details
  }
}

export const notFound = (what = 'הרשומה') => new DomainError('NOT_FOUND', `${what} לא נמצאה או שאין לך גישה אליה`)
export const forbidden = (msg = 'אין לך הרשאה לבצע פעולה זו') => new DomainError('FORBIDDEN', msg)
export const invalid = (msg: string, details?: Record<string, unknown>) => new DomainError('VALIDATION', msg, details)
export const versionConflict = () =>
  new DomainError('VERSION_CONFLICT', 'הרשומה עודכנה בינתיים על ידי מישהו אחר. רעננו את הדף ונסו שוב.')
export const precondition = (msg: string, details?: Record<string, unknown>) => new DomainError('PRECONDITION_FAILED', msg, details)
