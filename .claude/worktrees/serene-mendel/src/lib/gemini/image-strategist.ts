/**
 * Image Strategist
 * AI-powered system that analyzes the brand and decides what images are needed
 * Instead of fixed templates, this creates a custom strategy for each brand
 */

import { callAI } from '@/lib/ai-provider'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'
import type { ProposalContent } from '../openai/proposal-writer'
import { parseGeminiJson } from '../utils/json-cleanup'
const PRO_MODEL = 'gemini-3.1-pro-preview'     // Primary — best reasoning quality
const FLASH_MODEL = 'gemini-3-flash-preview'   // Fallback when Pro fails/overloaded

export interface ImagePlan {
  id: string
  purpose: string
  placement: 'cover' | 'brand' | 'audience' | 'activity' | 'product' | 'lifestyle' | 'closing' | 'custom'
  rationale: string
  priority: 'essential' | 'recommended' | 'optional'
}

export interface ImageStrategy {
  totalImages: number
  conceptSummary: string
  visualDirection: string
  images: ImagePlan[]
}

/**
 * Analyze brand and create a custom image strategy
 */
export async function analyzeAndPlanImages(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  proposalContent?: Partial<ProposalContent>
): Promise<ImageStrategy> {
  console.log(`[Image Strategist] Analyzing brand: ${brandResearch.brandName}`)

  const prompt = `אתה מנהל אמנותי בכיר בסוכנות פרסום ישראלית מובילה.
המשימה שלך: לנתח מותג ולתכנן אסטרטגיית תמונות מותאמת אישית עבור הצעת מחיר.

## המותג
- שם: ${brandResearch.brandName}
- תעשייה: ${brandResearch.industry || 'לא ידוע'}
- מיקום בשוק: ${brandResearch.marketPosition || 'לא ידוע'}
- אישיות המותג: ${brandResearch.brandPersonality?.join(', ') || 'מקצועי'}
- קהל יעד: ${brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45'}, ${brandResearch.targetDemographics?.primaryAudience?.gender || 'מעורב'}
- תחומי עניין של הקהל: ${brandResearch.targetDemographics?.primaryAudience?.interests?.join(', ') || 'לא ידוע'}

## צבעי המותג
- צבע ראשי: ${brandColors.primary}
- צבע משני: ${brandColors.secondary || brandColors.accent}

## מטרות הקמפיין
${proposalContent?.goals?.map(g => `- ${g.title}: ${g.description}`).join('\n') || 'הגברת מודעות ומעורבות'}

## ההנחיות שלך

תחשוב כמו מנהל אמנותי:
1. מה הסיפור הוויזואלי שהמותג הזה צריך לספר?
2. אילו רגעים ספציפיים יתחברו לקהל הישראלי?
3. איך המוצר/שירות יכול להופיע בצורה אורגנית ולא "סטוקית"?
4. מה יבדיל את ההצעה הזו מהצעות גנריות?

## דוגמאות לחשיבה יצירתית

לא ככה: "תמונת לייפסטייל של משפחה"
אלא ככה: "ילד ישראלי בן 8 מביא לאבא שלו בקבוק מי עדן קר במהלך משחק מכבי בטלוויזיה - רגע משפחתי אמיתי"

לא ככה: "תמונת מוצר"
אלא ככה: "בקבוק מי עדן על שולחן פיקניק בפארק הירקון, עם טשטוש של ילדים משחקים ברקע, אור שקיעה זהוב"

## מבנה התשובה

החזר JSON בלבד (ללא טקסט נוסף) בפורמט:

{
  "totalImages": 4-6,
  "conceptSummary": "משפט אחד שמתאר את הכיוון הויזואלי הכללי",
  "visualDirection": "2-3 משפטים על הסגנון, התחושה והאווירה",
  "images": [
    {
      "id": "מזהה_ייחודי_באנגלית",
      "purpose": "מה התמונה אמורה להשיג - משפט אחד",
      "placement": "cover/brand/audience/activity/product/lifestyle/closing/custom",
      "rationale": "תיאור מדויק ויצירתי של התמונה - 2-3 משפטים עם פרטים ספציפיים",
      "priority": "essential/recommended/optional"
    }
  ]
}

חשוב:
- בין 4-6 תמונות (לא יותר)
- לפחות 2 תמונות essential
- התיאור ב-rationale חייב להיות ספציפי וישראלי
- אל תכתוב תיאורים גנריים - תהיה יצירתי ומדויק`

  // Flash first (fast + cheap), Pro fallback
  const models = [PRO_MODEL, FLASH_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[Image Strategist] Calling ${model} (attempt ${attempt + 1}/${models.length})...`)
      const aiResult = await callAI({
        model,
        prompt,
        geminiConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'HIGH' as any },
        },
        thinkingLevel: 'HIGH',
        callerId: `image-strategist-${brandResearch.brandName}`,
      })

      const text = aiResult.text || ''
      const strategy = parseGeminiJson<ImageStrategy>(text)

      if (strategy && strategy.images && strategy.images.length > 0) {
        console.log(`[Image Strategist] Created strategy with ${strategy.images.length} images (model: ${model})`)
        console.log(`[Image Strategist] Concept: ${strategy.conceptSummary}`)
        if (attempt > 0) console.log(`[Image Strategist] ✅ Succeeded with fallback model (${model})`)
        return strategy
      }

      throw new Error('Invalid strategy response')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Image Strategist] Attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[Image Strategist] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Image Strategist] All attempts failed, using defaults')
  return getDefaultStrategy(brandResearch)
}

/**
 * Get default strategy as fallback
 */
function getDefaultStrategy(brandResearch: BrandResearch): ImageStrategy {
  return {
    totalImages: 4,
    conceptSummary: 'תמונות מותג מקצועיות לשוק הישראלי',
    visualDirection: 'סגנון מודרני, נקי ומזמין. אווירה ים-תיכונית עם אסתטיקה עירונית תל אביבית.',
    images: [
      {
        id: 'hero_cover',
        purpose: 'תמונת פתיחה חזקה שמייצגת את המותג',
        placement: 'cover',
        rationale: `תמונה ראשית עבור ${brandResearch.brandName} - קומפוזיציה נקייה עם מקום לטקסט, אור חם ים-תיכוני`,
        priority: 'essential',
      },
      {
        id: 'brand_lifestyle',
        purpose: 'חיבור המותג לחיי היומיום של הקהל',
        placement: 'brand',
        rationale: 'סצנה אורבנית ישראלית אותנטית - רחוב תל אביבי, בית קפה טרנדי או פארק עירוני',
        priority: 'essential',
      },
      {
        id: 'audience_connection',
        purpose: 'הקהל שלנו בפעולה',
        placement: 'audience',
        rationale: 'אנשים ישראליים מגוונים בסיטואציה טבעית שמתחברת לערכי המותג',
        priority: 'recommended',
      },
      {
        id: 'activity_moment',
        purpose: 'רגע של שימוש או חוויה',
        placement: 'activity',
        rationale: 'רגע אותנטי של אינטראקציה עם המוצר או השירות בהקשר ישראלי',
        priority: 'recommended',
      },
    ],
  }
}

export { getDefaultStrategy }
