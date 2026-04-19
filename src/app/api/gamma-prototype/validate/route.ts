/**
 * Slide validation — verify sources and creative references using Gemini + Google grounding.
 *
 * POST { slide } → { source?: {status, reasoning, foundUrl?}, reference?: {...}, image?: {...} }
 * POST { presentation } (batch) → { results: [{slideIndex, validation}] } — for "verify whole deck"
 *
 * Uses Google Search grounding so the model is forced to cite real web results.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type { StructuredSlide } from '@/lib/gemini/layout-prototypes/types'

export const maxDuration = 180

type SourceStatus = 'verified' | 'unverified' | 'fake'

interface ValidationResult {
  source?: { status: SourceStatus; reasoning?: string; foundUrl?: string; checkedAt: string }
  reference?: { status: SourceStatus; reasoning?: string; checkedAt: string }
}

const SOURCE_VALIDATOR_SYSTEM = `את/ה מאמת/ת עובדות למצגות קריאייטיב.
קיבלת תובנה (insight) + נתון (dataPoint) + מקור (source) + תיאור (dataLabel).
המשימה: לאמת שהמקור אמיתי וקיים, ושהנתון תואם לאמור בו.

עליך להשתמש ב-Google Search כדי לחפש את המקור. אם מצאת — תחזיר URL.
אם המקור מזויף / לא קיים / לא תואם — תחזיר status "fake" עם הסבר.
אם לא ודאי — status "unverified".

החזר JSON בדיוק: { "status": "verified" | "unverified" | "fake", "reasoning": "1-2 משפטים בעברית", "foundUrl": "https://..." | null }`

const REFERENCE_VALIDATOR_SYSTEM = `את/ה מאמת/ת רפרנסים לקמפיינים.
קיבלת תיאור קונספט קריאייטיבי שמזכיר קמפיין-עולם (שם + שנה + מה עשה).
המשימה: לבדוק שהקמפיין אמיתי (לא מומצא).

חפש/י ב-Google. החזר/י JSON: { "status": "verified"|"unverified"|"fake", "reasoning": "..." }`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slide = body.slide as StructuredSlide | undefined
    if (!slide) return NextResponse.json({ error: 'slide required' }, { status: 400 })

    const result: ValidationResult = {}

    // Source validation (insight layout)
    const slots = slide.slots as unknown as Record<string, unknown>
    if (slide.layout === 'centered-insight') {
      const source = String(slots.source || '').trim()
      const dataPoint = String(slots.dataPoint || '').trim()
      const dataLabel = String(slots.dataLabel || '').trim()
      const title = String(slots.title || '').trim()

      if (source) {
        console.log(`[validate] Checking source: "${source}" for "${dataPoint} ${dataLabel}"`)
        try {
          const ai = await callAI({
            model: 'gemini-3-pro-preview',
            prompt: `תובנה: ${title}\nנתון: ${dataPoint}\nהקשר: ${dataLabel}\nמקור מצוטט: ${source}\n\nאמת את המקור. החזר JSON בלבד.`,
            callerId: 'validate-source',
            maxOutputTokens: 1500,
            useGoogleSearch: true,
            geminiConfig: {
              systemInstruction: SOURCE_VALIDATOR_SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          })
          const parsed = parseGeminiJson<{ status: SourceStatus; reasoning?: string; foundUrl?: string }>(ai.text)
          result.source = {
            status: parsed?.status || 'unverified',
            reasoning: parsed?.reasoning,
            foundUrl: parsed?.foundUrl || undefined,
            checkedAt: new Date().toISOString(),
          }
        } catch (e) {
          console.error('[validate] source check failed:', e)
          result.source = { status: 'unverified', reasoning: 'Validation failed: ' + (e instanceof Error ? e.message : 'unknown'), checkedAt: new Date().toISOString() }
        }
      }
    }

    // Reference validation (creative layouts — body text may contain a campaign ref)
    if (slide.layout === 'full-bleed-image-text' || slide.layout === 'split-image-text') {
      const body = String(slots.body || slots.bodyText || '').trim()
      // Heuristic: look for a year pattern OR common campaign-mention words
      if (body && /\b(19|20)\d{2}\b/.test(body) && body.length > 30) {
        console.log(`[validate] Checking creative reference in body: "${body.slice(0, 80)}..."`)
        try {
          const ai = await callAI({
            model: 'gemini-3-pro-preview',
            prompt: `טקסט: "${body}"\n\nאם הטקסט מזכיר קמפיין/מותג/יצירה עם שם ושנה — אמת שהוא קיים. אם אין רפרנס מוצהר — החזר status "verified" עם reasoning "לא מוזכר רפרנס ספציפי".`,
            callerId: 'validate-reference',
            maxOutputTokens: 1000,
            useGoogleSearch: true,
            geminiConfig: {
              systemInstruction: REFERENCE_VALIDATOR_SYSTEM,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          })
          const parsed = parseGeminiJson<{ status: SourceStatus; reasoning?: string }>(ai.text)
          if (parsed?.status) {
            result.reference = {
              status: parsed.status,
              reasoning: parsed.reasoning,
              checkedAt: new Date().toISOString(),
            }
          }
        } catch (e) {
          console.warn('[validate] reference check failed (non-fatal):', e)
        }
      }
    }

    return NextResponse.json({ validation: result })
  } catch (err) {
    console.error('[validate] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
