import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  downloadDriveFileBytes,
  downloadDriveFileBytesAsUser,
  uploadBufferToDriveAsUser,
  uploadBufferToDriveFolder,
} from '@/lib/google-drive/client'
import { sendGmailEmail, refreshAccessToken } from '@/lib/gmail'
import { buildSignedConfirmationEmail } from '@/lib/signatures/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/signatures/{token}/sign
 *
 * Public endpoint. Accepts the signer's name + a signature image
 * (data URL). We:
 *   1. Stamp the signature image + signer name + date onto the last
 *      page of the PDF.
 *   2. Upload the signed PDF to the same Drive folder as the original.
 *   3. Email the signed PDF link to (a) the signer, (b) the sender,
 *      (c) anything in `cc_emails`.
 *   4. Mark the request `signed` and stamp activity_log.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = (await request.json().catch(() => null)) as {
    signer_name?: string
    signer_email?: string
    signer_role?: string
    signer_notes?: string
    signature_image?: string  // data URL: "data:image/png;base64,..."
    typed_name?: string
  } | null

  if (!body || !body.signer_name || (!body.signature_image && !body.typed_name)) {
    return NextResponse.json(
      { error: 'נדרשים שם החותם וחתימה (ציור או הקלדה)' },
      { status: 400 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Fetch the request
  const { data: req, error: fetchErr } = await supabase
    .from('signature_requests')
    .select('id, token, title, pdf_drive_file_id, pdf_drive_folder_id, status, recipient_email, recipient_name, created_by_email, created_by_name, cc_emails, lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !req) {
    return NextResponse.json({ error: 'בקשת חתימה לא נמצאה' }, { status: 404 })
  }
  if (req.status === 'signed') {
    return NextResponse.json({ error: 'המסמך כבר נחתם' }, { status: 409 })
  }
  if (req.status === 'cancelled' || new Date(req.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'בקשת החתימה פגה תוקף' }, { status: 410 })
  }
  if (!req.pdf_drive_file_id) {
    return NextResponse.json({ error: 'PDF המקור חסר ב-Drive' }, { status: 500 })
  }

  // Resolve the sender's OAuth — needed to read the original PDF (uploaded
  // as the user) and to write the signed PDF back to the same folder.
  const senderRefresh = await getCreatorRefreshToken(supabase, req.created_by_email)
  let senderAccess: string | null = null
  if (senderRefresh) {
    try { senderAccess = await refreshAccessToken(senderRefresh) }
    catch (e) { console.warn('[sign] refresh failed:', e) }
  }

  // Download the original PDF from Drive — try user OAuth first
  // (because we uploaded it as the user). Service account is a last-ditch
  // fallback (only works if the folder happens to be shared with it).
  let originalPdfBytes: Buffer
  try {
    if (senderAccess) {
      originalPdfBytes = await downloadDriveFileBytesAsUser(senderAccess, req.pdf_drive_file_id)
    } else {
      originalPdfBytes = await downloadDriveFileBytes(req.pdf_drive_file_id)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `שליפת PDF המקור נכשלה: ${msg}` }, { status: 500 })
  }

  // Sanity check — the file must start with %PDF
  const head = originalPdfBytes.subarray(0, 8).toString('latin1')
  if (!head.includes('%PDF')) {
    return NextResponse.json({ error: 'הקובץ ב-Drive אינו PDF תקין' }, { status: 500 })
  }

  // Stamp the PDF
  let signedPdfBytes: Uint8Array
  try {
    signedPdfBytes = await stampPdfWithSignature({
      originalPdf: originalPdfBytes,
      signerName: body.signer_name,
      signatureImageDataUrl: body.signature_image ?? null,
      typedName: body.typed_name ?? null,
      signedAtIso: new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Stamp failed: ${msg}` }, { status: 500 })
  }

  // Upload signed PDF to the same folder as the original. Prefer the
  // sender's OAuth (we already refreshed it above for the download) so
  // the file lands in their Drive. Fallback to the service account
  // only if the sender has no refresh token at all.
  let signedUpload: { id: string; viewLink: string }
  try {
    if (senderAccess) {
      const result = await uploadBufferToDriveAsUser({
        accessToken: senderAccess,
        folderId: req.pdf_drive_folder_id,
        fileName: `${req.title} (חתום).pdf`,
        mimeType: 'application/pdf',
        buffer: Buffer.from(signedPdfBytes),
      })
      signedUpload = { id: result.id, viewLink: result.viewLink }
    } else {
      const result = await uploadBufferToDriveFolder({
        folderId: req.pdf_drive_folder_id,
        fileName: `${req.title} (חתום).pdf`,
        mimeType: 'application/pdf',
        buffer: Buffer.from(signedPdfBytes),
      })
      signedUpload = { id: result.id, viewLink: result.viewLink }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 })
  }

  // Persist
  const signedAt = new Date().toISOString()
  await supabase
    .from('signature_requests')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signature_image: body.signature_image ?? null,
      signature_typed_name: body.typed_name ?? null,
      signer_name: body.signer_name,
      signer_email: body.signer_email ?? req.recipient_email,
      signer_role: body.signer_role ?? null,
      signer_notes: body.signer_notes ?? null,
      signed_pdf_drive_file_id: signedUpload.id,
      signed_pdf_drive_view_link: signedUpload.viewLink,
    })
    .eq('token', token)

  // Activity log
  if (req.lead_id) {
    await supabase.from('activity_log').insert({
      source: 'leaders_ui',
      action_type: 'signature_signed',
      summary: `${body.signer_name} חתם על "${req.title}"`,
      entity_type: 'lead',
      entity_id: req.lead_id,
      actor_email: body.signer_email ?? req.recipient_email,
      actor_name: body.signer_name,
      payload: {
        token,
        drive_link: signedUpload.viewLink,
      },
    })
  }

  // Notification emails — sent FROM the creator's gmail account so they
  // arrive as part of the existing thread (and the signed pdf isn't
  // sent from a generic noreply). Reuse the same refresh_token we
  // resolved above for the Drive download/upload.
  const creatorRefresh = senderRefresh
  const formattedSignedAt = formatHebrewDateTime(signedAt)
  const signerEmailFinal = body.signer_email ?? req.recipient_email ?? ''
  const recipients = collectRecipients({
    signerEmail: signerEmailFinal,
    senderEmail: req.created_by_email,
    cc: ((req.cc_emails as string[] | null) ?? []),
  })

  if (creatorRefresh) {
    await Promise.all(
      recipients.map((to) =>
        sendGmailEmail({
          refreshToken: creatorRefresh,
          from: req.created_by_email,
          fromName: req.created_by_name ?? req.created_by_email,
          to,
          subject: `נחתם: ${req.title} — Leaders`,
          html: buildSignedConfirmationEmail({
            signerName: body.signer_name!,
            title: req.title,
            driveLink: signedUpload.viewLink,
            signedAt: formattedSignedAt,
            isInternal: to !== signerEmailFinal,
          }),
        }).catch((e) =>
          console.error(`[sign] gmail send failed for ${to}:`, e),
        ),
      ),
    )
  } else {
    console.warn(`[sign] no refresh_token for ${req.created_by_email} — emails not sent`)
  }

  return NextResponse.json({
    ok: true,
    signed_at: signedAt,
    drive_link: signedUpload.viewLink,
  })
}

/* ---------------------------------------------------------------- */
/* PDF stamping                                                     */
/* ---------------------------------------------------------------- */

async function stampPdfWithSignature(params: {
  originalPdf: Buffer
  signerName: string
  signatureImageDataUrl: string | null
  typedName: string | null
  signedAtIso: string
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(params.originalPdf)
  pdf.registerFontkit(fontkit)

  const page = pdf.getPages().at(-1)
  if (!page) throw new Error('PDF has no pages')

  const { width } = page.getSize()
  const margin = 36
  const boxWidth = width - margin * 2
  const boxHeight = 110
  const baseY = margin

  // Light separator line above the signature box
  page.drawRectangle({
    x: margin,
    y: baseY + boxHeight + 6,
    width: boxWidth,
    height: 0.6,
    color: rgb(0.85, 0.85, 0.88),
  })

  // Box (subtle bg)
  page.drawRectangle({
    x: margin,
    y: baseY,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.9, 0.9, 0.93),
    borderWidth: 0.6,
  })

  // Embed signature image if provided
  if (params.signatureImageDataUrl) {
    try {
      const base64 = params.signatureImageDataUrl.replace(/^data:image\/png;base64,/, '')
      const sigBytes = Buffer.from(base64, 'base64')
      const sigImage = await pdf.embedPng(sigBytes)
      const sigDims = sigImage.scale(0.45)
      const targetH = Math.min(60, boxHeight - 40)
      const scale = targetH / sigDims.height
      const renderW = sigDims.width * scale
      const renderH = sigDims.height * scale
      page.drawImage(sigImage, {
        x: margin + boxWidth - renderW - 18,
        y: baseY + (boxHeight - renderH) / 2 + 8,
        width: renderW,
        height: renderH,
      })
    } catch (e) {
      console.warn('[stamp] failed to embed signature image:', e)
    }
  }

  // Embed Hebrew-capable fonts (Heebo) so RTL names render correctly.
  const heeboRegular = await loadEmbeddedFont(pdf, 'Heebo-Regular.ttf')
  const heeboBold    = await loadEmbeddedFont(pdf, 'Heebo-Bold.ttf')

  const labelSize = 8
  const valueSize = 11
  const xLabel = margin + 18

  drawText(page, 'SIGNED BY', xLabel, baseY + boxHeight - 22, labelSize, heeboRegular, rgb(0.45, 0.45, 0.5))
  drawText(page, prepBidi(params.signerName), xLabel, baseY + boxHeight - 38, valueSize, heeboBold, rgb(0.1, 0.1, 0.18))

  drawText(page, 'SIGNED AT', xLabel, baseY + 38, labelSize, heeboRegular, rgb(0.45, 0.45, 0.5))
  drawText(page, formatStampDate(params.signedAtIso), xLabel, baseY + 22, valueSize, heeboBold, rgb(0.1, 0.1, 0.18))

  if (params.typedName && !params.signatureImageDataUrl) {
    drawText(page, prepBidi(params.typedName), margin + boxWidth - 220, baseY + boxHeight / 2 - 6, 22, heeboRegular, rgb(0.05, 0.05, 0.18))
  }

  return pdf.save()
}

let cachedFontBytes: Record<string, Buffer> = {}
async function loadEmbeddedFont(pdf: PDFDocument, fileName: string): Promise<PDFFont> {
  if (!cachedFontBytes[fileName]) {
    const fontPath = path.join(process.cwd(), 'public', 'fonts', fileName)
    cachedFontBytes[fileName] = await fs.readFile(fontPath)
  }
  return pdf.embedFont(cachedFontBytes[fileName], { subset: true })
}

function drawText(
  page: ReturnType<PDFDocument['getPages']>[number],
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { x, y, size, font, color })
}

/**
 * pdf-lib draws glyphs left-to-right with no bidi reordering. For pure
 * Hebrew runs we reverse the codepoints so the visual order ends up
 * correct. For mixed strings we leave them — typical signer names are
 * single-language so this is good enough.
 */
function prepBidi(text: string): string {
  if (!text) return text
  const isHebrew = /[֐-׿]/.test(text)
  if (!isHebrew) return text
  // If the string is overwhelmingly Hebrew (no Latin letters), reverse it.
  if (!/[A-Za-z]/.test(text)) {
    return Array.from(text).reverse().join('')
  }
  return text
}

function formatStampDate(iso: string): string {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr}, ${timeStr}`
}

function formatHebrewDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })} בשעה ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
}

function collectRecipients(params: {
  signerEmail: string
  senderEmail: string
  cc: string[]
}): string[] {
  const set = new Set<string>()
  set.add(params.signerEmail)
  set.add(params.senderEmail)
  for (const c of params.cc) set.add(c)
  return Array.from(set).filter(Boolean)
}

async function getCreatorRefreshToken(
  supabase: SupabaseClient,
  creatorEmail: string,
): Promise<string | null> {
  const { data: u } = await supabase
    .from('users')
    .select('id')
    .eq('email', creatorEmail)
    .maybeSingle()
  const userId = (u as { id?: string } | null)?.id
  if (!userId) return null
  const { data: t } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()
  return (t as { refresh_token?: string } | null)?.refresh_token ?? null
}
