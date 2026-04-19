/**
 * Gemini AI Slide Designer — 3-Step Pipeline
 *
 * Architecture:
 *   1. Design System — AI generates creative direction + visual system
 *   2. Planner — AI reads ALL wizard data, writes Hebrew copy for every slide
 *   3. Slide Generator — AI generates visual layout per plan (3 parallel batches)
 *
 * Exports:
 * - pipelineFoundation/Batch/Finalize — staged pipeline for Vercel
 * - generateAIPresentation() — full pipeline (non-staged)
 * - regenerateSingleSlide() — single slide regen
 * - generateAISlides() — legacy HTML wrapper
 */

import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import type {
  Presentation,
  Slide,
  SlideType,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
} from '@/types/presentation'

// ── Sub-module imports ──────────────────────────────────
import type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
  SlidePlan,
  PremiumProposalData,
} from './slide-design'

import {
  // Config loaders
  getDesignSystemModels, getBatchModels,
  getSystemInstruction, getImageRoleHints,
  getPacingMap,
  getThinkingLevel, getBatchThinkingLevel,
  getMaxOutputTokens, getTemperature,
  // Schemas
  DESIGN_SYSTEM_SCHEMA, SLIDE_BATCH_SCHEMA,
  // Color utils
  validateAndFixColors,
  // Fallbacks
  buildFallbackDesignSystem, buildFallbackSlide, createFallbackSlide,
  // Logo injection
  injectLeadersLogo, injectClientLogo,
} from './slide-design'

// Re-export pipeline types for external consumers
export type { PipelineFoundation, BatchResult, HtmlBatchResult, HtmlPresentation, SlidePlan } from './slide-design'

// ─── Constants ──────────────────────────────────────────

/** Sticky fallback — once Pro 503s, skip it for all subsequent calls in this generation */
let _proUnavailable = false
export function resetStickyFallback() { _proUnavailable = false }

/** Build a simple HTML slide when AI returns fewer slides than expected */
function buildFallbackHtmlSlide(
  plan: SlidePlan,
  colors: Record<string, string>,
  brandName: string,
): string {
  const bg = colors.background || '#0C0C10'
  const text = colors.text || '#F5F5F7'
  const primary = colors.primary || '#E94560'
  const title = plan.title || plan.slideType || ''
  const subtitle = plan.subtitle || ''
  const body = plan.bodyText || ''
  const bullets = (plan.bulletPoints || []).map(b => `<li style="margin-bottom:12px;font-size:22px;">${b}</li>`).join('')
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;700;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box;}.slide{width:1920px;height:1080px;position:relative;overflow:hidden;font-family:'Heebo',sans-serif;direction:rtl;background:${bg};color:${text};display:flex;flex-direction:column;justify-content:center;padding:120px;}</style>
</head><body><div class="slide">
<h1 style="font-size:56px;font-weight:900;margin-bottom:24px;color:${primary};">${title}</h1>
${subtitle ? `<h2 style="font-size:32px;font-weight:300;margin-bottom:32px;opacity:0.7;">${subtitle}</h2>` : ''}
${body ? `<p style="font-size:24px;line-height:1.6;max-width:1200px;">${body}</p>` : ''}
${bullets ? `<ul style="list-style:none;margin-top:32px;">${bullets}</ul>` : ''}
<div style="position:absolute;bottom:40px;left:60px;font-size:14px;opacity:0.3;">${brandName}</div>
</div></body></html>`
}

/** Fixed layout directive per slide type — mandatory, not a suggestion */
const LAYOUT_MAP: Record<string, string> = {
  cover:              'Typographic Brutalism — oversized brand name 300px+ with textStroke, Aurora BG, dramatic negative space',
  brief:              'Editorial Bleed — image bleeds 60% of canvas with borderRadius capsule, minimal text on opposite side',
  goals:              'Bento Box — asymmetric grid of mixed-size rounded cells with key numbers inside each cell',
  audience:           'Magazine Spread — large pull-quote with dominant image, editorial feel',
  insight:            'Typographic Brutalism — the insight quote at 48px centered, keyword 250px+ hollow in background',
  whyNow:             'Data Art — oversized numbers as visual centerpiece with minimal supporting text',
  strategy:           'Split Screen Asymmetry — right side (700px) dark with title, left side floating cards crossing the divider',
  competitive:        'Bento Box — competitor cards in asymmetric grid with data highlights',
  bigIdea:            'Typographic Brutalism — idea name at 80px, giant hollow keyword 300px+ rotated in background',
  approach:           'Overlapping Z-index cards — layered cards with fake-3D shadows (+12px offset) creating depth',
  deliverables:       'Swiss Grid — structured grid with clear hierarchy, each deliverable in its own cell',
  metrics:            'Data Art — each metric as oversized number (80-140px) with small label below, dramatic spacing',
  influencerStrategy: 'Diagonal Grid — angled composition with criteria as floating tags',
  contentStrategy:    'Overlapping Z-index cards — content themes as layered cards with depth shadows',
  influencers:        'Bento Box — influencer cards in tight grid with circular profile images',
  timeline:           'Cinematic Widescreen — horizontal flow with timeline phases as connected elements',
  closing:            'Typographic Brutalism — BRAND name 350px+ hollow, centered CTA at 80px, Aurora BG',
}

const IMAGE_SIZE_HINTS: Record<string, string> = {
  cover: 'Full-bleed (1920×1080) or right-half (960×1080). Image is the hero.',
  brief: 'Right 40% (768×800), vertically centered. Leave left for text.',
  audience: 'Right 45% (864×900). People-focused, large and immersive.',
  insight: 'Background overlay (1920×1080) with gradient on top, or right 50%.',
  bigIdea: 'Right 60% (1152×1080) full height. The visual IS the idea.',
  strategy: 'Accent image, 30% (576×600), positioned as visual anchor.',
  approach: 'Small accent (480×480), positioned at rule-of-thirds intersection.',
  closing: 'Background overlay (1920×1080) at low opacity, or centered accent.',
}

const TENSION_SLIDES = new Set(['cover', 'insight', 'bigIdea', 'closing'])

// ─── Helpers ────────────────────────────────────────────

function detailedError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  let current: unknown = (error as Error & { cause?: unknown }).cause
  let depth = 0
  while (current && depth < 3) {
    if (current instanceof Error) {
      parts.push(`cause: ${current.message}`)
      current = (current as Error & { cause?: unknown }).cause
    } else {
      parts.push(`cause: ${String(current)}`)
      break
    }
    depth++
  }
  const code = (error as Error & { code?: string }).code
  if (code) parts.push(`code: ${code}`)
  return parts.join(' → ')
}

/** Strip internal fields from proposal data for prompt (reduce tokens) */
function cleanDataForPrompt(data: PremiumProposalData): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_') || key === 'scrapedInfluencers' || key === 'enhancedInfluencers') continue
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    clean[key] = value
  }
  return clean
}

/** Quick CSS shadow/filter syntax check */
function isValidCssShadow(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  return /\d+px|rgba?\(|hsla?\(|inset|blur|brightness|contrast|saturate/.test(value)
}

// ═══════════════════════════════════════════════════════════
//  DESIGN SYSTEM CACHE — reuse if same brand generates again
// ═══════════════════════════════════════════════════════════
const _dsCache = new Map<string, { ds: PremiumDesignSystem; ts: number }>()
const DS_CACHE_TTL = 1000 * 60 * 60 // 1 hour

function getDsCacheKey(brand: BrandDesignInput): string {
  return `${brand.brandName}|${brand.brandColors.primary}|${brand.brandColors.secondary}|${brand.industry || ''}`.toLowerCase()
}

// ═══════════════════════════════════════════════════════════
//  STEP 1: GENERATE DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════

async function generateDesignSystem(
  brand: BrandDesignInput,
): Promise<PremiumDesignSystem> {
  const requestId = `ds-${Date.now()}`

  // Check cache first
  const cacheKey = getDsCacheKey(brand)
  const cached = _dsCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < DS_CACHE_TTL) {
    console.log(`[SlideDesigner][${requestId}] ⚡ Design System from cache (${brand.brandName})`)
    return cached.ds
  }
  console.log(`[SlideDesigner][${requestId}] Step 1: Design System for "${brand.brandName}"`)

  console.log(`[SlideDesigner][${requestId}] 📋 Brand input:`, JSON.stringify({ name: brand.brandName, industry: brand.industry, personality: brand.brandPersonality, colors: brand.brandColors, audience: brand.targetAudience }, null, 2))

  const prompt = `<brand>
name: ${brand.brandName}
industry: ${brand.industry || 'לא ידוע'}
personality: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
colors: primary=${brand.brandColors.primary}, secondary=${brand.brandColors.secondary}, accent=${brand.brandColors.accent}
style: ${brand.brandColors.style || 'corporate'}
audience: ${brand.targetAudience || 'מבוגרים 25-45'}
</brand>

<task>
Generate a creative direction and design system JSON for a premium presentation.
</task>

<creative_direction_spec>
Generate these fields:

visualMetaphor: One concrete visual reference. Examples: "Japanese gallery minimalism", "90s fashion magazine", "brutalist concrete architecture". Never generic words like "modern", "clean", "professional".

visualMetaphor_translates_to: Object with concrete design implications:
  - whitespace_ratio: description (e.g. "high — 40%+ white space")
  - max_colors_per_slide: number (2–4)
  - text_alignment: e.g. "edge-anchored" or "asymmetric-offset"
  - image_treatment: e.g. "full-bleed" or "contained-with-margin" or "strip"

visualTension: A surprising contrast pair. Example: "giant broken text + Japanese minimalism".

oneRule: A single rule every slide must follow. Example: "one element always bleeds off-canvas".

colorStory: 3-act narrative for color across the deck. Example: "dark and cold → accent burst in middle → restrained ending".

typographyVoice: Weight contrast description. Example: "900 headings screaming vs 300 body whispering".

emotionalArc: Sequence of 5-6 emotions the viewer should feel across the deck.
</creative_direction_spec>

<design_system_spec>
Generate these exact fields:

colors: {primary, secondary, accent, background (dark, not pure black — add color hint), text (WCAG AA 4.5:1 vs background), cardBg (10-15% lighter/darker than background), cardBorder (low opacity primary or white), gradientStart, gradientEnd, muted (3:1 contrast min), highlight, auroraA, auroraB, auroraC}

typography: {displaySize:80-140, headingSize:48-64, subheadingSize:28-36, bodySize:20-24, captionSize:14-16, letterSpacingTight:-5 to -1, letterSpacingWide:2-8, lineHeightTight:0.9-1.05, lineHeightRelaxed:1.4-1.6, weightPairs:[[heading,body]] e.g. [[900,300]]}

spacing: {unit:8, cardPadding:32-48, cardGap:24-40, safeMargin:80}

effects: {borderRadius:"sharp"|"soft"|"pill", borderRadiusValue:number, decorativeStyle:"geometric"|"organic"|"minimal"|"brutalist", shadowStyle:"none"|"fake-3d"|"glow", auroraGradient:"CSS radial-gradient string from auroraA/B/C"}

motif: {type:"diagonal-lines"|"dots"|"circles"|"angular-cuts"|"wave"|"grid-lines"|"organic-blobs"|"triangles", opacity:0.05-0.2, color:string, implementation:"CSS description"}

