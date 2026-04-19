/**
 * Research Agent v8 — Brain only, no rendering.
 *
 * Architecture:
 *   Phase 1 (built-in tools): google_search + url_context → brand research
 *   Phase 2 (function declarations):
 *     - search_influencers → real IMAI data
 *     - draft_brand_content → brief, goals, audience (steps 1-3)
 *     - draft_strategy_content → insight, strategy, creative (steps 4-6)
 *     - draft_execution_content → deliverables, influencers, KPI (steps 7-9)
 *
 * Output: research data + draft wizard content + image prompts
 * Does NOT generate slides — that's slide-designer.ts's job.
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { searchIsraeliInfluencers, getAudienceReport, getInstagramUserInfo } from '@/lib/imai/client'

// ─── Types ──────────────────────────────────────────────

export interface ResearchAgentInput {
  brandName: string
  briefText: string
  briefFileUri?: string
  briefFileMime?: string
}

export interface ResearchAgentOutput {
  /** Raw research text from google_search + url_context */
  researchText: string
  /** Structured brand research (matches BrandResearch type for UI display) */
  structuredResearch: Record<string, unknown> | null
  /** IMAI influencer results — full profile data */
  influencers: Array<{
    username: string
    fullname: string
    followers: number
    engagement_rate: number
    is_verified?: boolean
    picture?: string
    bio?: string
    rationale?: string
  }>
  /** Draft content for wizard steps 1-3 */
  brandContent: {
    brandBrief?: string
    brandObjective?: string
    goals?: string[]
    targetDescription?: string
    targetAgeRange?: string
    targetGender?: string
  } | null
  /** Draft content for wizard steps 4-6 */
  strategyContent: {
    keyInsight?: string
    insightSource?: string
    insightData?: string
    strategyHeadline?: string
    strategyDescription?: string
    strategyPillars?: Array<{ title: string; description: string }>
    activityTitle?: string
    activityConcept?: string
    activityDescription?: string
    activityApproach?: Array<{ title: string; description: string }>
    activityDifferentiator?: string
    brandStory?: string
    toneOfManner?: string
    visualDirection?: string
    keyMessages?: string[]
    suggestedReferences?: Array<{ campaign: string; year?: string; why: string }>
  } | null
  /** Draft content for wizard steps 7-9 */
  executionContent: {
    deliverables?: string[]
    influencerStrategy?: string
    influencerCriteria?: string[]
    budget?: number
    potentialReach?: number
    successMetrics?: string[]
  } | null
  /** Image generation prompts (deferred to background job) */
  imagePrompts: Array<{ type: string; prompt: string }>
  /** Brand colors extracted from research */
  brandColors: { primary: string; accent: string; background: string } | null
  totalToolCalls: number
  durationMs: number
}

