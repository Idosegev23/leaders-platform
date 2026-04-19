/**
 * Content Curator — AI Copywriter for Presentation Slides
 *
 * Transforms raw wizard JSON into presentation-ready content.
 * Runs BEFORE the slide designer so the design AI only handles layout.
 *
 * Input:  Raw slide content (goals arrays, nested objects, paragraphs)
 * Output: CuratedSlideContent (punchy headlines, formatted stats, tight bullets)
 */

import { Type } from '@google/genai'
import type { CuratedSlideContent } from '@/types/presentation'
import { getConfig } from '@/lib/config/admin-config'
import { MODEL_DEFAULTS, PROMPT_DEFAULTS } from '@/lib/config/defaults'
import { callAI } from '@/lib/ai-provider'

interface RawSlideInput {
  slideType: string
  title: string
  content: Record<string, unknown>
  imageUrl?: string
}

// ─── Config ────────────────────────────────────────────

async function getCuratorModel(): Promise<string> {
  return getConfig(
    'ai_models',
    'content_curator.model',
    MODEL_DEFAULTS['content_curator.model']?.value as string || 'gemini-3-flash-preview',
  )
}

async function getCuratorSystemPrompt(): Promise<string> {
  return getConfig(
    'ai_prompts',
    'content_curator.system_prompt',
    PROMPT_DEFAULTS['content_curator.system_prompt']?.value as string || DEFAULT_SYSTEM_PROMPT,
  )
}

const DEFAULT_SYSTEM_PROMPT = `אתה קופירייטר בכיר בסוכנות פרסום פרימיום ישראלית.
המשימה שלך: לקחת מידע גולמי ולהפוך אותו לתוכן מצגת ברמת Awwwards.
כל מילה שתכתוב תעוצב ב-PDF יוקרתי — מגזין אופנה, לא PowerPoint.

## כללי ברזל:
1. **פחות = יותר.** שקף לא אמור להיראות כמו מסמך Word. מקסימום 40 מילים בגוף טקסט.
2. **כותרות הורגות.** מקסימום 5 מילים. פאנצ'י, לא תיאורי. "שינוי כללי המשחק" לא "מטרות הקמפיין שלנו".
3. **נתונים כגיבורים.** מספר גדול + תווית קצרה > פסקה. "500K+ חשיפות" לא "אנו צופים כ-500,000 חשיפות".
4. **בולטים חדים.** כל נקודה = פעולה/תוצאה, לא תיאור. מקסימום 8 מילים לנקודה.
5. **כרטיסים ממוקדים.** כותרת של 2-3 מילים + גוף של משפט אחד. מקסימום 4 כרטיסים.
6. **טון סוכנות בוטיק.** שפה סוחפת, ביטחונית, לא ביורוקרטית. "נשבש את הפיד" לא "נפעל ברשתות החברתיות".
7. **עברית.** הכל בעברית. ללא נקודתיים (:) בכותרות.`

// ─── Structured Output Schema ──────────────────────────

const CURATED_SLIDE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slideType: { type: Type.STRING },
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          bodyText: { type: Type.STRING },
          bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          keyNumber: { type: Type.STRING },
          keyNumberLabel: { type: Type.STRING },
          cards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                body: { type: Type.STRING },
              },
              required: ['title', 'body'],
            },
          },
          tagline: { type: Type.STRING },
          imageRole: { type: Type.STRING, enum: ['hero', 'accent', 'background', 'portrait', 'icon'] },
          emotionalNote: { type: Type.STRING },
        },
        required: ['slideType', 'title'],
      },
    },
  },
  required: ['slides'],
}

// ─── Pacing hints per slide type ───────────────────────

