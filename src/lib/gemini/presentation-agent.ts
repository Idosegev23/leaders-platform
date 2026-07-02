/**
 * Presentation Agent — ONE Gemini agent that builds an entire presentation.
 *
 * Architecture:
 *   1 agent call with multi-tool → researches, plans, generates, inspects.
 *   No data loss between stages — everything stays in context.
 *
 * Tools available to the agent:
 *   - google_search       — brand research (built-in)
 *   - url_context          — scrape brand website (built-in)
 *   - code_execution       — KPI calculations (built-in)
 *   - search_influencers   — IMAI API (function calling)
 *   - generate_slide_html  — creates one HTML slide at a time (function calling)
 *   - generate_image       — Nano Banana Pro for custom images (function calling)
 *
 * Per skill matrix: gemini-3.1-pro + HIGH thinking + multi-tool combining
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { searchIsraeliInfluencers, getAudienceReport } from '@/lib/imai/client'
import { pickPersona, renderAgentSlide } from './slide-personas'
import { checkWizardCoverage, type WizardContract, type CoverageResult } from './wizard-contract'
import { ART_DIRECTOR_RULES, auditDesignSystem } from '@/lib/design/art-director-rules'
import type { BrandAssets } from '@/lib/brand/types'
import type { PremiumDesignSystem } from './slide-design'

// ─── Types ──────────────────────────────────────────────

export interface AgentInput {
  brandName: string
  briefText: string
  kickoffText?: string
  /** Gemini Files API URI for PDF brief (preferred over briefText) */
  briefFileUri?: string
  briefFileMime?: string
  /** Pre-existing data from wizard (optional — agent fills gaps) */
  wizardData?: Record<string, unknown>
  /** Binding wizard requirements (buildWizardContract output) — injected into the prompt and coverage-checked after generation */
  wizardContract?: WizardContract
  /** Brand research already done (optional — agent will research if missing) */
  brandResearch?: Record<string, unknown>
  /** Images already generated */
  images?: Record<string, string>
  /** Verified brand assets (logo / product photos / scenes) — preferred imagery */
  brandAssets?: BrandAssets
  /** Client logo URL */
  clientLogoUrl?: string
  /** Leaders logo URL */
  leadersLogoUrl?: string
  /** Absolute epoch-ms ceiling for OPTIONAL post-passes (wizard repair).
   *  Past it, repair is skipped/aborted so the caller keeps time to persist. */
  deadlineTs?: number
}

export interface AgentSlide {
  slideType: string
  title: string
  html: string
  /** The content args the agent passed to generate_slide_html (no designColors) — used for wizard-coverage checks */
  content?: Record<string, unknown>
}

export interface AgentOutput {
  designSystem: PremiumDesignSystem
  slides: AgentSlide[]
  htmlSlides: string[]
  slideTypes: string[]
  research?: Record<string, unknown>
  influencers?: Array<{ username: string; followers: number; rationale: string }>
  kpis?: Record<string, number>
  /** Post-repair wizard coverage (present only when a contract was supplied) */
  wizardCoverage?: CoverageResult
  totalToolCalls: number
  durationMs: number
}

export type AgentProgressCallback = (event: {
  stage: string
  message: string
  slideIndex?: number
  totalSlides?: number
}) => void

// ─── Gemini Client ──────────────────────────────────────

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { timeout: 600_000 },
    })
  }
  return _client
}

// ─── Function Declarations ──────────────────────────────

