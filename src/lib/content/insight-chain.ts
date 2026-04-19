/**
 * Insight Chain — 3-stage pipeline for generating sharp, punching insights.
 *
 * Stage 1: Contrarian Hypothesis — "What doesn't the audience know about themselves?"
 * Stage 2: Tension Finder — "What behavioral tension exists?"
 * Stage 3: Insight Crystallization — "One razor-sharp sentence"
 *
 * REWRITTEN April 2026: Migrated from Claude Opus to Gemini 3.1 Pro with
 * explicit context cache. Each session reuses the same brand context across
 * all 3 stages → ~70% cost saving on input tokens.
 *
 * Per gemini-toolkit skill matrix:
 *   Insight generation (creative) → gemini-3.1-pro + HIGH thinking + no tools
 */

import { callAI, createGeminiCache } from '@/lib/ai-provider'

export interface InsightChainInput {
  brandName: string
  industry: string
  targetAudience: string
  brandBrief: string
  painPoints: string[]
  researchData?: string // Additional brand research context
}

export interface InsightChainOutput {
  hypothesis: string    // Stage 1 output
  tension: string       // Stage 2 output
  insight: string       // Stage 3 output — THE final insight
  dataPoint: string     // Supporting data/stat
  source: string        // Where the data comes from
}

const STAGE_1_SYSTEM = `אתה אסטרטג שיווקי שמוצא את מה שאף אחד לא רואה. המשימה: מצא השערה מנוגדת לאינטואיציה על קהל היעד.

לא "הקהל רוצה X" אלא "הקהל חושב שהוא רוצה X, אבל בעצם הוא מונע מ-Y".

דוגמאות של השערות מנוגדות טובות:
- "אנשים שקונים רכבי יוקרה לא מחפשים סטטוס — הם מחפשים שקט. השקט של החלטה שלא צריך להצדיק."
- "הורים שקונים מוצרי פרימיום לתינוקות לא דואגים לאיכות — הם דואגים למה שהורים אחרים יחשבו עליהם."
- "אנשים שעוקבים אחרי משפיענים לא מחפשים השראה — הם מחפשים אישור להחלטה שכבר קיבלו."

החזר רק את ההשערה — משפט אחד בעברית. חד, מפתיע, אמיתי.`

const STAGE_2_SYSTEM = `אתה מוצא מתחים התנהגותיים — פערים בין מה שאנשים אומרים לבין מה שהם עושים.

בהינתן השערה מנוגדת, מצא את המתח הספציפי:
- "הם אומרים X, אבל עושים Y"
- "הם מחפשים X, אבל בורחים מ-Y"
- "הם מאמינים ב-X, אבל קונים Y"

חייב לכלול נתון כמותי אמיתי (אחוז, מספר, מחקר). אם אין לך נתון ספציפי — השתמש בנתון הגיוני עם מקור מוערך.

פורמט:
מתח: [המתח]
נתון: [X% / מספר]
מקור: [שם המחקר / הסקר / הפלטפורמה]`

const STAGE_3_SYSTEM = `אתה מגבש תובנה אסטרטגית למצגת.

קח את ההשערה והמתח וצור משפט תובנה אחד שעונה על שני קריטריונים:
1. מפתיע — הקורא אומר "וואו, לא חשבתי על זה ככה"
2. מחבר לפעולה — ברור מה צריך לעשות

דוגמאות תובנות טובות:
- "73% מהקונים מחליטים לפי המלצת חבר — לא לפי פרסום. המותג שלכם צריך חברים, לא קמפיינים."
- "דור ה-Z לא בורח מפרסומות — הוא בורח מהעמדת פנים. הפרסום שהוא מחפש נראה כמו תוכן, לא כמו מכירה."

החזר רק את משפט התובנה — בעברית. חד כתער.`

const MODEL = 'gemini-3.1-pro-preview'

/**
 * Run the full 3-stage insight chain on Gemini Pro.
 * Each stage runs sequentially because each depends on the previous.
 */
