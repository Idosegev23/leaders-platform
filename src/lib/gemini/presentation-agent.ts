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
  /** Brand research already done (optional — agent will research if missing) */
  brandResearch?: Record<string, unknown>
  /** Images already generated */
  images?: Record<string, string>
  /** Client logo URL */
  clientLogoUrl?: string
  /** Leaders logo URL */
  leadersLogoUrl?: string
}

export interface AgentSlide {
  slideType: string
  title: string
  html: string
}

export interface AgentOutput {
  designSystem: PremiumDesignSystem
  slides: AgentSlide[]
  htmlSlides: string[]
  slideTypes: string[]
  research?: Record<string, unknown>
  influencers?: Array<{ username: string; followers: number; rationale: string }>
  kpis?: Record<string, number>
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

function buildSlideHtml(args: Record<string, unknown>): string {
  const c = (args.designColors || {}) as Record<string, string>
  const bg = c.background || '#0C0C10'
  const text = c.text || '#F5F5F7'
  const primary = c.primary || '#E94560'
  const accent = c.accent || primary
  const title = (args.title as string) || ''
  const subtitle = (args.subtitle as string) || ''
  const body = (args.bodyText as string) || ''
  const imageUrl = args.imageUrl as string | undefined
  const keyNum = args.keyNumber as string | undefined
  const keyLabel = args.keyNumberLabel as string | undefined
  const bullets = (args.bulletPoints as string[]) || []
  const cards = (args.cards as Array<{ title: string; body: string }>) || []
  const tone = (args.emotionalTone as string) || 'professional'

  // Dynamic glow colors
  const glow1 = `${primary}25`
  const glow2 = `${accent}18`

  const bulletsHtml = bullets.length
    ? `<ul style="list-style:none;margin-top:32px;">${bullets.map(b => `<li style="margin-bottom:16px;font-size:22px;padding-right:24px;position:relative;"><span style="position:absolute;right:0;color:${primary};">●</span>${b}</li>`).join('')}</ul>`
    : ''

  const cardsHtml = cards.length
    ? `<div style="display:flex;gap:24px;margin-top:40px;flex-wrap:wrap;">${cards.map((card, i) => `<div style="flex:1;min-width:280px;background:rgba(255,255,255,0.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;"><div style="font-size:48px;font-weight:900;color:${primary};opacity:0.15;margin-bottom:8px;">0${i + 1}</div><h3 style="font-size:24px;font-weight:700;margin-bottom:12px;">${card.title}</h3><p style="font-size:18px;opacity:0.7;line-height:1.5;">${card.body}</p></div>`).join('')}</div>`
    : ''

  const keyNumHtml = keyNum
    ? `<div style="position:absolute;bottom:120px;left:120px;"><span style="font-size:96px;font-weight:900;color:${primary};text-shadow:0 0 60px ${primary}40;">${keyNum}</span>${keyLabel ? `<div style="font-size:18px;opacity:0.5;margin-top:8px;">${keyLabel}</div>` : ''}</div>`
    : ''

  const imageHtml = imageUrl
    ? `<div style="position:absolute;inset:0;z-index:0;"><img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.4) contrast(1.15);" /><div style="position:absolute;inset:0;background:linear-gradient(180deg, ${bg}CC 0%, ${bg}40 40%, ${bg}CC 100%);"></div></div>`
    : ''

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100;300;400;500;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;font-family:'Heebo',sans-serif;direction:rtl;background:${bg};color:${text};}
.slide h1,.slide h2,.slide h3{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;word-break:break-word;text-wrap:balance;}
.slide p{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;word-break:break-word;}
.slide li{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-overflow:ellipsis;}
</style>
</head><body><div class="slide">
${imageHtml}
<!-- Atmosphere: aurora mesh -->
<div style="position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 120% 80% at 15% 50%, ${glow1}, transparent 60%), radial-gradient(ellipse 80% 120% at 85% 30%, ${glow2}, transparent 55%);"></div>
<!-- Accent stripe top -->
<div style="position:absolute;top:0;right:0;width:100%;height:4px;z-index:5;background:linear-gradient(90deg, ${primary}, ${accent}, transparent);"></div>
<!-- Content -->
<div style="position:relative;z-index:3;padding:100px 120px;height:100%;display:flex;flex-direction:column;justify-content:center;">
<h1 style="font-size:${title.length > 20 ? '48' : '64'}px;font-weight:900;line-height:1.05;margin-bottom:24px;text-shadow:0 4px 30px rgba(0,0,0,0.6), 0 0 80px ${accent}20;">${title}</h1>
${subtitle ? `<h2 style="font-size:28px;font-weight:300;opacity:0.7;margin-bottom:32px;letter-spacing:2px;">${subtitle}</h2>` : ''}
${body ? `<p style="font-size:22px;line-height:1.6;max-width:1200px;opacity:0.85;">${body}</p>` : ''}
${bulletsHtml}
${cardsHtml}
</div>
${keyNumHtml}
<!-- Watermark -->
<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:300px;font-weight:900;-webkit-text-stroke:2px ${text}08;color:transparent;opacity:0.04;z-index:2;white-space:nowrap;pointer-events:none;">${args.slideType || ''}</div>
<!-- Accent stripe bottom -->
<div style="position:absolute;bottom:0;right:0;width:100%;height:4px;z-index:5;background:linear-gradient(270deg, ${primary}, ${accent}, transparent);"></div>
</div></body></html>`
}

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

## פורמט סיום:
אחרי שיצרת את כל 11 השקפים, סכם ב-JSON:
{
  "designSystem": { "colors": {...}, "fonts": {...}, "effects": {...}, "creativeDirection": {...} },
  "summary": "סיכום בעברית של ההצעה"
}`

  const userPrompt = `בנה מצגת הצעת מחיר עבור המותג "${input.brandName}".

## בריף:
${input.briefText.slice(0, 8000)}
${wizardContext}
${researchContext}
${imagesContext}

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

            onProgress?.({
              stage: 'generating',
              message: `🎨 מייצר שקף ${slideIndex + 1}/11: ${slideType}`,
              slideIndex,
              totalSlides: 11,
            })

            const html = buildSlideHtml(args)
            slides.push({ slideType, title: slideTitle, html })
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

  // ── Inject logos ──
  const leadersLogo = input.leadersLogoUrl || `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
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
    totalToolCalls,
    durationMs,
  }
}