Font: Heebo.
</design_system_spec>`

  const sysInstruction = await getSystemInstruction()
  const models = await getDesignSystemModels()
  const [dsThinkingLevel, dsMaxOutputTokens] = await Promise.all([getThinkingLevel(), getMaxOutputTokens()])
  const dsThinking = dsThinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : dsThinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] 🤖 Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
      console.log(`[SlideDesigner][${requestId}] 📝 DS prompt length: ${prompt.length} chars | thinking: ${dsThinkingLevel} | maxTokens: ${dsMaxOutputTokens}`)
      const dsResult = await callAI({
        model,
        prompt,
        systemPrompt: sysInstruction,
        geminiConfig: {
          systemInstruction: sysInstruction,
          responseMimeType: 'application/json',
          responseSchema: DESIGN_SYSTEM_SCHEMA,
          thinkingConfig: { thinkingLevel: dsThinking },
          maxOutputTokens: dsMaxOutputTokens,
        },
        responseSchema: DESIGN_SYSTEM_SCHEMA as unknown as Record<string, unknown>,
        thinkingLevel: dsThinkingLevel,
        maxOutputTokens: dsMaxOutputTokens,
        callerId: `${requestId}-ds`,
        noGlobalFallback: true,
      })

      const rawText = dsResult.text || ''
      console.log(`[SlideDesigner][${requestId}] Raw response length: ${rawText.length} chars (model: ${model})`)

      let parsed: PremiumDesignSystem
      try {
        parsed = JSON.parse(rawText) as PremiumDesignSystem
      } catch {
        console.warn(`[SlideDesigner][${requestId}] JSON.parse failed, falling back to robust parser`)
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<PremiumDesignSystem>(rawText)
        if (!fallbackParsed) throw new Error('Both JSON.parse and parseGeminiJson failed')
        parsed = fallbackParsed
      }

      if (parsed?.colors?.primary) {
        parsed.colors = validateAndFixColors(parsed.colors)
        parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
        parsed.direction = 'rtl'
        console.log(`[SlideDesigner][${requestId}] ✅ Design System ready (model: ${model}):`)
        console.log(`[SlideDesigner][${requestId}]   🎨 Colors: primary=${parsed.colors.primary} secondary=${parsed.colors.secondary} accent=${parsed.colors.accent} bg=${parsed.colors.background} text=${parsed.colors.text}`)
        console.log(`[SlideDesigner][${requestId}]   📐 Typography: heading=${parsed.typography?.headingSize}px body=${parsed.typography?.bodySize}px weights=${JSON.stringify(parsed.typography?.weightPairs)}`)
        console.log(`[SlideDesigner][${requestId}]   ✨ Effects: radius=${parsed.effects?.borderRadius} shadow=${parsed.effects?.shadowStyle} deco=${parsed.effects?.decorativeStyle}`)
        console.log(`[SlideDesigner][${requestId}]   🎭 Creative: metaphor="${parsed.creativeDirection?.visualMetaphor}" tension="${parsed.creativeDirection?.visualTension}" rule="${parsed.creativeDirection?.oneRule}"`)
        // Cache for reuse
        _dsCache.set(cacheKey, { ds: parsed, ts: Date.now() })
        return parsed
      }
      throw new Error(`Invalid design system — parsed colors missing`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)

      if (attempt === 0 && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
        console.log(`[SlideDesigner][${requestId}] Marked ${model} as unavailable — subsequent calls will skip to fallback`)
      }

      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.error(`[SlideDesigner][${requestId}] All design system attempts failed, using fallback`)
  return buildFallbackDesignSystem(brand)
}

// ═══════════════════════════════════════════════════════════
//  STEP 2: PLANNER — AI reads ALL data, plans every slide
// ═══════════════════════════════════════════════════════════

async function generateSlidePlan(
  data: PremiumProposalData,
  designSystem: PremiumDesignSystem,
  images: Record<string, string>,
): Promise<SlidePlan[]> {
  const requestId = `plan-${Date.now()}`
  const brandName = data.brandName || 'Unknown'
  console.log(`[SlideDesigner][${requestId}] Step 2: Planner for "${brandName}"`)

  const cleanData = cleanDataForPrompt(data)
  const brandResearch = data._brandResearch || {}
  const influencerResearch = data._influencerStrategy || data.influencerResearch || {}

  // Available images list
  const imageList = Object.entries(images)
    .filter(([, url]) => url)
    .map(([key, url]) => `  - ${key}: ${url}`)
    .join('\n')

  const cd = designSystem.creativeDirection

  const prompt = `אתה קריאייטיב דיירקטור בכיר ב-Leaders, סוכנות שיווק דיגיטלי ישראלית מובילה.

<brand_data>
${JSON.stringify(cleanData, null, 2)}
</brand_data>

<brand_research>
${JSON.stringify(brandResearch, null, 2)}
</brand_research>

<influencer_research>
${JSON.stringify(influencerResearch, null, 2)}
</influencer_research>

<available_images>
${imageList || 'אין תמונות זמינות'}
</available_images>

