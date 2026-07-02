// src/app/api/canva/import/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateScreenshotPdf, generateMultiPagePdf } from '@/lib/playwright/pdf'
import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'
import type { Presentation } from '@/types/presentation'
import { renderStructuredSlide } from '@/lib/gemini/layout-prototypes/renderer'
import type { StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'
import { structuredPresentationToPptxDetailed } from '@/lib/export/structured-pptx'
import { uploadAndSignedUrl, deckArtifactPath } from '@/lib/render/storage'
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
  let bodyPresentation: StructuredPresentation | undefined
  try {
    const body = await request.json()
    documentId = (body?.documentId || '').trim()
    bodyPresentation = (body?.presentation as StructuredPresentation | undefined) || undefined
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

  // 1. Produce the deck artifact. StructuredPresentation → NATIVE PPTX (real
  //    editable text/image/shape elements in Canva). Anything else falls back
  //    to the legacy screenshot-PDF path (flat, but never blocks the import).
  const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  let artifact: { buffer: Buffer; contentType: string; ext: 'pdf' | 'pptx'; mode: 'measured-pptx' | 'native-pptx' | 'screenshot-pdf' }
  let pptxWarnings: string[] = []
  try {
    const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; title?: string } | undefined
    const astPres = documentData._presentation as Presentation | undefined
    const cachedSlides = documentData._cachedSlides as string[] | undefined
    // The /edit screen edits a StructuredPresentation and auto-saves it to
    // _structuredPresentation. Prefer it (or a live copy POSTed straight from
    // the editor) so Canva receives exactly what the user sees — not the older
    // generate-time _htmlPresentation.
    const structured =
      (bodyPresentation?.slides?.length ? bodyPresentation : undefined) ||
      (documentData._structuredPresentation as StructuredPresentation | undefined)

    if (structured?.slides?.length) {
      // Render the EXACT editor HTML for each slide, then choose the export:
      //  1. MEASURED PPTX (primary) — measure every element's real box in
      //     headless Chrome and emit native elements at those coordinates, so
      //     Canva shows what the user saw (max fidelity for the server-side
      //     Connect API; element-level positioning APIs are editor-app-only).
      //  2. SEMANTIC native PPTX — if measurement fails.
      //  3. SCREENSHOT PDF — last resort (flat, never blocks the import).
      const structuredHtml = structured.slides.map((s) =>
        renderStructuredSlide(s, structured.designSystem, { brandLogoUrl: structured.brandLogoUrl }),
      )
      try {
        const { measureSlides } = await import('@/lib/export/measure-slide')
        const { measuredSlidesToPptx } = await import('@/lib/export/measured-pptx')
        const measured = await measureSlides(structuredHtml)
        const nonEmpty = measured.filter((m) => m.elements.length > 0).length
        if (nonEmpty < Math.ceil(measured.length / 2)) {
          throw new Error(`measurement too sparse (${nonEmpty}/${measured.length} slides had elements)`)
        }
        const { buffer, warnings } = await measuredSlidesToPptx(measured)
        pptxWarnings = warnings
        artifact = { buffer, contentType: PPTX_MIME, ext: 'pptx', mode: 'measured-pptx' }
      } catch (measErr) {
        console.error('[canva-import] measured PPTX failed, trying semantic native PPTX:', measErr)
        try {
          const { buffer, warnings } = await structuredPresentationToPptxDetailed(structured)
          pptxWarnings = warnings
          artifact = { buffer, contentType: PPTX_MIME, ext: 'pptx', mode: 'native-pptx' }
        } catch (pptxErr) {
          console.error('[canva-import] native PPTX failed, falling back to screenshot PDF:', pptxErr)
          const pdfBuffer = await generateScreenshotPdf(structuredHtml, {
            format: '16:9',
            title: structured.brandName || brandName,
            brandName: structured.brandName || brandName,
          })
          artifact = { buffer: pdfBuffer, contentType: 'application/pdf', ext: 'pdf', mode: 'screenshot-pdf' }
        }
      }
    } else if (htmlPres?.htmlSlides?.length) {
      const pdfBuffer = await generateScreenshotPdf(htmlPres.htmlSlides, {
        format: '16:9', title: htmlPres.title || brandName, brandName,
      })
      artifact = { buffer: pdfBuffer, contentType: 'application/pdf', ext: 'pdf', mode: 'screenshot-pdf' }
    } else if (astPres?.slides?.length) {
      const pages = presentationToHtmlSlides(astPres, true)
      const pdfBuffer = await generateMultiPagePdf(pages, {
        format: '16:9', title: astPres.title || brandName, brandName,
      })
      artifact = { buffer: pdfBuffer, contentType: 'application/pdf', ext: 'pdf', mode: 'screenshot-pdf' }
    } else if (cachedSlides?.length) {
      const pdfBuffer = await generateMultiPagePdf(cachedSlides, {
        format: '16:9', title: brandName, brandName,
      })
      artifact = { buffer: pdfBuffer, contentType: 'application/pdf', ext: 'pdf', mode: 'screenshot-pdf' }
    } else {
      return NextResponse.json(
        { error: 'Deck has no rendered slides yet — generate the PDF first, then import to Canva.' },
        { status: 409 },
      )
    }
  } catch (e) {
    console.error('[canva-import] deck artifact generation failed:', e)
    return NextResponse.json({ error: `Deck export failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  // 2. Upload to Supabase Storage and hand Canva a SIGNED URL. Google Drive's
  //    uc?export=download returns a redirect/confirm page (not a direct 200),
  //    which Canva's url-import rejects ("status code wasn't 200"). A Supabase
  //    signed URL is a direct 200 download Canva can fetch.
  let publicUrl: string
  try {
    const { signedUrl } = await uploadAndSignedUrl({
      path: deckArtifactPath(documentId, artifact.ext),
      body: artifact.buffer,
      contentType: artifact.contentType,
    })
    publicUrl = signedUrl
  } catch (e) {
    console.error('[canva-import] storage upload failed:', e)
    return NextResponse.json({ error: `Storage upload failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  // 3. Import into Canva + poll for the finished design.
  let result: { designId: string; editUrl: string; viewUrl: string }
  try {
    const { jobId } = await importDesignFromUrl({
      title: brandName,
      url: publicUrl,
      mimeType: artifact.contentType,
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
    mode: artifact.mode,
    export_warnings: pptxWarnings.length ? pptxWarnings : undefined,
  })
}
