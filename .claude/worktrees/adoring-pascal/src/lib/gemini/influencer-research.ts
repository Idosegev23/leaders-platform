/**
 * Influencer Research Service
 * Uses Gemini to recommend relevant, real influencers for a brand grounded in Google Search
 */

import { callAI } from '@/lib/ai-provider'
import type { BrandResearch } from './brand-research'
import { parseGeminiJson } from '../utils/json-cleanup'
import { getConfig } from '../config/admin-config'
import { PROMPT_DEFAULTS, MODEL_DEFAULTS } from '../config/defaults'

const PRO_MODEL_DEFAULT = MODEL_DEFAULTS['influencer_research.primary_model'].value as string
const FLASH_MODEL_DEFAULT = MODEL_DEFAULTS['influencer_research.fallback_model'].value as string

async function getInfluencerModels(): Promise<string[]> {
  const primary = await getConfig('ai_models', 'influencer_research.primary_model', PRO_MODEL_DEFAULT)
  const fallback = await getConfig('ai_models', 'influencer_research.fallback_model', FLASH_MODEL_DEFAULT)
  return [primary, fallback]
}

export interface InfluencerRecommendation {
  name: string
  handle: string
  platform: 'instagram' | 'tiktok' | 'youtube'
  category: string
  followers: string
  engagement: string
  avgStoryViews?: string
  whyRelevant: string
  contentStyle: string
  estimatedCost: string
  profileUrl: string
  profilePicUrl?: string // Added after scraping
  // New quality & safety fields
  israeliAudienceEstimate?: string  // % קהל ישראלי משוער (e.g. "85%+")
  bestContentFormat?: string        // Reels / Stories / TikTok / Posts
  competitorBrandWork?: string      // האם עבד עם מתחרים (+ שמות)
  audienceQualitySignal?: 'high' | 'mixed' | 'low' // אותנטיות הקהל
  previousBrandCollabs?: string[]   // שמות מותגים שעבד איתם
}

export interface InfluencerStrategy {
  // Strategy Overview
  strategyTitle: string
  strategySummary: string
  
  // Influencer Tiers
  tiers: {
    name: string // Mega, Macro, Micro, Nano
    description: string
    recommendedCount: number
    budgetAllocation: string
    purpose: string
  }[]
  
  // Recommended Influencers (from research)
  recommendations: InfluencerRecommendation[]
  
  // Content Strategy
  contentThemes: {
    theme: string
    description: string
    examples: string[]
  }[]
  
  // KPIs
  expectedKPIs: {
    metric: string
    target: string
    rationale: string
  }[]
  
  // Timeline
  suggestedTimeline: {
    phase: string
    duration: string
    activities: string[]
  }[]
  
  // Risks
  potentialRisks: {
    risk: string
    mitigation: string
  }[]
}

/**
 * Research and recommend influencers for a brand
 */