<creative_direction>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
One Rule: ${cd.oneRule}
Color Story: ${cd.colorStory}
Typography Voice: ${cd.typographyVoice}
Emotional Arc: ${cd.emotionalArc}` : 'No creative direction available'}
</creative_direction>

<task>
תכנן מצגת הצעת מחיר פרימיום עבור "${brandName}".

כתוב את הקופי העברי המדויק לכל שקף. אתה הקופירייטר והקריאייטיב דיירקטור — תהיה ספציפי, חד, ויצירתי.

סוגי שקפים — בדיוק 11, בסדר הזה. אל תוסיף ואל תדלג:
cover, brief, goals, audience, insight, strategy, bigIdea, deliverables, influencers, metrics, closing

הסבר:
- cover: שקף פתיחה ויזואלי
- brief: למה הבריף הזה? מה האתגר/הבעיה? (לא סיפור המותג — התמקד בסיבה שפנו אלינו)
- goals: יעדי הקמפיין (2-3 יעדים ממוקדים)
- audience: קהלי יעד
- insight: תובנה חדה ומפתיעה שמובילה ישירות לאסטרטגיה. חייבת להיות מבוססת נתון אמיתי. חייבת "להכות"
- strategy: אסטרטגיה קונקרטית — headline + 3 pillars + תוצאות צפויות. לא "באוויר"
- bigIdea: הקריאייטיב — הרעיון המרכזי, פורמט התוכן, הקונספט
- deliverables: תוצרים מדויקים (כמויות, סוגים)
- influencers: משפיענים מומלצים ואסטרטגיית משפיענים ספציפית
- metrics: KPI + תקציב + CPE + reach
- closing: סגירה

כללים:
1. כל הטקסט בעברית בלבד! גם כותרת הcover חייבת להיות בעברית. שם המותג יכול להיות באנגלית אבל שאר הכותרת בעברית. דוגמה: "${brandName} — הסמכות של יוקרה חכמה" ולא "The Authority of Smart Luxury"
2. cover ו-closing חובה
3. כותרות: קצרות, פרובוקטיביות, ספציפיות למותג. לא "המטרות שלנו" אלא "3 יעדים שישנו את ${brandName}"
4. גוף: מקסימום 2-3 משפטים. תמציתי וחד
5. כרטיסים: כותרת + גוף קצר. מקסימום 5 כרטיסים
6. בולט פוינטס: מקסימום 5 נקודות, כל אחת עד 10 מילים
7. מספרים מפתח: השתמש בנתונים אמיתיים מהדאטה (תקציב, reach, KPIs). אם תקציב לא מצוין בדאטה — אל תמציא מספר! השתמש ב-KPIs אחרים כמו reach, engagement, המרות
8. שייך תמונות קיימות (existingImageKey) כשהן רלוונטיות. אם אין תמונה מתאימה — כתוב imageDirection לתמונה שצריך ליצור
9. influencers — כתוב אסטרטגיית משפיענים ספציפית (לא כללית!). אם יש שמות מומלצים — השתמש. אם לא — כתוב פרופילים לדוגמה
10. כל שקף צריך emotionalTone שמתאים לסיפור הכולל
11. המצגת היא מסע: אתגר → תובנה → פתרון → הוכחה → סגירה

כללים קריטיים לתוכן:
- BRIEF: לא סיפור המותג! כתוב את האתגר — למה פנו אלינו? מה הבעיה? מקסימום 3 משפטים.
- INSIGHT: חייבת להיות חדה, מפתיעה, ומבוססת על נתון אמיתי. לא משפט גנרי. דוגמה טובה: "73% מהקונים מחליטים לפי המלצת חבר — לא לפי פרסום." דוגמה רעה: "השוק משתנה ומתפתח כל הזמן."
  התובנה חייבת להוביל ישירות לאסטרטגיה — הקורא צריך להגיד "אה, עכשיו מובן למה האסטרטגיה הזו הגיונית"
- STRATEGY: חייבת להיות קונקרטית! headline + 3 pillars (כל pillar = כותרת + תיאור קצר + תוצר צפוי). לא "נבנה נוכחות דיגיטלית" אלא "3 קמפיינים ממוקדים: awareness ב-Instagram, conversion ב-TikTok, retargeting ב-Meta"
- BIGIDEA: הקריאייטיב — שם הקמפיין + קונספט + פורמט תוכן (UGC? הפקה? mashup?)
- METRICS: CPE = תקציב ÷ מוערבות (engagement). ודא שהחישוב נכון!
מגבלות טקסט קריטיות (כדי שהמצגת לא תזול מטקסט):
- כותרת: מקסימום 8 מילים. אם ארוך יותר — פצל לכותרת + כותרת משנה
- כותרת משנה: מקסימום 12 מילים. שורה אחת עדיפה
- גוף: מקסימום 40 מילים (2-3 משפטים קצרצרים). לא פסקה!
- בולט פוינטס: מקסימום 5 נקודות, כל אחת עד 8 מילים
- כרטיסים: כותרת 4 מילים, גוף 15 מילים, מקסימום 4 כרטיסים
- מספר מפתח: המספר + תווית עד 5 מילים
- COVER: רק כותרת + כותרת משנה קצרה (עד 8 מילים). אין bodyText בcover!
- CLOSING: רק כותרת + tagline. דוגמה: title="בואו נתחיל", tagline="Leaders × ${brandName}"
</task>`

  console.log(`[SlideDesigner][${requestId}] 📝 Plan prompt length: ${prompt.length} chars`)
  console.log(`[SlideDesigner][${requestId}] 🖼️ Available images: ${imageList || 'none'}`)

  // ── GPT-5.4 Planner — strict JSON schema (all objects need additionalProperties: false) ──
  const jsonSchema = {
    type: 'object' as const,
    additionalProperties: false,
    required: ['slides'],
    properties: {
      slides: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          additionalProperties: false,
          required: [
            'slideType', 'title', 'subtitle', 'bodyText', 'bulletPoints',
            'cards', 'keyNumber', 'keyNumberLabel', 'tagline',
            'imageDirection', 'existingImageKey', 'emotionalTone',
          ],
          properties: {
            slideType: { type: 'string' as const },
            title: { type: 'string' as const },
            subtitle: { type: ['string', 'null'] as const },
            bodyText: { type: ['string', 'null'] as const },
            bulletPoints: { type: ['array', 'null'] as const, items: { type: 'string' as const } },
            cards: {
              type: ['array', 'null'] as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                required: ['title', 'body'],
                properties: {
                  title: { type: 'string' as const },
                  body: { type: 'string' as const },
                },
              },
            },
            keyNumber: { type: ['string', 'null'] as const },
            keyNumberLabel: { type: ['string', 'null'] as const },
            tagline: { type: ['string', 'null'] as const },
            imageDirection: { type: ['string', 'null'] as const },
            existingImageKey: { type: ['string', 'null'] as const },
            emotionalTone: { type: 'string' as const },
          },
        },
      },
    },
  }

  // ── Gemini ONLY for Planner (April 2026) ──
  // Per skill matrix: "Slide content planner → gemini-3.1-pro + HIGH thinking + no tools"
  // No Claude/GPT fallback — Gemini Pro → Gemini Flash retry only.
  const plannerAttempts = [
    { provider: 'gemini', model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { provider: 'gemini', model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (retry)' },
  ]

  for (let attempt = 0; attempt < plannerAttempts.length; attempt++) {
    const { provider, model, label } = plannerAttempts[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] 🤖 Calling ${label} for plan (attempt ${attempt + 1}/${plannerAttempts.length})...`)

      let rawText = ''

      if (provider === 'anthropic') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const response = await anthropic.messages.create({
          model,
          max_tokens: 16384,
          // Prompt caching: system prompt cached across calls (70% cost saving)
          system: [
            {
              type: 'text' as const,
              text: 'אתה קריאייטיב דיירקטור בכיר ב-Leaders, סוכנות שיווק דיגיטלי ישראלית מובילה. תכנן מצגות הצעת מחיר פרימיום בעברית. התובנה חייבת להיות חדה ומבוססת נתון אמיתי. האסטרטגיה חייבת להיות קונקרטית עם 3 pillars ספציפיים. החזר JSON בלבד — אובייקט עם מפתח "slides" שמכיל מערך. ללא markdown, ללא הסבר.',
              cache_control: { type: 'ephemeral' as const },
            },
          ],
          messages: [{ role: 'user', content: prompt }],
        })

        rawText = response.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('') || '{}'

        // Claude might wrap in markdown fences
        rawText = rawText.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
      } else if (provider === 'openai') {
        const OpenAI = (await import('openai')).default
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const response = await openai.responses.create({
          model,
          instructions: 'אתה קריאייטיב דיירקטור בכיר. תכנן מצגות הצעת מחיר פרימיום בעברית. החזר JSON בלבד.',
          input: prompt,
          text: {
            format: {
              type: 'json_schema',
              name: 'slide_plan',
              strict: true,
              schema: jsonSchema,
            },
          },
        })

        rawText = response.output_text || '{}'
      } else if (provider === 'gemini') {
        const result = await callAI({
          model,
          prompt: `${prompt}\n\nהחזר JSON בלבד — אובייקט עם מפתח "slides" שמכיל מערך. ללא markdown.`,
          systemPrompt: 'אתה קריאייטיב דיירקטור בכיר ב-Leaders. תכנן מצגות הצעת מחיר פרימיום בעברית. החזר JSON בלבד.',
          geminiConfig: {
            systemInstruction: 'אתה קריאייטיב דיירקטור בכיר ב-Leaders. תכנן מצגות הצעת מחיר פרימיום בעברית. החזר JSON בלבד.',
            responseMimeType: 'application/json',
            // Per skill matrix: planner = HIGH thinking
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            maxOutputTokens: 16384,
          },
          thinkingLevel: 'HIGH',
          maxOutputTokens: 16384,
          callerId: `${requestId}-plan-gemini`,
          noGlobalFallback: true,
        })
        rawText = result.text || '{}'
      }

      console.log(`[SlideDesigner][${requestId}] ✅ ${label} responded: ${rawText.length} chars`)

      let parsed: { slides: SlidePlan[] }
      try {
        parsed = JSON.parse(rawText) as { slides: SlidePlan[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: SlidePlan[] }>(rawText)
        if (!fallbackParsed) throw new Error('JSON parse failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length >= 5) {
        // Post-process: ensure slideType is always defined, sanitize content
        const expectedTypes = ['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'bigIdea', 'deliverables', 'influencers', 'metrics', 'closing']
        for (let si = 0; si < parsed.slides.length; si++) {
          const slide = parsed.slides[si]
          if (!slide.slideType || typeof slide.slideType !== 'string' || slide.slideType.trim() === '') {
            slide.slideType = expectedTypes[si] || 'brief'
            console.log(`[SlideDesigner][${requestId}]   ⚠️ Fixed empty slideType at index ${si} → "${slide.slideType}"`)
          }
        }
        for (const slide of parsed.slides) {
          if (slide.slideType === 'cover') {
            delete slide.bodyText
            delete slide.bulletPoints
            delete slide.cards
          }
          if (slide.slideType === 'closing') {
            if (slide.bodyText && /הנחי[הי]|הערה|הוראה|instruction/i.test(slide.bodyText)) delete slide.bodyText
            if (slide.tagline && /הנחי[הי]|הערה|הוראה|instruction/i.test(slide.tagline)) delete slide.tagline
          }
          if (slide.bodyText && /^הנחי[הי]\s*(נוספת|:)/i.test(slide.bodyText.trim())) delete slide.bodyText
        }
        console.log(`[SlideDesigner][${requestId}] ✅ Plan ready: ${parsed.slides.length} slides (model: ${model})`)
        console.log(`[SlideDesigner][${requestId}]   Types: ${parsed.slides.map(s => s.slideType).join(', ')}`)
        for (const s of parsed.slides) {
          console.log(`[SlideDesigner][${requestId}]   📄 ${(s.slideType || '?').padEnd(18)} | title="${s.title}" | tone=${s.emotionalTone} | image=${s.existingImageKey || 'none'} | cards=${s.cards?.length || 0} | bullets=${s.bulletPoints?.length || 0} | number=${s.keyNumber || 'none'}`)
        }
        return parsed.slides
      }
      throw new Error(`Plan too short: ${parsed?.slides?.length || 0} slides`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Plan attempt ${attempt + 1} failed (${label}): ${msg}`)
      if (attempt < plannerAttempts.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.warn(`[SlideDesigner][${requestId}] All plan attempts failed, using fallback plan`)
  return buildFallbackPlan(data, images)
}

/** Fallback plan when AI fails */
function buildFallbackPlan(data: PremiumProposalData, images: Record<string, string>): SlidePlan[] {
  const brandName = data.brandName || 'המותג'
  // Fixed 9+2 slide sequence per Liran's feedback
  const plans: SlidePlan[] = [
    { slideType: 'cover', title: brandName, subtitle: data.campaignName || 'הצעת קריאטיב', emotionalTone: 'dramatic', existingImageKey: images.coverImage ? 'coverImage' : undefined },
    { slideType: 'brief', title: `האתגר של ${brandName}`, bodyText: data.brandObjective || data.brandBrief || '', emotionalTone: 'confident', existingImageKey: images.brandImage ? 'brandImage' : undefined },
    { slideType: 'goals', title: 'מטרות הקמפיין', bulletPoints: data.goals || [], emotionalTone: 'energetic' },
    { slideType: 'audience', title: 'קהל היעד', bodyText: data.targetDescription || '', emotionalTone: 'warm', existingImageKey: images.audienceImage ? 'audienceImage' : undefined },
    { slideType: 'insight', title: data.keyInsight || 'התובנה', bodyText: data.insightData || '', emotionalTone: 'dramatic' },
    { slideType: 'strategy', title: data.strategyHeadline || 'האסטרטגיה', bodyText: data.strategyDescription || '', cards: (data.strategyPillars || []).map(p => ({ title: p.title, body: p.description })), emotionalTone: 'confident' },
    { slideType: 'bigIdea', title: data.activityTitle || 'הקריאייטיב', bodyText: data.activityDescription || '', emotionalTone: 'bold', existingImageKey: images.activityImage ? 'activityImage' : undefined },
    { slideType: 'deliverables', title: 'תוצרים', bulletPoints: data.deliverables || [], emotionalTone: 'confident' },
    { slideType: 'influencers', title: 'משפיענים', bodyText: data.influencerResearch?.strategySummary || '', emotionalTone: 'energetic' },
    { slideType: 'metrics', title: 'KPI', bulletPoints: data.successMetrics || [], keyNumber: data.budget != null && data.budget > 0 ? `₪${data.budget.toLocaleString()}` : undefined, keyNumberLabel: 'תקציב', emotionalTone: 'analytical' },
    { slideType: 'closing', title: `בואו נתחיל`, subtitle: brandName, tagline: `Leaders × ${brandName}`, emotionalTone: 'inspiring' },
  ]

  return plans
}

// ═══════════════════════════════════════════════════════════
//  STEP 3: Intent Engine (in pipelineBatch below)
//  Old generateSlidesBatchAST + sanitizeElement + buildBatchPrompt deleted in v5 cleanup
// ═══════════════════════════════════════════════════════════

/* @deprecated — removed in v5. Use pipelineBatch() with Intent Engine instead. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyGenerateSlidesBatchAST(
  designSystem: PremiumDesignSystem,
  plans: SlidePlan[],
  batchIndex: number,
  brandName: string,
  batchContext: BatchContext,
  images: Record<string, string>,
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 3: Batch ${batchIndex + 1} (${plans.length} slides)`)

  const [
    pacingMap, _imageRoleHints,
    thinkingLevel, maxOutputTokens, temperature,
  ] = await Promise.all([
    getPacingMap(), getImageRoleHints(),
    getBatchThinkingLevel(), getMaxOutputTokens(), getTemperature(),
  ])

  const resolvedThinking = thinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : thinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  const colors = designSystem.colors
  const typo = designSystem.typography
  const effects = designSystem.effects
  const motif = designSystem.motif
  const cd = designSystem.creativeDirection

  // Build per-slide directives from plan
  const slidesDescription = plans.map((plan, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = pacingMap[plan.slideType] || pacingMap.brief
    const archetype = LAYOUT_MAP[plan.slideType] || LAYOUT_MAP.brief
    const hasTension = TENSION_SLIDES.has(plan.slideType)
    const imageSizeHint = IMAGE_SIZE_HINTS[plan.slideType] || 'At least 40% of slide area'

    // Resolve image URL
    const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    const imageTag = imageUrl
      ? `  <image url="${imageUrl}" sizing="${imageSizeHint}" />`
      : plan.imageDirection
      ? `  <image_direction>${plan.imageDirection}</image_direction>\n  <no_image>Create striking decorative shapes and typography to compensate.</no_image>`
      : `  <no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>`

    // Build content block from plan
    const contentParts: string[] = []
    contentParts.push(`  <title>${plan.title}</title>`)
    if (plan.subtitle) contentParts.push(`  <subtitle>${plan.subtitle}</subtitle>`)
    if (plan.keyNumber) contentParts.push(`  <key_number value="${plan.keyNumber}" label="${plan.keyNumberLabel || ''}" />`)
    if (plan.bodyText) contentParts.push(`  <body>${plan.bodyText}</body>`)
    if (plan.bulletPoints?.length) contentParts.push(`  <bullets>\n${plan.bulletPoints.map(b => `    <item>${b}</item>`).join('\n')}\n  </bullets>`)
    if (plan.cards?.length) contentParts.push(`  <cards>\n${plan.cards.map(c => `    <card title="${c.title}">${c.body}</card>`).join('\n')}\n  </cards>`)
    if (plan.tagline) contentParts.push(`  <tagline>${plan.tagline}</tagline>`)

    // Deterministic title zone assignment — cycles through TOP/MIDDLE/BOTTOM
    const TITLE_ZONES = [
      { zone: 'TOP', y: '80–280' },
      { zone: 'MIDDLE', y: '400–550' },
      { zone: 'BOTTOM', y: '650–850' },
    ] as const
    // Cover always TOP, closing always BOTTOM, others cycle
    const titleZone = plan.slideType === 'cover' ? TITLE_ZONES[0]
      : plan.slideType === 'closing' ? TITLE_ZONES[2]
      : TITLE_ZONES[globalIndex % 3]

    return `
<slide index="${globalIndex + 1}" total="${batchContext.totalSlides}" type="${plan.slideType}">
  <emotional_tone>${plan.emotionalTone}</emotional_tone>
  <energy>${pacing.energy}</energy>
  <density>${pacing.density}</density>
  <max_elements>${pacing.maxElements}</max_elements>
  <min_whitespace>${pacing.minWhitespace}%</min_whitespace>
  <title_zone zone="${titleZone.zone}" y_range="${titleZone.y}">MANDATORY: Place the title element in the ${titleZone.zone} zone (y=${titleZone.y}). This is NOT optional.</title_zone>
  <layout_directive>MANDATORY: ${archetype}</layout_directive>
${hasTension ? '  <tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>' : ''}
${imageTag}
  <content>
${contentParts.join('\n')}
  </content>
</slide>`
  }).join('\n')

  // Determine narrative rhythm for this batch
  const batchPosition = batchContext.totalSlides > 0
    ? batchContext.slideIndex / batchContext.totalSlides
    : 0
  const rhythm = batchPosition <= 0.33
    ? { arc: 'opening', description: 'Opening arc — build curiosity, introduce the brand. More whitespace, spacious layouts. Color: darker/cooler, accent sparingly. DEPTH: heavy shadows, cinematic image filter, tight negative letterSpacing on titles.' }
    : batchPosition <= 0.66
    ? { arc: 'core', description: 'Core content — densest section. Tighter spacing, more cards, bolder colors. Accent used freely. Maintain visual variety. DEPTH: boxShadow on all cards, introduce glassmorphism, aurora gradient backgrounds, textStroke watermarks.' }
    : { arc: 'resolution', description: 'Resolution — transition from dense to spacious. Final slide = maximum whitespace. Color returns to restraint. DEPTH: boxShadow only on closing CTA, largest textStroke watermark, textShadow glow on closing title.' }

  const prompt = buildBatchPrompt(brandName, cd, colors, typo, effects, motif, designSystem, batchContext, slidesDescription, plans.length, rhythm)

  console.log(`[SlideDesigner][${requestId}] 📝 Batch prompt: ${prompt.length} chars | rhythm: ${rhythm.arc}`)
  console.log(`[SlideDesigner][${requestId}] 🎯 Slide directives:`)
  for (const plan of plans) {
    const imgUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    console.log(`[SlideDesigner][${requestId}]   ${plan.slideType.padEnd(18)} | layout=${(LAYOUT_MAP[plan.slideType] || 'default').slice(0, 40)} | image=${imgUrl ? 'YES' : 'no'} | tone=${plan.emotionalTone}`)
  }

  // Retry with model fallback
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  const allAttempts: Array<{ model: string; thinking: ThinkingLevel; label: string }> = [
    { model: batchModels[0], thinking: resolvedThinking, label: `${batchModels[0]} (${thinkingLevel})` },
    ...(resolvedThinking !== ThinkingLevel.LOW
      ? [{ model: batchModels[0], thinking: ThinkingLevel.LOW, label: `${batchModels[0]} (LOW fallback)` }]
      : []),
    ...(batchModels[1] !== batchModels[0]
      ? [{ model: batchModels[1], thinking: ThinkingLevel.HIGH, label: `${batchModels[1]} (HIGH fallback)` }]
      : []),
  ]

  const attempts = _proUnavailable
    ? allAttempts.filter(a => a.model !== batchModels[0])
    : allAttempts

  if (_proUnavailable) {
    console.log(`[SlideDesigner][${requestId}] Sticky fallback — skipping ${batchModels[0]}, going straight to ${batchModels[1]}`)
  }

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const { model, thinking, label } = attempts[attempt]

    if (_proUnavailable && model === batchModels[0]) continue

    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${label} (attempt ${attempt + 1}/${attempts.length})...`)

      const batchResult = await callAI({
        model, prompt,
        systemPrompt: batchSysInstruction,
        geminiConfig: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens, temperature,
        },
        responseSchema: SLIDE_BATCH_SCHEMA as unknown as Record<string, unknown>,
        thinkingLevel: thinking === ThinkingLevel.HIGH ? 'HIGH' : thinking === ThinkingLevel.MEDIUM ? 'MEDIUM' : 'LOW',
        maxOutputTokens,
        callerId: `${requestId}-batch`,
        noGlobalFallback: true,
      })

      let parsed: { slides: Slide[] }
      try {
        parsed = JSON.parse(batchResult.text || '') as { slides: Slide[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: Slide[] }>(batchResult.text || '')
        if (!fallbackParsed) throw new Error('JSON parse failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length > 0) {
        const generatedSlides = parsed.slides.map((slide, i) => {
          const plan = plans[i]
          const resolvedType = (slide.slideType || plan?.slideType || 'closing') as SlideType
          const archetype = (slide as unknown as Record<string, unknown>).archetype as string | undefined
          const resolvedArchetype = archetype && archetype !== 'N/A' && archetype.trim().length > 2
            ? archetype
            : LAYOUT_MAP[resolvedType] || LAYOUT_MAP.brief
          const rawDramaticChoice = (slide as unknown as Record<string, unknown>).dramaticChoice as string | undefined
          return {
            id: slide.id || `slide-${batchContext.slideIndex + i}`,
            slideType: resolvedType,
            archetype: resolvedArchetype,
            dramaticChoice: rawDramaticChoice && rawDramaticChoice.trim().length > 3
              ? rawDramaticChoice
              : `${resolvedArchetype} — visual emphasis`,
            label: slide.label || plan?.title || `שקף ${batchContext.slideIndex + i + 1}`,
            background: slide.background || { type: 'solid' as const, value: colors.background },
            elements: (slide.elements || []).map((el, j) =>
              sanitizeElement(el, j, batchContext.slideIndex + i, colors)
            ),
          }
        })

        if (generatedSlides.length < plans.length) {
          console.warn(`[SlideDesigner][${requestId}] Got ${generatedSlides.length}/${plans.length} slides — filling with fallbacks`)
          for (let mi = generatedSlides.length; mi < plans.length; mi++) {
            const plan = plans[mi]
            const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
            const fallbackInput: SlideContentInput = {
              slideType: plan.slideType, title: plan.title,
              content: { subtitle: plan.subtitle, bodyText: plan.bodyText, bulletPoints: plan.bulletPoints },
              imageUrl,
            }
            const fb = buildFallbackSlide(fallbackInput, mi, batchContext, colors)
            generatedSlides.push({ ...fb, archetype: LAYOUT_MAP[fb.slideType] || LAYOUT_MAP.brief, dramaticChoice: 'fallback layout' })
          }
        }

        console.log(`[SlideDesigner][${requestId}] ✅ Generated ${generatedSlides.length} AST slides (${label})`)
        for (const slide of generatedSlides) {
          const texts = slide.elements.filter(e => e.type === 'text')
          const shapes = slide.elements.filter(e => e.type === 'shape')
          const imgs = slide.elements.filter(e => e.type === 'image')
          const titleEl = texts.find(e => (e as unknown as {role:string}).role === 'title') as unknown as {fontSize:number, y:number, content:string} | undefined
          console.log(`[SlideDesigner][${requestId}]   🎬 ${slide.slideType.padEnd(18)} | ${slide.elements.length} elements (${texts.length}T ${shapes.length}S ${imgs.length}I) | bg=${slide.background.type} | archetype="${slide.archetype?.slice(0, 35)}"`)
          if (titleEl) console.log(`[SlideDesigner][${requestId}]      title: "${titleEl.content?.slice(0, 30)}" fontSize=${titleEl.fontSize} y=${titleEl.y}`)
          console.log(`[SlideDesigner][${requestId}]      drama: "${slide.dramaticChoice?.slice(0, 60)}"`)
        }
        return generatedSlides
      }
      throw new Error('No slides in AST response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)

      if (model === batchModels[0] && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
      }

      if (attempt < attempts.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      } else {
        console.warn(`[SlideDesigner][${requestId}] All attempts failed. Generating fallback slides.`)
        return plans.map((plan, i) => {
          const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
          const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
          return buildFallbackSlide(input, i, batchContext, colors)
        })
      }
    }
  }

  return plans.map((plan, i) => {
    const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
    return buildFallbackSlide(input, i, batchContext, colors)
  })
}

// ═══════════════════════════════════════════════════════════
//  ELEMENT SANITIZER
// ═══════════════════════════════════════════════════════════

function sanitizeElement(
  el: SlideElement,
  elIndex: number,
  slideIndex: number,
  colors: PremiumDesignSystem['colors'],
): SlideElement {
  const base = { ...el, id: el.id || `el-${slideIndex}-${elIndex}` }

  const raw = base as unknown as Record<string, unknown>
  if (base.type === 'text') {
    if (!raw.fill || raw.fill === 'transparent') delete raw.fill
    if (!raw.src) delete raw.src
    if (!raw.shapeType) delete raw.shapeType
    if (!raw.objectFit) delete raw.objectFit
  } else if (base.type === 'shape') {
    if (!raw.content) delete raw.content
    if (!raw.color) delete raw.color
    if (!raw.role) delete raw.role
    if (!raw.src) delete raw.src
    if (!raw.objectFit) delete raw.objectFit
    if (!raw.fontSize) delete raw.fontSize
    if (!raw.fontWeight) delete raw.fontWeight
  } else if (base.type === 'image') {
    if (!raw.content) delete raw.content
    if (!raw.color) delete raw.color
    if (!raw.role) delete raw.role
    if (!raw.fill) delete raw.fill
    if (!raw.shapeType) delete raw.shapeType
    if (!raw.fontSize) delete raw.fontSize
    if (!raw.fontWeight) delete raw.fontWeight
  }

  if (base.type === 'text') {
    const txt = base as TextElement
    if (!txt.role) {
      txt.role = txt.fontSize && txt.fontSize >= 80 ? 'title'
        : txt.fontSize && txt.fontSize >= 40 ? 'subtitle'
        : txt.fontSize && txt.fontSize <= 16 ? 'caption'
        : 'body'
    }
    if (!txt.color) {
      if (txt.role === 'decorative') txt.color = `${colors.text || '#F5F5F7'}15`
      else if (txt.role === 'caption' || txt.role === 'label') txt.color = colors.muted || `${colors.text || '#F5F5F7'}80`
      else txt.color = colors.text || '#F5F5F7'
    }
    if (!txt.textAlign) txt.textAlign = 'right'
    if (!txt.fontWeight) {
      txt.fontWeight = txt.role === 'title' ? 900 : txt.role === 'subtitle' ? 700 : txt.role === 'decorative' ? 900 : txt.role === 'label' ? 300 : 400
    }
    if (!txt.fontSize) {
      txt.fontSize = txt.role === 'title' ? 64 : txt.role === 'subtitle' ? 32 : txt.role === 'caption' ? 14 : txt.role === 'label' ? 14 : 20
    }
    if (txt.opacity === undefined) txt.opacity = 1
    if (txt.role === 'decorative' && txt.opacity > 0.3 && txt.fontSize >= 150) txt.opacity = 0.08
    if (txt.letterSpacing === undefined || txt.letterSpacing === 0) {
      if (txt.role === 'label' || txt.role === 'caption') txt.letterSpacing = 4
      else if (txt.role === 'title' && txt.fontSize >= 60) txt.letterSpacing = -2
    }
    if (txt.textShadow && !isValidCssShadow(txt.textShadow)) delete txt.textShadow
    if (txt.boxShadow && !isValidCssShadow(txt.boxShadow)) delete txt.boxShadow
    // Enforce textShadow on titles for depth/readability
    if ((txt.role === 'title' || txt.role === 'subtitle') && !txt.textShadow) {
      txt.textShadow = txt.role === 'title'
        ? '0 4px 24px rgba(0,0,0,0.5)'
        : '0 2px 12px rgba(0,0,0,0.3)'
    }
    if (!txt.content) txt.content = ''
    return txt as unknown as SlideElement
  }

  if (base.type === 'shape') {
    const shape = base as ShapeElement
    if (!shape.fill) {
      shape.fill = (shape.borderRadius || shape.border) ? (colors.cardBg || '#252527') : 'transparent'
    }
    if (!shape.shapeType) shape.shapeType = 'decorative'
    if ((shape.shapeType as string) === 'card' && !shape.boxShadow) shape.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
    if (shape.boxShadow && !isValidCssShadow(shape.boxShadow)) delete shape.boxShadow
    if (shape.backdropFilter) {
      if (!isValidCssShadow(shape.backdropFilter)) {
        delete shape.backdropFilter
      } else {
        if (shape.fill && !shape.fill.includes('rgba') && !shape.fill.includes('transparent')) shape.fill = 'rgba(255,255,255,0.08)'
        if (!shape.border) shape.border = '1px solid rgba(255,255,255,0.12)'
      }
    }
    return shape as unknown as SlideElement
  }

  if (base.type === 'image') {
    const img = base as ImageElement
    if (!img.objectFit) img.objectFit = 'cover'
    if (!img.src) img.src = ''
    if (img.filter && !isValidCssShadow(img.filter)) delete img.filter
    if (img.boxShadow && !isValidCssShadow(img.boxShadow)) delete img.boxShadow
    return img as unknown as SlideElement
  }

  return base
}

// ═══════════════════════════════════════════════════════════
//  PROMPT BUILDER
// ═══════════════════════════════════════════════════════════

function buildBatchPrompt(
  brandName: string, cd: PremiumDesignSystem['creativeDirection'],
  colors: PremiumDesignSystem['colors'], typo: PremiumDesignSystem['typography'],
  effects: PremiumDesignSystem['effects'], motif: PremiumDesignSystem['motif'],
  designSystem: PremiumDesignSystem,
  batchContext: BatchContext, slidesDescription: string, slideCount: number,
  rhythm: { arc: string; description: string },
): string {
  return `<design_system>
<canvas>1920x1080px</canvas>
<direction>RTL</direction>
<font>Heebo</font>
<colors primary="${colors.primary}" secondary="${colors.secondary}" accent="${colors.accent}" background="${colors.background}" text="${colors.text}" cardBg="${colors.cardBg}" cardBorder="${colors.cardBorder}" muted="${colors.muted}" highlight="${colors.highlight}" gradientStart="${colors.gradientStart}" gradientEnd="${colors.gradientEnd}" />
<aurora>${effects.auroraGradient}</aurora>
<typography display="${typo.displaySize}px" heading_min="${typo.headingSize}px" heading_range="${typo.headingSize}-${typo.displaySize}px — VARY title sizes, do NOT use the same size for every title" subheading="${typo.subheadingSize}px" body="${typo.bodySize}px" caption="${typo.captionSize}px" spacing_tight="${typo.letterSpacingTight}" spacing_wide="${typo.letterSpacingWide}" weight_pairs="${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}" line_tight="${typo.lineHeightTight}" line_relaxed="${typo.lineHeightRelaxed}" />
<cards padding="${designSystem.spacing.cardPadding}px" gap="${designSystem.spacing.cardGap}px" radius="${effects.borderRadiusValue}px" />
<style decorative="${effects.decorativeStyle}" shadow="${effects.shadowStyle}" border_radius="${effects.borderRadius}" />
<motif type="${motif.type}" opacity="${motif.opacity}" color="${motif.color}">${motif.implementation}</motif>
${cd ? `<creative_direction>
  <visual_metaphor>${cd.visualMetaphor}</visual_metaphor>
  <visual_tension>${cd.visualTension}</visual_tension>
  <master_rule>${cd.oneRule}</master_rule>
  <color_story>${cd.colorStory}</color_story>
  <typography_voice>${cd.typographyVoice}</typography_voice>
  <emotional_arc>${cd.emotionalArc}</emotional_arc>
</creative_direction>` : ''}
</design_system>

<slides>
${slidesDescription}
</slides>

<rhythm arc="${rhythm.arc}">
${rhythm.description}
${batchContext.previousSlidesVisualSummary ? `Previous slides context: ${batchContext.previousSlidesVisualSummary}` : 'First batch — no previous context.'}
</rhythm>

<task>
Design ${slideCount} slides for "${brandName}".
The content (text, titles, bullets, cards) is ALREADY DECIDED in each <content> block — use it EXACTLY as written. Do NOT change the Hebrew copy. Your job is VISUAL LAYOUT ONLY.

For each slide, make ONE DRAMATIC CHOICE — a single bold visual decision that defines the slide.
Then build everything else to serve that choice. YOU MUST state it in the "dramaticChoice" field — this field is REQUIRED.

Use the layout_directive as inspiration for your archetype, but push it further. The dramatic choice matters more than following the archetype rigidly.

CRITICAL VARIETY RULES — these override defaults:
1. TITLE POSITION: You MUST vary title Y position across slides. Use ALL three zones:
   - TOP zone: y=80–280 (for some slides)
   - MIDDLE zone: y=400–550 (for some slides)
   - BOTTOM zone: y=650–850 (for some slides)
   NEVER place all titles at the same Y coordinate. In this batch of ${slideCount} slides, use at least 2 different zones.

2. TITLE SIZE: The design system headingSize is a MINIMUM, not a target. Push bigger:
   - At least 1 slide in this batch should have title fontSize ≥ 96px
   - At least 1 slide should have title fontSize ≥ 80px
   - Vary title sizes: 56px, 72px, 96px, 120px — not all the same

3. BACKGROUNDS: At least half the slides in this batch must use gradient backgrounds. Vary gradient directions (135deg, 180deg, 45deg, radial). Do NOT use the same solid color for every slide.

4. Never repeat the same dramatic approach on consecutive slides.
5. RTL: All readable text textAlign = "right".
6. IMAGES: Use exact URL from <image> tag. No image = bold typography and shapes.
7. Content text stays inside canvas. Decorative elements SHOULD bleed outside (-50px to -200px).
8. TEXT SHADOW: EVERY title element MUST have textShadow for depth (e.g. "0 4px 24px rgba(0,0,0,0.5)"). Subtitles too.
9. TITLE ZONE: Each slide has a <title_zone> directive — you MUST place the title at the Y range specified. This creates visual rhythm.
</task>

Return JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "archetype": "APPROACH_NAME", "dramaticChoice": "REQUIRED — describe the ONE bold visual decision", "label": "שם בעברית", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`
}

// ═══════════════════════════════════════════════════════════
//  MAIN: generateAIPresentation (non-staged)
// ═══════════════════════════════════════════════════════════

export async function generateAIPresentation(
  data: PremiumProposalData,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<Presentation> {
  const requestId = `pres-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'═'.repeat(50)}\n[SlideDesigner][${requestId}] Starting for "${data.brandName}" (Intent Engine v5)\n${'═'.repeat(50)}\n`)

  // Use the same pipeline as staged Vercel: Foundation → Batches → Finalize
  const foundation = await pipelineFoundation(data as Record<string, unknown>, config)

  // Batch 1 first (establishes visual language), then 2+3 in parallel
  const allSlides: Slide[] = []
  const batch1 = await pipelineBatch(foundation, 0, null)
  allSlides.push(...batch1.slides)

  const batchCount = foundation.batchCount || foundation.batches.length
  if (batchCount > 1) {
    const parallelBatches: Promise<import('./slide-design').BatchResult>[] = []
    for (let bi = 1; bi < batchCount; bi++) {
      parallelBatches.push(pipelineBatch(foundation, bi, batch1))
    }
    const results = await Promise.allSettled(parallelBatches)
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSlides.push(...result.value.slides)
      } else {
        console.error(`[SlideDesigner][${requestId}] Parallel batch failed:`, result.reason)
      }
    }
  }

  if (allSlides.length === 0) throw new Error('All slides failed')

  const presentation = await pipelineFinalize(foundation, allSlides)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  const meta = presentation.metadata || { brandName: data.brandName, createdAt: new Date().toISOString(), version: 5, pipeline: 'intent-engine-v5', qualityScore: 0 }
  console.log(`\n${'═'.repeat(50)}\n[SlideDesigner][${requestId}] Done in ${duration}s — ${presentation.slides.length} slides, quality: ${meta.qualityScore}/100\n${'═'.repeat(50)}\n`)

  return { ...presentation, metadata: { ...meta, duration: parseFloat(duration) } }
}

// ═══════════════════════════════════════════════════════════
//  STAGED PIPELINE (for Vercel timeout)
// ═══════════════════════════════════════════════════════════

export async function pipelineFoundation(
  data: Record<string, unknown>,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<import('./slide-design').PipelineFoundation> {
  const requestId = `found-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Staged pipeline: Foundation`)

  // Reset audit log for this generation session
  const { resetAuditLog, logAuditEntry } = await import('@/lib/audit/generation-log')
  resetAuditLog()

  _proUnavailable = false

  const d = data as PremiumProposalData
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || (typeof d._scraped?.logoUrl === 'string' ? d._scraped.logoUrl : '') || config.brandLogoUrl || ''

  const brandColors = d._brandColors || { primary: config.accentColor || '#E94560', secondary: '#1A1A2E', accent: config.accentColor || '#E94560', style: 'corporate', mood: 'מקצועי' }
  const brandInput: BrandDesignInput = {
    brandName: d.brandName || 'Unknown',
    industry: typeof d._brandResearch?.industry === 'string' ? d._brandResearch.industry : '',
    brandPersonality: Array.isArray(d._brandResearch?.brandPersonality) ? d._brandResearch.brandPersonality as string[] : [],
    brandColors, logoUrl: clientLogo || undefined, coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: d.targetDescription || '',
  }

  const images: Record<string, string> = { ...(config.images || {}), ...(d._generatedImages as Record<string, string> || {}) }
  if (config.extraImages) {
    for (const extra of config.extraImages) images[extra.id] = extra.url
  }

  // Step 1: Design System
  let dsStart = Date.now()
  const designSystem = await generateDesignSystem(brandInput)
  logAuditEntry({ stage: 'design-system', model: 'gemini-3.1-pro-preview', promptLength: 2600, responseLength: 2400, durationMs: Date.now() - dsStart, success: true, isFallback: false })

  // Step 2: Planner
  console.log(`[SlideDesigner][${requestId}] Running Planner...`)
  dsStart = Date.now()
  const plan = await generateSlidePlan(d, designSystem, images)
  logAuditEntry({ stage: 'planner', model: 'gpt-5.4', promptLength: 30000, responseLength: plan.length * 500, durationMs: Date.now() - dsStart, success: plan.length > 0, isFallback: false, notes: `${plan.length} slides planned` })

  // Split plan into 3 batches (indices)
  const batchSize = Math.ceil(plan.length / 3)
  const batches: number[][] = []
  for (let i = 0; i < plan.length; i += batchSize) {
    const batch: number[] = []
    for (let j = i; j < Math.min(i + batchSize, plan.length); j++) batch.push(j)
    batches.push(batch)
  }

  const batchSizes = batches.map(b => b.length)

  // ── Create Gemini explicit cache for the design system context ──
  // Reused across all batches → 70% savings on input tokens for the Gemini path
  let geminiCacheName: string | undefined
  try {
    const cdBlock = designSystem.creativeDirection
      ? `\nCreative metaphor: ${designSystem.creativeDirection.visualMetaphor}\nVisual tension: ${designSystem.creativeDirection.visualTension}\nOne rule: ${designSystem.creativeDirection.oneRule}\nColor story: ${designSystem.creativeDirection.colorStory || ''}`
      : ''
    const cacheableSystem = `You are a legendary web designer creating premium 1920×1080 RTL Hebrew presentation slides.

Brand: ${d.brandName || ''}
Industry: ${typeof d._brandResearch?.industry === 'string' ? d._brandResearch.industry : ''}

DESIGN SYSTEM (use these exact values, never improvise):
Colors:
- Primary: ${designSystem.colors.primary}
- Secondary: ${designSystem.colors.secondary}
- Accent: ${designSystem.colors.accent}
- Background: ${designSystem.colors.background || '#0C0C10'}
- Text: ${designSystem.colors.text || '#F5F5F7'}
- Card BG: ${designSystem.colors.cardBg || 'rgba(255,255,255,0.05)'}
- Muted: ${designSystem.colors.muted || 'rgba(245,245,247,0.5)'}
- Aurora: ${designSystem.effects?.auroraGradient || ''}

Typography:
- Display: ${designSystem.typography?.displaySize || 120}px
- Heading: ${designSystem.typography?.headingSize || 56}px
- Body: ${designSystem.typography?.bodySize || 22}px
- Weight pairs: ${JSON.stringify(designSystem.typography?.weightPairs || [[900, 300]])}
- Letter spacing tight: ${designSystem.typography?.letterSpacingTight ?? -3}
- Letter spacing wide: ${designSystem.typography?.letterSpacingWide ?? 4}

Effects:
- Border radius: ${designSystem.effects?.borderRadius || 'soft'} (${designSystem.effects?.borderRadiusValue || 16}px)
- Shadow style: ${designSystem.effects?.shadowStyle || 'glow'}
- Decorative style: ${designSystem.effects?.decorativeStyle || 'minimal'}
${cdBlock}

CORE RULES (apply to every slide you generate):
1. Output ONLY a JSON object: { "slides": ["<!DOCTYPE html>...", ...] }. No markdown fences.
2. Each slide is a complete HTML document — boilerplate, <style>, .slide div with width:1920px;height:1080px;position:relative;overflow:hidden.
3. Heebo font from Google Fonts. RTL direction. Hebrew text only.
4. Five visual layers per slide: background → atmosphere (aurora/glow/vignette) → structural decor → content → overlay decor (watermark/floating label).
5. Multi-layer text-shadow on every title (depth + glow + ambient).
6. Use design system colors ONLY — never invent hex values.
7. Images: when a URL is provided, use object-fit:cover with a gradient overlay for text legibility.
8. Vary layouts dramatically — no two consecutive slides should feel similar.
9. Text overflow protection: every text element needs overflow:hidden + line-clamp.
10. Safe zone: keep readable text within 80px of slide edges.

This system instruction is cached. Per-batch user prompts will only contain the slide-specific content.`

    // Min tokens to cache: gemini-3.1-pro = 4096; gemini-3-flash = 1024
    // Our cacheable block is ~1500-2000 tokens — qualifies for Flash, may not for Pro.
    if (cacheableSystem.length > 4000) {
      const { createGeminiCache } = await import('@/lib/ai-provider')
      geminiCacheName = await createGeminiCache({
        model: 'gemini-3-flash-preview',
        systemInstruction: cacheableSystem,
        ttlSeconds: 3600,
        callerId: requestId,
      })
      console.log(`[SlideDesigner][${requestId}] 💾 Gemini cache created: ${geminiCacheName}`)
    }
  } catch (cacheErr) {
    console.warn(`[SlideDesigner][${requestId}] ⚠️ Gemini cache creation failed (non-critical):`, cacheErr instanceof Error ? cacheErr.message : cacheErr)
  }

  const foundation: import('./slide-design').PipelineFoundation = {
    designSystem, plan, batches, proposalData: d,
    brandName: d.brandName || '', clientLogo, leadersLogo,
    totalSlides: plan.length, images, batchCount: batches.length, batchSizes,
    geminiCacheName,
  }

  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${plan.length} slides planned in ${batches.length} batches (${batchSizes.join(', ')})`)
  console.log(`[SlideDesigner][${requestId}] 🏷️ clientLogo: ${clientLogo || 'NONE'} | leadersLogo: ${leadersLogo ? 'YES' : 'NONE'}`)
  return foundation
}

export async function pipelineBatch(
  foundation: import('./slide-design').PipelineFoundation,
  batchIndex: number,
  previousContext: import('./slide-design').BatchResult | null,
): Promise<import('./slide-design').BatchResult> {
  const requestId = `batch-${batchIndex}-${Date.now()}`
  const batchIndices = foundation.batches[batchIndex]
  if (!batchIndices || batchIndices.length === 0) throw new Error(`Invalid batch index: ${batchIndex}`)

  const batchPlans = batchIndices.map(i => foundation.plan[i])
  let slideOffset = 0
  for (let i = 0; i < batchIndex; i++) slideOffset += foundation.batches[i].length

  console.log(`[SlideDesigner][${requestId}] 🚀 Batch ${batchIndex + 1}/${foundation.batches.length} (${batchPlans.length} slides, offset ${slideOffset}) — Intent Engine v5`)
  console.log(`[SlideDesigner][${requestId}]   Types: ${batchPlans.map(p => p.slideType).join(', ')}`)

  const ds = foundation.designSystem as PremiumDesignSystem

  // ═══ Intent Engine v5 — GPT picks tokens, Layout Resolver picks pixels ═══
  try {
    const { buildIntentPrompt, SLIDE_INTENT_SCHEMA } = await import('@/lib/slide-engine/intent-prompt')
    const { resolveLayout, FALLBACK_COMPOSITIONS } = await import('@/lib/slide-engine/layout-resolver')
    const { liteValidateSlide } = await import('@/lib/slide-engine/lite-validation')
    type SlideIntentType = import('@/lib/slide-engine/semantic-tokens').SlideIntent

    // Parse previous intents for variety constraints
    let previousIntents: SlideIntentType[] | undefined
    if (previousContext?.visualSummary) {
      try { previousIntents = JSON.parse(previousContext.visualSummary) as SlideIntentType[] } catch { /* ok */ }
    }

    const prompt = buildIntentPrompt(batchPlans, ds, foundation.images, foundation.brandName, previousIntents, slideOffset, foundation.totalSlides)
    console.log(`[SlideDesigner][${requestId}] 📝 Intent prompt: ${prompt.length} chars`)

    let intents: SlideIntentType[]

    try {
      // Per skill matrix: art direction = Gemini Pro + HIGH thinking + structured output
      console.log(`[SlideDesigner][${requestId}] 🟢 Calling Gemini 3.1 Pro for slide intents (PRIMARY)...`)
      const intentResult = await callAI({
        model: 'gemini-3.1-pro-preview',
        prompt: prompt + '\n\nReturn ONLY valid JSON matching the schema. No markdown.',
        systemPrompt: 'You are a world-class presentation art director. Choose the best visual composition for each slide. Return ONLY valid JSON.',
        geminiConfig: {
          systemInstruction: 'You are a world-class presentation art director. Choose the best visual composition for each slide. Return ONLY valid JSON.',
          responseMimeType: 'application/json',
          responseSchema: SLIDE_INTENT_SCHEMA as any,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          maxOutputTokens: 16000,
        },
        responseSchema: SLIDE_INTENT_SCHEMA as unknown as Record<string, unknown>,
        thinkingLevel: 'HIGH',
        maxOutputTokens: 16000,
        callerId: `${requestId}-intent-gemini`,
        noGlobalFallback: true,
      })

      const rawText = intentResult.text || '{}'
      console.log(`[SlideDesigner][${requestId}] ✅ Gemini Pro responded: ${rawText.length} chars`)
      const parsed = JSON.parse(rawText) as { slides: SlideIntentType[] }
      intents = parsed.slides || []

      console.log(`[SlideDesigner][${requestId}] ✅ Parsed ${intents.length} intents:`)
      for (const intent of intents) {
        console.log(`[SlideDesigner][${requestId}]   🎯 ${intent.composition.padEnd(22)} | ${intent.background.padEnd(18)} | ${intent.mood} | ${intent.elements.length} elements`)
      }
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : String(aiError)
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Intent AI failed (${msg.slice(0, 150)}), using fallback compositions`)

      // Fallback: deterministic compositions from FALLBACK_COMPOSITIONS map
      intents = batchPlans.map((plan, i) => ({
        composition: FALLBACK_COMPOSITIONS[plan.slideType] || 'hero-center' as import('@/lib/slide-engine/semantic-tokens').CompositionToken,
        background: (i === 0 ? 'gradient-dramatic' : 'solid-dark') as import('@/lib/slide-engine/semantic-tokens').BackgroundToken,
        mood: 'professional' as import('@/lib/slide-engine/semantic-tokens').MoodToken,
        elements: planToElements(plan, foundation.images),
      }))
    }

    // ── Resolve intents → pixel-positioned Slides ──
    console.log(`[SlideDesigner][${requestId}] 🏗️ Resolving layout...`)
    const slides: Slide[] = intents.map((intent, i) => {
      const plan = batchPlans[i] || batchPlans[0]
      const slide = resolveLayout(intent, plan, ds, slideOffset + i)

      // ── Auto-inject missing images ──
      // If plan has an image but GPT didn't include it (or resolver didn't render it),
      // force-inject as a background image with dark overlay
      const planImageUrl = plan.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
      const hasImage = slide.elements.some(e => e.type === 'image' && (e as ImageElement).src)
      if (planImageUrl && !hasImage) {
        console.log(`[SlideDesigner][${requestId}]   📸 Auto-injecting image for ${plan.slideType}`)
        const imgEl: ImageElement = {
          id: `auto-img-${slideOffset + i}`, type: 'image',
          x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          src: planImageUrl, alt: '', objectFit: 'cover' as const,
          opacity: 0.25, filter: 'brightness(0.5) contrast(1.15)',
        }
        const overlayEl: ShapeElement = {
          id: `auto-overlay-${slideOffset + i}`, type: 'shape',
          x: 0, y: 0, width: 1920, height: 1080, zIndex: 1,
          shapeType: 'background' as const,
          fill: `linear-gradient(180deg, ${ds.colors.background}CC 0%, ${ds.colors.background}40 40%, ${ds.colors.background}CC 100%)`,
        }
        // Insert at beginning (behind everything)
        slide.elements = [imgEl, overlayEl, ...slide.elements]
      }
      return slide
    })

    // ── Lite validation (bounds + contrast + overlap only) ──
    const validated = slides.map(s => liteValidateSlide(s, ds))

    // ── No logo injection here — pipelineFinalize handles it once for all slides ──
    for (let i = 0; i < validated.length; i++) validated[i].id = `slide-${slideOffset + i}`

    console.log(`[SlideDesigner][${requestId}] ✅ Intent Engine generated ${validated.length} slides:`)
    for (const slide of validated) {
      const texts = slide.elements.filter((e: SlideElement) => e.type === 'text')
      const shapes = slide.elements.filter((e: SlideElement) => e.type === 'shape')
      const imgs = slide.elements.filter((e: SlideElement) => e.type === 'image')
      const titleEl = texts.find((e: SlideElement) => (e as unknown as { role: string }).role === 'title') as unknown as { fontSize: number; y: number; content: string } | undefined
      console.log(`[SlideDesigner][${requestId}]   🎬 ${slide.slideType.padEnd(18)} | ${slide.elements.length} elements (${texts.length}T ${shapes.length}S ${imgs.length}I) | bg=${slide.background.type}`)
      if (titleEl) console.log(`[SlideDesigner][${requestId}]      title: "${titleEl.content?.slice(0, 35)}" ${titleEl.fontSize}px y=${titleEl.y}`)
    }

    const visualSummary = JSON.stringify(intents)
    return { slides: validated, visualSummary, slideIndex: slideOffset + validated.length }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] ❌ Intent engine failed entirely:`, error)

    // Last resort: legacy fallback slides
    const fallbackSlides = batchPlans.map((plan, i) => {
      const imageUrl = plan.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
      const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
      return createFallbackSlide(input, ds, slideOffset + i)
    })
    return { slides: fallbackSlides, visualSummary: '', slideIndex: slideOffset + fallbackSlides.length }
  }
}

