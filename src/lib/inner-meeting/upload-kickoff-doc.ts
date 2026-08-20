/**
 * Render a completed kickoff (פגישת התנעה) form as an HTML document and
 * upload it into the client's Drive workspace, converted to a Google Doc on
 * the way in. This is the artifact Salesforce links from the
 * "מסמך לפגישת התנעה" field once the form is submitted.
 *
 * Mirrors src/lib/brief/upload-doc.ts (same Drive conversion trick, same
 * anyone-with-link permission) with one deliberate difference: when a doc
 * with the same name already exists we **overwrite its content** instead of
 * skipping. The kickoff can legitimately be re-submitted with edits, and the
 * Salesforce field must end up pointing at the *current* text — while the
 * file id (and therefore the URL) stays stable, so re-pushing to Salesforce
 * is idempotent.
 */

import { Readable } from 'stream'
import { createDriveClient } from '@/lib/google-drive/client'
import { ensureClientWorkspace } from '@/lib/google-drive/client-folders'

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

export interface KickoffParticipant {
  name?: string
  email?: string
  hebrewName?: string
}

/** The completion payload POSTed to /api/inner-meeting/complete. */
export interface KickoffDocPayload {
  clientName: string
  meetingDate: string
  participants: KickoffParticipant[]
  creativeWriter: KickoffParticipant[]
  presenter: KickoffParticipant[]
  presentationMaker: KickoffParticipant[]
  accountManager: KickoffParticipant[]
  mediaPerson?: KickoffParticipant[]
  aboutBrand: string
  targetAudiences: string
  goals: string
  insight: string
  strategy: string
  mediaStrategy?: string
  creative: string
  creativePresentation?: string
  influencersExample?: string
  additionalNotes?: string
  budgetDistribution?: string
  creativeDeadline: string
  internalDeadline: string
  clientDeadline: string
}

export interface UploadKickoffDocInput {
  payload: KickoffDocPayload
  senderName: string | null
  senderEmail: string | null
  /** Drive folder to write into. Defaults to the client's workspace folder. */
  folderId?: string
  /** Used for the doc name: "פגישת התנעה — {client} — {YYYY-MM-DD}". */
  completedAt?: string
}

export interface UploadKickoffDocResult {
  fileId: string
  viewLink: string
  folderId: string
  /** True when an existing doc was overwritten rather than created. */
  updated: boolean
}

/** Build the canonical doc name so lookups and creates always agree. */
export function kickoffDocName(clientName: string, completedAt?: string): string {
  const when = completedAt ? new Date(completedAt) : new Date()
  return `פגישת התנעה — ${clientName} — ${when.toISOString().slice(0, 10)}`
}

export async function uploadKickoffDocToDrive(
  input: UploadKickoffDocInput,
): Promise<UploadKickoffDocResult> {
  const drive = await createDriveClient()
  const clientName = input.payload.clientName

  // Resolve the destination folder — the per-client workspace under
  // "ניהול לקוח" unless the caller pinned one explicitly. ensureClientWorkspace
  // is idempotent, so this reuses the folder the brief cascade already made.
  const folderId =
    input.folderId ?? (await ensureClientWorkspace({ clientName })).workspaceId

  const docName = kickoffDocName(clientName, input.completedAt)
  const html = renderKickoffHtml(input)

  const body = () => {
    const stream = new Readable()
    stream.push(Buffer.from(html, 'utf-8'))
    stream.push(null)
    return stream
  }

  // Same-name doc in this folder → refresh its content, keep the URL.
  const safeName = docName.replace(/'/g, "\\'")
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType='${GOOGLE_DOC_MIME}' and name='${safeName}'`,
    fields: 'files(id, webViewLink)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const dup = existing.data.files?.[0]
  if (dup?.id) {
    await drive.files.update({
      fileId: dup.id,
      media: { mimeType: 'text/html', body: body() },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })
    await makeAnyoneReader(drive, dup.id)
    return {
      fileId: dup.id,
      viewLink: dup.webViewLink || docUrl(dup.id),
      folderId,
      updated: true,
    }
  }

  // Upload as text/html and ask Drive to convert by setting the *target*
  // mimeType to a Google Doc.
  const res = await drive.files.create({
    requestBody: { name: docName, mimeType: GOOGLE_DOC_MIME, parents: [folderId] },
    media: { mimeType: 'text/html', body: body() },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })
  const fileId = res.data.id!
  await makeAnyoneReader(drive, fileId)

  return {
    fileId,
    viewLink: res.data.webViewLink || docUrl(fileId),
    folderId,
    updated: false,
  }
}

const docUrl = (id: string) => `https://docs.google.com/document/d/${id}/edit`

/**
 * Make the file readable by anyone with the link, so the Salesforce field
 * opens for people outside the Leaders domain. Best-effort — never throws.
 */
async function makeAnyoneReader(
  drive: Awaited<ReturnType<typeof createDriveClient>>,
  fileId: string,
): Promise<void> {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })
  } catch (e) {
    console.warn(
      `[kickoff-doc] could not set public permission on ${fileId}:`,
      e instanceof Error ? e.message : e,
    )
  }
}