export type ResearchProgressCallback = (event: {
  stage: 'research' | 'influencers' | 'drafting' | 'done' | 'error'
  message: string
  progress?: number
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
      'Search for Israeli influencers on IMAI. Returns real, quality-filtered data. ' +
      'Keywords must be 2-4 BRAND-SPECIFIC single English words describing the NICHE ' +
      '(e.g. brand is a baby cream → ["parenting","baby","skincare"]; brand is a car → ["automotive","driving"]). ' +
      'DO NOT use generic words like "lifestyle", "content", "hebrew", "israel" — they return junk. ' +
      'You MUST call this to find influencers for the campaign.',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'Brand-niche English keywords (2-4 words)' },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
        minFollowers: { type: 'integer', description: 'Min followers. Default 15000. Raise to 30000+ for premium brands.' },
        minEngagement: { type: 'number', description: 'Min engagement % (e.g. 1.5). Default 1.5.' },
        maxFollowers: { type: 'integer' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'enrich_influencer',
    description:
      'Look up a specific influencer by Instagram username using IMAI database. ' +
      'Returns real follower count, engagement rate, avg likes. ' +
      'Use this to enrich influencer names found via Google Search with real data. ' +
      'Call this for EACH influencer username you found during research.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Instagram username without @' },
      },
      required: ['username'],
    },
  },
  {
    name: 'get_influencer_audience',
    description: 'Get audience demographics for a specific influencer. Use on top 2-3 candidates only.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
      },
      required: ['username'],
    },
  },
  {
    name: 'draft_brand_content',
    description:
      'Draft wizard steps 1-3: brief, goals, target audience. ' +
      'Fill ALL fields — do not skip any. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        // Step 1: Brief
        brandBrief: { type: 'string', description: 'מה האתגר של המותג? למה פנו אלינו? 2-3 משפטים.' },
        brandObjective: { type: 'string', description: 'למה הבריף הזה? משפט אחד על הסיבה העסקית.' },
        brandPainPoints: { type: 'array', items: { type: 'string' }, description: 'כאבים/אתגרים עסקיים של המותג (2-4 פריטים)' },
        successMetrics: { type: 'array', items: { type: 'string' }, description: 'מדדי הצלחה שהלקוח הזכיר בבריף (2-4 פריטים)' },
        clientSpecificRequests: { type: 'array', items: { type: 'string' }, description: 'דרישות מיוחדות מהלקוח (אם יש, אחרת [])' },
        // Step 2: Goals
        goals: { type: 'array', items: { type: 'string' }, description: '2-4 יעדי קמפיין ממוקדים — ככותרות קצרות' },
        goalsDetailed: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'כותרת היעד' },
              description: { type: 'string', description: 'תיאור היעד — איך משיגים אותו, 1-2 משפטים' },
            },
            required: ['title', 'description'],
          },
          description: 'כל יעד עם תיאור מפורט',
        },
        // Step 3: Target Audience
        targetGender: { type: 'string', description: 'נשים/גברים/שניהם' },
        targetAgeRange: { type: 'string', description: 'טווח גילאים (לדוגמה: 25-45)' },
        targetDescription: { type: 'string', description: 'תיאור קהל היעד — 2-3 משפטים' },
        targetBehavior: { type: 'string', description: 'איך הקהל מתנהג — הרגלי צריכה, דיגיטל, קניות' },
        targetInsights: { type: 'array', items: { type: 'string' }, description: 'תובנות על הקהל (2-4 פריטים)' },
      },
      required: ['brandBrief', 'brandObjective', 'goals', 'goalsDetailed', 'targetDescription', 'targetBehavior', 'targetGender', 'targetAgeRange'],
    },
  },
  {
    name: 'draft_strategy_content',
    description:
      'Draft wizard steps 4-6: insight, strategy, creative. ' +
      'Fill ALL fields. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        // Step 4: Key Insight
        keyInsight: { type: 'string', description: 'תובנה חדה ומפתיעה — משפט אחד עם נתון' },
        insightSource: { type: 'string', description: 'מאיפה התובנה הגיעה (מחקר/אינטואיציה/נתון)' },
        insightData: { type: 'string', description: 'הנתון/הסטטיסטיקה שתומכים בתובנה' },
        // Step 5: Strategy
        strategyHeadline: { type: 'string', description: 'כותרת האסטרטגיה — 5-8 מילים חדות' },
        strategyDescription: { type: 'string', description: 'תיאור האסטרטגיה — 2-3 משפטים' },
        strategyPillars: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
          description: '3 pillars אסטרטגיים (כל אחד עם תיאור)',
        },
        // Step 6: Creative
        activityTitle: { type: 'string', description: 'שם הקמפיין / הרעיון הגדול' },
        activityConcept: { type: 'string', description: 'הקונספט הקריאייטיבי — משפט אחד חד' },
        activityDescription: { type: 'string', description: 'תיאור הקונספט המלא — 2-3 משפטים' },
        activityApproach: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
          description: '2-3 גישות/שלבים בביצוע הקריאייטיב',
        },
        activityDifferentiator: { type: 'string', description: 'מה מבדיל את הקריאייטיב הזה — משפט אחד' },
        brandStory: { type: 'string', description: 'סיפור המותג / נרטיב — אם הבריף כלל סעיף כזה, קח ישירות' },
        toneOfManner: { type: 'string', description: 'טון ומניירה — כפי שנכתב בבריף אם קיים, אחרת על בסיס המחקר' },
        visualDirection: { type: 'string', description: 'כיווני נראות — מילות מפתח ויזואליות' },
        keyMessages: { type: 'array', items: { type: 'string' }, description: 'מסרים מרכזיים (2-4)' },
        suggestedReferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              campaign: { type: 'string', description: 'שם הקמפיין/מותג' },
              year: { type: 'string' },
              why: { type: 'string', description: 'למה רלוונטי לאסטרטגיה — משפט אחד' },
            },
            required: ['campaign', 'why'],
          },
          description: '2-3 קמפיינים מהעולם שמחזקים את הכיוון (Dove Real Beauty, Spotify Wrapped, וכו\')',
        },
      },
      required: ['keyInsight', 'insightSource', 'strategyHeadline', 'strategyDescription', 'strategyPillars', 'activityTitle', 'activityConcept', 'activityDescription', 'activityApproach', 'suggestedReferences'],
    },
  },
  {
    name: 'draft_execution_content',
    description:
      'Draft wizard steps 7-9: deliverables, influencers, KPI. ' +
      'Fill ALL fields. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        // Step 7: Deliverables
        deliverables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'סוג התוצר (Reel, Story, Post, TikTok)' },
              quantity: { type: 'number', description: 'כמה מתוצר זה' },
              description: { type: 'string', description: 'תיאור התוצר' },
              purpose: { type: 'string', description: 'מה המטרה של התוצר הזה' },
            },
            required: ['type', 'quantity', 'description', 'purpose'],
          },
          description: '3-6 תוצרים (Reel/Story/Post) עם כמות ותיאור',
        },
        deliverablesSummary: { type: 'string', description: 'סיכום התוצרים — משפט אחד' },
        // Step 8: Influencers
        influencerStrategy: { type: 'string', description: 'אסטרטגיית משפיענים — 2-3 משפטים' },
        influencerCriteria: { type: 'array', items: { type: 'string' }, description: 'קריטריונים לבחירת משפיענים (3-5 פריטים)' },
        // Step 9: KPI / Media Targets
        budget: { type: 'number', description: 'תקציב מומלץ (שקלים). 0 אם לא ידוע.' },
        currency: { type: 'string', description: 'מטבע (₪/$/€). ברירת מחדל ₪.' },
        potentialReach: { type: 'number', description: 'Reach צפוי (מספר אנשים)' },
        potentialEngagement: { type: 'number', description: 'Engagement צפוי (לייקים+תגובות+שיתופים)' },
        estimatedImpressions: { type: 'number', description: 'Impressions צפויים' },
        cpe: { type: 'number', description: 'CPE = תקציב/engagement (אם ידוע, אחרת 0)' },
        cpm: { type: 'number', description: 'CPM = תקציב/impressions*1000 (אם ידוע)' },
        metricsExplanation: { type: 'string', description: 'הסבר איך חושבו ה-KPIs — משפט אחד' },
        successMetrics: { type: 'array', items: { type: 'string' }, description: 'מדדי הצלחה (3-5)' },
      },
      required: ['deliverables', 'deliverablesSummary', 'influencerStrategy', 'influencerCriteria', 'budget', 'currency', 'potentialReach', 'potentialEngagement', 'successMetrics'],
    },
  },
  {
    name: 'suggest_image_prompts',
    description:
      'Suggest 3-4 image generation prompts for the presentation. ' +
      'These will be generated in the background while the user edits the wizard.',
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['cover', 'brand', 'audience', 'activity'] },
              prompt: { type: 'string', description: 'Detailed image prompt in English (cinematic, editorial, 16:9)' },
            },
            required: ['type', 'prompt'],
          },
        },
      },
      required: ['images'],
    },
  },
]