/** Convert SlidePlan → ElementIntent[] for fallback intents */
function planToElements(plan: SlidePlan, images: Record<string, string>): import('@/lib/slide-engine/semantic-tokens').ElementIntent[] {
  const hasStat = !!plan.keyNumber
  const els: import('@/lib/slide-engine/semantic-tokens').ElementIntent[] = [
    { type: 'text', role: 'title', content: plan.title, size: hasStat ? 'title' : 'headline', weight: hasStat ? 'prominent' : 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
  ]
  if (plan.subtitle) els.push({ type: 'text', role: 'subtitle', content: plan.subtitle, size: 'subtitle', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null })
  if (plan.bodyText) els.push({ type: 'text', role: 'body', content: plan.bodyText, size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null })
  if (plan.keyNumber) {
    els.push({ type: 'text', role: 'stat', content: plan.keyNumber, size: 'hero', weight: 'dominant', position: null, color: 'accent', imageUrl: null, imageOpacity: null })
    if (plan.keyNumberLabel) els.push({ type: 'text', role: 'label', content: plan.keyNumberLabel, size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null })
  }
  // Bullets → card pairs
  if (plan.bulletPoints?.length) {
    for (const bullet of plan.bulletPoints.slice(0, 4)) {
      els.push({ type: 'text', role: 'card-title', content: bullet, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null })
      els.push({ type: 'text', role: 'card-body', content: '', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null })
    }
  }
  if (plan.cards?.length) {
    for (const card of plan.cards.slice(0, 4)) {
      els.push({ type: 'text', role: 'card-title', content: card.title, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null })
      els.push({ type: 'text', role: 'card-body', content: card.body, size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null })
    }
  }
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
  if (imageUrl) els.push({ type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl, imageOpacity: 0.3 })
  return els
}

/** Lightweight quality estimator — no pacing map needed */
function estimateQuality(slide: Slide): number {
  let score = 60
  const els = slide.elements
  const texts = els.filter(e => e.type === 'text')
  const images = els.filter(e => e.type === 'image')
  if (slide.background.type === 'gradient') score += 10
  if (els.some(e => e.type === 'shape')) score += 5
  if (images.length > 0) score += 10
  if (els.length >= 3 && els.length <= 8) score += 5
  const title = texts.find(e => (e as unknown as { role: string }).role === 'title')
  if (title && (title as unknown as { fontSize: number }).fontSize >= 48) score += 5
  if (els.length <= 10) score += 5
  return Math.min(score, 100)
}

export async function pipelineFinalize(
  foundation: import('./slide-design').PipelineFoundation,
  allSlides: Slide[],
): Promise<Presentation> {
  const requestId = `final-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Finalizing: ${allSlides.length} slides`)
  if (allSlides.length === 0) throw new Error('No slides to finalize')

  const ds = foundation.designSystem as PremiumDesignSystem
  const { liteValidateSlide } = await import('@/lib/slide-engine/lite-validation')

  // v5: lite validation only (bounds + contrast + overlap). No old density/whitespace/consistency checks.
  const validatedSlides = allSlides.map(s => liteValidateSlide(s, ds))
  const avgScore = Math.round(validatedSlides.reduce((sum, s) => sum + estimateQuality(s), 0) / validatedSlides.length)
  const finalSlides = injectClientLogo(injectLeadersLogo(validatedSlides), foundation.clientLogo)

  console.log(`[SlideDesigner][${requestId}] Finalized: ${finalSlides.length} slides, quality: ${avgScore}/100`)
  return {
    id: `pres-${Date.now()}`, title: foundation.brandName || 'הצעת מחיר', designSystem: ds,
    slides: finalSlides,
    metadata: { brandName: foundation.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v5-planner-staged', qualityScore: avgScore },
  }
}

// ═══════════════════════════════════════════════════════════
//  HTML-NATIVE PIPELINE (v6) — GPT outputs raw HTML/CSS per slide
// ═══════════════════════════════════════════════════════════

export async function pipelineBatchHtml(
  foundation: import('./slide-design').PipelineFoundation,
  batchIndex: number,
): Promise<import('./slide-design').HtmlBatchResult> {
  const requestId = `html-batch-${batchIndex}-${Date.now()}`
  const batchIndices = foundation.batches[batchIndex]
  if (!batchIndices || batchIndices.length === 0) throw new Error(`Invalid batch index: ${batchIndex}`)

  const batchPlans = batchIndices.map(i => foundation.plan[i])
  let slideOffset = 0
  for (let i = 0; i < batchIndex; i++) slideOffset += foundation.batches[i].length

  console.log(`[SlideDesigner][${requestId}] 🎨 HTML Batch ${batchIndex + 1}/${foundation.batches.length} (${batchPlans.length} slides, offset ${slideOffset})`)

  const ds = foundation.designSystem as PremiumDesignSystem
  const c = ds.colors
  const cd = ds.creativeDirection

  // Pull influencer list from the document for the influencers slide
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wizardData = foundation.proposalData as any
  const influencerProfiles = (wizardData?.influencers || []) as Array<{
    name?: string
    username?: string
    followers?: number
    engagementRate?: number
    profilePicUrl?: string
    isVerified?: boolean
    bio?: string
  }>

  // Build slide descriptions for the prompt
  const slidesBlock = batchPlans.map((plan, i) => {
    const globalIndex = slideOffset + i + 1
    const imageUrl = plan.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
    const contentParts: string[] = [`Title: ${plan.title}`]
    if (plan.subtitle) contentParts.push(`Subtitle: ${plan.subtitle}`)
    if (plan.bodyText) contentParts.push(`Body: ${plan.bodyText}`)
    if (plan.bulletPoints?.length) contentParts.push(`Bullets:\n${plan.bulletPoints.map(b => `  • ${b}`).join('\n')}`)
    if (plan.cards?.length) contentParts.push(`Cards:\n${plan.cards.map(card => `  - ${card.title}: ${card.body}`).join('\n')}`)
    if (plan.keyNumber) contentParts.push(`KEY STAT: ${plan.keyNumber} (${plan.keyNumberLabel || ''})`)
    if (plan.tagline) contentParts.push(`Tagline: ${plan.tagline}`)
    if (imageUrl) contentParts.push(`IMAGE URL: ${imageUrl}`)

    // For the influencers slide — inject the full profile list with PICTURE URLs
    if (plan.slideType === 'influencers' && influencerProfiles.length > 0) {
      const profileList = influencerProfiles.slice(0, 6).map(p => {
        const picPart = p.profilePicUrl ? `PIC: ${p.profilePicUrl}` : 'PIC: none'
        const verified = p.isVerified ? ' ✓' : ''
        return `  - @${p.username}${verified} (${p.name}) | ${p.followers?.toLocaleString() || '?'} followers | ER ${p.engagementRate?.toFixed(1) || '?'}% | ${picPart}`
      }).join('\n')
      contentParts.push(`INFLUENCERS (use PIC URLs as circular profile images):\n${profileList}`)
      contentParts.push(`CRITICAL: Render each influencer as a card with: circular profile pic (use PIC URL with object-fit:cover, border-radius:50%, border:3px solid accent), @username, follower count, ER %. Layout as grid of cards. If PIC is "none" — show first letter of username in a colored circle instead.`)
    }

    return `<slide index="${globalIndex}" type="${plan.slideType}" tone="${plan.emotionalTone || 'professional'}">
${contentParts.join('\n')}
</slide>`
  }).join('\n\n')

  const prompt = `You are the MOST AWARDED presentation designer alive. Cannes Lions, D&AD Black Pencil, TDC.
You don't make slides — you make VISUAL EXPERIENCES that people screenshot and share.

<design_system>
Brand: ${foundation.brandName}
Primary: ${c.primary} | Secondary: ${c.secondary} | Accent: ${c.accent}
Background: ${c.background || '#0C0C10'} | Text: ${c.text || '#F5F5F7'}
Card BG: ${c.cardBg || 'rgba(255,255,255,0.05)'} | Muted: ${c.muted || 'rgba(245,245,247,0.5)'}
Aurora: ${ds.effects?.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${c.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${c.accent}30, transparent 50%), ${c.background}`}
Font: Heebo | Direction: RTL
${cd ? `Creative Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
One Rule: ${cd.oneRule}
Color Story: ${cd.colorStory || 'dark → accent burst → restrained ending'}` : ''}
</design_system>

<five_layer_model>
Every slide MUST have at least 5 visual layers. This is what separates a B+ slide from an A+ slide:

Layer 0 — BACKGROUND: Solid color, gradient, or full-bleed image with overlay
Layer 1 — ATMOSPHERE: Glow clusters (radial-gradient orbs), aurora mesh (3+ overlapping elliptical gradients), vignette (darkened edges), noise texture
Layer 2 — STRUCTURAL DECOR: Accent lines (thin gradient bars), accent blades (vertical dividers with box-shadow glow), geometric frame corners (partial borders at 2 corners), diagonal slashes, floating circles
Layer 3 — CONTENT: Titles, body text, images, cards, stats
Layer 4 — OVERLAY DECOR: Watermarks (200-400px text at 0.03-0.06 opacity), floating labels (tiny uppercase tracking text at edges), number badges, accent stripes (thin gradient line at top/bottom)

If a slide has fewer than 5 layers, ADD MORE ATMOSPHERE AND DECORATION.
</five_layer_model>

<css_arsenal>
USE ALL of these — this is your paint palette:

ATMOSPHERE:
- Aurora mesh: 3 overlapping radial-gradient ellipses at different positions/sizes
  radial-gradient(ellipse 120% 80% at 15% 50%, ${c.primary}25, transparent 60%),
  radial-gradient(ellipse 80% 120% at 85% 30%, ${c.accent}18, transparent 55%),
  radial-gradient(ellipse 60% 90% at 50% 80%, ${c.secondary || c.primary}12, transparent 50%)
- Vignette: radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(0,0,0,0.3) 100%)
- Glow orbs: position:absolute divs with radial-gradient(circle, ${c.primary}20, transparent 70%) and large width/height (800-1000px)

