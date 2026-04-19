/**
 * Smart Prompt Generator
 * AI generates optimized JSON prompts for image generation
 * Based on the image strategy, creates specific, creative prompts
 */

import { callAI } from '@/lib/ai-provider'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'
import type { ImageStrategy, ImagePlan } from './image-strategist'
import { parseGeminiJson } from '../utils/json-cleanup'
const PRO_MODEL = 'gemini-3.1-pro-preview'     // Primary — best reasoning quality
const FLASH_MODEL = 'gemini-3-flash-preview'   // Fallback when Pro fails/overloaded

export interface SmartImagePrompt {
  imageId: string
  placement: string
  prompt: {
    subject: string
    scene: string
    mood: string
    colors: string[]
    composition: string
    lighting: string
    style: string
    israeliElements: string
    noText: boolean
  }
  aspectRatio: '16:9' | '1:1' | '4:5'
  priority: 'essential' | 'recommended' | 'optional'
}

export interface GeneratedPrompts {
  prompts: SmartImagePrompt[]
  styleGuide: string
}

/**
 * Generate smart prompts for all planned images
 */
export async function generateSmartPrompts(
  strategy: ImageStrategy,
  brandResearch: BrandResearch,
  brandColors: BrandColors
): Promise<GeneratedPrompts> {
  console.log(`[Smart Prompts] Generating prompts for ${strategy.images.length} images`)
  
  const imagePlans = strategy.images.map((img, i) => 
    `${i + 1}. ID: ${img.id}
   Purpose: ${img.purpose}
   Placement: ${img.placement}
   Rationale: ${img.rationale}`
  ).join('\n\n')

  const prompt = `אתה Art Director בכיר ומומחה ל-Prompt Engineering עבור Gemini Nano Banana Pro (מודל יצירת תמונות מטורף).
המשימה: לכתוב פרומפטים מקצועיים, דרמטיים ומדויקים עבור כל תמונה באסטרטגיה, שיופקו ברמת פרימיום/מגזין.

## המותג
- שם: ${brandResearch.brandName}
- תעשייה: ${brandResearch.industry || 'כללי'}
- אישיות: ${brandResearch.brandPersonality?.join(', ') || 'מקצועי ומודרני'}
- קהל יעד: ${brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45'} שנים

## צבעי המותג
- ראשי: ${brandColors.primary}
- משני: ${brandColors.secondary || brandColors.accent}
- נוסף: ${brandColors.accent}

## הכיוון הויזואלי
${strategy.conceptSummary}
${strategy.visualDirection}

## התמונות לייצר
${imagePlans}

## כללי כתיבת פרומפט ל-Nano Banana Pro

1. **מבנה JSON**: הפרומפט צריך להיות מובנה, ספציפי ועשיר.
2. **Cinematic & Editorial**: תאר את התמונות כאילו מדובר בהפקת אופנה או פרסומת במיליון דולר.
3. **ישראליות מודרנית**: תל אביב הייטקיסטית, חופי ים תיכון אסתטיים, אנשים יפים ואותנטיים (לא תמונות סטוק גנריות מאמריקה).
4. **NO TEXT**: קריטי! אין טקסט, אותיות, מילים, לוגואים.
5. **תאורה**: תאורה ים-תיכונית חמה, שעת זהב, תאורת סטודיו דרמטית.
6. **קומפוזיציה**: שטח שלילי (Negative space) בצד ימין לטובת כתיבת טקסט ב-RTL במצגת.

## פורמט תגובה (החזר JSON בלבד)
\`\`\`json
{
  "styleGuide": "משפט אחד על הסגנון האחיד (למשל: 'מראה פילם 35ממ, תאורה רכה, גוונים חמים')",
  "prompts": [
    {
      "imageId": "המזהה מהאסטרטגיה (חובה לשמור על אותו ID)",
      "placement": "cover/brand/audience/activity/product/lifestyle/closing/custom",
      "prompt": {
        "subject": "נושא מרכזי מפורט",
        "scene": "תיאור הסצנה והסביבה ברזולוציה גבוהה",
        "mood": "תחושות ואווירה (למשל: יוקרתי, קצבי, מרגש)",
        "colors": ["Hex", "Color names"],
        "composition": "מיקום אלמנטים (למשל: צד שמאל מפוקס, צד ימין נקי לטקסט)",
        "lighting": "סוג התאורה (למשל: Cinematic golden hour)",
        "style": "סגנון צילום (למשל: High-end commercial photography)",
        "israeliElements": "אלמנטים ישראליים ספציפיים (למשל: אדריכלות באוהאוס בתל אביב)",
        "noText": true
      },
      "aspectRatio": "16:9",
      "priority": "essential"
    }
  ]
}
\`\`\`
`

  // Flash first (fast + cheap), Pro fallback
  const models = [PRO_MODEL, FLASH_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[Smart Prompts] Calling ${model} (attempt ${attempt + 1}/${models.length})...`)
      const aiResult = await callAI({
        model,
        prompt,
        geminiConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'HIGH' as any },
        },
        thinkingLevel: 'HIGH',
        callerId: `smart-prompts-${brandResearch.brandName}`,
      })

      const text = aiResult.text || ''
      const result = parseGeminiJson<GeneratedPrompts>(text)

      if (result && result.prompts && result.prompts.length > 0) {
        console.log(`[Smart Prompts] Generated ${result.prompts.length} premium prompts (model: ${model})`)
        console.log(`[Smart Prompts] Style guide: ${result.styleGuide}`)
        if (attempt > 0) console.log(`[Smart Prompts] ✅ Succeeded with fallback model (${model})`)
        return result
      }

      throw new Error('Invalid prompts response')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Smart Prompts] Attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[Smart Prompts] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Smart Prompts] All attempts failed, using defaults')
  return getDefaultPrompts(strategy, brandResearch, brandColors)
}

/**
 * Convert SmartImagePrompt to a narrative-style English text prompt for Nano Banana Pro
 *
 * Uses narrative descriptions and injects high-end photography modifiers
 * to ensure breathtaking 4K results.
 */
export function smartPromptToText(smartPrompt: SmartImagePrompt): string {
  const p = smartPrompt.prompt

  // Build a cohesive narrative prompt
  const colorMention = p.colors.slice(0, 3).join(', ')
  
  // Photography and rendering boosters for Nano Banana Pro
  const premiumBoosters = "8k resolution, highly detailed masterpiece, award-winning photography, photorealistic, Vogue editorial style, shot on 35mm lens, beautiful depth of field, sharp focus on subject, soft bokeh background"

  return `A breathtaking, high-end commercial photograph of ${p.subject}. 
Set in ${p.scene}. The atmosphere is ${p.mood}, evoking a premium lifestyle feel. 
The visual color palette is dominated by ${colorMention}, incorporating ${p.israeliElements}. 
Lighting setup: ${p.lighting}. Composition details: ${p.composition}, ensuring negative space where needed.
Overall styling: ${p.style}. 

Technical details: ${premiumBoosters}. 
CRITICAL RULES: The image is purely visual. ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS, NO LOGOS, NO GRAPHICS. Zero text. Avoid generic stock photo look; make it authentic and spectacular.`
}

/**
 * Default prompts as fallback
 */
function getDefaultPrompts(
  strategy: ImageStrategy,
  brandResearch: BrandResearch,
  brandColors: BrandColors
): GeneratedPrompts {
  const prompts: SmartImagePrompt[] = strategy.images.map(img => ({
    imageId: img.id,
    placement: img.placement,
    prompt: {
      subject: `${brandResearch.brandName} - premium representation of ${img.purpose}`,
      scene: img.rationale,
      mood: brandResearch.brandPersonality?.join(', ') || 'Professional, modern, inviting',
      colors: [brandColors.primary, brandColors.secondary || brandColors.accent, brandColors.accent],
      composition: 'Subject on the left, clean negative space on the right for RTL text overlay',
      lighting: 'Natural Mediterranean lighting, golden hour, soft cinematic shadows',
      style: 'Premium commercial photography, photorealistic',
      israeliElements: 'Authentic modern Israeli lifestyle vibe',
      noText: true,
    },
    aspectRatio: '16:9',
    priority: img.priority,
  }))

  return {
    styleGuide: 'Modern Israeli editorial style with warm cinematic lighting and clean composition.',
    prompts,
  }
}

export { getDefaultPrompts }