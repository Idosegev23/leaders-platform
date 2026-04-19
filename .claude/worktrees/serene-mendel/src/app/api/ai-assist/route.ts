import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import { getConfig } from '@/lib/config/admin-config'
import { PROMPT_DEFAULTS, MODEL_DEFAULTS } from '@/lib/config/defaults'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'

export const maxDuration = 60

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const FAST_MODEL_DEFAULT = MODEL_DEFAULTS['ai_assist.model'].value as string

type AiAssistAction =
  | 'generate_goal_description'
  | 'generate_goal_descriptions_batch'
  | 'generate_audience_insights'
  | 'refine_insight'
  | 'generate_strategy_flow'
  | 'refine_strategy_pillars'
  | 'suggest_content_formats'
  | 'find_brand_logo'
  | 'reprocess_field'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestId = `ai-assist-${Date.now()}`
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { action, ...params } = body as { action: AiAssistAction; [key: string]: unknown }

    console.log(`[${requestId}] AI Assist: ${action}`)

    const selectedModel = await getConfig('ai_models', 'ai_assist.model', FAST_MODEL_DEFAULT)
    const useGrounding = ['generate_audience_insights', 'refine_insight', 'find_brand_logo'].includes(action)

    let prompt: string

    switch (action) {
      case 'generate_goal_description':
        prompt = await buildGoalDescriptionPrompt(params)
        break
      case 'generate_goal_descriptions_batch':
        prompt = await buildGoalDescriptionsBatchPrompt(params)
        break
      case 'generate_audience_insights':
        prompt = await buildAudienceInsightsPrompt(params)
        break
      case 'refine_insight':
        prompt = await buildRefineInsightPrompt(params)
        break
      case 'generate_strategy_flow':
        prompt = await buildStrategyFlowPrompt(params)
        break
      case 'refine_strategy_pillars':
        prompt = await buildRefineStrategyPillarsPrompt(params)
        break
      case 'suggest_content_formats':
        prompt = await buildContentFormatsPrompt(params)
        break
      case 'find_brand_logo':
        prompt = await buildFindLogoPrompt(params)
        break
      case 'reprocess_field':
        prompt = await buildReprocessFieldPrompt(params)
        break
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        ...(useGrounding
          ? { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' }
          : { responseMimeType: 'application/json' }),
      },
    })

    const text = response.text || '{}'
    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] Completed in ${elapsed}ms (model: ${selectedModel})`)

    const parsed = parseGeminiJson<Record<string, unknown>>(text)
    return NextResponse.json({ success: true, ...(parsed || {}) })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] Error after ${elapsed}ms:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI assist failed' },
      { status: 500 }
    )
  }
}

// --- Prompt Builders (all load base prompt from admin config) ---

async function buildGoalDescriptionPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.goal_description', PROMPT_DEFAULTS['ai_assist.goal_description'].value as string)
  const goalTitle = params.goalTitle as string || ''
  const briefContext = params.briefContext as string || ''

  return `${basePrompt}

מטרה: ${goalTitle}
הקשר הבריף: ${briefContext}

החזר JSON:
{ "description": "תיאור המטרה ב-2-3 משפטים שמסביר מה רוצים להשיג ואיך" }`
}

async function buildGoalDescriptionsBatchPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.goal_descriptions_batch', PROMPT_DEFAULTS['ai_assist.goal_descriptions_batch'].value as string)
  const goalTitles = params.goalTitles as string[] || []
  const briefContext = params.briefContext as string || ''

  return `${basePrompt}

מטרות: ${goalTitles.join(', ')}
הקשר הבריף: ${briefContext}

החזר JSON:
{
  "descriptions": {
    "${goalTitles[0] || 'מטרה'}": "תיאור ב-2-3 משפטים",
    ...
  }
}`
}

async function buildAudienceInsightsPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.audience_insights', PROMPT_DEFAULTS['ai_assist.audience_insights'].value as string)
  const gender = params.gender as string || ''
  const ageRange = params.ageRange as string || ''
  const description = params.description as string || ''
  const brandName = params.brandName as string || ''
  const industry = params.industry as string || ''

  return `${basePrompt}

קהל יעד: ${gender}, גילאי ${ageRange}
תיאור: ${description}
מותג: ${brandName} (${industry})

חפש נתונים אמיתיים מ-2024-2026 — מחקרים, סקרים, סטטיסטיקות.

החזר JSON:
{
  "insights": [
    {
      "text": "תובנה שמנוסחת כמו אנקדוטה מדויקת — 1-2 משפטים על התנהגות אמיתית",
      "actionable": "מה זה אומר לקמפיין שלנו — משפט אחד ישיר",
      "source": "שם המחקר/סקר/מקור",
      "sourceUrl": "URL אם זמין",
      "dataPoint": "נתון מספרי בולט (לדוגמה: 72% מהנשים 25-34...)",
      "confidence": "high/medium/low"
    }
  ]
}