STRUCTURAL:
- Accent stripe: 4px height, full width, linear-gradient(90deg, ${c.primary}, ${c.accent}, transparent)
- Geometric frame corners: 2px × 60px L-shapes at corners using ::before/::after or absolute divs
- Accent blade: 3px wide vertical line with box-shadow: 0 0 20px ${c.accent}40
- Diagonal slash: rotated div with subtle gradient fill

TYPOGRAPHY:
- Titles: text-shadow: 0 4px 30px rgba(0,0,0,0.6), 0 0 80px ${c.accent}20, 0 0 160px ${c.primary}10
- Stats: text-shadow: 0 0 80px ${c.accent}40, 0 8px 40px rgba(0,0,0,0.5)
- Hollow watermarks: -webkit-text-stroke: 2px ${c.text}08; color: transparent; font-size: 300-400px; opacity: 0.03-0.06
- Labels: letter-spacing: 6-12px; text-transform: uppercase; font-weight: 300; opacity: 0.4-0.5
- Headlines: letter-spacing: -6 to -8px; line-height: 0.85-0.95

CARDS:
- Glassmorphism: backdrop-filter: blur(12px); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.2)
- Gradient border: outer div with gradient bg, inner div with solid bg (1px gap = border)
- 3D tilt on hover area: transform: perspective(1200px) rotateX(2deg) rotateY(-1deg)
- Number badges inside cards: large number (48-96px) at low opacity (0.08-0.15)