const FUNCTION_DECLARATIONS = [
  {
    name: 'search_influencers',
    description:
      'Search for Israeli influencers on IMAI by keywords. Returns real data (followers, ER, username). ' +
      'Call this when you need to recommend specific influencers for the campaign.',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Topic keywords in English (e.g. ["cooking","food","lifestyle"])',
        },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
        minFollowers: { type: 'integer' },
        maxFollowers: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'get_influencer_audience',
    description:
      'Get detailed audience demographics for a specific influencer (gender, age, geo, credibility). ' +
      'Use only on top 2-3 final candidates. Costs 1 token per call.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'youtube'] },
      },
      required: ['username'],
    },
  },
  {
    name: 'generate_slide_html',
    description:
      'Generate ONE presentation slide as a complete HTML document (1920x1080, RTL Hebrew, Heebo font). ' +
      'Call this once per slide, in order (cover first, closing last). ' +
      'Pass the design system colors, the slide content, and any image URLs.',
    parameters: {
      type: 'object',
      properties: {
        slideType: {
          type: 'string',
          enum: ['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'bigIdea', 'deliverables', 'influencers', 'metrics', 'closing'],
        },
        title: { type: 'string', description: 'Hebrew title, max 8 words' },
        subtitle: { type: 'string', description: 'Hebrew subtitle, max 12 words' },
        bodyText: { type: 'string', description: 'Hebrew body, max 40 words' },
        bulletPoints: { type: 'array', items: { type: 'string' }, description: 'Max 5 bullets, 8 words each' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, body: { type: 'string' } },
            required: ['title', 'body'],
          },
          description: 'Max 4 cards',
        },
        keyNumber: { type: 'string', description: 'Big stat number (e.g. "₪150,000" or "1.5M")' },
        keyNumberLabel: { type: 'string' },
        imageUrl: { type: 'string', description: 'Image URL to include (object-fit:cover with gradient overlay)' },
        emotionalTone: { type: 'string' },
        designColors: {
          type: 'object',
          properties: {
            primary: { type: 'string' },
            secondary: { type: 'string' },
            accent: { type: 'string' },
            background: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['primary', 'background', 'text'],
        },
      },
      required: ['slideType', 'title', 'designColors'],
    },
  },
  {
    name: 'generate_brand_image',
    description:
      'Generate a premium brand image using Nano Banana Pro (Gemini image gen). ' +
      'Use for cover backgrounds, lifestyle shots, or brand mood images. Returns a URL.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image generation prompt (English, detailed, cinematic)' },
        aspectRatio: { type: 'string', enum: ['16:9', '1:1', '9:16'] },
      },
      required: ['prompt'],
    },
  },
]

// ─── Function Handlers ──────────────────────────────────


