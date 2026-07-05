/**
 * POST /api/gen-scenes  { documentId, count? }
 *
 * Pre-generates cinematic, reference-conditioned scenes from the doc's real
 * product photos (_brandAssets.productImages) via Nano Banana Pro, and stores
 * them on _brandAssets.sceneImages. The presentation agent prefers sceneImages
 * over raw product photos, so this is what makes deck imagery AI-generated
 * cinematic scenes CONTAINING the real product — not pasted catalog stock.
 *
 * Separated from deck generation so the scenes can be inspected on their own.
 * Internal-secret auth for ops/QA.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateBrandScene } from '@/lib/brand/scene-generator'
import type { BrandAssets, SceneImageAsset } from '@/lib/brand/types'

export const maxDuration = 600
export const runtime = 'nodejs'

// Varied art directions so the deck gets a diverse cinematic pool, not one look.
const ART_DIRECTIONS: Array<{ forSlideType: string; artDirection: string }> = [
  { forSlideType: 'hero-cover', artDirection: 'cinematic dark editorial hero — the real product as the star on a moody stovetop, drifting steam, dramatic rim light, shallow depth of field, premium magazine cover feel' },
  { forSlideType: 'cooking-action', artDirection: 'authentic home-kitchen action — the real product mid-cook on a lit stovetop, steam and sizzle, a hand stirring, warm natural window light, lifestyle documentary' },
  { forSlideType: 'lifestyle-table', artDirection: 'warm family Friday-dinner table — the real product serving a beautifully styled dish at the center of the table, natural daylight, inviting lifestyle scene' },
  { forSlideType: 'ingredients-flatlay', artDirection: 'top-down flatlay — the real product surrounded by fresh colorful raw ingredients on a rustic wood board, bright natural light, editorial food styling' },
  { forSlideType: 'product-hero', artDirection: 'clean editorial product hero — the real product on a polished marble surface, soft studio light, premium catalog aesthetic, subtle reflection' },
  { forSlideType: 'craft-closeup', artDirection: 'extreme close-up of the real product — its material, surface and craftsmanship, dramatic side light, texture-forward, premium' },
  { forSlideType: 'brief-mood', artDirection: 'moody transitional still-life — the real product resting on a weathered rustic counter, one dramatic shaft of light, contemplative and premium, dark negative space' },
  { forSlideType: 'audience-family', artDirection: 'warm candid family kitchen moment — the real product in everyday use, a home cook and family blurred in the background, golden natural light, aspirational lifestyle' },
  { forSlideType: 'insight-content', artDirection: 'overhead recipe-in-progress content-creation vibe — the real product mid-cook shot from above as if filming a reel, phone-friendly framing, bright airy modern kitchen' },
  { forSlideType: 'bigidea-hero', artDirection: 'bold aspirational hero — the real product as the centerpiece on a clean dramatic backdrop with a deep brand-red accent wash, editorial, confident, striking negative space' },
  { forSlideType: 'creative-reel', artDirection: 'dynamic close action — a sizzle or pour into the real product, motion and energy, splashes frozen, vivid reel aesthetic, shallow focus' },
  { forSlideType: 'closing-celebration', artDirection: 'celebratory served meal at a beautiful set table — the real product present, glasses raised feel, warm golden hour light, joyful premium closing mood' },
]

export async function POST(request: NextRequest) {
  const requestId = `gen-scenes-${Date.now()}`
  const startTs = Date.now()
  try {
    const secret = request.headers.get('x-internal-secret')
    if (!process.env.LEADS_TRIGGER_SECRET || secret !== process.env.LEADS_TRIGGER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = await createClient()
    const { documentId, count } = await request.json()
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    const { data: doc, error } = await supabase.from('documents').select('*').eq('id', documentId).single()
    if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const data = doc.data as Record<string, unknown>
    const brandName = (data.brandName as string) || ''
    const brandAssets = (data._brandAssets as BrandAssets) || {}
    const productRefs = (brandAssets.productImages || [])
      .filter((p) => p.status !== 'rejected')
      .map((p) => p.url)
    if (!productRefs.length) {
      return NextResponse.json({ error: 'No product images on _brandAssets — seed/acquire products first' }, { status: 400 })
    }

    // Brand palette (from _brandColors if present, else wizard visualIdentity, else Soltam-ish default).
    const bc = (data._brandColors as Record<string, string>) || {}
    const colors = {
      primary: bc.primary || '#D32F2F',
      secondary: bc.secondary || '#1A1A1A',
      accent: bc.accent || '#9E9E9E',
      background: bc.background || '#F6F3EE',
      text: bc.text || '#141414',
    }

    const wanted = Math.min(Math.max(1, Number(count) || ART_DIRECTIONS.length), ART_DIRECTIONS.length)
    const jobs = ART_DIRECTIONS.slice(0, wanted)
    console.log(`[${requestId}] 🎬 Generating ${jobs.length} scenes for "${brandName}" from ${productRefs.length} product refs`)

    // Run 2-at-a-time to keep within Nano Banana rate limits + the time budget.
    const scenes: SceneImageAsset[] = []
    const deadline = startTs + (maxDuration - 60) * 1000
    for (let i = 0; i < jobs.length; i += 2) {
      if (Date.now() > deadline) { console.log(`[${requestId}] ⏱️ budget reached at ${scenes.length}`); break }
      const batch = jobs.slice(i, i + 2)
      const results = await Promise.all(batch.map((j) =>
        generateBrandScene({
          brandName,
          forSlideType: j.forSlideType,
          artDirection: j.artDirection,
          designSystem: { colors },
          productRefs,
          documentId,
        }).catch(() => null),
      ))
      for (const s of results) if (s) scenes.push(s)
      console.log(`[${requestId}]   … ${scenes.length}/${jobs.length} so far`)
    }

    const merged: BrandAssets = { ...brandAssets, sceneImages: scenes, updatedAt: new Date().toISOString() }
    await supabase.from('documents').update({
      data: { ...data, _brandAssets: merged },
      updated_at: new Date().toISOString(),
    }).eq('id', documentId)

    console.log(`[${requestId}] ✅ ${scenes.length} scenes (${scenes.filter(s => s.status === 'verified').length} verified) in ${Date.now() - startTs}ms`)
    return NextResponse.json({
      ok: true,
      sceneCount: scenes.length,
      verified: scenes.filter((s) => s.status === 'verified').length,
      scenes: scenes.map((s) => ({ url: s.url, status: s.status, forSlideType: s.forSlideType })),
    })
  } catch (err) {
    console.error(`[${requestId}] ❌`, err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'gen-scenes failed' }, { status: 500 })
  }
}