⚠️ CRITICAL FOR PDF EXPORT COMPATIBILITY:
When you create visual CARDS (grid items, stat cards, feature boxes, metric cards) that use
glassmorphism/backdrop-filter — you MUST add class="pdf-glass-card" to the card element,
in addition to your inline styling.

When you use backdrop-filter ONLY as a text-readability surface behind a heading/paragraph
on a busy background (image, heavy gradient) — DO NOT add this class. Keep backdrop-filter
inline only.

Rule of thumb: if the element is a visible "surface" with clear boundaries that the user
should perceive as a card — pdf-glass-card. If it's just a subtle blur to make text readable
and should be nearly invisible — no class.

IMAGE TREATMENT:
- Full-bleed: position:absolute; inset:0; object-fit:cover; filter: brightness(0.5) contrast(1.15)
- Overlay gradient (PDF-safe): linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%) — use SMOOTH transitions spanning the full 0%→100%, NOT sharp mid-point stops
- Split with fade (PDF-safe): linear-gradient(to right, transparent 0%, rgba(20,28,45,0.7) 50%, ${c.background}EE 100%) — gradual 3-stop transition, NEVER sharp cuts like "transparent 60%, bg 100%"
- Image bleeds: negative margins (-40px) on image edges for editorial tension

⚠️ PDF EXPORT — SMOOTH GRADIENTS ONLY:
Chrome's PDF print engine renders alpha gradients in BANDS if the transition is too sharp.
A gradient like "linear-gradient(to right, transparent 60%, bg 100%)" will render as a hard
edge rectangle in PDF instead of a soft fade.