export async function researchInfluencers(
  brandResearch: BrandResearch,
  budget: number,
  goals: string[]
): Promise<InfluencerStrategy> {
  console.log(`[Influencer Research] Starting research for ${brandResearch.brandName} with budget ${budget} ILS`)
  
  const systemPrompt = await getConfig('ai_prompts', 'influencer_research.system_prompt', PROMPT_DEFAULTS['influencer_research.system_prompt'].value as string)
  const criticalRules = await getConfig('ai_prompts', 'influencer_research.critical_rules', PROMPT_DEFAULTS['influencer_research.critical_rules'].value as string)

  const prompt = `
${systemPrompt}

## פרטי המותג והקמפיין:
- שם המותג: ${brandResearch.brandName}
- תעשייה: ${brandResearch.industry}
- קהל יעד: ${brandResearch.targetDemographics?.primaryAudience?.gender || 'כללי'}, גילאי ${brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45'}
- תחומי עניין: ${brandResearch.targetDemographics?.primaryAudience?.interests?.join(', ') || 'רלוונטי לתעשייה'}
- ערכי המותג: ${brandResearch.brandValues?.join(', ') || 'איכות, מקצוענות'}
- מתחרים: ${brandResearch.competitors?.map(c => typeof c === 'string' ? c : c.name).join(', ') || 'לא ידוע'}
- פלטפורמה דומיננטית בישראל לקהל זה: ${(brandResearch as any).dominantPlatformInIsrael || 'אינסטגרם'}
- הקשר שוק ישראלי: ${(brandResearch as any).israeliMarketContext || ''}
- תקציב פנוי: ${budget.toLocaleString()} ש"ח
- מטרות הקמפיין: ${goals.join(', ')}

${criticalRules}

## פורמט תגובה:
החזר **אך ורק** אובייקט JSON חוקי לפי המבנה הבא (ללא טקסט מקדים או סיומת):

\`\`\`json
{
  "strategyTitle": "כותרת קצרה וקולעת לאסטרטגיה",
  "strategySummary": "סיכום האסטרטגיה ב-3-4 משפטים המותאמים לתקציב ולמטרות.",

  "tiers": [
    {
      "name": "שם השכבה (למשל: Micro / Macro)",
      "description": "תיאור קהל העוקבים הרלוונטי",
      "recommendedCount": 4,
      "budgetAllocation": "אחוז מהתקציב",
      "purpose": "מטרת השכבה בקמפיין"
    }
  ],

  "recommendations": [
    {
      "name": "שם מלא ואמיתי של המשפיען",
      "handle": "@username_real",
      "platform": "instagram",
      "category": "תחום התוכן",
      "followers": "כמות משוערת (למשל 45K)",
      "engagement": "אחוז מעורבות משוער",
      "avgStoryViews": "כמות צפיות משוערת",
      "whyRelevant": "למה הוא מתאים בול למותג הזה",
      "contentStyle": "סגנון התוכן",
      "estimatedCost": "הערכת מחיר בשקלים",
      "profileUrl": "https://instagram.com/username_real",
      "israeliAudienceEstimate": "85%+ קהל ישראלי",
      "bestContentFormat": "Reels",
      "competitorBrandWork": "לא עבד עם מתחרים ידועים / עבד עם [שם מתחרה] — ⚠️ לשקול",
      "audienceQualitySignal": "high",
      "previousBrandCollabs": ["מותג 1", "מותג 2"]
    }
  ],
  
  "contentThemes": [
    {
      "theme": "שם הנושא לקריאייטיב",
      "description": "תיאור מפורט",
      "examples": ["דוגמה 1", "דוגמה 2"]
    }
  ],
  
  "expectedKPIs": [
    {
      "metric": "Reach / Engagement / Clicks",
      "target": "מספר יעד ריאלי לתקציב",
      "rationale": "הסבר לחישוב"
    }
  ],
  
  "suggestedTimeline": [
    {
      "phase": "שם השלב",
      "duration": "משך זמן",
      "activities": ["פעילות 1", "פעילות 2"]
    }
  ],
  
  "potentialRisks": [
    {
      "risk": "סיכון אפשרי",
      "mitigation": "דרך התמודדות"
    }
  ]
}
\`\`\`

**חובה להחזיר JSON בלבד! וודא שמות משפיענים אמיתיים מהשוק הישראלי.**
`

  const callGemini = async (model: string) => {
    const result = await callAI({
      model,
      prompt,
      geminiConfig: {
        thinkingConfig: { thinkingLevel: 'LOW' as any },
        maxOutputTokens: 6000,
      },
      thinkingLevel: 'LOW',
      maxOutputTokens: 6000,
      useGoogleSearch: true,
      callerId: `influencer-research-${brandResearch.brandName}`,
    })
    return result.text || ''
  }

  // Primary model first, fallback if it fails
  const models = await getInfluencerModels()
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const text = await callGemini(model)
      console.log(`[Influencer Research] Response received (${model}), parsing JSON...`)
      const strategy = parseGeminiJson<InfluencerStrategy>(text)
      console.log(`[Influencer Research] Complete. Found ${strategy.recommendations?.length || 0} real recommendations.`)
      if (attempt > 0) console.log(`[Influencer Research] ✅ Succeeded with fallback model (${model})`)
      return strategy
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Influencer Research] Attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log('[Influencer Research] ⚡ Falling back to Flash...')
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Influencer Research] All attempts failed, using fallback')
  return getDefaultStrategy(brandResearch, budget, goals)
}

/**
 * Get quick influencer suggestions (less detailed)
 */
