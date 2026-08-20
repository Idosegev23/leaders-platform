import { createClient } from '@supabase/supabase-js'
import { generateScreenshotPdf, generateMultiPagePdf } from '@/lib/playwright/pdf'
import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'
import type { Presentation } from '@/types/presentation'
import { renderStructuredSlide } from '@/lib/gemini/layout-prototypes/renderer'
import type { StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'
import { structuredPresentationToPptxDetailed } from '@/lib/export/structured-pptx'
import { uploadAndSignedUrl, deckArtifactPath } from '@/lib/render/storage'
import { importDesignFromUrl, waitForUrlImport } from '@/lib/canva/client'

export type CanvaExportResult = {
  designId: string
  editUrl: string
  viewUrl: string
  mode: 'measured-pptx' | 'native-pptx' | 'screenshot-pdf'
  warnings: string[]
  kickoffUpdated: boolean
}

export class DeckNotReadyError extends Error {}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Core "ship this deck to Canva" flow, callable from the session route
 * (/api/canva/import) AND headlessly from the auto pipeline:
 * artifact (measured-pptx → native-pptx → screenshot-pdf) → Supabase signed
 * URL → Canva url-import → persist links on documents.data._canva + the
 * linked kickoff row.
 */
export async function exportDeckToCanva(opts: {
  documentId: string
  presentation?: StructuredPresentation
}): Promise<CanvaExportResult> {
  const { documentId, presentation: bodyPresentation } = opts
  const sb = service()

  const { data: document, error: docErr } = await sb
    .from('documents')
    .select('id, title, type, data, pdf_url')
    .eq('id', documentId)
    .single()
  if (docErr || !document) throw new Error('Document not found')

  const documentData = (document.data ?? {}) as Record<string, unknown>
  const brandName = (documentData.brandName as string) || document.title || 'Presentation'

  // 1. Produce the deck artifact. StructuredPresentation → NATIVE PPTX (real
  //    editable text/image/shape elements in Canva). Anything else falls back
  //    to the legacy screenshot-PDF path (flat, but never blocks the import).
  let artifact: { buffer: Buffer; contentType: string; ext: 'pdf' | 'pptx'; mode: CanvaExportResult['mode'] }
  let pptxWarnings: string[] = []

  const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; title?: string } | undefined
  const astPres = documentData._presentation as Presentation | undefined
  const cachedSlides = documentData._cachedSlides as string[] | undefined
  const structured =
    (bodyPresentation?.slides?.length ? bodyPresentation : undefined) ||
    (documentData._structuredPresentation as StructuredPresentation | undefined)

  if (structured?.slides?.length) {
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
      console.error('[canva-export] measured PPTX failed, trying semantic native PPTX:', measErr)
      try {
        const { buffer, warnings } = await structuredPresentationToPptxDetailed(structured)
        pptxWarnings = warnings
        artifact = { buffer, contentType: PPTX_MIME, ext: 'pptx', mode: 'native-pptx' }
      } catch (pptxErr) {
        console.error('[canva-export] native PPTX failed, falling back to screenshot PDF:', pptxErr)
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
    throw new DeckNotReadyError('Deck has no rendered slides yet — generate the PDF first, then import to Canva.')
  }

  // 2. Upload to Supabase Storage and hand Canva a SIGNED URL (Drive's
  //    uc?export=download redirect is rejected by Canva's url-import).
  const { signedUrl } = await uploadAndSignedUrl({
    path: deckArtifactPath(documentId, artifact.ext),
    body: artifact.buffer,
    contentType: artifact.contentType,
  })

  // 3. Import into Canva + poll for the finished design.
  const { jobId } = await importDesignFromUrl({
    title: brandName,
    url: signedUrl,
    mimeType: artifact.contentType,
  })
  const result = await waitForUrlImport(jobId)

  const nowIso = new Date().toISOString()

  // 4a. Persist on the deck itself (works for pipeline decks with no kickoff).
  try {
    const { data: fresh } = await sb.from('documents').select('data').eq('id', documentId).single()
    await sb
      .from('documents')
      .update({
        data: {
          ...((fresh?.data ?? {}) as Record<string, unknown>),
          _canva: {
            designId: result.designId,
            editUrl: result.editUrl,
            viewUrl: result.viewUrl,
            mode: artifact.mode,
            updatedAt: nowIso,
          },
        },
        updated_at: nowIso,
      })
      .eq('id', documentId)
  } catch (e) {
    console.warn('[canva-export] _canva persist failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  // 4b. Write the Canva links onto the linked kickoff row, if any.
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
    console.warn('[canva-export] kickoff update failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  return {
    designId: result.designId,
    editUrl: result.editUrl,
    viewUrl: result.viewUrl,
    mode: artifact.mode,
    warnings: pptxWarnings,
    kickoffUpdated,
  }
}
