/**
 * Creative Concept Enhancer
 * Takes the proposal-agent's initial creative concept (written before research)
 * and enriches it with competitive intelligence from brand research.
 */

import { callAI, resolveModels } from '@/lib/ai-provider'
import { parseGeminiJson } from '../utils/json-cleanup'
import { MODEL_DEFAULTS } from '../config/defaults'
import type { BrandResearch } from './brand-research'
import type { CreativeStepData } from '@/types/wizard'
const PRO_MODEL_DEFAULT = MODEL_DEFAULTS['creative_enhancer.primary_model'].value as string
const FLASH_MODEL_DEFAULT = MODEL_DEFAULTS['creative_enhancer.fallback_model'].value as string

async function getCreativeModels(): Promise<string[]> {
  return resolveModels(
    'creative_enhancer.primary_model',
    'creative_enhancer.fallback_model',
    PRO_MODEL_DEFAULT,
    FLASH_MODEL_DEFAULT,
  )
}

/**
 * Enhance a creative concept with competitive intelligence from brand research.
 * If brandResearch is empty/null, returns the original creative unchanged.
 */
export async function enhanceCreativeWithResearch(
  existingCreative: CreativeStepData,
  brandResearch: BrandResearch,
): Promise<CreativeStepData> {
  // Guard: if research is minimal, return as-is
  const hasUsefulResearch =
    (brandResearch.competitors?.length > 0) ||
    (brandResearch.contentThemes?.length > 0) ||
    brandResearch.marketPosition ||
    (brandResearch.uniqueSellingPoints?.length > 0)

  if (!hasUsefulResearch) {
    console.log('[CreativeEnhancer] No useful research data, returning original creative')
    return existingCreative
  }

  console.log(`[CreativeEnhancer] Enhancing creative for ${brandResearch.brandName}`)

  // Build competitive intelligence summary for Gemini
  const competitorLines = brandResearch.competitors?.slice(0, 4)
    .map(c => `- ${c.name}: ${c.differentiator || c.description || ''}`)
    .join('\n') || ''

  const competitorCampaigns = (brandResearch as any).competitorCampaigns as Array<{
    competitorName: string
    campaignDescription: string
    influencersUsed?: string[]
    whatWorked?: string
    opportunityForBrand?: string
  }> || []

  const campaignIntelligence = competitorCampaigns.slice(0, 3)
    .map(c => `- ${c.competitorName}: ${c.campaignDescription}${c.opportunityForBrand ? ` → הזדמנות: ${c.opportunityForBrand}` : ''}`)
    .join('\n') || 'לא נמצא מידע על קמפיינים תחרותיים'

  const prompt = `
אתה אסטרטג קריאייטיב בכיר בסוכנות שיווק משפיענים.
המשימה שלך: לשדרג רעיון קריאייטיבי ראשוני בעזרת intelligence תחרותי ותובנות שוק אמיתיות.

## הרעיון הקיים (נכתב לפני המחקר):
- כותרת: ${existingCreative.activityTitle}
- קונספט: ${existingCreative.activityConcept}
- תיאור: ${existingCreative.activityDescription}
- גישה: ${existingCreative.activityApproach?.map(a => `${a.title}: ${a.description}`).join(' | ') || ''}
- מבדל: ${existingCreative.activityDifferentiator || 'לא הוגדר'}

## Intelligence תחרותי מהמחקר:
**מתחרים ומה מבדיל אותם:**
${competitorLines}

**קמפיינים תחרותיים אחרונים:**
${campaignIntelligence}

**מיקום שוק של המותג:**
${brandResearch.marketPosition || 'לא נמצא'}

**יתרונות תחרותיים (USPs):**
${brandResearch.uniqueSellingPoints?.join(', ') || 'לא נמצאו'}

**נושאי תוכן מומלצים:**
${brandResearch.contentThemes?.join(', ') || 'לא נמצאו'}

**הרגע העסקי (Why Now):**
${(brandResearch as any).whyNowTrigger || 'לא נמצא'}

**הקשר שוק ישראלי:**
${(brandResearch as any).israeliMarketContext || 'לא נמצא'}

**מתחים (tensions) שזוהו במחקר:**
${(brandResearch as any).tensions?.length ? (brandResearch as any).tensions.join('\n- ') : 'לא זוהו מתחים ספציפיים'}

## הנחיות לשדרוג:
1. **שמור על הטון והרוח** של הרעיון המקורי — רק חזק אותו עם insight ספציפי
2. **הכנס intelligence תחרותי קונקרטי** — הזכר מה המתחרים עושים ואיך הקמפיין שלנו שונה/טוב יותר
3. **הקונספט חייב להתייחס ל"רגע הזה"** של המותג בשוק הישראלי
4. **שמור על הגישות (approaches) הקיימות** — רק הפוך כל אחת לחדה יותר עם נתון/insight ספציפי
5. **אל תמציא מספרים** — אם יש נתון ממחקר, השתמש בו. אם אין, כתוב בצורה איכותית בלי להמציא אחוזים או כמויות
6. **אל תוסיף סופרלטיבים ריקים** — "מוביל", "פורץ דרך", "חדשני", "ייחודי" בלי ביסוס = נפסל. אם זה לא ספציפי, אל תכתוב את זה
7. כתוב בעברית נקייה, בטון מקצועי ושיווקי — בלי "בעידן הדיגיטלי", "באזז", "מעורר השראה"

## פורמט JSON חובה:
\`\`\`json
{
  "activityTitle": "כותרת ממוקדת ומשופרת",
  "activityConcept": "קונספט מחודד עם insight תחרותי (2-3 משפטים)",
  "activityDescription": "תיאור מקיף שמשלב competitive intelligence ו-WHY NOW (3-4 משפטים)",
  "activityApproach": [
    {
      "title": "כותרת הגישה (שמור על הכותרת המקורית!)",
      "description": "תיאור משופר עם insight ספציפי מהמחקר"
    }
  ],
  "activityDifferentiator": "מה מבדיל את הקמפיין הזה מכל מה שהמתחרים עשו"
}
\`\`\`
`

  // Primary model first, fallback if it fails
  const models = await getCreativeModels()
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[CreativeEnhancer] Calling ${model} (attempt ${attempt + 1}/${models.length})...`)
      const aiResult = await callAI({
        model,
        prompt,
        geminiConfig: {
          thinkingConfig: { thinkingLevel: 'HIGH' as any },
        },
        thinkingLevel: 'HIGH',
        callerId: `creative-enhancer-${brandResearch.brandName}`,
      })

      const text = aiResult.text || ''
      const enhanced = parseGeminiJson<Partial<CreativeStepData>>(text)

      // Merge — preserve referenceImages and any field not returned
      const result: CreativeStepData = {
        ...existingCreative,
        activityTitle: enhanced.activityTitle || existingCreative.activityTitle,
        activityConcept: enhanced.activityConcept || existingCreative.activityConcept,
        activityDescription: enhanced.activityDescription || existingCreative.activityDescription,
        activityDifferentiator: enhanced.activityDifferentiator || existingCreative.activityDifferentiator,
        // Preserve original approach titles, only update descriptions
        activityApproach: (enhanced.activityApproach && enhanced.activityApproach.length > 0)
          ? existingCreative.activityApproach.map((orig, i) => ({
              title: orig.title, // Always keep original title
              description: enhanced.activityApproach![i]?.description || orig.description,
            }))
          : existingCreative.activityApproach,
      }

      console.log(`[CreativeEnhancer] Enhanced: "${result.activityTitle}" (model: ${model})`)
      if (attempt > 0) console.log(`[CreativeEnhancer] ✅ Succeeded with fallback model (${model})`)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CreativeEnhancer] Attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[CreativeEnhancer] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[CreativeEnhancer] All attempts failed, returning original')
  return existingCreative
}
