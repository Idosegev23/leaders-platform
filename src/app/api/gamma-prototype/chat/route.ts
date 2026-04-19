/**
 * AI chat for cross-slide edits on a StructuredPresentation.
 * Input: { presentation, instruction }
 * Output: { presentation } (full modified deck)
 *
 * Example instructions:
 *  - "קצר את כל השקפים"
 *  - "שנה את הטון לדרמטי יותר"
 *  - "הפוך הכל לעברית פורמלית"
 */

import { NextRequest, NextResponse } from 'next/server'
import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type { StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'

export const maxDuration = 300

const SYSTEM = `את/ה איש/אשת פרסום ואסטרטגיה בכיר/ה, עורך/ת של StructuredPresentation ב-Leaders AI.
מקבל/ת מצגת מובנית (JSON) + הוראה.
מחזיר/ה את אותה מצגת עם שינויים נקודתיים לפי ההוראה, בעברית חדה ומקצועית.

כללים:
- שומר/ת על מבנה ה-JSON בדיוק (אותם slides, layouts, slot keys).
- לא מוסיף/ה שקפים חדשים אלא אם הוראה מפורשת.
- לא משנה elementStyles / freeElements / hiddenRoles / bg.
- משנה רק slots.* ו-designSystem (אם רלוונטי).
- אם insight — שומר/ת על source. אם creative — שומר/ת על רפרנס-עולם.
- עברית ← עברית. אנגלית ← אנגלית. אלא אם ההוראה מבקשת תרגום.

החזר/י JSON מלא של StructuredPresentation. ללא markdown.`

export async function POST(req: NextRequest) {
  try {
    const { presentation, instruction } = await req.json() as {
      presentation: StructuredPresentation
      instruction: string
    }
    if (!presentation || !instruction) {
      return NextResponse.json({ error: 'presentation + instruction required' }, { status: 400 })
    }

    const prompt = [
      `## מצגת נוכחית (JSON):`,
      JSON.stringify(presentation),
      '',
      `## הוראה:`,
      instruction,
      '',
      `## פלט: JSON מלא של StructuredPresentation מעודכן. רק JSON.`,
    ].join('\n')

    const result = await callAI({
      model: 'gemini-3-pro-preview',
      prompt,
      callerId: 'gamma-chat',
      maxOutputTokens: 32000,
      geminiConfig: {
        systemInstruction: SYSTEM,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    })

    const parsed = parseGeminiJson<StructuredPresentation>(result.text)
    if (!parsed?.slides?.length) {
      return NextResponse.json({ error: 'Invalid AI response', raw: result.text.slice(0, 500) }, { status: 500 })
    }

    // Preserve user-level customizations (the AI shouldn't touch these)
    const merged: StructuredPresentation = {
      ...parsed,
      slides: parsed.slides.map((s, i) => {
        const original = presentation.slides[i]
        if (!original) return s
        return {
          ...s,
          elementStyles: original.elementStyles,
          freeElements: original.freeElements,
          hiddenRoles: original.hiddenRoles,
          bg: original.bg,
        }
      }),
    }

    return NextResponse.json({ success: true, presentation: merged })
  } catch (err) {
    console.error('[gamma-chat] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
