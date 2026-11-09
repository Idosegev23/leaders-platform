import { z, type ZodTypeAny } from 'zod'
import { invalid } from './errors'
import { jerusalemLocalToUtc } from './domain/time'

/** Validate input with zod; Hebrew message listing the bad fields. */
export function parseInput<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    throw invalid(`הנתונים שנשלחו אינם תקינים: ${fields.map((f) => f.message).join('; ')}`, { fields })
  }
  return r.data
}

const he = {
  required: 'שדה חובה',
}

export const zText = (max: number) => z.string().trim().max(max, `עד ${max} תווים`)
export const zRequiredText = (max: number) => z.string({ required_error: he.required }).trim().min(1, he.required).max(max, `עד ${max} תווים`)
export const zOptText = (max: number) => z.string().trim().max(max, `עד ${max} תווים`).optional().nullable()
  .transform((v) => (v ? v : null))
export const zUuid = z.string().uuid('מזהה לא תקין')
export const zOptUuid = z.string().uuid('מזהה לא תקין').optional().nullable().or(z.literal('').transform(() => null))
export const zUrl = z.string().trim().url('כתובת לא תקינה').refine((u) => /^https?:\/\//i.test(u), 'כתובת חייבת להתחיל ב-http או https')
export const zOptUrl = zUrl.optional().nullable().or(z.literal('').transform(() => null))
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין (YYYY-MM-DD)')
export const zOptDate = zDate.optional().nullable().or(z.literal('').transform(() => null))
export const zVersion = z.number({ required_error: 'חסרה גרסת הרשומה' }).int().positive()
export const zMoney = z.union([z.string(), z.number()]).transform((v) => String(v).trim())
export const zOptMoney = z.union([z.string(), z.number()]).optional().nullable()
  .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim()))

/**
 * A business date-time from the UI: either an ISO instant with offset/Z, or a
 * wall-clock "YYYY-MM-DDTHH:mm" that is interpreted in Asia/Jerusalem.
 */
export const zBusinessDateTime = z.string().trim().transform((s, ctx) => {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: 'custom', message: 'מועד לא תקין' }); return z.NEVER }
    return d
  }
  try {
    return jerusalemLocalToUtc(s)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'מועד לא תקין' })
    return z.NEVER
  }
})
export const zOptBusinessDateTime = zBusinessDateTime.optional().nullable().or(z.literal('').transform(() => null))

/** Normalize to E.164. Israeli local numbers (05x…) become +9725x…; returns null for empty. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const digits = s.replace(/[^\d+]/g, '')
  let out: string
  if (digits.startsWith('+')) out = '+' + digits.slice(1).replace(/\D/g, '')
  else if (digits.startsWith('00')) out = '+' + digits.slice(2)
  else if (digits.startsWith('0')) out = '+972' + digits.slice(1)
  else if (digits.startsWith('972')) out = '+' + digits
  else out = '+' + digits
  if (!/^\+[1-9]\d{7,14}$/.test(out)) throw invalid(`מספר טלפון לא תקין: ${raw}`)
  return out
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw invalid(`כתובת דוא"ל לא תקינה: ${raw}`)
  return s
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/\/+$/, '')
}
