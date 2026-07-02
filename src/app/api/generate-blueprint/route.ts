/**
 * POST /api/generate-blueprint  { documentId }
 *
 * Phase A of two-phase deck generation: produce the strategic blueprint
 * ("הפיצוח") the user reviews/edits on /blueprint/[id] before slides render.
 * Saves DeckBlueprint to document.data._deckBlueprint and returns it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import { generateDeckBlueprint } from '@/lib/gemini/deck-blueprint'

export const maxDuration = 300
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const requestId = `blueprint-${Date.now()}`
  const startTs = Date.now()

  try {
    const supabase = await createClient()

    // Auth — platform-shared: any authenticated Leaders user may plan any deck.
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    } else {
      void DEV_AUTH_USER
    }

    const { documentId, regenerate } = await request.json()
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    const { data: doc, error: docErr } = await supabase
      .from('documents').select('*').eq('id', documentId).single()
    if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const data = doc.data as Record<string, unknown>

    // Return the existing blueprint unless the caller forces a regenerate.
    const existing = data._deckBlueprint
    if (existing && !regenerate) {
      return NextResponse.json({ ok: true, blueprint: existing, cached: true })
    }

    const brandName = (data.brandName as string) || (data.brand as string) || ''
    console.log(`[${requestId}] 🧠 Generating blueprint for "${brandName}"`)

    const blueprint = await generateDeckBlueprint({
      brandName,
      briefText: (data._briefText as string) || (data.brandBrief as string) || '',
      brandResearch: (data._brandResearch as Record<string, unknown>) || undefined,
      wizardData: data,
    })

    await supabase.from('documents').update({
      data: { ...data, _deckBlueprint: blueprint },
      updated_at: new Date().toISOString(),
    }).eq('id', documentId)

    console.log(`[${requestId}] ✅ Blueprint: ${blueprint.slidePlan.length} slides, ${Date.now() - startTs}ms`)
    return NextResponse.json({ ok: true, blueprint })
  } catch (error) {
    console.error(`[${requestId}] ❌ Blueprint failed:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blueprint generation failed' },
      { status: 500 },
    )
  }
}