const SLIDE_PACING: Record<string, { maxWords: number; prefer: string; tone: string }> = {
  cover:             { maxWords: 12, prefer: 'tagline + brand', tone: 'bold, confident' },
  brief:             { maxWords: 50, prefer: 'bodyText + bullets', tone: 'professional, empathetic' },
  goals:             { maxWords: 40, prefer: 'cards or bullets + keyNumber', tone: 'ambitious, clear' },
  audience:          { maxWords: 45, prefer: 'bodyText (persona story) + bullets', tone: 'human, vivid' },
  insight:           { maxWords: 25, prefer: 'keyNumber + bold bodyText', tone: 'provocative, aha-moment' },
  whyNow:            { maxWords: 35, prefer: 'keyNumber + bullets', tone: 'urgent, timely' },
  strategy:          { maxWords: 40, prefer: 'cards (pillars)', tone: 'strategic, visionary' },
  competitive:       { maxWords: 45, prefer: 'cards (competitors) + keyNumber', tone: 'analytical, sharp' },
  bigIdea:           { maxWords: 30, prefer: 'bold title + short bodyText', tone: 'exciting, creative, wow' },
  approach:          { maxWords: 45, prefer: 'cards (approaches)', tone: 'practical, innovative' },
  deliverables:      { maxWords: 50, prefer: 'cards + keyNumber (total)', tone: 'concrete, organized' },
  metrics:           { maxWords: 40, prefer: 'keyNumber + cards (KPIs)', tone: 'data-driven, confident' },
  influencerStrategy:{ maxWords: 45, prefer: 'bullets + bodyText', tone: 'strategic, insider' },
  contentStrategy:   { maxWords: 45, prefer: 'cards (themes)', tone: 'creative, structured' },
  influencers:       { maxWords: 50, prefer: 'cards (profiles)', tone: 'exciting, curated' },
  timeline:          { maxWords: 45, prefer: 'cards (phases) + keyNumber', tone: 'organized, progressive' },
  closing:           { maxWords: 15, prefer: 'tagline + subtitle', tone: 'warm, inviting, memorable' },
}

// ─── Main Function ─────────────────────────────────────

/**
 * Curate a batch of raw slide inputs into presentation-ready content.
 * Uses Flash model for speed (~3-5s for a batch of 4 slides).
 */
