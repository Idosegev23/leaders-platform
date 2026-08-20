import { createClient } from '@supabase/supabase-js'
import { exportDeckToCanva, type CanvaExportResult } from '@/lib/canva/export-deck'

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Final step of the automatic deck pipeline: make the finished deck land in
 * Canva with maximum fidelity.
 *
 * 1. Derive `_structuredPresentation` 1:1 from `_agentSlides` if it's missing
 *    (same faithful path as /api/gamma-prototype — no regeneration), so the
 *    Canva import gets native editable PPTX instead of a flat screenshot PDF.
 * 2. exportDeckToCanva() — PPTX → signed URL → Canva url-import → links
 *    persisted on documents.data._canva + the linked kickoff row.
 * 3. autofillCreativeDeckFromDocument() — the AI mapping bridge fills the
 *    creative-strategy brand template (~86 text+image fields) and persists a
 *    NATIVE Canva design on documents.data._canva.native. Non-fatal: the PPTX
 *    import above is still the primary artifact if autofill fails.
 */
export async function finalizeDeckToCanva(documentId: string, tag = 'deck-finalize'): Promise<CanvaExportResult> {
  const sb = service()
  const { data: doc, error } = await sb.from('documents').select('data').eq('id', documentId).single()
  if (error || !doc) throw new Error(`document ${documentId} not found`)

  const data = (doc.data ?? {}) as Record<string, unknown>

  const hasStructured = Boolean(
    (data._structuredPresentation as { slides?: unknown[] } | undefined)?.slides?.length,
  )
  const agentSlides = data._agentSlides as
    | Array<{ slideType: string; title: string; content?: Record<string, unknown> }>
    | undefined

  if (!hasStructured && agentSlides?.length) {
    console.log(`[${tag}] deriving _structuredPresentation from ${agentSlides.length} agent slides`)
    const { agentSlidesToStructured } = await import('@/lib/gemini/html-to-structured')
    const htmlPres = data._htmlPresentation as { designSystem?: Record<string, unknown> } | undefined
    const brandAssets = data._brandAssets as { logo?: { url?: string } } | undefined
    const scraped = data._scraped as { logoUrl?: string } | undefined
    const presentation = agentSlidesToStructured({
      slides: agentSlides,
      designSystem: htmlPres?.designSystem,
      brandName: (data.brandName as string) || (data.brand as string) || 'Brand',
      brandLogoUrl: brandAssets?.logo?.url || scraped?.logoUrl || undefined,
      enhancedInfluencers: (data.enhancedInfluencers as Array<Record<string, unknown>> | undefined) as never,
    })
    await sb
      .from('documents')
      .update({
        data: { ...data, _structuredPresentation: presentation },
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
  }

  console.log(`[${tag}] exporting deck ${documentId} to Canva…`)
  const result = await exportDeckToCanva({ documentId })
  console.log(`[${tag}] ✅ Canva design ${result.designId} (${result.mode})`)

  try {
    const { autofillCreativeDeckFromDocument } = await import('@/lib/canva/autofill-deck')
    const native = await autofillCreativeDeckFromDocument(documentId, tag)
    console.log(`[${tag}] ✅ native Canva design ${native.designId} (${native.filledFields} fields)`)
  } catch (e) {
    console.warn(`[${tag}] native autofill failed (non-fatal):`, e instanceof Error ? e.message : e)
  }

  return result
}