async function handleGenerateImage(args: Record<string, unknown>): Promise<{ imageUrl: string } | { error: string }> {
  try {
    const { generateWithNanoBanana } = await import('./nano-banana-pro')
    const result = await generateWithNanoBanana({
      prompt: (args.prompt as string) || '',
      aspectRatio: (args.aspectRatio as '16:9' | '1:1' | '9:16') || '16:9',
      imageSize: '2K',
    })
    if (!result) return { error: 'Image generation returned null' }

    // Upload to Supabase storage
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const buffer = Buffer.from(result.base64, 'base64')
    const path = `proposals/agent_${Date.now()}.${result.mimeType.includes('png') ? 'png' : 'jpg'}`
    await supabase.storage.from('assets').upload(path, buffer, { contentType: result.mimeType, upsert: true })
    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path)
    return { imageUrl: urlData.publicUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── The Agent ──────────────────────────────────────────

export async function runPresentationAgent(
  input: AgentInput,
  onProgress?: AgentProgressCallback,
): Promise<AgentOutput> {
  const requestId = `pres-agent-${Date.now()}`
  const startTs = Date.now()

  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[PresentationAgent][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[PresentationAgent][${requestId}]    brief: ${input.briefText.length} chars`)
  console.log(`[PresentationAgent][${requestId}]    fileUri: ${input.briefFileUri || 'none'}`)
  console.log(`[PresentationAgent][${requestId}]    wizardData: ${input.wizardData ? Object.keys(input.wizardData).length + ' keys' : 'none'}`)
  console.log(`[PresentationAgent][${requestId}]    images: ${input.images ? Object.keys(input.images).length : 0}`)

  onProgress?.({ stage: 'init', message: 'מאתחל סוכן AI...' })

  const client = getClient()
  const slides: AgentSlide[] = []
  const htmlSlides: string[] = []
  const slideTypes: string[] = []
  // Per-brand visual language — deterministic, so the same brand regenerates
  // consistently but different brands stop looking identical.
  const persona = pickPersona(input.brandName)
  console.log(`[PresentationAgent][${requestId}] 🎭 Visual persona: ${persona}`)
  // Image-variety enforcement: a URL may appear on at most 2 slides; the 3rd
  // use is rejected back to the model with the unused pool.
  const imageUse = new Map<string, number>()
  let totalToolCalls = 0
  let designSystem: PremiumDesignSystem | null = null
  let researchData: Record<string, unknown> | undefined
  let influencerData: Array<{ username: string; followers: number; rationale: string }> | undefined
  let kpiData: Record<string, number> | undefined

  // ── Two-phase tool strategy ──
  // SDK 1.34.0 doesn't support combining built-in tools with function declarations.
  // Phase 1: research with built-in tools (google_search, url_context, code_execution)
  // Phase 2: generate slides with function declarations only
  // Both phases share the same conversation history — no data loss.
  const researchTools: Array<Record<string, unknown>> = [
    { googleSearch: {} },
    { urlContext: {} },
    { codeExecution: {} },
  ]
  const generationTools: Array<Record<string, unknown>> = [
    { functionDeclarations: FUNCTION_DECLARATIONS },
  ]

  // Build the master prompt
  const wizardContext = input.wizardData
    ? `\n\nהנה נתונים שכבר נאספו בוויזרד (השתמש בהם, אל תמציא מחדש):\n${JSON.stringify(input.wizardData, null, 2).slice(0, 20000)}`
    : ''

  const researchContext = input.brandResearch
    ? `\n\nמחקר מותג שכבר בוצע (השתמש בו!):\n${JSON.stringify(input.brandResearch, null, 2).slice(0, 15000)}`
    : ''

  const imagesContext = input.images && Object.keys(input.images).length > 0
    ? `\n\nתמונות זמינות (השתמש ב-URLs האלה בשקפים):\n${Object.entries(input.images).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : ''

  // Verified real-brand imagery (scenes first — hero-worthy) beats generic AI images.
  const preferredImageryUrls = [
    ...(input.brandAssets?.sceneImages ?? []).filter(a => a.status !== 'rejected').map(a => a.url),
    ...(input.brandAssets?.productImages ?? []).filter(a => a.status !== 'rejected').map(a => a.url),
  ]
  const preferredImageryContext = preferredImageryUrls.length
    ? `\n\nתמונות מותג אמיתיות ומאומתות (המוצר האמיתי של הלקוח — סצנות ותצלומי מוצר). העדף אותן על פני כל תמונה אחרת כשאתה מעביר imageUrl לשקפים ויזואליים (cover, bigIdea, deliverables):\n${preferredImageryUrls.map(u => `  - ${u}`).join('\n')}`
    : ''

  const systemPrompt = `אתה סוכן AI מלא שבונה מצגות הצעת מחיר פרימיום עבור סוכנות שיווק המשפיענים Leaders.

המשימה שלך: מבריף אחד → מצגת מלאה של 11 שקפים.

## הזרימה שלך:

### שלב 1: מחקר (אם חסר)
${input.brandResearch ? 'מחקר מותג כבר בוצע — השתמש בו. אל תחפש שוב.' : '- חקור את המותג עם Google Search + URL Context\n- סרוק את האתר שלהם'}
- חפש משפיענים ישראלים ב-IMAI עם search_influencers
- ספציפי: keywords שמתאימים למותג + תעשייה

### שלב 2: תכנון
- הגדר Design System: צבעים (primary, secondary, accent, background, text), fonts (Heebo)
- תכנן 11 שקפים: cover, brief, goals, audience, insight, strategy, bigIdea, deliverables, influencers, metrics, closing
- כל שקף עם כותרת עברית חדה, תוכן ממוקד

### שלב 3: יצירת שקפים
- קרא ל-generate_slide_html לכל שקף, אחד-אחד, בסדר
- העבר את הצבעים מה-Design System
- אם יש תמונה — העבר imageUrl
- כל הטקסט בעברית!

### שלב 4: KPI (בשקף metrics)
- השתמש ב-code_execution כדי לחשב CPE/CPM/reach אמיתיים (Python)
- אל תנחש מספרים — חשב!

## כללי ברזל:
1. כל הטקסט בעברית. שמות מותגים יכולים להיות באנגלית.
2. INSIGHT חייב להיות חד ומבוסס נתון — לא "השוק משתנה"
3. STRATEGY חייבת להיות קונקרטית — headline + 3 pillars
4. אל תמציא נתונים. אם אין — חשב או חפש.
5. כל שקף = קריאה אחת ל-generate_slide_html. לא יותר מ-11 קריאות.
6. הצבעים חייבים להיות עקביים — אותו Design System בכל 11 השקפים.
7. כותרות: מקסימום 8 מילים. גוף: מקסימום 40 מילים.
8. גיוון תמונות — חוק קשיח: לעולם אל תעביר את אותו imageUrl ליותר משקף אחד
   (המערכת תדחה שימוש שלישי). לכל שקף ויזואלי בחר תמונה אחרת מהמאגר; אם אין
   תמונה חדשה מתאימה — צור אחת עם generate_brand_image או השמט את imageUrl
   (שקף טיפוגרפי נקי עדיף על תמונה חוזרת).
9. לכל שקף תוכן חייב להיות לפחות אחד מ: bodyText / bulletPoints / cards /
   keyNumber. שקף עם כותרת בלבד מוצג כשקף מעבר (section divider) — השתמש בזה
   בכוונה רק אם זו המטרה.

## פורמט סיום:
אחרי שיצרת את כל 11 השקפים, סכם ב-JSON:
{
  "designSystem": { "colors": {...}, "fonts": {...}, "effects": {...}, "creativeDirection": {...} },
  "summary": "סיכום בעברית של ההצעה"
}${input.wizardContract?.promptBlock ? `\n\n${input.wizardContract.promptBlock}` : ''}

${ART_DIRECTOR_RULES}`

  const userPrompt = `בנה מצגת הצעת מחיר עבור המותג "${input.brandName}".

## בריף:
${input.briefText.slice(0, 8000)}
${wizardContext}
${researchContext}
${imagesContext}
${preferredImageryContext}

התחל עכשיו. חקור → תכנן → צור 11 שקפים.`

  // Build contents — support Files API
  let contents: unknown
  if (input.briefFileUri && input.briefFileMime) {
    contents = [{
      role: 'user',
      parts: [
        { fileData: { mimeType: input.briefFileMime, fileUri: input.briefFileUri } },
        { text: userPrompt },
      ],
    }]
    console.log(`[PresentationAgent][${requestId}] 📄 Using Files API for brief`)
  } else {
    contents = userPrompt
  }

  // ── Agent Loop ──────────────────────────────────────────

  const history: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []
  if (Array.isArray(contents)) {
    history.push(contents[0] as any)
  } else {
    history.push({ role: 'user', parts: [{ text: contents as string }] })
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 1: Research — built-in tools (google_search, url_context, code_execution)
  // The model researches the brand, discovers competitors, scrapes the website.
  // No function declarations here — avoids the SDK limitation.
  // ════════════════════════════════════════════════════════════

  const needsResearch = !input.brandResearch
  if (needsResearch) {
    console.log(`[PresentationAgent][${requestId}] 📚 Phase 1: Research (built-in tools)`)
    onProgress?.({ stage: 'research', message: '🔍 חוקר את המותג...' })

    const researchConfig: GenerateContentConfig = {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingLevel: 'HIGH' as any },
      maxOutputTokens: 16000,
      tools: researchTools,
    } as GenerateContentConfig

    const researchPrompt = `חקור את המותג "${input.brandName}" בשוק הישראלי.
חפש באינטרנט וסרוק את האתר שלהם. מצא:
1. תעשייה, מתחרים, מיצוב
2. קהל יעד (גיל, מגדר, תחומי עניין)
3. נוכחות דיגיטלית (אינסטגרם, טיקטוק)
4. ערכי מותג, טון דיבור, סגנון ויזואלי
5. צבעים עיקריים של המותג (primary, accent)

בבריף כתוב: ${input.briefText.slice(0, 2000)}

סכם את הממצאים בפסקאות מסודרות בעברית. כלול נתונים ספציפיים ו-URLs.`

    try {
      const researchResponse: any = await client.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: researchPrompt,
        config: researchConfig,
      })

      const researchText = researchResponse.text || ''
      console.log(`[PresentationAgent][${requestId}] ✅ Research complete: ${researchText.length} chars`)

      // Inject research into history so Phase 2 has full context
      history.push({ role: 'user', parts: [{ text: `מחקר מותג שנאסף:\n\n${researchText}\n\nעכשיו בנה את המצגת. קרא ל-generate_slide_html עבור כל אחד מ-11 השקפים.` }] })
    } catch (researchErr) {
      console.warn(`[PresentationAgent][${requestId}] ⚠️ Research failed (continuing without):`, researchErr instanceof Error ? researchErr.message : researchErr)
      history.push({ role: 'user', parts: [{ text: `לא הצלחתי לחקור — השתמש במידע מהבריף בלבד. בנה את המצגת. קרא ל-generate_slide_html עבור כל אחד מ-11 השקפים.` }] })
    }
  } else {
    console.log(`[PresentationAgent][${requestId}] ℹ️ Phase 1 skipped — brandResearch already provided`)
    // Add instruction to generate slides immediately
    history.push({ role: 'user', parts: [{ text: `מחקר מותג כבר קיים (ב-wizardData). בנה את המצגת עכשיו. קרא ל-generate_slide_html עבור כל אחד מ-11 השקפים, בסדר: cover, brief, goals, audience, insight, strategy, bigIdea, deliverables, influencers, metrics, closing.` }] })
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 2: Generate slides — function declarations only
  // The model calls generate_slide_html, search_influencers, etc.
  // Research context is already in history from Phase 1.
  // ════════════════════════════════════════════════════════════

  console.log(`[PresentationAgent][${requestId}] 🎨 Phase 2: Generate slides (function calling)`)
  onProgress?.({ stage: 'generating', message: '🎨 מתחיל ליצור שקפים...' })

  const genConfig: GenerateContentConfig = {
    systemInstruction: systemPrompt,
    thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
    maxOutputTokens: 65536,
    tools: generationTools,
  } as GenerateContentConfig

  const MAX_ITERATIONS = 25 // 11 slides + IMAI searches + buffer

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const iterStart = Date.now()
    console.log(`[PresentationAgent][${requestId}] 🔁 Iteration ${iter + 1}/${MAX_ITERATIONS} (${slides.length}/11 slides, ${totalToolCalls} tool calls)`)

    const response: any = await client.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: history as any,
      config: genConfig,
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    console.log(`[PresentationAgent][${requestId}]   ⏱️ ${Date.now() - iterStart}ms, parts=${parts.length}, functionCalls=${functionCalls.length}`)

    if (functionCalls.length === 0) {
      // Agent finished — extract final text + designSystem
      const finalText = parts.filter((p: any) => p.text).map((p: any) => p.text).join('')
      console.log(`[PresentationAgent][${requestId}] ✅ Phase 2 finished: ${slides.length} slides, ${totalToolCalls} tool calls, ${Date.now() - startTs}ms`)

      // Try to parse design system from final response
      try {
        const jsonMatch = finalText.match(/\{[\s\S]*"designSystem"[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.designSystem) designSystem = parsed.designSystem
        }
      } catch { /* ok — use default */ }

      // Keep the closing model turn in history so the repair pass (if any)
      // continues a well-formed conversation.
      if (parts.length) history.push({ role: 'model', parts })

      break
    }

    // Process function calls
    history.push({ role: 'model', parts })

    const responseParts: Array<Record<string, unknown>> = []
    for (const part of functionCalls) {
      const fc = part.functionCall
      const name = fc.name as string
      const args = fc.args || {}
      totalToolCalls++

      console.log(`[PresentationAgent][${requestId}]   🔧 ${name}(${JSON.stringify(args).slice(0, 150)})`)

      let result: unknown

      try {
        switch (name) {
          case 'search_influencers': {
            onProgress?.({ stage: 'research', message: '🔍 מחפש משפיענים ב-IMAI...' })
            const keywords = (args.keywords as string[]) || []
            const influencers = await searchIsraeliInfluencers(keywords, {
              platform: (args.platform as 'instagram' | 'tiktok') || 'instagram',
              minFollowers: (args.minFollowers as number) || 5000,
              maxFollowers: (args.maxFollowers as number) || 500000,
              limit: (args.limit as number) || 10,
            })
            result = influencers.slice(0, 10).map(i => ({
              username: i.username, fullname: i.fullname,
              followers: i.followers, engagement_rate: i.engagement_rate,
              avg_likes: i.avg_likes, is_verified: i.is_verified,
            }))
            influencerData = influencers.slice(0, 8).map(i => ({
              username: i.username, followers: i.followers,
              rationale: `${i.fullname} — ${i.followers.toLocaleString()} followers, ER ${i.engagement_rate}%`,
            }))
            console.log(`[PresentationAgent][${requestId}]     → ${(result as any[]).length} influencers found`)
            break
          }

          case 'get_influencer_audience': {
            onProgress?.({ stage: 'research', message: `📊 בודק קהל של @${args.username}...` })
            const report = await getAudienceReport(args.username as string, (args.platform as any) || 'instagram')
            result = {
              username: report.user_profile.username,
              followers: report.user_profile.followers,
              er: report.user_profile.engagement_rate,
              genders: report.audience_followers?.data?.audience_genders,
              ages: report.audience_followers?.data?.audience_ages,
              credibility: report.audience_followers?.data?.audience_credibility,
            }
            break
          }

          case 'generate_slide_html': {
            const slideType = args.slideType as string
            const slideTitle = args.title as string
            const slideIndex = slides.length

            // Image-variety gate: reject the 3rd use of the same URL and hand
            // the model the still-unused pool so it can retry immediately.
            const imgUrl = ((args.imageUrl as string) || '').trim()
            if (imgUrl && (imageUse.get(imgUrl) ?? 0) >= 2) {
              const unused = preferredImageryUrls.filter(u => !imageUse.has(u)).slice(0, 10)
              console.log(`[PresentationAgent][${requestId}]     ✋ Rejected reused image on ${slideType} (already used twice)`)
              result = {
                success: false,
                error: 'התמונה הזו כבר בשימוש בשני שקפים. קרא שוב ל-generate_slide_html לאותו שקף עם תמונה אחרת מהרשימה, או צור חדשה עם generate_brand_image, או השמט imageUrl.',
                unusedImages: unused,
              }
              break
            }
            if (imgUrl) imageUse.set(imgUrl, (imageUse.get(imgUrl) ?? 0) + 1)

            onProgress?.({
              stage: 'generating',
              message: `🎨 מייצר שקף ${slideIndex + 1}/11: ${slideType}`,
              slideIndex,
              totalSlides: 11,
            })

            const html = renderAgentSlide(args, { persona, slideIndex, brandName: input.brandName })
            const content: Record<string, unknown> = { ...args }
            delete content.designColors
            slides.push({ slideType, title: slideTitle, html, content })
            htmlSlides.push(html)
            slideTypes.push(slideType)

            console.log(`[PresentationAgent][${requestId}]     → Slide ${slideIndex + 1}: ${slideType} "${slideTitle}" (${html.length} chars)`)
            result = { success: true, slideIndex, slideType, htmlLength: html.length }
            break
          }

          case 'generate_brand_image': {
            onProgress?.({ stage: 'images', message: '🎨 מייצר תמונה...' })
            result = await handleGenerateImage(args)
            console.log(`[PresentationAgent][${requestId}]     → Image: ${JSON.stringify(result).slice(0, 100)}`)
            break
          }

          default:
            result = { error: `Unknown function: ${name}` }
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
        console.error(`[PresentationAgent][${requestId}]     ❌ ${name} failed:`, result)
      }

      responseParts.push({
        functionResponse: { name, response: { result } },
      })
    }

    history.push({ role: 'user', parts: responseParts })
  }

  // ── Default Design System if agent didn't provide one ──
  if (!designSystem) {
    designSystem = {
      colors: {
        primary: '#E94560', secondary: '#1A1A2E', accent: '#E94560',
        background: '#0C0C10', text: '#F5F5F7', cardBg: 'rgba(255,255,255,0.05)',
        muted: 'rgba(245,245,247,0.5)',
      },
      typography: { headingSize: 64, bodySize: 22 },
      effects: { borderRadius: 'soft', borderRadiusValue: 16, shadowStyle: 'glow', decorativeStyle: 'minimal' },
      fonts: { heading: 'Heebo', body: 'Heebo' },
      direction: 'rtl',
    } as PremiumDesignSystem
  }

  // ── Design-system hardening (art-director rules: contrast floors, Hebrew fonts) ──
  try {
    const { issues, corrected } = auditDesignSystem({
      colors: ((designSystem as PremiumDesignSystem).colors ?? {}) as unknown as Record<string, string>,
      fonts: (designSystem as PremiumDesignSystem).fonts as unknown as Record<string, string> | undefined,
    })
    if (issues.length) {
      console.warn(
        `[PresentationAgent][${requestId}] 🎨 Design-system audit corrected ${issues.length} issue(s): ` +
          issues.map(i => `${i.field}: ${i.problem} → ${i.fix}`).join(' | '),
      )
    }
    designSystem = {
      ...designSystem,
      colors: { ...(designSystem as PremiumDesignSystem).colors, ...corrected.colors },
      ...(corrected.fonts ? { fonts: { ...(designSystem as PremiumDesignSystem).fonts, ...corrected.fonts } } : {}),
    } as PremiumDesignSystem
  } catch (auditErr) {
    console.warn(`[PresentationAgent][${requestId}] ⚠️ Design-system audit failed (using unaudited):`, auditErr instanceof Error ? auditErr.message : auditErr)
  }

  // ── Wizard-coverage check + ONE targeted repair pass ──
  // Missing binding items → a single follow-up conversation that regenerates
  // ONLY the affected slides. Residual misses are returned for editor flags —
  // coverage failures never block generation.
  let wizardCoverage: CoverageResult | undefined
  if (input.wizardContract?.items?.length) {
    const coverageSlides = () =>
      slides.map(s => ({ slideType: s.slideType, slots: s.content ?? { title: s.title } }))
    try {
      let coverage = checkWizardCoverage(coverageSlides(), input.wizardContract)
      console.log(`[PresentationAgent][${requestId}] 📋 Wizard coverage:\n${coverage.report}`)

      // Wall-clock guard: repair is OPTIONAL — it must never spend the time the
      // caller needs to persist the deck. Capped at 120s and at input.deadlineTs.
      const repairDeadline = Math.min(
        input.deadlineTs ?? Number.POSITIVE_INFINITY,
        Date.now() + 120_000,
      )
      if (coverage.missing.length > 0 && slides.length > 0 && repairDeadline - Date.now() < 30_000) {
        console.warn(`[PresentationAgent][${requestId}] 🔧 Repair skipped — under 30s left before deadline`)
      } else if (coverage.missing.length > 0 && slides.length > 0) {
        onProgress?.({ stage: 'repair', message: `🔧 משלים ${coverage.missing.length} פריטי ויזארד חסרים...` })
        // Map contract slide aliases to the generate_slide_html enum and drop
        // anything the tool can't produce ('stats' → 'metrics', unknown → out).
        const SLIDE_TYPE_ENUM = ['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'bigIdea', 'deliverables', 'influencers', 'metrics', 'closing']
        const SLIDE_TYPE_ALIASES: Record<string, string> = { stats: 'metrics', numbers: 'metrics', kpis: 'metrics' }
        const targetTypes = Array.from(new Set(
          coverage.missing
            .flatMap(m => m.mustAppearIn)
            .map(t => SLIDE_TYPE_ALIASES[t] ?? t)
            .filter(t => SLIDE_TYPE_ENUM.includes(t)),
        ))
        const missingLines = coverage.missing.map(m => {
          const v = Array.isArray(m.value) ? m.value.join(' | ') : m.value
          return `- ${m.requirement} [שקף: ${m.mustAppearIn.join('/')}]: ${v}`
        })
        history.push({
          role: 'user',
          parts: [{
            text:
              `בקרת איכות אוטומטית: הפריטים המחייבים הבאים מהוויזארד חסרים מהמצגת:\n${missingLines.join('\n')}\n\n` +
              `תקן עכשיו: קרא ל-generate_slide_html מחדש אך ורק עבור השקפים האלה: ${targetTypes.join(', ')}. ` +
              `צור כל שקף כזה מחדש בשלמותו — אותם צבעים ואותו סגנון — ושלב את הפריטים החסרים במדויק (מספרים וציטוטים כלשונם). אל תיגע בשקפים אחרים.`,
          }],
        })

        const MAX_REPAIR_ITERATIONS = 4
        for (let iter = 0; iter < MAX_REPAIR_ITERATIONS; iter++) {
          if (Date.now() >= repairDeadline) {
            console.warn(`[PresentationAgent][${requestId}] 🔧 Repair aborted at iteration ${iter} — deadline reached`)
            break
          }
          const response: any = await client.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: history as any,
            config: genConfig,
          })
          const parts = response.candidates?.[0]?.content?.parts || []
          const functionCalls = parts.filter((p: any) => p.functionCall)
          if (functionCalls.length === 0) break

          history.push({ role: 'model', parts })
          const responseParts: Array<Record<string, unknown>> = []
          for (const part of functionCalls) {
            const fc = part.functionCall
            totalToolCalls++
            let result: unknown
            if (fc.name === 'generate_slide_html') {
              const args = fc.args || {}
              const slideType = args.slideType as string
              const idx = slideTypes.indexOf(slideType)
              const html = renderAgentSlide(args, {
                persona,
                slideIndex: idx >= 0 ? idx : slides.length,
                brandName: input.brandName,
              })
              const content: Record<string, unknown> = { ...args }
              delete content.designColors
              if (idx >= 0) {
                slides[idx] = { slideType, title: (args.title as string) || slides[idx].title, html, content }
                htmlSlides[idx] = html
                console.log(`[PresentationAgent][${requestId}]   🔧 Repaired slide ${idx + 1} (${slideType})`)
                result = { success: true, replaced: true, slideIndex: idx, slideType }
              } else {
                // New slide type — insert BEFORE the closing slide so the
                // deck's narrative order survives the repair (never append
                // content after the CTA).
                const closingIdx = slideTypes.indexOf('closing')
                const insertAt = closingIdx >= 0 ? closingIdx : slides.length
                slides.splice(insertAt, 0, { slideType, title: (args.title as string) || '', html, content })
                htmlSlides.splice(insertAt, 0, html)
                slideTypes.splice(insertAt, 0, slideType)
                console.log(`[PresentationAgent][${requestId}]   🔧 Repair inserted missing slide (${slideType}) at ${insertAt + 1}`)
                result = { success: true, replaced: false, slideIndex: insertAt, slideType }
              }
            } else {
              result = { error: `Only generate_slide_html is allowed during repair (got ${fc.name})` }
            }
            responseParts.push({ functionResponse: { name: fc.name, response: { result } } })
          }
          history.push({ role: 'user', parts: responseParts })
        }

        coverage = checkWizardCoverage(coverageSlides(), input.wizardContract)
        console.log(`[PresentationAgent][${requestId}] 📋 Post-repair coverage: ${coverage.missing.length} still missing`)
      }
      wizardCoverage = coverage
    } catch (covErr) {
      console.warn(`[PresentationAgent][${requestId}] ⚠️ Wizard coverage check failed (continuing):`, covErr instanceof Error ? covErr.message : covErr)
    }
  }

  // ── Inject logos ──
  // Default to the dark wordmark served from /public on the app origin.
  // Callers can still override via input.leadersLogoUrl.
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://leaders-platform.vercel.app')).replace(/\/$/, '')
  const leadersLogo = input.leadersLogoUrl || `${appBase}/new_logo.svg`
  const clientLogo = input.clientLogoUrl || ''

  const finalHtml = htmlSlides.map(html => {
    let patched = html
    // Leaders logo
    if (leadersLogo && !patched.includes('leaders-logo')) {
      const logoTag = `<img src="${leadersLogo}" alt="Leaders" style="position:absolute;bottom:30px;left:40px;height:40px;opacity:0.8;z-index:10;" />`
      patched = patched.replace('</div></body>', `${logoTag}</div></body>`)
    }
    // Client logo
    if (clientLogo && !patched.includes(clientLogo)) {
      const clientTag = `<img src="${clientLogo}" alt="${input.brandName}" style="position:absolute;top:30px;right:40px;height:50px;opacity:0.9;z-index:10;" />`
      patched = patched.replace('</div></body>', `${clientTag}</div></body>`)
    }
    return patched
  })

  const durationMs = Date.now() - startTs
  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[PresentationAgent][${requestId}] ✅ DONE — ${finalHtml.length} slides, ${totalToolCalls} tool calls, ${durationMs}ms`)
  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)

  onProgress?.({ stage: 'done', message: `✅ מצגת מוכנה — ${finalHtml.length} שקפים`, totalSlides: finalHtml.length })

  return {
    designSystem,
    slides,
    htmlSlides: finalHtml,
    slideTypes,
    research: researchData,
    influencers: influencerData,
    kpis: kpiData,
    wizardCoverage,
    totalToolCalls,
    durationMs,
  }
}
