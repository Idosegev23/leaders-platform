/**
 * Regenerate a single slide with AI.
 * Input: current slide + optional instruction + full presentation context.
 * Output: replacement StructuredSlide (layout may change, slots rewritten).
 */

import { NextRequest, NextResponse } from 'next/server'
import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type { StructuredSlide, StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'

export const maxDuration = 120

const SYSTEM = `את/ה איש/אשת פרסום בכיר/ה, מעצב/ת שקף יחיד במצגת Leaders AI.
עברית RTL, 1920×1080. המשימה: לייצר גרסה חדשה של השקף הנתון.

כללי איכות:
- חדות, מקצועיות, רהיטות. לא buzzwords ריקים.
- אם slideType = "insight" → dataPoint ספציפי + source אמיתי ומפורש (Nielsen / eMarketer / Ipsos / מחקר מקומי).
- אם slideType = "creative" → כלול רפרנס לקמפיין-עולם (שם + שנה).
- שמור/י על slideType אלא אם המשתמש ביקש אחרת. מותר לשנות layout.

החזר/י JSON יחיד: { "slideType": "...", "layout": "...", "slots": {...} }. רק JSON.

8 ה-layouts: hero-cover, full-bleed-image-text, split-image-text, centered-insight, three-pillars-grid, numbered-stats, influencer-grid, closing-cta.`

export async function POST(req: NextRequest) {
  try {
    const { slide, instruction, presentation } = await req.json() as {
      slide: StructuredSlide
      instruction?: string
      presentation?: StructuredPresentation
    }
    if (!slide) return NextResponse.json({ error: 'slide required' }, { status: 400 })

    const prompt = [
      `## מותג: ${presentation?.brandName || ''}`,
      presentation?.designSystem?.creativeDirection?.oneRule
        ? `## כלל יצירתי: ${presentation.designSystem.creativeDirection.oneRule}` : '',
      `## השקף הנוכחי:`,
      JSON.stringify(slide, null, 2),
      '',
      instruction ? `## בקשה: ${instruction}` : `## בקשה: עצב מחדש את השקף — אותו תוכן בסיסי, נסה/י layout או טקסטים חדים יותר.`,
      '',
      `## פלט: JSON יחיד של שקף חדש. רק JSON.`,
    ].filter(Boolean).join('\n')

    const result = await callAI({
      model: 'gemini-3-pro-preview',
      prompt,
      callerId: 'gamma-regen-slide',
      maxOutputTokens: 8000,
      geminiConfig: {
        systemInstruction: SYSTEM,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        temperature: 0.9,
        responseMimeType: 'application/json',
      },
    })

    const parsed = parseGeminiJson<StructuredSlide>(result.text)
    if (!parsed?.layout || !parsed?.slots) {
      return NextResponse.json({ error: 'Invalid response from AI', raw: result.text.slice(0, 500) }, { status: 500 })
    }

    // Preserve slideType if AI dropped it
    if (!parsed.slideType) parsed.slideType = slide.slideType

    return NextResponse.json({ success: true, slide: parsed })
  } catch (err) {
    console.error('[gamma-regen] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