ALWAYS use gradients that start at 0% and end at 100% with at least 3 color stops for any
overlay that should look "soft". Examples:
  GOOD: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%)
  BAD:  linear-gradient(to right, transparent 60%, bg 100%)   ← sharp cut
  BAD:  linear-gradient(to right, transparent 70%, bg 70.1%)  ← hard line

If the overlay needs to cover half the slide (split layout), use a SOLID color with alpha
(e.g. rgba(20,28,45,0.7)) on a full-width div — don't rely on gradient cuts.
</css_arsenal>

<rules>
1. Each slide = COMPLETE HTML document with this EXACT boilerplate:
<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100;300;400;500;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;font-family:'Heebo',sans-serif;direction:rtl;}
/* TEXT OVERFLOW PROTECTION — mandatory on every text element */
.slide h1,.slide h2,.slide h3,.slide [data-role="title"]{
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
  word-break:break-word;overflow-wrap:break-word;text-wrap:balance;
}
.slide p,.slide [data-role="body"]{
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;
  word-break:break-word;overflow-wrap:break-word;
}
.slide li,.slide [data-role="bullet"]{
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
  text-overflow:ellipsis;
}
.slide [data-role="card-body"]{
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
}
.slide [data-role="subtitle"]{
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
  text-wrap:balance;
}
</style>
</head><body><div class="slide">...</div></body></html>
2. ALL text in Hebrew. RTL.
3. Design system colors ONLY. No random colors.
4. Images: use ONLY provided URLs. Always with object-fit:cover and a gradient overlay for text readability.
5. EVERY title gets multi-layer text-shadow (depth + glow + ambient). No flat text.
6. EVERY slide gets at least one watermark OR floating label OR accent stripe (Layer 4).
7. EVERY slide gets atmospheric depth — glow orbs, aurora mesh, or vignette (Layer 1).
8. VARY layouts DRAMATICALLY. No two slides should feel similar.
9. The CONTRAST between slides makes the deck alive.
10. Think Vogue spread, not PowerPoint.

TEXT OVERFLOW PREVENTION (CRITICAL):
11. ALL text containers MUST have overflow:hidden and max-height set. Text must NEVER bleed outside the slide.
12. Title: max 2 lines. If title is long, reduce font-size to fit. Use CSS: display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
13. Body text: max 3 lines per paragraph. Same clamp technique.
14. Cards: each card has fixed height. Text inside gets overflow:hidden.
15. Bullet lists: max 5 items. Each item max 1 line with text-overflow:ellipsis.
16. LESS TEXT = BETTER DESIGN. If content is long, summarize. Use icons and numbers instead of sentences.
17. Every text element: white-space:normal; word-break:break-word; overflow-wrap:break-word;
18. Safe zone: keep ALL readable text within 80px margin from slide edges (1920-160=1760px usable width, 1080-160=920px usable height).
</rules>

<slides>
${slidesBlock}
</slides>

CRITICAL: You MUST generate EXACTLY ${batchPlans.length} slides. Not 1, not 2 — exactly ${batchPlans.length}.
Each slide maps to one <slide> element above. If you return fewer, the presentation will be broken.

