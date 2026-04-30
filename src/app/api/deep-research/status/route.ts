/**
 * GET /api/deep-research/status?documentId=…&mode=brand|influencers|competitors
 *
 * Polls the Deep Research API for the interaction stored on the document
 * for the given mode. Returns current status and (when complete) the
 * extracted text output. The client polls this every ~30s.
 *
 * When status === 'completed' for the first time, the route persists the
 * raw text + a parsed JSON block (when present) onto the document under
 * `_deepResearch[mode].result` so subsequent polls don't repeatedly hit
 * the upstream API.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDeepResearchStatus, extractText } from '@/lib/gemini/deep-research'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 60

type Mode = 'brand' | 'influencers' | 'competitors'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const url = new URL(req.url)
    const documentId = url.searchParams.get('documentId')
    const mode = (url.searchParams.get('mode') || 'brand') as Mode
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    const { data: doc, error } = await supabase
      .from('documents').select('*').eq('id', documentId).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (!isDevMode && doc.user_id !== userId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const data = doc.data as Record<string, unknown>
    const drState = (data._deepResearch as Record<string, {
      interactionId?: string
      status?: string
      startedAt?: string
      result?: { text: string; parsed?: unknown; completedAt: string }
    }> | undefined) || {}
    const slot = drState[mode]
    if (!slot?.interactionId) {
      return NextResponse.json({ error: `No deep research started for mode=${mode}` }, { status: 404 })
    }

    // Already cached — return without hitting upstream.
    if (slot.result) {
      return NextResponse.json({
        ok: true,
        mode,
        status: 'completed',
        text: slot.result.text,
        parsed: slot.result.parsed,
        completedAt: slot.result.completedAt,
      })
    }

    const interaction = await getDeepResearchStatus(slot.interactionId)
    const status = interaction.status

    if (status === 'completed') {
      const text = extractText(interaction)
      // Try to parse a JSON block if the prompt requested one.
      let parsed: unknown = undefined
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch?.[1]) {
        try { parsed = JSON.parse(jsonMatch[1]) } catch { /* keep undefined */ }
      }
      const completedAt = new Date().toISOString()
      drState[mode] = {
        ...slot,
        status: 'completed',
        result: { text, parsed, completedAt },
      }
      await supabase
        .from('documents')
        .update({ data: { ...data, _deepResearch: drState } })
        .eq('id', documentId)
      return NextResponse.json({ ok: true, mode, status, text, parsed, completedAt })
    }

    if (status === 'failed') {
      drState[mode] = { ...slot, status: 'failed' }
      await supabase
        .from('documents')
        .update({ data: { ...data, _deepResearch: drState } })
        .eq('id', documentId)
      return NextResponse.json({
        ok: false,
        mode,
        status,
        error: interaction.error?.message || 'Deep Research failed',
      })
    }

    return NextResponse.json({ ok: true, mode, status, startedAt: slot.startedAt })
  } catch (err) {
    console.error('[deep-research/status] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
