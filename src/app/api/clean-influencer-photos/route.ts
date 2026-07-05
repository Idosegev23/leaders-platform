/**
 * POST /api/clean-influencer-photos  { documentId }
 *
 * Re-processes each influencer's raw IG profile photo through Nano Banana Pro:
 * replaces ONLY the clashing background (electric-blue studio, busy scene) with a
 * soft neutral backdrop, while keeping the person's face pixel-identical. Square
 * output for the circular avatar. Re-hosts to Supabase and rewrites the photo URL
 * across every influencer field. Best-effort: a failed/again-off photo keeps its
 * current URL. Internal-secret auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWithNanoBanana } from '@/lib/gemini/nano-banana-pro'
import { rehostImage } from '@/lib/brand/rehost-image'

export const maxDuration = 400
export const runtime = 'nodejs'

const EDIT_PROMPT =
  'Replace ONLY the background of this portrait photo with a soft, warm, neutral studio backdrop ' +
  '(gentle cream-to-beige gradient, subtle vignette). Keep the PERSON completely unchanged and ' +
  'photo-identical: same face, facial features, expression, skin tone, hair, and clothing — do NOT ' +
  'restyle, beautify, slim, age, or alter the person in any way. This must remain a truthful photo ' +
  'of the same real individual, only the background is cleaned. Professional editorial headshot, ' +
  'centered, natural soft lighting. No text, no logos, no watermarks.'

export async function POST(request: NextRequest) {
  const requestId = `clean-inf-${Date.now()}`
  try {
    const secret = request.headers.get('x-internal-secret')
    if (!process.env.LEADS_TRIGGER_SECRET || secret !== process.env.LEADS_TRIGGER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = await createClient()
    const { documentId } = await request.json()
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    const { data: doc, error } = await supabase.from('documents').select('*').eq('id', documentId).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const data = doc.data as Record<string, unknown>

    // Collect unique (username → current photo URL) from the enrichment fields.
    const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
    const sources: Array<Record<string, unknown>> = []
    const collect = (arr: unknown) => { if (Array.isArray(arr)) for (const e of arr) if (rec(e)) sources.push(e) }
    collect(data.enhancedInfluencers)
    collect((data.influencerResearch as Record<string, unknown>)?.recommendations)
    collect((data._influencerStrategy as Record<string, unknown>)?.recommendations)
    const byUser = new Map<string, string>()
    for (const s of sources) {
      const u = String(s.username || s.handle || '')
      const p = String(s.profilePicUrl || '')
      if (u && p && /^https?:/.test(p) && !byUser.has(u)) byUser.set(u, p)
    }
    if (!byUser.size) return NextResponse.json({ error: 'No influencer photos found' }, { status: 400 })

    // Clean each photo (2-at-a-time).
    const cleaned = new Map<string, string>()
    const users = Array.from(byUser.keys())
    for (let i = 0; i < users.length; i += 2) {
      await Promise.all(users.slice(i, i + 2).map(async (u) => {
        try {
          const src = byUser.get(u)!
          const res = await fetch(src, { signal: AbortSignal.timeout(10_000) })
          if (!res.ok) return
          const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
          if (!ct.startsWith('image/')) return
          const b64 = Buffer.from(await res.arrayBuffer()).toString('base64')
          const out = await generateWithNanoBanana({
            prompt: EDIT_PROMPT,
            references: [{ base64: b64, mimeType: ct, caption: 'the person to keep identical' }],
            aspectRatio: '1:1',
            imageSize: '2K',
          })
          if (!out) return
          const buf = Buffer.from(out.base64, 'base64')
          const path = `influencers/clean/${u.replace(/[^a-z0-9_-]/gi, '') || 'inf'}.png`
          const up = await supabase.storage.from('assets').upload(path, buf, { contentType: out.mimeType, upsert: true })
          if (up.error) return
          cleaned.set(u, supabase.storage.from('assets').getPublicUrl(path).data.publicUrl)
        } catch { /* keep original */ }
      }))
    }

    // Rewrite the cleaned URL across every influencer field.
    for (const s of sources) {
      const u = String(s.username || s.handle || '')
      const c = cleaned.get(u)
      if (c) s.profilePicUrl = c
    }
    // wizard step field too
    const stepArrays = [
      (data.influencers as Record<string, unknown>)?.influencers,
      ((data._stepData as Record<string, unknown>)?.influencers as Record<string, unknown>)?.influencers,
    ]
    for (const arr of stepArrays) if (Array.isArray(arr)) for (const e of arr) {
      if (rec(e)) { const c = cleaned.get(String(e.username || e.handle || '')); if (c) e.profilePicUrl = c }
    }

    await supabase.from('documents').update({ data, updated_at: new Date().toISOString() }).eq('id', documentId)
    console.log(`[${requestId}] cleaned ${cleaned.size}/${byUser.size} influencer photos`)
    return NextResponse.json({
      ok: true,
      cleaned: cleaned.size,
      total: byUser.size,
      photos: Array.from(cleaned.entries()).map(([u, url]) => ({ username: u, url })),
    })
  } catch (err) {
    console.error(`[${requestId}]`, err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 })
  }
}
