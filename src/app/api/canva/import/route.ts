// src/app/api/canva/import/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateScreenshotPdf, generateMultiPagePdf } from '@/lib/playwright/pdf'
import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'
import type { Presentation } from '@/types/presentation'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { importDesignFromUrl, waitForUrlImport } from '@/lib/canva/client'
import { isDevMode } from '@/lib/auth/dev-mode'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * POST /api/canva/import  { documentId }
 *
 * Import our generated deck into Canva and stash the edit link on the linked
 * kickoff (inner_meeting_forms) row. Reuses the same deck→PDF path as /api/pdf
 * then uploads that PDF to Drive with PUBLIC read so Canva's url-import can pull
 * it. edit_url expires ~30 days out; canva_design_id is kept for re-issuing.
 */
export async function POST(request: Request) {
  // Auth — allow dev-mode bypass, else require a logged-in Leaders user.
  if (!isDevMode) {
    const supabase = await createSsrClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let documentId: string
  try {
    const body = await request.json()
    documentId = (body?.documentId || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  const sb = service()
  const { data: document, error: docErr } = await sb
    .from('documents')
    .select('id, title, type, data, pdf_url')
    .eq('id', documentId)
    .single()
  if (docErr || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const documentData = (document.data ?? {}) as Record<string, unknown>
  const brandName = (documentData.brandName as string) || document.title || 'Presentation'

  // 1. Produce the deck PDF (mirror /api/pdf slide selection).
  let pdfBuffer: Buffer
  try {
    const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; title?: string } | undefined
    const astPres = documentData._presentation as Presentation | undefined
    const cachedSlides = documentData._cachedSlides as string[] | undefined

    if (htmlPres?.htmlSlides?.length) {
      pdfBuffer = await generateScreenshotPdf(htmlPres.htmlSlides, {
        format: '16:9', title: htmlPres.title || brandName, brandName,
      })
    } else if (astPres?.slides?.length) {
      const pages = presentationToHtmlSlides(astPres, true)
      pdfBuffer = await generateMultiPagePdf(pages, {
        format: '16:9', title: astPres.title || brandName, brandName,
      })
    } else if (cachedSlides?.length) {
      pdfBuffer = await generateMultiPagePdf(cachedSlides, {
        format: '16:9', title: brandName, brandName,
      })
    } else {
      return NextResponse.json(
        { error: 'Deck has no rendered slides yet — generate the PDF first, then import to Canva.' },
        { status: 409 },
      )
    }
  } catch (e) {
    console.error('[canva-import] PDF generation failed:', e)
    return NextResponse.json({ error: `PDF generation failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  // 2. Upload PUBLIC to Drive (anyone-reader) → public downloadable URL.
  let publicUrl: string
  try {
    const uploaded = await uploadBufferToDriveFolder({
      folderId: DRIVE_ANCHORS.BRIEFS_SENT,
      fileName: `${brandName} (Canva import).pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    })
    // Canva's url-import needs a direct-download URL. downloadLink is the
    // webContentLink; fall back to the uc?export=download form if empty.
    publicUrl = uploaded.downloadLink || `https://drive.google.com/uc?export=download&id=${uploaded.id}`
  } catch (e) {
    console.error('[canva-import] Drive upload failed:', e)
    return NextResponse.json({ error: `Drive upload failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  // 3. Import into Canva + poll for the finished design.
  let result: { designId: string; editUrl: string; viewUrl: string }
  try {
    const { jobId } = await importDesignFromUrl({
      title: brandName,
      url: publicUrl,
      mimeType: 'application/pdf',
    })
    result = await waitForUrlImport(jobId)
  } catch (e) {
    console.error('[canva-import] Canva import failed:', e)
    return NextResponse.json({ error: `Canva import failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  // 4. Write the Canva links onto the linked kickoff doc (item 2).
  //    Prefer an explicit linked_deck_document_id; else no-op the write but
  //    still return the links so the deck UI can show them.
  const nowIso = new Date().toISOString()
  let kickoffUpdated = false
  try {
    const { data: linked } = await sb
      .from('inner_meeting_forms')
      .select('id')
      .eq('linked_deck_document_id', documentId)
      .maybeSingle()
    if (linked?.id) {
      await sb
        .from('inner_meeting_forms')
        .update({
          canva_design_id: result.designId,
          canva_edit_url: result.editUrl,
          canva_view_url: result.viewUrl,
          canva_link_updated_at: nowIso,
        })
        .eq('id', linked.id)
      kickoffUpdated = true
    }
  } catch (e) {
    console.warn('[canva-import] kickoff update failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    design_id: result.designId,
    edit_url: result.editUrl,
    view_url: result.viewUrl,
    kickoff_updated: kickoffUpdated,
  })
}