/* ───────────────── HTML rendering ───────────────── */

export function renderKickoffHtml(input: UploadKickoffDocInput): string {
  const p = input.payload
  const completedAt = input.completedAt ? new Date(input.completedAt) : new Date()
  const stamp = completedAt.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const team = [
    row('כותב/ת קריאייטיב', p.creativeWriter),
    row('מציג/ה', p.presenter),
    row('יוצר/ת מצגת', p.presentationMaker),
    row('אקאונט מנג׳ר', p.accountManager),
    row('מדיה', p.mediaPerson),
    row('משתתפים', p.participants, true),
  ].filter(Boolean).join('\n')

  const content = [
    field('על המותג', p.aboutBrand),
    field('קהלי יעד', p.targetAudiences),
    field('מטרות', p.goals),
    field('תובנה', p.insight),
    field('אסטרטגיה', p.strategy),
    field('אסטרטגיית מדיה', p.mediaStrategy),
    field('קריאייטיב', p.creative),
    field('הצגת קריאייטיב', p.creativePresentation),
    field('דוגמת משפיענים', p.influencersExample),
    field('חלוקת תקציב', p.budgetDistribution),
    field('הערות נוספות', p.additionalNotes),
  ].join('\n')

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(`פגישת התנעה — ${p.clientName}`)}</title></head>
<body style="font-family: 'Heebo', Arial, sans-serif; color: #1a1a2e;">
  <h1 style="font-size:24px; margin:0 0 4px;">פגישת התנעה</h1>
  <h2 style="font-size:18px; margin:0 0 16px; color:#444;">${esc(p.clientName)}</h2>
  <p style="font-size:12px; color:#666; margin:0 0 24px;">
    תאריך פגישה: ${esc(dateFmt(p.meetingDate))}<br>
    הוגש: ${esc(stamp)}
    ${input.senderName ? `<br>נשלח ע״י: ${esc(input.senderName)}${input.senderEmail ? ` &lt;${esc(input.senderEmail)}&gt;` : ''}` : ''}
  </p>

  <h3 style="font-size:15px; margin:24px 0 8px; border-bottom:1px solid #e8e5dc; padding-bottom:4px;">צוות</h3>
${team}

  <h3 style="font-size:15px; margin:24px 0 8px; border-bottom:1px solid #e8e5dc; padding-bottom:4px;">תוכן</h3>
${content}

  <h3 style="font-size:15px; margin:24px 0 8px; border-bottom:1px solid #e8e5dc; padding-bottom:4px;">דדליינים</h3>
${field('דדליין קריאייטיב', dateFmt(p.creativeDeadline))}
${field('דדליין פנימי', dateFmt(p.internalDeadline))}
${field('דדליין ללקוח', dateFmt(p.clientDeadline))}
</body></html>`
}

/** One team row. `all` lists every participant instead of just the first. */
function row(label: string, people?: KickoffParticipant[], all = false): string {
  const picked = all ? (people ?? []) : (people?.[0] ? [people[0]] : [])
  const names = picked
    .map((v) => {
      const name = v.hebrewName || v.name
      if (!name) return ''
      return v.email ? `${name} (${v.email})` : name
    })
    .filter(Boolean)
  if (names.length === 0) return ''
  return `  <p style="margin:0 0 6px;"><strong>${esc(label)}:</strong> ${esc(names.join(', '))}</p>`
}

/** One labelled content block. Empty values are omitted entirely. */
function field(label: string, value?: string): string {
  if (!value?.trim()) return ''
  return `  <p style="margin:0 0 4px;"><strong>${esc(label)}</strong></p>
  <p style="margin:0 0 14px; white-space: pre-wrap;">${esc(value)}</p>`
}

function dateFmt(d: string): string {
  if (!d) return ''
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('he-IL')
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
