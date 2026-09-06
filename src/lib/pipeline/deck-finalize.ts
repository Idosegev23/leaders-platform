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
 * 1. (removed) A structured/PPTX draft used to be derived here from the raw
 *    agent slides; it went stale the moment the critique changed anything.
 * 2. exportDeckToCanva() — HTML (one page per current slide) → signed URL →
 *    Canva url-import → links. The derived structured/PPTX form is only a
 *    fallback now: it reflects the agent's first draft, not the critiqued deck.
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

  // No structured draft is derived here any more. It was built once from the
  // agent's raw `_agentSlides` and reused forever, so Canva received the first
  // draft regardless of what the critique later fixed. The export now imports
  // the CURRENT HTML slides directly (see exportDeckToCanva); if that fails it
  // falls back to a screenshot of those same slides — never a stale draft.
  void data

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