Return a JSON object: { "slides": ["<!DOCTYPE html>...", "<!DOCTYPE html>...", ...] }
The "slides" array MUST contain exactly ${batchPlans.length} items.
Each item is a COMPLETE, self-contained HTML document for one slide. Make them BREATHTAKING.`

  try {
    // ── Gemini 3.1 Pro PRIMARY (with cache when available) → Claude → GPT fallbacks ──
    // Flipped April 2026: Gemini is now the primary path because:
    // 1. Anthropic key may be unavailable → previous Claude-first failed
    // 2. Explicit context cache cuts ~70% of input cost across the 3 batches
    // 3. Gemini 3.1 Pro matches Claude Sonnet quality on HTML and is cheaper
    let rawText = ''
    let usedModel = ''

    const useCache = !!foundation.geminiCacheName
    console.log(`[SlideDesigner][${requestId}] 🟢 PRIMARY: Gemini 3.1 Pro for HTML batch (cache=${useCache ? '✅' : '❌'}, prompt=${prompt.length} chars)`)

    try {
      // MEDIUM thinking (not HIGH): HTML code gen doesn't need deep reasoning —
      // the CSS arsenal already tells the model what techniques to use.
      // HIGH burns ~15K thinking tokens out of maxOutputTokens → starves actual HTML.
      // Dynamic output budget: 6K tokens per slide + overhead.
      const perSlideTokens = 6000
      const outputTokens = Math.max(32768, batchPlans.length * perSlideTokens + 4000)
      console.log(`[SlideDesigner][${requestId}]   📏 ${batchPlans.length} slides × ${perSlideTokens} tok/slide = ${outputTokens} maxOutput (thinking=MEDIUM)`)

      const geminiResult = await callAI({
        model: 'gemini-3.1-pro-preview',
        prompt,
        ...(useCache ? { cachedContent: foundation.geminiCacheName } : {}),
        geminiConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          maxOutputTokens: outputTokens,
        },
        thinkingLevel: 'MEDIUM',
        maxOutputTokens: outputTokens,
        callerId: `${requestId}-html-gemini-primary`,
        noGlobalFallback: true,
      })
      rawText = geminiResult.text || '{}'
      usedModel = useCache ? 'Gemini 3.1 Pro (cached)' : 'Gemini 3.1 Pro'
      console.log(`[SlideDesigner][${requestId}] ✅ Gemini Pro returned ${rawText.length} chars (expected ~${batchPlans.length * 4000} for ${batchPlans.length} slides)`)
    } catch (geminiErr) {
      const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
      console.error(`[SlideDesigner][${requestId}] ❌ Gemini Pro failed: ${errMsg}`)

      // Retry once with Flash (cheaper, faster, may handle the load better)
      console.log(`[SlideDesigner][${requestId}] 🔄 Retrying with Gemini Flash...`)
      const flashOutputTokens = batchPlans.length * 6000 + 4000
      try {
        const retryResult = await callAI({
          model: 'gemini-3-flash-preview',
          prompt,
          geminiConfig: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            maxOutputTokens: flashOutputTokens,
          },
          thinkingLevel: 'MEDIUM',
          maxOutputTokens: flashOutputTokens,
          callerId: `${requestId}-html-gemini-flash-retry`,
          noGlobalFallback: true,
        })
        rawText = retryResult.text || '{}'
        usedModel = 'Gemini 3 Flash (retry)'
        console.log(`[SlideDesigner][${requestId}] ✅ Flash retry returned ${rawText.length} chars`)
      } catch (flashErr) {
        console.error(`[SlideDesigner][${requestId}] ❌ Flash retry also failed: ${flashErr instanceof Error ? flashErr.message : flashErr}`)
        throw geminiErr // throw original error for outer catch
      }
    }

    console.log(`[SlideDesigner][${requestId}] ✅ ${usedModel} responded: ${rawText.length} chars`)

    const parsed = JSON.parse(rawText) as { slides: string[] }
    const htmlSlides = parsed.slides || []

    // Validate count — fill missing slides with simple HTML fallbacks
    if (htmlSlides.length !== batchPlans.length) {
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Count mismatch: AI returned ${htmlSlides.length}/${batchPlans.length} slides`)
      if (htmlSlides.length === 0) throw new Error(`AI returned 0 slides`)
      // Fill missing slides with a simple HTML fallback instead of throwing
      while (htmlSlides.length < batchPlans.length) {
        const missingPlan = batchPlans[htmlSlides.length]
        const fallbackHtml = buildFallbackHtmlSlide(missingPlan, ds.colors, foundation.brandName)
        htmlSlides.push(fallbackHtml)
        console.log(`[SlideDesigner][${requestId}]   📋 Filled missing slide ${htmlSlides.length}/${batchPlans.length} (${missingPlan.slideType}) with fallback HTML`)
      }
    }
    const actualCount = Math.min(htmlSlides.length, batchPlans.length)

    console.log(`[SlideDesigner][${requestId}] ✅ Got ${actualCount} HTML slides:`)
    for (let i = 0; i < actualCount; i++) {
      const plan = batchPlans[i]
      console.log(`[SlideDesigner][${requestId}]   🎨 ${(plan?.slideType || '?').padEnd(18)} | ${htmlSlides[i].length} chars`)
    }

    // Post-process: inject overflow safety CSS if GPT didn't include it
    const SAFETY_CSS = `<style data-safety>
.slide h1,.slide h2,.slide h3,.slide [data-role="title"]{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;word-break:break-word;text-wrap:balance;}
.slide p,.slide [data-role="body"]{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;word-break:break-word;}
.slide li{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-overflow:ellipsis;}
.slide [data-role="card-body"]{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;}
.slide [data-role="subtitle"]{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;text-wrap:balance;}
</style>`
    const safeSlides = htmlSlides.slice(0, actualCount).map(html => {
      // Only inject if GPT didn't already include line-clamp rules
      if (html.includes('-webkit-line-clamp') || html.includes('line-clamp')) return html
      // Inject before </head> or before </style> or before </body>
      if (html.includes('</head>')) return html.replace('</head>', SAFETY_CSS + '</head>')
      if (html.includes('</style>')) return html.replace('</style>', '</style>' + SAFETY_CSS)
      if (html.includes('</body>')) return html.replace('</body>', SAFETY_CSS + '</body>')
      return html + SAFETY_CSS
    })

    // ── Reflection Loop (DeepPresenter pattern) ──
    // Inspect each slide visually, auto-revise defective ones
    let finalSlides = safeSlides
    try {
      const { inspectAllSlides } = await import('@/lib/slide-engine/vision-inspector')
      const slideTypes = batchPlans.slice(0, actualCount).map(p => p.slideType)
      const imageFlags = batchPlans.slice(0, actualCount).map(p => !!(p.existingImageKey && foundation.images[p.existingImageKey]))

      const reports = await inspectAllSlides(finalSlides, slideTypes, imageFlags)
      const defective = reports.filter(r => r.hasDefects && r.score < 70)

      if (defective.length > 0) {
        console.log(`[SlideDesigner][${requestId}] 🔄 Reflection: ${defective.length} slides need revision`)

        for (const report of defective) {
          if (!report.revisionHint) continue
          try {
            console.log(`[SlideDesigner][${requestId}]   🔧 Revising slide ${report.slideIndex + 1} (${report.slideType}): ${report.revisionHint.slice(0, 80)}`)

            // Gemini Flash for quick revisions (per skill matrix: single slide regen → Flash + MEDIUM)
            const revisionResult = await callAI({
              model: 'gemini-3-flash-preview',
              prompt: `Original slide HTML:\n${finalSlides[report.slideIndex]}\n\nDefects found:\n${report.issues.join('\n')}\n\nFix: ${report.revisionHint}\n\nReturn the FIXED complete HTML document only. No explanation.`,
              systemPrompt: 'Fix the HTML slide based on the defect report. Return ONLY the fixed complete HTML document. No explanation, no markdown fences.',
              geminiConfig: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                maxOutputTokens: 8192,
              },
              thinkingLevel: 'MEDIUM',
              maxOutputTokens: 8192,
              callerId: `${requestId}-revise-${report.slideIndex}`,
              noGlobalFallback: true,
            })

            const fixedHtml = (revisionResult.text || '')
              .replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

            if (fixedHtml.includes('<!DOCTYPE') || fixedHtml.includes('<html')) {
              finalSlides[report.slideIndex] = fixedHtml
              console.log(`[SlideDesigner][${requestId}]   ✅ Slide ${report.slideIndex + 1} revised by Gemini Flash`)
            }
          } catch (revErr) {
            console.warn(`[SlideDesigner][${requestId}]   ⚠️ Revision failed for slide ${report.slideIndex + 1}: ${revErr}`)
          }
        }
      } else {
        console.log(`[SlideDesigner][${requestId}] ✅ Reflection: all slides passed inspection`)
      }
    } catch (inspectErr) {
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Vision inspection skipped: ${inspectErr instanceof Error ? inspectErr.message : String(inspectErr)}`)
    }

    return {
      htmlSlides: finalSlides,
      slideTypes: batchPlans.slice(0, actualCount).map(p => p.slideType),
      slideIndex: slideOffset + actualCount,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[SlideDesigner][${requestId}] ❌ HTML batch failed: ${msg.slice(0, 200)}`)

    // Fallback: use AST pipeline → convert to HTML
    console.log(`[SlideDesigner][${requestId}] 🔄 Falling back to AST → HTML conversion...`)
    try {
      const astResult = await pipelineBatch(foundation, batchIndex, null)
      const { presentationToHtmlSlides } = await import('@/lib/presentation/ast-to-html')
      const tempPresentation = {
        id: 'temp', title: foundation.brandName, designSystem: ds,
        slides: astResult.slides, metadata: { version: 2 },
      }
      const htmlSlides = presentationToHtmlSlides(tempPresentation as import('@/types/presentation').Presentation)
      return {
        htmlSlides,
        slideTypes: batchPlans.map(p => p.slideType),
        slideIndex: slideOffset + htmlSlides.length,
      }
    } catch (fallbackErr) {
      console.error(`[SlideDesigner][${requestId}] ❌ Fallback also failed:`, fallbackErr)
      return { htmlSlides: [], slideTypes: [], slideIndex: slideOffset }
    }
  }
}

export async function pipelineFinalizeHtml(
  foundation: import('./slide-design').PipelineFoundation,
  allHtmlSlides: string[],
  allSlideTypes: string[],
): Promise<import('./slide-design').HtmlPresentation> {
  const requestId = `html-final-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Finalizing HTML presentation: ${allHtmlSlides.length} slides`)

  // Inject logos into each HTML slide
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const leadersLogoUrl = foundation.leadersLogo || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-white.png`
  const clientLogoUrl = foundation.clientLogo

  const finalSlides = allHtmlSlides.map(html => {
    // Inject logos before </body>
    const logos: string[] = []
    if (leadersLogoUrl) {
      logos.push(`<img src="${leadersLogoUrl}" alt="Leaders" style="position:absolute;bottom:30px;left:40px;height:40px;opacity:0.7;z-index:999;" />`)
    }
    if (clientLogoUrl) {
      logos.push(`<img src="${clientLogoUrl}" alt="Brand" style="position:absolute;top:30px;right:40px;height:50px;opacity:0.85;z-index:999;" />`)
    }
    if (logos.length > 0) {
      // Insert logos inside the .slide div — find it specifically, not just any </div>
      const slideIdx = html.indexOf('class="slide"')
      if (slideIdx > 0) {
        // Find the </body> tag and insert before it (logos are position:absolute, so they work anywhere in slide)
        const bodyCloseIdx = html.indexOf('</body>')
        if (bodyCloseIdx > 0) {
          return html.slice(0, bodyCloseIdx) + logos.join('\n') + html.slice(bodyCloseIdx)
        }
      }
      // Fallback: insert before </html>
      const htmlCloseIdx = html.lastIndexOf('</html>')
      if (htmlCloseIdx > 0) {
        return html.slice(0, htmlCloseIdx) + logos.join('\n') + html.slice(htmlCloseIdx)
      }
    }
    return html
  })

  console.log(`[SlideDesigner][${requestId}] ✅ HTML presentation ready: ${finalSlides.length} slides, logos injected`)

  return {
    title: foundation.brandName || 'הצעת מחיר',
    brandName: foundation.brandName || '',
    designSystem: foundation.designSystem as PremiumDesignSystem,
    htmlSlides: finalSlides,
    slideTypes: allSlideTypes,
    metadata: {
      brandName: foundation.brandName,
      createdAt: new Date().toISOString(),
      version: 6,
      pipeline: 'html-native-v6',
      qualityScore: 90,
    },
  }
}

// ═══════════════════════════════════════════════════════════
//  SINGLE SLIDE REGENERATION
// ═══════════════════════════════════════════════════════════

export async function regenerateSingleSlide(
  designSystem: PremiumDesignSystem,
  slideContent: SlideContentInput,
  brandName: string,
  _creativeDirection?: unknown,
  _layoutStrategy?: unknown,
  instruction?: string,
): Promise<Slide> {
  const { buildIntentPrompt, SLIDE_INTENT_SCHEMA } = await import('@/lib/slide-engine/intent-prompt')
  const { resolveLayout, FALLBACK_COMPOSITIONS } = await import('@/lib/slide-engine/layout-resolver')
  const { liteValidateSlide } = await import('@/lib/slide-engine/lite-validation')
  type SlideIntentType = import('@/lib/slide-engine/semantic-tokens').SlideIntent

  const plan: SlidePlan = {
    slideType: slideContent.slideType,
    title: slideContent.title,
    subtitle: typeof slideContent.content?.subtitle === 'string' ? slideContent.content.subtitle : undefined,
    bodyText: instruction
      ? `${String(slideContent.content?.description || '')}\n\nהנחיה: ${instruction}`
      : typeof slideContent.content?.description === 'string' ? slideContent.content.description : undefined,
    emotionalTone: 'confident',
    existingImageKey: slideContent.imageUrl ? 'image' : undefined,
  }
  const images: Record<string, string> = slideContent.imageUrl ? { image: slideContent.imageUrl } : {}

  // Try Intent Engine
  try {
    const prompt = buildIntentPrompt([plan], designSystem, images, brandName, undefined, 0, 1)
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.responses.create({
      model: 'gpt-5.4',
      instructions: 'You are a world-class presentation art director. Return ONLY valid JSON.',
      input: prompt,
      text: { format: { type: 'json_schema', name: 'slide_intents', strict: true, schema: SLIDE_INTENT_SCHEMA } },
    })
    const parsed = JSON.parse(response.output_text || '{}') as { slides: SlideIntentType[] }
    if (parsed.slides?.[0]) {
      const slide = resolveLayout(parsed.slides[0], plan, designSystem, 0)
      return liteValidateSlide(slide, designSystem)
    }
  } catch (error) {
    console.warn('[regenerateSingleSlide] Intent engine failed, using fallback:', error)
  }

  // Fallback: deterministic composition
  const fallbackIntent: SlideIntentType = {
    composition: FALLBACK_COMPOSITIONS[slideContent.slideType] || 'hero-center',
    background: 'gradient-dramatic',
    mood: 'professional',
    elements: planToElements(plan, images),
  }
  return liteValidateSlide(resolveLayout(fallbackIntent, plan, designSystem, 0), designSystem)
}

// ═══════════════════════════════════════════════════════════
//  LEGACY WRAPPER: HTML output
// ═══════════════════════════════════════════════════════════

import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'

export async function generateAISlides(
  documentData: PremiumProposalData,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {},
): Promise<string[]> {
  const presentation = await generateAIPresentation(documentData, config)
  return presentationToHtmlSlides(presentation)
}