export async function getQuickInfluencerSuggestions(
  industry: string,
  targetAudience: string,
  budget: number
): Promise<InfluencerRecommendation[]> {
  const prompt = `
הצע 5 משפיענים ישראליים **אמיתיים וקיימים** שמתאימים לקמפיין הבא:
- תעשייה: ${industry}
- קהל יעד: ${targetAudience}
- תקציב כולל: ${budget.toLocaleString()} ש"ח (התאם את גודל המשפיענים לתקציב)

השתמש בחיפוש גוגל כדי לאמת את קיומם.
החזר אך ורק JSON במבנה הבא:
\`\`\`json
[
  {
    "name": "שם מלא ואמיתי",
    "handle": "@username_real",
    "platform": "instagram",
    "category": "קטגוריה",
    "followers": "100K",
    "engagement": "3.5%",
    "whyRelevant": "למה מתאים",
    "contentStyle": "סגנון",
    "estimatedCost": "X ש\"ח לפוסט",
    "profileUrl": "https://instagram.com/..."
  }
]
\`\`\`
`

  try {
    const [primaryModel] = await getInfluencerModels()
    const result = await callAI({
      model: primaryModel,
      prompt,
      geminiConfig: {
        thinkingConfig: { thinkingLevel: 'LOW' as any },
      },
      thinkingLevel: 'LOW',
      useGoogleSearch: true,
      callerId: 'influencer-quick-suggestions',
    })

    const text = result.text || ''
    return parseGeminiJson<InfluencerRecommendation[]>(text)
  } catch (error) {
    console.error('[Quick Influencer] Error fetching suggestions:', error)
    return []
  }
}

/**
 * Default strategy fallback in case of API failure
 */
function getDefaultStrategy(
  brandResearch: BrandResearch,
  budget: number,
  goals: string[]
): InfluencerStrategy {
  return {
    strategyTitle: `אסטרטגיית משפיענים עבור ${brandResearch.brandName}`,
    strategySummary: `אסטרטגיה משולבת הכוללת משפיענים בגדלים שונים להשגת המטרות: ${goals.join(', ')}. הקמפיין יתמקד בתוכן אותנטי שמתחבר לקהל היעד.`,
    
    tiers: [
      {
        name: 'Macro Influencers',
        description: 'משפיענים עם 100K+ עוקבים',
        recommendedCount: 1,
        budgetAllocation: '40%',
        purpose: 'חשיפה רחבה ומודעות למותג'
      },
      {
        name: 'Micro Influencers',
        description: 'משפיענים עם 10K-100K עוקבים',
        recommendedCount: 3,
        budgetAllocation: '40%',
        purpose: 'יצירת מעורבות אקטיבית והמרות'
      },
      {
        name: 'Nano Influencers',
        description: 'משפיענים עם 1K-10K עוקבים',
        recommendedCount: 5,
        budgetAllocation: '20%',
        purpose: 'בניית קהילה ואותנטיות'
      }
    ],
    
    recommendations: [],
    
    contentThemes: [
      {
        theme: 'שילוב אותנטי בשגרה',
        description: 'הדגמת שימוש במוצר או בשירות כחלק טבעי מסדר היום של המשפיען.',
        examples: ['סרטון בוקר (GRWM) עם המוצר', 'ולוג יומי שמשלב את השירות']
      },
      {
        theme: 'סקירה מקצועית וכנה',
        description: 'ביקורת מפורטת המציגה את היתרונות (והחסרונות) של המוצר לבניית אמינות.',
        examples: ['סרטון Unboxing מרגש', 'סרטון שאלות ותשובות (Q&A) על המותג']
      }
    ],
    
    expectedKPIs: [
      {
        metric: 'Reach (חשיפה)',
        target: Math.round(budget * 6).toLocaleString(),
        rationale: 'חישוב מבוסס על עלות CPM ממוצעת של 15-20 ש"ח בשוק הישראלי'
      },
      {
        metric: 'Engagement (מעורבות)',
        target: Math.round(budget / 3).toLocaleString(),
        rationale: 'חישוב מבוסס על עלות CPE ממוצעת של 3 ש"ח לאינטראקציה'
      }
    ],
    
    suggestedTimeline: [
      {
        phase: 'הכנה ותכנון',
        duration: 'שבועיים',
        activities: ['איתור משפיענים סופיים', 'חתימה על הסכמים', 'שליחת מוצרים/בריף קריאייטיב']
      },
      {
        phase: 'ביצוע ועלייה לאוויר',
        duration: '3-4 שבועות',
        activities: ['אישור תכנים', 'פרסום מדורג (Drip)', 'ניטור תגובות בזמן אמת']
      },
      {
        phase: 'מדידה ואופטימיזציה',
        duration: 'שבוע',
        activities: ['איסוף נתוני אמת מהמשפיענים', 'הפקת דוח סיכום קמפיין (ROI)']
      }
    ],
    
    potentialRisks: [
      {
        risk: 'עיכובים בזמני הפרסום מצד המשפיענים',
        mitigation: 'עיגון חלונות זמן מדויקים בחוזה ואישור תכנים מראש.'
      },
      {
        risk: 'חוסר מעורבות (אדישות הקהל)',
        mitigation: 'בחירת משפיענים עם שיעור מעורבות מוכח של מעל 3%, ומתן חופש קריאייטיבי להנגשת התוכן.'
      }
    ]
  }
}