export async function curateSlideContent(
  slides: RawSlideInput[],
  brandName: string,
  creativeDirection?: {
    visualMetaphor?: string
    oneRule?: string
    emotionalArc?: string
    typographyVoice?: string
  },
): Promise<CuratedSlideContent[]> {
  const requestId = `curator-${Date.now()}`
  console.log(`[ContentCurator][${requestId}] Curating ${slides.length} slides for "${brandName}"`)

  const slidesXml = slides.map((slide, i) => {
    const pacing = SLIDE_PACING[slide.slideType] || SLIDE_PACING.brief
    const contentStr = JSON.stringify(slide.content, null, 1)

    return `<slide index="${i + 1}" type="${slide.slideType}" title="${slide.title}">
  <pacing maxWords="${pacing.maxWords}" prefer="${pacing.prefer}" tone="${pacing.tone}" />
  ${slide.imageUrl ? '<has_image>true</has_image>' : '<has_image>false</has_image>'}
  <raw_content>
${contentStr}
  </raw_content>
</slide>`
  }).join('\n\n')

  const cdSection = creativeDirection ? `
<creative_direction>
Visual Metaphor: ${creativeDirection.visualMetaphor || 'N/A'}
Master Rule: ${creativeDirection.oneRule || 'N/A'}
Emotional Arc: ${creativeDirection.emotionalArc || 'N/A'}
Typography Voice: ${creativeDirection.typographyVoice || 'N/A'}
</creative_direction>` : ''

  const prompt = `<task>
Transform the raw data below into presentation-ready content for "${brandName}".
Each slide must feel like a page from a premium brand book — punchy, visual, zero fluff.
</task>
${cdSection}

<rules>
1. **title**: Max 5 Hebrew words. Punchy. No colons. Think magazine headline.
2. **subtitle**: Optional. One short line that adds context. Max 8 words.
3. **bodyText**: Max ~40 words. If the data is complex, summarize ruthlessly. Better to cut than to bore.
4. **bulletPoints**: 3-5 items, max 8 words each. Start with action verb or bold noun. No "כמו כן" or filler.
5. **keyNumber**: Pick THE most impressive stat. Format it big: "500K+", "₪120K", "4.2%", "12 שבועות".
6. **keyNumberLabel**: 2-4 words explaining the number.
7. **cards**: Max 4. Each card title = 2-3 words. Card body = one punchy sentence.
8. **tagline**: Only for cover/closing/bigIdea. A memorable one-liner.
9. **imageRole**: If has_image=true, decide: hero (dominates), accent (supporting), background (behind text), portrait (person), icon (small).
10. **emotionalNote**: One word describing the slide's emotional intent (e.g., "סקרנות", "ביטחון", "התלהבות", "דחיפות").

CRITICAL: Not every field is needed. A great insight slide might only need title + keyNumber + bodyText.
A cover slide might only need title + tagline. Use ONLY what serves the slide. Empty fields are BETTER than weak content.
</rules>

<slides_to_curate>
${slidesXml}
</slides_to_curate>`

  const [model, systemPrompt] = await Promise.all([getCuratorModel(), getCuratorSystemPrompt()])

  try {
    const aiResult = await callAI({
      model,
      prompt,
      systemPrompt,
      geminiConfig: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: CURATED_SLIDE_SCHEMA,
        maxOutputTokens: 16384,
        temperature: 0.7,
      },
      responseSchema: CURATED_SLIDE_SCHEMA as Record<string, unknown>,
      thinkingLevel: 'LOW',
      maxOutputTokens: 16384,
      timeout: 60_000,
      callerId: requestId,
    })
    if (aiResult.switched) console.warn(`[ContentCurator][${requestId}] 🔄 Switched to Claude`)

    const raw = aiResult.text || ''
    let parsed: { slides: CuratedSlideContent[] }

    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn(`[ContentCurator][${requestId}] JSON.parse failed, using robust parser`)
      const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
      const fallback = parseGeminiJson<{ slides: CuratedSlideContent[] }>(raw)
      if (!fallback?.slides) throw new Error('Curator JSON parse failed completely')
      parsed = fallback
    }

    if (!parsed.slides || parsed.slides.length === 0) {
      throw new Error('Curator returned empty slides array')
    }

    // Merge imageUrl from input (Curator doesn't generate URLs)
    const curated = parsed.slides.map((cs, i) => ({
      ...cs,
      slideType: cs.slideType || slides[i]?.slideType || 'brief',
      imageUrl: slides[i]?.imageUrl,
    }))

    console.log(`[ContentCurator][${requestId}] Curated ${curated.length} slides:`)
    curated.forEach((c, i) => {
      const fields = [
        c.title ? 'title' : '',
        c.subtitle ? 'sub' : '',
        c.bodyText ? 'body' : '',
        c.bulletPoints?.length ? `${c.bulletPoints.length}bullets` : '',
        c.keyNumber ? `key:${c.keyNumber}` : '',
        c.cards?.length ? `${c.cards.length}cards` : '',
        c.tagline ? 'tag' : '',
      ].filter(Boolean).join(', ')
      console.log(`[ContentCurator][${requestId}]   ${i + 1}. ${c.slideType}: [${fields}] emotion:${c.emotionalNote || '-'}`)
    })

    return curated
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[ContentCurator][${requestId}] Failed: ${msg}. Returning raw fallback.`)
    return slides.map(s => buildFallbackCurated(s))
  }
}

/**
 * Minimal fallback — extract basic text from raw content when AI fails.
 */
function buildFallbackCurated(slide: RawSlideInput): CuratedSlideContent {
  const c = slide.content
  const headline = typeof c.headline === 'string' ? c.headline : slide.title

  // Try to extract bullets from common array fields
  const bullets: string[] = []
  for (const key of ['goals', 'painPoints', 'insights', 'criteria', 'deliverables']) {
    const arr = c[key]
    if (Array.isArray(arr)) {
      for (const item of arr.slice(0, 4)) {
        if (typeof item === 'string') bullets.push(item.slice(0, 50))
        else if (typeof item === 'object' && item && 'title' in item) {
          bullets.push(String((item as { title: string }).title).slice(0, 50))
        }
      }
      break
    }
  }

  // Try to find a body text
  const body = typeof c.description === 'string' ? c.description
    : typeof c.brandBrief === 'string' ? c.brandBrief
    : typeof c.concept === 'string' ? c.concept
    : typeof c.strategy === 'string' ? c.strategy
    : undefined

  return {
    slideType: slide.slideType,
    title: headline,
    bodyText: body ? body.slice(0, 200) : undefined,
    bulletPoints: bullets.length > 0 ? bullets : undefined,
    imageUrl: slide.imageUrl,
  }
}