export async function generateInsight(input: InsightChainInput): Promise<InsightChainOutput> {
  const requestId = `insight-${Date.now()}`
  const startTs = Date.now()
  console.log(`[InsightChain][${requestId}] ═══════════════════════════════════════`)
  console.log(`[InsightChain][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[InsightChain][${requestId}]    industry: ${input.industry}`)
  console.log(`[InsightChain][${requestId}]    audience: ${(input.targetAudience || '').slice(0, 100)}`)
  console.log(`[InsightChain][${requestId}]    pain points: [${input.painPoints.join(', ')}]`)
  console.log(`[InsightChain][${requestId}]    research: ${input.researchData ? input.researchData.length + ' chars' : 'none'}`)

  const context = `
מותג: ${input.brandName}
תעשייה: ${input.industry}
קהל יעד: ${input.targetAudience}
בריף: ${input.brandBrief}
נקודות כאב: ${input.painPoints.join(', ')}
${input.researchData ? `מחקר: ${input.researchData}` : ''}
`.trim()

  // ── Try to create an explicit cache for the brand context ──
  // Stage 1+2+3 all reuse the same brand context → ideal for caching.
  // Pro min cache size: 4096 tokens. If context is too small, skip cache.
  let cacheName: string | undefined
  if (context.length > 5000) {
    try {
      cacheName = await createGeminiCache({
        model: MODEL,
        systemInstruction: `Brand context (cached, used by all 3 insight stages):\n${context}`,
        ttlSeconds: 600, // 10 min — long enough for all 3 stages
        callerId: `${requestId}-cache`,
      })
      console.log(`[InsightChain][${requestId}] 💾 Cache created for brand context (~${Math.round(context.length / 4)} tokens)`)
    } catch (err) {
      console.warn(`[InsightChain][${requestId}] ⚠️ Cache creation failed (non-critical), continuing without cache:`, err instanceof Error ? err.message : err)
    }
  } else {
    console.log(`[InsightChain][${requestId}] ℹ️ Context too small for explicit cache (${context.length} chars), skipping`)
  }

  // ── Stage 1: Contrarian Hypothesis ──
  console.log(`[InsightChain][${requestId}] 🎯 Stage 1: Contrarian Hypothesis`)
  const t1 = Date.now()
  const stage1Result = await callAI({
    model: MODEL,
    prompt: cacheName ? 'בהתבסס על פרטי המותג שב-system context, מצא השערה מנוגדת לאינטואיציה.' : context,
    systemPrompt: STAGE_1_SYSTEM,
    ...(cacheName ? { cachedContent: cacheName } : {}),
    geminiConfig: {
      systemInstruction: STAGE_1_SYSTEM,
      thinkingConfig: { thinkingLevel: 'HIGH' as any },
      maxOutputTokens: 1024,
    },
    thinkingLevel: 'HIGH',
    maxOutputTokens: 1024,
    callerId: `${requestId}-s1`,
    noGlobalFallback: true,
  })
  const hypothesis = (stage1Result.text || '').trim()
  console.log(`[InsightChain][${requestId}] ✅ Stage 1 done in ${Date.now() - t1}ms`)
  console.log(`[InsightChain][${requestId}]    Hypothesis: "${hypothesis.slice(0, 150)}..."`)

  // ── Stage 2: Tension Finder ──
  console.log(`[InsightChain][${requestId}] 🎯 Stage 2: Tension Finder`)
  const t2 = Date.now()
  const stage2Result = await callAI({
    model: MODEL,
    prompt: `${cacheName ? '' : context + '\n\n'}השערה מנוגדת:\n${hypothesis}\n\nמצא את המתח הספציפי + נתון + מקור.`,
    systemPrompt: STAGE_2_SYSTEM,
    ...(cacheName ? { cachedContent: cacheName } : {}),
    geminiConfig: {
      systemInstruction: STAGE_2_SYSTEM,
      thinkingConfig: { thinkingLevel: 'HIGH' as any },
      maxOutputTokens: 1024,
    },
    thinkingLevel: 'HIGH',
    maxOutputTokens: 1024,
    callerId: `${requestId}-s2`,
    noGlobalFallback: true,
  })
  const tensionRaw = (stage2Result.text || '').trim()
  console.log(`[InsightChain][${requestId}] ✅ Stage 2 done in ${Date.now() - t2}ms`)
  console.log(`[InsightChain][${requestId}]    Tension raw: "${tensionRaw.slice(0, 200)}..."`)

  // Parse tension, data, source
  const tensionMatch = tensionRaw.match(/מתח:\s*(.+)/)?.[1]?.trim() || tensionRaw.split('\n')[0]
  const dataMatch = tensionRaw.match(/נתון:\s*(.+)/)?.[1]?.trim() || ''
  const sourceMatch = tensionRaw.match(/מקור:\s*(.+)/)?.[1]?.trim() || ''
  console.log(`[InsightChain][${requestId}]    parsed → tension="${tensionMatch.slice(0, 60)}", data="${dataMatch}", source="${sourceMatch}"`)

  // ── Stage 3: Insight Crystallization ──
  console.log(`[InsightChain][${requestId}] 🎯 Stage 3: Crystallization`)
  const t3 = Date.now()
  const stage3Result = await callAI({
    model: MODEL,
    prompt: `${cacheName ? '' : context + '\n\n'}השערה: ${hypothesis}\n\nמתח: ${tensionMatch}\nנתון: ${dataMatch}\nמקור: ${sourceMatch}\n\nגבש משפט תובנה אחד חד כתער.`,
    systemPrompt: STAGE_3_SYSTEM,
    ...(cacheName ? { cachedContent: cacheName } : {}),
    geminiConfig: {
      systemInstruction: STAGE_3_SYSTEM,
      thinkingConfig: { thinkingLevel: 'HIGH' as any },
      maxOutputTokens: 512,
    },
    thinkingLevel: 'HIGH',
    maxOutputTokens: 512,
    callerId: `${requestId}-s3`,
    noGlobalFallback: true,
  })
  const insight = (stage3Result.text || '').trim()
  console.log(`[InsightChain][${requestId}] ✅ Stage 3 done in ${Date.now() - t3}ms`)
  console.log(`[InsightChain][${requestId}] ✨ FINAL INSIGHT: "${insight}"`)
  console.log(`[InsightChain][${requestId}] ⏱️ Total: ${Date.now() - startTs}ms (cache=${cacheName ? 'YES' : 'no'})`)
  console.log(`[InsightChain][${requestId}] ═══════════════════════════════════════`)

  return {
    hypothesis,
    tension: tensionMatch,
    insight,
    dataPoint: dataMatch,
    source: sourceMatch,
  }
}
