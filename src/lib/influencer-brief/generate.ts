import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { generateId } from '@/lib/utils'
import { renderInfluencerBriefHtml } from './template'
import type { DeckDocData } from './types'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Generate the influencer brief DOCUMENT from an approved creative deck.
 * Reads the deck's persisted `data._stepData`, renders a Hebrew RTL brief,
 * converts to PDF, uploads to Drive (public read), and inserts a
 * `documents` row (type='influencer_brief', parent_document_id = deck id).
 *
 * Idempotent-ish: if an influencer_brief already exists for this deck it is
 * returned instead of generating a duplicate.
 */
export async function generateInfluencerBrief(
  deckDocId: string,
): Promise<{ documentId: string; pdfUrl: string }> {
  const sb = service()

  // Reuse an existing brief for this deck if present.
  const { data: existing } = await sb
    .from('documents')
    .select('id, drive_file_url, pdf_url')
    .eq('parent_document_id', deckDocId)
    .eq('type', 'influencer_brief')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return {
      documentId: existing.id,
      pdfUrl: existing.drive_file_url || existing.pdf_url || '',
    }
  }

  // Load the approved deck.
  const { data: deck, error: deckErr } = await sb
    .from('documents')
    .select('id, type, title, data')
    .eq('id', deckDocId)
    .single()
  if (deckErr || !deck) {
    throw new Error(`Deck not found: ${deckErr?.message || deckDocId}`)
  }
  if (deck.type !== 'deck') {
    throw new Error(`Document ${deckDocId} is not a deck (type=${deck.type})`)
  }

  const data = (deck.data || {}) as DeckDocData
  const brandName =
    data._extractedData?.brand?.name || data.brandName || deck.title || 'המותג'

  const html = renderInfluencerBriefHtml({
    brandName,
    brandTagline: data._extractedData?.brand?.industry,
    data,
  })

  const title = `בריף למשפיענים — ${brandName}`

  // HTML -> PDF (A4). generateMultiPagePdf takes an array of pages.
  const pdfBuffer = await generateMultiPagePdf([html], {
    format: 'A4',
    title,
    brandName,
  })

  // Upload to Drive with public read (anyone-with-link).
  const uploaded = await uploadBufferToDriveFolder({
    folderId: DRIVE_ANCHORS.BRIEFS_SENT,
    fileName: `${title}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  })

  const documentId = generateId()
  const { error: insErr } = await sb.from('documents').insert({
    id: documentId,
    user_id: null,
    type: 'influencer_brief',
    title,
    status: 'generated',
    data: { brandName, source_deck_id: deckDocId },
    parent_document_id: deckDocId,
    drive_file_id: uploaded.id,
    drive_file_url: uploaded.viewLink,
    pdf_url: uploaded.viewLink,
  })
  if (insErr) {
    throw new Error(`Failed to insert influencer_brief document: ${insErr.message}`)
  }

  return { documentId, pdfUrl: uploaded.viewLink }
}