חזור עם 3-5 תובנות. תן עדיפות לנתונים ישראליים כשזמינים.`
}

async function buildRefineInsightPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.refine_insight', PROMPT_DEFAULTS['ai_assist.refine_insight'].value as string)
  const currentInsight = params.currentInsight as string || ''
  const briefContext = params.briefContext as string || ''
  const audienceContext = params.audienceContext as string || ''

  return `${basePrompt}

תובנה נוכחית: ${currentInsight}
הקשר הבריף: ${briefContext}
קהל יעד: ${audienceContext}

חפש נתוני שוק אמיתיים שתומכים בתובנה או מחזקים אותה.

החזר JSON:
{
  "keyInsight": "תובנה מחודדת ב-1-2 משפטים",
  "insightSource": "מקור ראשי של התובנה",
  "supportingResearch": [
    {
      "statistic": "נתון סטטיסטי",
      "source": "שם המקור",
      "year": "שנה",
      "url": "URL אם זמין"
    }
  ]
}`
}

async function buildStrategyFlowPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.strategy_flow', PROMPT_DEFAULTS['ai_assist.strategy_flow'].value as string)
  const headline = params.strategyHeadline as string || ''
  const pillars = params.strategyPillars as string || ''
  const briefContext = params.briefContext as string || ''

  return `${basePrompt}

כותרת אסטרטגיה: ${headline}
עמודי תווך: ${pillars}
הקשר: ${briefContext}

כל שלב צריך שם קצר, תיאור של משפט אחד, ואייקון אימוג'י מתאים.

החזר JSON:
{
  "steps": [
    { "label": "שם השלב", "description": "תיאור קצר", "icon": "emoji" }
  ]
}`
}

async function buildContentFormatsPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.content_formats', PROMPT_DEFAULTS['ai_assist.content_formats'].value as string)
  const briefContext = params.briefContext as string || ''
  const creative = params.creative as string || ''

  return `${basePrompt}

הקשר הבריף: ${briefContext}
כיוון קריאייטיבי: ${creative}

הפורמטים האפשריים: production (הפקה), ugc (תוכן גולשים), influencer_selfshot (צילום עצמי משפיען), studio (סטודיו), animation (אנימציה)

החזר JSON:
{
  "formats": [
    {
      "format": "production/ugc/influencer_selfshot/studio/animation",
      "label": "שם בעברית",
      "description": "למה הפורמט הזה מתאים - משפט אחד",
      "percentage": 30
    }
  ]
}

בחר 2-4 פורמטים רלוונטיים. האחוזים חייבים לסכום ל-100.`
}

async function buildRefineStrategyPillarsPrompt(params: Record<string, unknown>): Promise<string> {
  const basePrompt = await getConfig('ai_prompts', 'ai_assist.refine_pillars', PROMPT_DEFAULTS['ai_assist.refine_pillars'].value as string)
  const pillars = params.pillars as string || ''
  const strategyHeadline = params.strategyHeadline as string || ''
  const briefContext = params.briefContext as string || ''

  return `${basePrompt}

כותרת אסטרטגיה: ${strategyHeadline}
עמודי תווך נוכחיים: ${pillars}
הקשר הבריף: ${briefContext}

החזר JSON:
{
  "pillars": [
    { "title": "כותרת חדשה קליטה", "description": "2-3 משפטים ספציפיים עם פעולות קונקרטיות" }
  ]
}`
}

async function buildFindLogoPrompt(params: Record<string, unknown>): Promise<string> {
  const template = await getConfig('ai_prompts', 'ai_assist.find_logo', PROMPT_DEFAULTS['ai_assist.find_logo'].value as string)
  const brandName = params.brandName as string || ''
  return template.replace(/\{brandName\}/g, brandName)
}

async function buildReprocessFieldPrompt(params: Record<string, unknown>): Promise<string> {
  const fieldName = params.fieldName as string || ''
  const currentValue = params.currentValue as string || ''
  const briefExcerpt = params.briefExcerpt as string || ''
  const fullBriefContext = params.fullBriefContext as string || ''
  const fieldInstructions = params.fieldInstructions as string || ''

  return `אתה עוזר מקצועי לכתיבת הצעות שיווק ופרסום בעברית.

המשימה: שפר ועבד מחדש את השדה "${fieldName}" תוך שימוש בתוכן המקורי מהבריף של הלקוח.

--- ציטוט רלוונטי מהבריף ---
${briefExcerpt}

--- הקשר מלא מהבריף ---
${fullBriefContext}

--- ערך נוכחי של השדה ---
${currentValue}

${fieldInstructions ? `--- הנחיות נוספות ---\n${fieldInstructions}` : ''}

הנחיות:
1. שמור על תוכן איכותי מהבריף — ציטוטים, נתונים, שמות ומושגים מדויקים
2. שלב בין המידע המקורי של הלקוח לבין עיבוד מקצועי
3. כתוב בעברית תקנית, ברמה מקצועית של סוכנות פרסום מובילה
4. אל תמציא מידע שלא מופיע בבריף — השתמש רק במה שניתן
5. התוצאה צריכה להיות מוכנה להצגה בהצעה מקצועית

החזר JSON:
{ "value": "הערך המשופר והמעובד" }`
}
