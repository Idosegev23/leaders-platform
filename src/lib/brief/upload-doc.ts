/**
 * Render a completed client-brief submission as an HTML document and
 * upload it into the brief's Drive folder, converted to a Google Doc on
 * the way in. Replaces the Make.com step that used to create a Google
 * Doc per submission.
 *
 * Idempotent-ish: if a doc with the same name already exists in the
 * folder we *don't* create a duplicate — we just return the existing
 * one. This is important because the cascade may run more than once
 * (e.g. the user re-submits, or we re-run it manually for back-fill).
 */

import { Readable } from 'stream'
import { createDriveClient } from '@/lib/google-drive/client'
import { formSteps } from '@/lib/client-brief/formSteps'
import { formStepsEn } from '@/lib/client-brief/formSteps.en'
import type { FormData, StepConfig } from '@/types/client-brief'

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

export interface UploadBriefDocInput {
  folderId: string
  clientName: string
  senderName: string | null
  senderEmail: string | null
  submission: Partial<FormData>
  language?: 'he' | 'en'
  /** Used for the doc name: "בריף — {client} — {YYYY-MM-DD}". */
  submittedAt?: string
}

export interface UploadBriefDocResult {
  fileId: string
  viewLink: string
  reused: boolean
}

export async function uploadBriefDocToFolder(
  input: UploadBriefDocInput,
): Promise<UploadBriefDocResult> {
  const drive = await createDriveClient()
  const isEnglish = input.language === 'en'
  const submittedAt = input.submittedAt ? new Date(input.submittedAt) : new Date()
  const dateStr = submittedAt.toISOString().slice(0, 10)
  const docName = isEnglish
    ? `Brief — ${input.clientName} — ${dateStr}`
    : `בריף — ${input.clientName} — ${dateStr}`

  // Skip if a doc with the same name is already there.
  const safeName = docName.replace(/'/g, "\\'")
  const existing = await drive.files.list({
    q: `'${input.folderId}' in parents and trashed=false and mimeType='${GOOGLE_DOC_MIME}' and name='${safeName}'`,
    fields: 'files(id, webViewLink)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const dup = existing.data.files?.[0]
  if (dup?.id) {
    await makeAnyoneReader(drive, dup.id)
    return {
      fileId: dup.id,
      viewLink: dup.webViewLink || `https://docs.google.com/document/d/${dup.id}/edit`,
      reused: true,
    }
  }

  const html = renderBriefHtml({
    clientName: input.clientName,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    submittedAt,
    submission: input.submission,
    isEnglish,
  })

  // Upload as text/html, ask Drive to convert to a Google Doc by setting
  // the *target* mimeType to application/vnd.google-apps.document.
  const stream = new Readable()
  stream.push(Buffer.from(html, 'utf-8'))
  stream.push(null)

  const res = await drive.files.create({
    requestBody: {
      name: docName,
      mimeType: GOOGLE_DOC_MIME,
      parents: [input.folderId],
    },
    media: {
      mimeType: 'text/html',
      body: stream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  await makeAnyoneReader(drive, res.data.id!)

  return {
    fileId: res.data.id!,
    viewLink:
      res.data.webViewLink ||
      `https://docs.google.com/document/d/${res.data.id}/edit`,
    reused: false,
  }
}

/**
 * Make the file readable by anyone with the link (public view), so the brief
 * doc link works for external systems (e.g. Salesforce) and recipients outside
 * the Leaders domain. Best-effort — never throws. drive.file scope can manage
 * permissions on files the app created.
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
      `[brief-doc] could not set public permission on ${fileId}:`,
      e instanceof Error ? e.message : e,
    )
  }
}

/* ───────────────── HTML rendering ───────────────── */

function renderBriefHtml(opts: {
  clientName: string
  senderName: string | null
  senderEmail: string | null
  submittedAt: Date
  submission: Partial<FormData>
  isEnglish: boolean
}): string {
  const steps: StepConfig[] = opts.isEnglish ? formStepsEn : formSteps
  const dir = opts.isEnglish ? 'ltr' : 'rtl'
  const lang = opts.isEnglish ? 'en' : 'he'
  const formattedDate = opts.submittedAt.toLocaleString(opts.isEnglish ? 'en-US' : 'he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const sections = steps
    .map((step) => renderSection(step, opts.submission))
    .join('\n')

  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><title>${esc(`בריף — ${opts.clientName}`)}</title></head>
<body style="font-family: 'Heebo', Arial, sans-serif; color: #1a1a2e;">
  <h1 style="font-size:24px; margin:0 0 4px;">${esc(opts.isEnglish ? 'Client Brief' : 'בריף לקוח')}</h1>
  <h2 style="font-size:18px; margin:0 0 16px; color:#444;">${esc(opts.clientName)}</h2>
  <p style="font-size:12px; color:#666; margin:0 0 24px;">
    ${esc(opts.isEnglish ? 'Submitted' : 'הוגש')}: ${esc(formattedDate)}
    ${opts.senderName ? `<br>${esc(opts.isEnglish ? 'Sent by' : 'נשלח ע״י')}: ${esc(opts.senderName)}${opts.senderEmail ? ` &lt;${esc(opts.senderEmail)}&gt;` : ''}` : ''}
  </p>
  ${sections}
</body></html>`
}

function renderSection(step: StepConfig, data: Partial<FormData>): string {
  const fields = step.fields
    .map((f) => {
      const raw = data[f.name]
      const valueHtml = renderFieldValue(raw)
      return `<p style="margin:0 0 4px;"><strong>${esc(f.label)}</strong></p>
              <p style="margin:0 0 14px; white-space: pre-wrap;">${valueHtml}</p>`
    })
    .join('\n')
  return `<h3 style="font-size:15px; margin:24px 0 8px; color:#1a1a2e; border-bottom:1px solid #e8e5dc; padding-bottom:4px;">${esc(step.title)}</h3>
${fields}`
}

function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '<span style="color:#aaa;">—</span>'
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span style="color:#aaa;">—</span>'
    return value.map((v) => esc(String(v))).join(', ')
  }
  return esc(String(value))
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