// ─── The Agent ──────────────────────────────────────────

export async function runResearchAgent(
  input: ResearchAgentInput,
  onProgress?: ResearchProgressCallback,
): Promise<ResearchAgentOutput> {
  const requestId = `research-agent-${Date.now()}`
  const startTs = Date.now()

  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[ResearchAgent][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[ResearchAgent][${requestId}]    brief: ${input.briefText.length} chars`)
  console.log(`[ResearchAgent][${requestId}]    fileUri: ${input.briefFileUri || 'none'}`)

  const client = getClient()
  let totalToolCalls = 0
  let researchText = ''
  let structuredResearch: Record<string, unknown> | null = null
  const influencers: ResearchAgentOutput['influencers'] = []
  let brandContent: ResearchAgentOutput['brandContent'] = null
  let strategyContent: ResearchAgentOutput['strategyContent'] = null
  let executionContent: ResearchAgentOutput['executionContent'] = null
  const imagePrompts: ResearchAgentOutput['imagePrompts'] = []
  let brandColors: ResearchAgentOutput['brandColors'] = null

  // ════════════════════════════════════════════════════════
  // PHASE 1: Research — built-in tools only
  // ════════════════════════════════════════════════════════

  console.log(`[ResearchAgent][${requestId}] 📚 Phase 1: Research`)
  onProgress?.({ stage: 'research', message: '🔍 חוקר את המותג...', progress: 10 })

  const researchPrompt = `חקור את המותג "${input.brandName}" בשוק הישראלי.
חפש באינטרנט וסרוק את האתר שלהם. מצא את כל המידע שתוכל.

חשוב מאוד — חפש **משפיענים ישראלים** שיכולים להתאים לקמפיין:
- חפש "${input.brandName} influencer" או "${input.brandName} שיתוף פעולה"
- חפש את ה-Instagram/TikTok של המותג ומצא משפיענים שתייגו אותם
- חפש **משפיענים ישראלים פופולריים בנישה** של המותג (גם אם מעולם לא עבדו איתו!)
  למשל: אם המותג הוא אוכל — חפש בלוגרי אוכל ישראלים. אם יופי — חפש יוטיוברי יופי ישראליות.
- חפש "top Israeli influencers {niche}" או "משפיענים ישראלים {תחום}"
- מצא 5-10 שמות עם ה-Instagram username שלהם
- ציין את ה-usernames בשדה "suggestedInfluencerHandles"

## הבריף המלא (מקור אמת — הסתמך עליו, אל תסתור אותו):
${input.briefText.slice(0, 30000)}

החזר את הממצאים כ-JSON מובנה בפורמט הבא (ללא markdown fences):
{
  "brandName": "${input.brandName}",
  "officialName": "שם רשמי באנגלית",
  "industry": "תעשייה",
  "subIndustry": "תת-תעשייה",
  "founded": "שנת הקמה",
  "headquarters": "מיקום",
  "website": "URL",
  "companyDescription": "תיאור מקיף בעברית — 3-5 משפטים",
  "marketPosition": "פסקה על הפוזיציה בשוק",
  "pricePositioning": "budget/mid-range/premium/luxury",
  "competitors": [{"name": "שם", "description": "תיאור", "differentiator": "מה מבדיל"}],
  "uniqueSellingPoints": ["יתרון 1", "יתרון 2"],
  "mainProducts": [{"name": "שם מוצר", "description": "תיאור"}],
  "targetDemographics": {
    "primaryAudience": {"gender": "", "ageRange": "", "socioeconomic": "", "lifestyle": "", "interests": [], "painPoints": []}
  },
  "brandPersonality": ["תכונה 1", "תכונה 2"],
  "brandValues": ["ערך 1"],
  "toneOfVoice": "תיאור הטון",
  "visualIdentity": {"primaryColors": ["#XXXXXX"], "style": "", "moodKeywords": []},
  "socialPresence": {"instagram": {"handle": "", "followers": ""}, "tiktok": {"handle": ""}},
  "previousCampaigns": [{"name": "", "description": ""}],
  "industryTrends": ["טרנד 1"],
  "contentThemes": ["נושא 1"],
  "suggestedApproach": "פסקה על אסטרטגיה מומלצת",
  "dominantPlatformInIsrael": "אינסטגרם/טיקטוק",
  "israeliMarketContext": "הקשר ישראלי ספציפי",
  "suggestedInfluencerHandles": ["username1", "username2", "username3"],
  "confidence": "high/medium/low",
  "sources": [{"title": "מקור", "url": "URL"}]
}

חשוב: החזר JSON בלבד. אל תעטוף ב-\`\`\`. כתוב תוכן עשיר בעברית.
בסוף הJSON, בשורה חדשה, ציין: PRIMARY=#XXXXXX ACCENT=#XXXXXX`

  try {
    let contents: unknown
    if (input.briefFileUri && input.briefFileMime) {
      contents = [{
        role: 'user',
        parts: [
          { fileData: { mimeType: input.briefFileMime, fileUri: input.briefFileUri } },
          { text: researchPrompt },
        ],
      }]
    } else {
      contents = researchPrompt
    }

    const researchResponse: any = await client.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: contents as any,
      config: {
        thinkingConfig: { thinkingLevel: 'HIGH' as any },
        maxOutputTokens: 16000,
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      } as GenerateContentConfig,
    })

    researchText = researchResponse.text || ''
    console.log(`[ResearchAgent][${requestId}] ✅ Research: ${researchText.length} chars`)

    // Try to parse structured JSON from research
    try {
      const jsonMatch = researchText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        structuredResearch = JSON.parse(jsonMatch[0])
        console.log(`[ResearchAgent][${requestId}]   📊 Structured research parsed: ${Object.keys(structuredResearch!).length} fields`)
      }
    } catch {
      console.warn(`[ResearchAgent][${requestId}]   ⚠️ Could not parse structured research JSON`)
    }

    // Extract colors from research text or structured data
    const colorMatch = researchText.match(/PRIMARY=#([0-9A-Fa-f]{6})/)
    const accentMatch = researchText.match(/ACCENT=#([0-9A-Fa-f]{6})/)
    const structColors = (structuredResearch as any)?.visualIdentity?.primaryColors
    if (colorMatch) {
      brandColors = {
        primary: `#${colorMatch[1]}`,
        accent: accentMatch ? `#${accentMatch[1]}` : `#${colorMatch[1]}`,
        background: '#0C0C10',
      }
    } else if (structColors?.length) {
      brandColors = {
        primary: structColors[0],
        accent: structColors[1] || structColors[0],
        background: '#0C0C10',
      }
    }
    if (brandColors) {
      console.log(`[ResearchAgent][${requestId}]   🎨 Colors: ${brandColors.primary} / ${brandColors.accent}`)
    }
  } catch (err) {
    console.error(`[ResearchAgent][${requestId}] ⚠️ Research failed:`, err instanceof Error ? err.message : err)
    researchText = `לא הצלחתי לחקור את "${input.brandName}". משתמש במידע מהבריף בלבד.`
  }

  onProgress?.({ stage: 'research', message: '✅ מחקר הושלם', progress: 30 })

  // ════════════════════════════════════════════════════════
  // PHASE 2: Draft content + IMAI — function declarations only
  // ════════════════════════════════════════════════════════

  console.log(`[ResearchAgent][${requestId}] 🎯 Phase 2: Draft + IMAI`)
  onProgress?.({ stage: 'drafting', message: '📝 מנסח תוכן ראשוני...', progress: 40 })

  // Extract influencer handles found by Google in Phase 1
  const suggestedHandles = (structuredResearch as any)?.suggestedInfluencerHandles || []

  const draftPrompt = `Based on the research below, do the following IN ORDER:

STEP 1 — ENRICH INFLUENCERS:
${suggestedHandles.length > 0
    ? `Google found these influencer usernames: ${suggestedHandles.join(', ')}
Call enrich_influencer for EACH of these usernames to get real IMAI data (followers, verified status).
This is the most important step — we need real numbers, not guesses.`
    : `No influencer usernames found by Google. Call search_influencers with 2-3 SINGLE-WORD keywords related to "${input.brandName}"'s niche (e.g. "food", "beauty", "parenting").`}

STEP 2 — Also call search_influencers with 2-4 BRAND-NICHE single English keywords (specific to the brand's category, NOT generic words like "lifestyle" or "content"). Examples: baby cream → ["parenting","baby","skincare"]; luxury car → ["automotive","cars","luxury"]; restaurant → ["food","culinary","dining"]. For premium brands set minFollowers 30000+. Set minEngagement 2.0 for quality. Results are auto-filtered by engagement × follower-quality.

STEP 3 — Call draft_brand_content — draft brief, goals, audience (Hebrew)
STEP 4 — Call draft_strategy_content — draft insight, strategy, creative (Hebrew)
STEP 5 — Call draft_execution_content — draft deliverables, influencers, KPIs (Hebrew). Include ALL influencers found (from enrich + search).
STEP 6 — Call suggest_image_prompts — suggest 3-4 images for the presentation

⚠️ SOURCE HIERARCHY (VERY IMPORTANT):
1. The BRIEF (below) is the primary source of truth. Anything written there — creative direction, brand story, tone, mandatories, referenced campaigns — MUST be preserved verbatim or tightly paraphrased. Do not contradict the brief.
2. RESEARCH enriches what is missing. Use it to fill gaps, add statistics, add market context.
3. Your own inference is the last resort — only when both brief and research are silent.

## הבריף המלא (source of truth — read every section):
${input.briefText.slice(0, 40000)}

## RESEARCH RESULTS (enrichment):
${researchText.slice(0, 20000)}

⚠️ CRITICAL — FILL EVERY FIELD:
- You MUST fill EVERY field in EVERY draft function. No empty fields. No missing fields.
- For CREATIVE fields — if the brief has a "קריאייטיב" / "creative" / "brand story" / "tone" section, USE IT directly. Do not invent a new direction that contradicts the brief.
- activityConcept / activityApproach / activityDifferentiator — if brief describes a creative direction, build on it. Otherwise propose one grounded in the research.
- suggestedReferences — cite REAL campaigns from the world (Dove Real Beauty 2004, Spotify Wrapped, Nike Dream Crazy, etc.) that match the strategy.
- If insight: must have source (Nielsen / eMarketer / Ipsos / MOA / local research — real names).
- If a field is not in the brief, derive it from the research. If not in research, use logical inference.
- Every Hebrew text field must have meaningful content (not "N/A" or empty).
- Arrays must have at least the minimum items specified.

IMPORTANT:
- All text content must be in Hebrew
- search_influencers keywords must be SINGLE ENGLISH WORDS (not phrases!)
- The insight must be sharp and data-backed — not generic
- The strategy must be concrete with 3 specific pillars
- Use REAL data from the research, don't invent statistics
- Call enrich_influencer FIRST for each Google-found username, THEN search_influencers for additional ones

FIELDS TO FILL (EVERY ONE MUST HAVE CONTENT):
draft_brand_content: brandBrief, brandObjective, brandPainPoints[], successMetrics[], clientSpecificRequests[], goals[], goalsDetailed[], targetGender, targetAgeRange, targetDescription, targetBehavior, targetInsights[]
draft_strategy_content: keyInsight, insightSource, insightData, strategyHeadline, strategyDescription, strategyPillars[3], activityTitle, activityConcept, activityDescription, activityApproach[], activityDifferentiator, brandStory, toneOfManner, visualDirection, keyMessages[], suggestedReferences[2-3]
draft_execution_content: deliverables[] (with type+quantity+description+purpose each), deliverablesSummary, influencerStrategy, influencerCriteria[], budget, currency, potentialReach, potentialEngagement, estimatedImpressions, cpe, cpm, metricsExplanation, successMetrics[]`

  const history: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: 'user', parts: [{ text: draftPrompt }] },
  ]

  const MAX_ITERATIONS = 15

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(`[ResearchAgent][${requestId}] 🔁 Iteration ${iter + 1}/${MAX_ITERATIONS} (${totalToolCalls} tool calls)`)

    const response: any = await client.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: history as any,
      config: {
        systemInstruction: `אתה אסטרטג שיווק ומחקר מותגים בכיר בסוכנות Leaders.
תפקידך: לחקור מותג, למצוא משפיענים אמיתיים, ולנסח תוכן ראשוני ל-9 שלבי הוויזרד.
כל הטקסט בעברית. תובנות חדות. אסטרטגיות קונקרטיות. אל תמציא נתונים.`,
        thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
        maxOutputTokens: 32000,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] as any,
      } as GenerateContentConfig,
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    if (functionCalls.length === 0) {
      console.log(`[ResearchAgent][${requestId}] ✅ Phase 2 done: ${totalToolCalls} tool calls`)
      break
    }

    history.push({ role: 'model', parts })
    const responseParts: Array<Record<string, unknown>> = []

    for (const part of functionCalls) {
      const fc = part.functionCall
      const name = fc.name as string
      const args = fc.args || {}
      totalToolCalls++

      console.log(`[ResearchAgent][${requestId}]   🔧 ${name}(${JSON.stringify(args).slice(0, 120)})`)

      let result: unknown

      try {
        switch (name) {
          case 'search_influencers': {
            onProgress?.({ stage: 'influencers', message: '🔍 מחפש משפיענים ב-IMAI...', progress: 50 })
            const keywords = (args.keywords as string[]) || []
            const minFollowers = (args.minFollowers as number) || 15000  // raised from 5K — real influencers only
            const minEngagement = (args.minEngagement as number) || 1.5
            const found = await searchIsraeliInfluencers(keywords, {
              platform: (args.platform as 'instagram' | 'tiktok') || 'instagram',
              minFollowers,
              maxFollowers: (args.maxFollowers as number) || 2_000_000,
              limit: 30, // fetch more, then quality-filter
            })
            console.log(`[ResearchAgent][${requestId}]     → IMAI returned ${found.length} raw results (min ${minFollowers} followers, min ${minEngagement}% ER)`)

            // Quality filter: engagement rate + size threshold
            const qualityFiltered = found.filter(i => {
              const followers = i.followers || 0
              const er = i.engagement_rate || 0
              if (followers < minFollowers) return false
              if (er < minEngagement) return false
              // drop obvious non-influencer business accounts (very low ER / mega-follower ratio)
              if (followers > 100_000 && er < 0.5) return false
              return true
            })

            // Re-rank: weighted by engagement × log10(followers) — favor quality over vanity size
            const ranked = qualityFiltered.sort((a, b) => {
              const scoreA = (a.engagement_rate || 0) * Math.log10(Math.max(a.followers || 1, 10))
              const scoreB = (b.engagement_rate || 0) * Math.log10(Math.max(b.followers || 1, 10))
              return scoreB - scoreA
            })

            const mapped = ranked.slice(0, 8).map(i => ({
              username: i.username,
              fullname: i.fullname,
              followers: i.followers,
              engagement_rate: i.engagement_rate,
              is_verified: i.is_verified,
              picture: i.picture,
            }))
            for (const m of mapped) {
              if (!influencers.find(x => x.username === m.username)) {
                influencers.push({ ...m, rationale: '' })
              }
            }
            result = mapped
            console.log(`[ResearchAgent][${requestId}]     → ${mapped.length} quality influencers after filter (${mapped.filter(m => m.picture).length} with pics)`)
            if (mapped.length === 0 && found.length > 0) {
              console.warn(`[ResearchAgent][${requestId}]     ⚠️ All ${found.length} raw results filtered out — thresholds may be too strict or keywords too broad`)
            }
            break
          }

          case 'enrich_influencer': {
            const handle = (args.username as string).replace('@', '').trim()
            onProgress?.({ stage: 'influencers', message: `📊 מעשיר נתונים: @${handle}...`, progress: 55 })
            console.log(`[ResearchAgent][${requestId}]     → Enriching @${handle} via IMAI`)
            try {
              const rawResponse = await getInstagramUserInfo(handle) as any
              // IMAI returns { status: 'success', user: {...} } — the data is under `user`
              const info = rawResponse?.user || rawResponse?.user_profile || rawResponse?.data?.user_profile || rawResponse?.data || rawResponse
              const username = info?.username || info?.handle || handle
              const fullname = info?.fullname || info?.full_name || info?.name || ''
              const followers = info?.followers || info?.follower_count || info?.followers_count || info?.edge_followed_by?.count || 0
              const isVerified = info?.is_verified || info?.verified || false
              const bio = info?.biography || info?.bio || ''
              const picture = info?.picture || info?.profile_pic_url || ''
              const engagementRate = info?.engagement_rate || info?.er || 0

              // Log what we actually got
              if (followers === 0) {
                console.warn(`[ResearchAgent][${requestId}]     → @${handle}: IMAI returned data but no followers found. Info keys: ${Object.keys(info || {}).slice(0, 20).join(', ')}`)
                result = { error: `@${handle} — no follower data`, username: handle, infoKeys: Object.keys(info || {}) }
              } else {
                const enriched = { username, fullname, followers, engagement_rate: engagementRate, is_verified: isVerified, bio, picture }
                if (!influencers.find(i => i.username === username)) {
                  influencers.push({ username, fullname, followers, engagement_rate: engagementRate, is_verified: isVerified, picture, bio, rationale: bio || '' })
                }
                result = enriched
                console.log(`[ResearchAgent][${requestId}]     → @${handle}: ${followers.toLocaleString()} followers, ER ${engagementRate}%, verified=${isVerified}, pic=${picture ? 'YES' : 'no'}`)
              }
            } catch (enrichErr) {
              console.warn(`[ResearchAgent][${requestId}]     → @${handle} enrich failed: ${enrichErr instanceof Error ? enrichErr.message : enrichErr}`)
              result = { error: `@${handle} — ${enrichErr instanceof Error ? enrichErr.message : 'unknown'}`, username: handle }
            }
            break
          }

          case 'get_influencer_audience': {
            const report = await getAudienceReport(args.username as string, (args.platform as any) || 'instagram')
            result = {
              username: report.user_profile.username,
              followers: report.user_profile.followers,
              credibility: report.audience_followers?.data?.audience_credibility,
            }
            break
          }

          case 'draft_brand_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח בריף, מטרות וקהל יעד...', progress: 60 })
            brandContent = args as ResearchAgentOutput['brandContent']
            result = { success: true, step: 'brand_content' }
            console.log(`[ResearchAgent][${requestId}]     → Brand content drafted`)
            break
          }

          case 'draft_strategy_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח תובנה, אסטרטגיה וקריאייטיב...', progress: 70 })
            strategyContent = args as ResearchAgentOutput['strategyContent']
            result = { success: true, step: 'strategy_content' }
            console.log(`[ResearchAgent][${requestId}]     → Strategy content drafted`)
            break
          }

          case 'draft_execution_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח תוצרים, משפיענים ו-KPI...', progress: 80 })
            executionContent = args as ResearchAgentOutput['executionContent']
            result = { success: true, step: 'execution_content' }
            console.log(`[ResearchAgent][${requestId}]     → Execution content drafted`)
            break
          }

          case 'suggest_image_prompts': {
            onProgress?.({ stage: 'drafting', message: '🎨 מכין רעיונות לתמונות...', progress: 85 })
            const imgs = (args.images as Array<{ type: string; prompt: string }>) || []
            imagePrompts.push(...imgs)
            result = { success: true, imageCount: imgs.length }
            console.log(`[ResearchAgent][${requestId}]     → ${imgs.length} image prompts`)
            break
          }

          default:
            result = { error: `Unknown function: ${name}` }
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
        console.error(`[ResearchAgent][${requestId}]     ❌ ${name} failed:`, result)
      }

      responseParts.push({ functionResponse: { name, response: { result } } })
    }

    history.push({ role: 'user', parts: responseParts })
  }

  const durationMs = Date.now() - startTs
  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[ResearchAgent][${requestId}] ✅ DONE — ${totalToolCalls} tool calls, ${durationMs}ms`)
  console.log(`[ResearchAgent][${requestId}]    research: ${researchText.length} chars`)
  console.log(`[ResearchAgent][${requestId}]    influencers: ${influencers.length}`)
  console.log(`[ResearchAgent][${requestId}]    brandContent: ${brandContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    strategyContent: ${strategyContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    executionContent: ${executionContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    imagePrompts: ${imagePrompts.length}`)
  console.log(`[ResearchAgent][${requestId}]    colors: ${brandColors ? brandColors.primary : 'none'}`)
  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)

  onProgress?.({ stage: 'done', message: '✅ מחקר ותוכן מוכנים', progress: 100 })

  return {
    researchText,
    structuredResearch,
    influencers,
    brandContent,
    strategyContent,
    executionContent,
    imagePrompts,
    brandColors,
    totalToolCalls,
    durationMs,
  }
}
