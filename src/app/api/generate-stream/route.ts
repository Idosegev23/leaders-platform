import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import type { PremiumDesignSystem, SlidePlan, PipelineFoundation } from '@/lib/gemini/slide-design/types'

export const maxDuration = 300

/**
 * POST /api/generate-stream
 *
 * Streams HTML slides one-by-one using AI SDK 6.
 * Client uses useCompletion() to receive slides as they're generated.
 *
 * Body: { documentId, batchIndex }
 *
 * The response is a text stream where each complete slide HTML is
 * delimited by <!--SLIDE_BREAK-->.
 * Client splits on this delimiter to show slides as they arrive.
 */
export async function POST(request: NextRequest) {
  const requestId = `stream-${Date.now()}`

  try {
    const supabase = await createClient()

    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return new Response('Unauthorized', { status: 401 })
    }

    const { documentId, batchIndex = 0 } = await request.json()
    if (!documentId) return new Response('documentId required', { status: 400 })

    // Load document
    const { data: doc } = await supabase.from('documents').select('data').eq('id', documentId).single()
    if (!doc) return new Response('Document not found', { status: 404 })

    const docData = doc.data as Record<string, unknown>
    const pipeline = docData._pipeline as { foundation: PipelineFoundation } | undefined
    if (!pipeline?.foundation) return new Response('Foundation not found', { status: 400 })

    const foundation = pipeline.foundation
    const ds = foundation.designSystem as PremiumDesignSystem
    const c = ds.colors
    const cd = ds.creativeDirection

    const batchIndices = foundation.batches[batchIndex]
    if (!batchIndices) return new Response('Invalid batch index', { status: 400 })

    const batchPlans = batchIndices.map((i: number) => foundation.plan[i])
    let slideOffset = 0
    for (let i = 0; i < batchIndex; i++) slideOffset += foundation.batches[i].length

    console.log(`[${requestId}] Streaming batch ${batchIndex + 1} (${batchPlans.length} slides)`)

    // Build per-slide content blocks
    const slidesBlock = batchPlans.map((plan: SlidePlan, i: number) => {
      const globalIndex = slideOffset + i + 1
      const imageUrl = plan.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
      const parts: string[] = [`Title: ${plan.title}`]
      if (plan.subtitle) parts.push(`Subtitle: ${plan.subtitle}`)
      if (plan.bodyText) parts.push(`Body: ${plan.bodyText}`)
      if (plan.bulletPoints?.length) parts.push(`Bullets:\n${plan.bulletPoints.map((b: string) => `  • ${b}`).join('\n')}`)
      if (plan.cards?.length) parts.push(`Cards:\n${plan.cards.map((card: { title: string; body: string }) => `  - ${card.title}: ${card.body}`).join('\n')}`)
      if (plan.keyNumber) parts.push(`KEY STAT: ${plan.keyNumber} (${plan.keyNumberLabel || ''})`)
      if (plan.tagline) parts.push(`Tagline: ${plan.tagline}`)
      if (imageUrl) parts.push(`IMAGE URL: ${imageUrl}`)
      return `<slide index="${globalIndex}" type="${plan.slideType}" tone="${plan.emotionalTone || 'professional'}">\n${parts.join('\n')}\n</slide>`
    }).join('\n\n')

    const prompt = `Design ${batchPlans.length} presentation slides for "${foundation.brandName}".

<design_system>
Primary: ${c.primary} | Secondary: ${c.secondary} | Accent: ${c.accent}
Background: ${c.background || '#0C0C10'} | Text: ${c.text || '#F5F5F7'}
Font: Heebo | Direction: RTL
${cd ? `Metaphor: ${cd.visualMetaphor}\nTension: ${cd.visualTension}` : ''}
</design_system>

<slides>
${slidesBlock}
</slides>

For EACH slide, output a COMPLETE HTML document (1920×1080, RTL Hebrew, Heebo font).
Use glassmorphism, mesh gradients, text-stroke watermarks, multi-layer text-shadows.
CRITICAL: After each complete slide, output exactly: <!--SLIDE_BREAK-->
This delimiter separates slides so they can be displayed one by one.

Start with the first slide NOW.`

    // Stream with AI SDK 6
    const result = streamText({
      model: anthropic('claude-sonnet-4-6-20250514'),
      system: 'You are a legendary presentation designer. Output complete HTML slides separated by <!--SLIDE_BREAK-->. Each slide is a full HTML document starting with <!DOCTYPE html>. No JSON wrapping. No markdown fences. Just raw HTML then the delimiter.',
      prompt,
      maxOutputTokens: 32768,
    })

    console.log(`[${requestId}] Stream started`)

    return result.toTextStreamResponse({
      headers: {
        'X-Batch-Index': String(batchIndex),
        'X-Slide-Count': String(batchPlans.length),
        'X-Brand-Name': encodeURIComponent(foundation.brandName),
      },
    })
  } catch (error) {
    console.error(`[${requestId}] Stream error:`, error)
    return new Response(error instanceof Error ? error.message : 'Stream failed', { status: 500 })
  }
}
