/**
 * Creator import from CSV (Excel "Save as CSV"), in two steps:
 *   preview → every row classified as ready / duplicate / error, nothing saved
 *   commit  → creates the ready rows (each in its own savepoint), reports the rest
 * Headers may be Hebrew or English; the delimiter (comma, semicolon, tab) is
 * detected from the header line. Limits: 2,000 rows, 2 MB.
 */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, invalid } from '../errors'
import { requireInternal } from '../auth/policy'
import { normalizeEmail, normalizeHandle, normalizePhone, parseInput } from '../validation'
import { createCreatorTx, findDuplicates } from './creators'

export const MAX_ROWS = 2000
export const MAX_BYTES = 2 * 1024 * 1024

/** RFC 4180 parser with quoted fields, doubled quotes, CR/LF and a leading BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>
  let q = false
  let atStart = true
  for (const ch of firstLine) {
    if (ch === '"' && (atStart || q)) { q = !q; atStart = false; continue }
    if (!q && ch in counts) { counts[ch]++; atStart = true; continue }
    atStart = false
  }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"' && field === '') inQuotes = true // a quote opens a quoted field only at its start (דוא"ל stays literal)
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

const HEADERS: Record<string, string[]> = {
  display_name: ['name', 'display_name', 'שם', 'שם מלא', 'שם היוצר', 'שם המשפיען'],
  email: ['email', 'mail', 'אימייל', 'דוא"ל', 'דואל', 'דוא״ל', 'מייל'],
  phone: ['phone', 'mobile', 'טלפון', 'נייד', 'פלאפון'],
  instagram: ['instagram', 'ig', 'אינסטגרם'],
  tiktok: ['tiktok', 'טיקטוק'],
  youtube: ['youtube', 'יוטיוב'],
  followers: ['followers', 'עוקבים'],
  categories: ['categories', 'category', 'קטגוריות', 'קטגוריה', 'תחום'],
  agency: ['agency', 'talent agency', 'סוכנות', 'סוכנות כישרונות'],
  notes: ['notes', 'הערות'],
}

function mapHeaders(header: string[]): Record<string, number> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[׳']/g, '').replace(/״/g, '"')
  const out: Record<string, number> = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [key, names] of Object.entries(HEADERS)) if (names.map(norm).includes(n) && !(key in out)) out[key] = i
  })
  return out
}

export interface ImportRow {
  line: number
  status: 'ready' | 'duplicate' | 'error'
  messages: string[]
  display_name: string
  email: string | null
  phone: string | null
  accounts: { platform: 'instagram' | 'tiktok' | 'youtube'; handle: string; follower_count: number | null }[]
  categories: string[]
  agency: string | null
  notes: string | null
  duplicate_of?: string
}

async function analyze(db: Queryable, orgId: string, text: string): Promise<{ rows: ImportRow[]; missingAgencies: string[] }> {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw invalid('הקובץ גדול מ-2MB. פצלו אותו לכמה קבצים.')
  const table = parseCsv(text)
  if (table.length < 2) throw invalid('לא נמצאו שורות. השורה הראשונה צריכה להכיל כותרות עמודות (למשל: שם, דוא"ל, טלפון, אינסטגרם).')
  if (table.length - 1 > MAX_ROWS) throw invalid(`אפשר לייבא עד ${MAX_ROWS} שורות בכל פעם`)
  const cols = mapHeaders(table[0])
  if (!('display_name' in cols)) throw invalid('חסרה עמודת "שם". שמות עמודות נתמכים: שם, דוא"ל, טלפון, אינסטגרם, טיקטוק, יוטיוב, עוקבים, קטגוריות, סוכנות, הערות.')
  const agencies = await many<{ id: string; name: string }>(db, `select id, name from cm_talent_agencies where organization_id = $1`, [orgId])
  const agencyByName = new Map(agencies.map((a) => [a.name.trim().toLowerCase(), a.id]))
  const missing = new Set<string>()
  const seen = new Map<string, number>()
  const rows: ImportRow[] = []
  for (let i = 1; i < table.length; i++) {
    const r = table[i]
    const get = (k: string) => (k in cols ? (r[cols[k]] ?? '').trim() : '')
    const messages: string[] = []
    let email: string | null = null
    let phone: string | null = null
    try { email = normalizeEmail(get('email')) } catch (e) { messages.push((e as Error).message) }
    try { phone = normalizePhone(get('phone')) } catch (e) { messages.push((e as Error).message) }
    const followersRaw = get('followers').replace(/[,\s]/g, '')
    const followers = followersRaw === '' ? null : Number(followersRaw)
    if (followersRaw !== '' && (!Number.isInteger(followers) || (followers as number) < 0)) messages.push(`מספר עוקבים לא תקין: ${get('followers')}`)
    const accounts = (['instagram', 'tiktok', 'youtube'] as const)
      .filter((p) => get(p))
      .map((p, idx) => ({ platform: p, handle: normalizeHandle(get(p)), follower_count: idx === 0 && Number.isInteger(followers) ? followers : null }))
    const name = get('display_name')
    if (!name) messages.push('חסר שם')
    else if (name.length > 200) messages.push('שם ארוך מדי')
    const agency = get('agency') || null
    if (agency && !agencyByName.has(agency.toLowerCase())) missing.add(agency)
    const row: ImportRow = {
      line: i + 1, status: messages.length ? 'error' : 'ready', messages, display_name: name, email, phone, accounts,
      categories: get('categories').split(/[,;|]/).map((c) => c.trim()).filter(Boolean).slice(0, 20), agency, notes: get('notes') || null,
    }
    // duplicates inside the file
    for (const key of [email && `e:${email}`, phone && `p:${phone}`, ...accounts.map((a) => `s:${a.platform}:${a.handle.toLowerCase()}`)].filter(Boolean) as string[]) {
      if (seen.has(key) && row.status === 'ready') { row.status = 'duplicate'; row.messages.push(`כפילות בקובץ (שורה ${seen.get(key)})`) }
      else if (!seen.has(key)) seen.set(key, row.line)
    }
    // duplicates already in the organization
    if (row.status === 'ready') {
      const dups = await findDuplicates(db, orgId, { email, phone, social: accounts })
      if (dups.length) { row.status = 'duplicate'; row.duplicate_of = dups[0].creator_id; row.messages.push(`קיים במאגר: ${dups[0].display_name} (${dups[0].reason})`) }
    }
    rows.push(row)
  }
  return { rows, missingAgencies: Array.from(missing) }
}

const importSchema = z.object({
  csv: z.string().min(1, 'הקובץ ריק'),
  create_missing_agencies: z.boolean().default(false),
})

export async function previewImport(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(importSchema, input)
  const { rows, missingAgencies } = await analyze(ctx.db, actor.orgId, v.csv)
  return {
    rows, missingAgencies,
    summary: { total: rows.length, ready: rows.filter((r) => r.status === 'ready').length, duplicate: rows.filter((r) => r.status === 'duplicate').length, error: rows.filter((r) => r.status === 'error').length },
  }
}

export async function commitImport(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  const v = parseInput(importSchema, input)
  return withTx(async (tx) => {
    const { rows, missingAgencies } = await analyze(tx, actor.orgId, v.csv)
    if (missingAgencies.length && !v.create_missing_agencies) {
      throw new DomainError('PRECONDITION_FAILED', `סוכנויות שלא קיימות במערכת: ${missingAgencies.join(', ')}. אפשר לאשר יצירה שלהן או להסיר את העמודה.`, { missingAgencies })
    }
    const agencyIds = new Map((await many<{ id: string; name: string }>(tx, `select id, name from cm_talent_agencies where organization_id = $1`, [actor.orgId]))
      .map((a) => [a.name.trim().toLowerCase(), a.id]))
    for (const name of missingAgencies) {
      const a = await one<{ id: string }>(tx, `insert into cm_talent_agencies (organization_id, name, created_by) values ($1,$2,$3) returning id`, [actor.orgId, name, actor.userId])
      agencyIds.set(name.toLowerCase(), a!.id)
    }
    const created: number[] = []
    const failed: { line: number; message: string }[] = []
    for (const r of rows.filter((x) => x.status === 'ready')) {
      await tx.query('savepoint imp')
      try {
        await createCreatorTx(tx, ctx, {
          display_name: r.display_name, email: r.email, phone: r.phone, talent_agency_id: r.agency ? agencyIds.get(r.agency.toLowerCase()) ?? null : null,
          agent_id: null, categories: r.categories, internal_notes: r.notes, besti_account_id: null,
          social_accounts: r.accounts.map((a) => ({ platform: a.platform, handle: a.handle, follower_count: a.follower_count, external_user_id: null, profile_url: null })),
        })
        await tx.query('release savepoint imp')
        created.push(r.line)
      } catch (e) {
        await tx.query('rollback to savepoint imp')
        failed.push({ line: r.line, message: e instanceof DomainError ? e.message : 'שגיאה בשמירת השורה' })
      }
    }
    await audit(tx, ctx, { campaignId: null, entityType: 'creator', entityId: null, action: 'creators.imported',
      summary: `יובאו ${created.length} יוצרים מקובץ (${rows.length} שורות)`, changes: { created: created.length, skipped: rows.length - created.length - failed.length, failed: failed.length } })
    return {
      created: created.length, createdAgencies: missingAgencies.length,
      skipped: rows.filter((x) => x.status !== 'ready').map((x) => ({ line: x.line, status: x.status, messages: x.messages })),
      failed,
    }
  }, ctx.db)
}
