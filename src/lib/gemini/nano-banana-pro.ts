/**
 * Nano Banana Pro — Advanced image generation with Hebrew text support
 *
 * Wraps gemini-3-pro-image-preview with capabilities the basic imagen.ts wrapper lacks:
 * - Up to 14 reference images (logo + brand assets)
 * - Hebrew text rendering inside generated images
 * - Image editing (text-and-image-to-image)
 * - 4K output
 *
 * Use cases:
 * - Slide backgrounds with Hebrew titles baked in
 * - Hero images that match the brand's visual identity (via reference logo)
 * - Editing/refining an existing image with Hebrew typography
 */

import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-3-pro-image-preview'

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
  }
  return _client
}

export interface ReferenceImage {
  base64: string
  mimeType: string
  caption?: string
}

export interface NanoBananaInput {
  /** Main prompt describing what to generate */
  prompt: string
  /** Hebrew text to render inside the image (optional) */
  hebrewText?: { title?: string; subtitle?: string; cta?: string }
  /** Up to 14 reference images for style/brand matching */
  references?: ReferenceImage[]
  /** Aspect ratio for the output */
  aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3' | '3:4'
  /** Output resolution */
  imageSize?: '1K' | '2K' | '4K'
  /** Enable Google Search grounding (for "make it look like real X" prompts) */
  useSearchGrounding?: boolean
}

export interface NanoBananaResult {
  base64: string
  mimeType: string
  prompt: string
}

/**
 * Generate an image with optional Hebrew text and reference images.
 */
export async function generateWithNanoBanana(
  input: NanoBananaInput,
): Promise<NanoBananaResult | null> {
  const requestId = `nano-${Date.now()}`
  const refCount = input.references?.length || 0

  if (refCount > 14) {
    throw new Error(`Nano Banana Pro supports max 14 reference images, got ${refCount}`)
  }

  const startTs = Date.now()
  console.log(`[NanoBanana][${requestId}] ═══════════════════════════════════════`)
  console.log(`[NanoBanana][${requestId}] 🎨 Generating ${input.aspectRatio || '16:9'} ${input.imageSize || '2K'}, refs=${refCount}, grounding=${input.useSearchGrounding ? 'YES' : 'no'}`)
  console.log(`[NanoBanana][${requestId}]    prompt (${input.prompt.length} chars): ${input.prompt.slice(0, 200)}...`)
  if (input.hebrewText) {
    if (input.hebrewText.title) console.log(`[NanoBanana][${requestId}]    🇮🇱 title: "${input.hebrewText.title}"`)
    if (input.hebrewText.subtitle) console.log(`[NanoBanana][${requestId}]    🇮🇱 subtitle: "${input.hebrewText.subtitle}"`)
    if (input.hebrewText.cta) console.log(`[NanoBanana][${requestId}]    🇮🇱 cta: "${input.hebrewText.cta}"`)
  }

  // Build prompt with Hebrew text directives if provided
  let fullPrompt = input.prompt
  if (input.hebrewText) {
    const t = input.hebrewText
    const lines: string[] = []
    if (t.title)    lines.push(`Hebrew title text: "${t.title}" — render in elegant Hebrew typography, prominently visible`)
    if (t.subtitle) lines.push(`Hebrew subtitle: "${t.subtitle}"`)
    if (t.cta)      lines.push(`Hebrew CTA button text: "${t.cta}"`)
    fullPrompt += `\n\nIMPORTANT — Render this Hebrew text inside the image with PERFECT typography (right-to-left, modern Hebrew font, no garbled characters):\n${lines.join('\n')}`
  }

  // Build contents — references come first, then the prompt
  const parts: Array<Record<string, unknown>> = []
  if (input.references) {
    for (const ref of input.references) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } })
      if (ref.caption) parts.push({ text: `[Reference: ${ref.caption}]` })
    }
  }
  parts.push({ text: fullPrompt })

  const config: Record<string, unknown> = {
    responseModalities: ['image', 'text'],
    imageConfig: {
      aspectRatio: input.aspectRatio || '16:9',
      imageSize: input.imageSize || '2K',
    },
  }
  if (input.useSearchGrounding) {
    config.tools = [{ googleSearch: {} }]
  }

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }] as any,
      config: config as any,
    })

    const elapsed = Date.now() - startTs
    const candidates = response.candidates || []
    console.log(`[NanoBanana][${requestId}] 📥 Response in ${elapsed}ms — candidates=${candidates.length}`)
    for (const candidate of candidates) {
      const respParts = candidate.content?.parts || []
      for (const part of respParts) {
        if (part.inlineData) {
          const sizeKb = Math.round((part.inlineData.data?.length || 0) / 1024)
          console.log(`[NanoBanana][${requestId}] ✅ Generated image — ${sizeKb}KB ${part.inlineData.mimeType}`)
          console.log(`[NanoBanana][${requestId}] ═══════════════════════════════════════`)
          return {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/png',
            prompt: fullPrompt,
          }
        }
      }
    }

    console.warn(`[NanoBanana][${requestId}] ⚠️ No image in response after ${elapsed}ms`)
    return null
  } catch (err) {
    console.error(`[NanoBanana][${requestId}] ❌ Failed after ${Date.now() - startTs}ms:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Edit an existing image — pass it as a reference + describe the change.
 */
export async function editImageWithNanoBanana(
  sourceImage: ReferenceImage,
  editInstruction: string,
  hebrewText?: NanoBananaInput['hebrewText'],
): Promise<NanoBananaResult | null> {
  return generateWithNanoBanana({
    prompt: `Edit this image: ${editInstruction}. Preserve the overall composition and brand feel.`,
    references: [sourceImage],
    hebrewText,
    aspectRatio: '16:9',
    imageSize: '2K',
  })
}

/**
 * Generate a slide background image with brand-consistent style.
 * Uses the brand logo as a reference so colors/style match.
 */
export async function generateBrandedSlideBackground(opts: {
  brandName: string
  brandLogo?: ReferenceImage
  scenePrompt: string
  hebrewTitle?: string
  hebrewSubtitle?: string
}): Promise<NanoBananaResult | null> {
  const refs: ReferenceImage[] = []
  if (opts.brandLogo) refs.push({ ...opts.brandLogo, caption: `Brand logo for ${opts.brandName} — match its color palette and visual style` })

  return generateWithNanoBanana({
    prompt: `${opts.scenePrompt}. Cinematic commercial photography style, full bleed composition for a 1920x1080 presentation slide, premium aesthetic, dark editorial mood with subtle accent lighting, no people unless specified.`,
    references: refs,
    hebrewText: opts.hebrewTitle ? { title: opts.hebrewTitle, subtitle: opts.hebrewSubtitle } : undefined,
    aspectRatio: '16:9',
    imageSize: '4K',
  })
}
