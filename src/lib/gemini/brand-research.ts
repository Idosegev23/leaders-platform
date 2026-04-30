/**
 * Gemini Deep Brand Research Service
 * Multi-Agent approach: Targeted Google Searches -> Context Synthesis -> JSON Output
 */

import { callAI, resolveModels } from '@/lib/ai-provider'
import { parseGeminiJson } from '../utils/json-cleanup'
import { getConfig } from '../config/admin-config'
import { PROMPT_DEFAULTS, MODEL_DEFAULTS } from '../config/defaults'

const PRO_MODEL_DEFAULT = MODEL_DEFAULTS['brand_research.primary_model'].value as string
const FLASH_MODEL_DEFAULT = MODEL_DEFAULTS['brand_research.fallback_model'].value as string

async function getBrandResearchModels(): Promise<string[]> {
  return resolveModels(
    'brand_research.primary_model',
    'brand_research.fallback_model',
    PRO_MODEL_DEFAULT,
    FLASH_MODEL_DEFAULT,
  )
}

export interface BrandResearch {
  // Basic Info
  brandName: string
  officialName: string
  tagline?: string
  industry: string
  subIndustry?: string
  founded: string
  headquarters: string
  website: string
  
  // Company Overview
  companyDescription: string
  historyHighlights: string[]
  businessModel: string
  
  // Market Position
  marketPosition: string
  marketShare?: string
  competitors: {
    name: string
    description: string
    differentiator: string
  }[]
  uniqueSellingPoints: string[]
  competitiveAdvantages: string[]
  
  // Products/Services
  mainProducts: {
    name: string
    description: string
    targetMarket?: string
  }[]
  pricePositioning: 'budget' | 'mid-range' | 'premium' | 'luxury'
  
  // Target Audience - Detailed
  targetDemographics: {
    primaryAudience: {
      gender: string
      ageRange: string
      socioeconomic: string
      lifestyle: string
      interests: string[]
      painPoints: string[]
      aspirations: string[]
    }
    secondaryAudience?: {
      gender: string
      ageRange: string
      description: string
    }
    behavior: string
    purchaseDrivers: string[]
  }
  
  // Brand Identity
  brandPersonality: string[]
  brandValues: string[]
  brandPromise: string
  toneOfVoice: string
  visualIdentity: {
    primaryColors: string[]
    style: string
    moodKeywords: string[]
  }
  
  // Digital Presence
  socialPresence: {
    instagram?: { handle?: string; followers?: string; engagement?: string; contentStyle?: string }
    facebook?: { followers?: string; engagement?: string }
    tiktok?: { handle?: string; followers?: string; contentStyle?: string }
    youtube?: { subscribers?: string; contentType?: string }
    linkedin?: { followers?: string }
  }
  websiteTraffic?: string
  onlineReputation?: string
  
  // Influencer Marketing Context
  previousCampaigns: {
    name: string
    description: string
    results?: string
  }[]
  influencerTypes: string[]
  contentThemes: string[]
  suggestedApproach: string
  recommendedGoals: string[]
  potentialChallenges: string[]
  
  // Industry Insights
  industryTrends: string[]
  seasonality?: string
  keyDates?: string[]

  // Competitive Campaign Intelligence (new)
  competitorCampaigns: {
    competitorName: string
    campaignDescription: string
    influencersUsed?: string[]
    whatWorked?: string
    opportunityForBrand?: string
  }[]
  competitiveGap?: string  // מה המותג "פספס" לעומת מתחריו

  // Brand Safety & Israeli Market (new)
  brandSafetyFlags: string[]       // הגבלות רגולטוריות (אם יש)
  dominantPlatformInIsrael?: string // אינסטגרם/טיקטוק/פייסבוק לקהל הספציפי
  whyNowTrigger?: string           // הרגע העסקי שמניע את הקמפיין
  israeliMarketContext?: string    // הקשר שוק ישראלי ספציפי

  // Strategic Analysis — "So what?" layer
  tensions?: string[]
  opportunities?: string[]
  risks?: string[]
  brandVoiceGuide?: {
    personality: string
    toneSpectrum: string
    languageStyle: string
    avoid: string
  }

  // Visual Brand DNA — drives image generation, renderer atmosphere, deck consistency.
  // The whole point: two different brands shouldn't yield two visually identical decks.
  visualDNA?: {
    /** Photographic style for AI-generated imagery and reference scraping. */
    photoStyle:
      | 'clinical'           // medical/pharma — white bg, clean, sterile
      | 'lifestyle'          // people in real contexts, warm, candid
      | 'editorial'          // fashion-magazine — high contrast, posed
      | 'documentary'        // raw, unposed, photo-journalism
      | 'illustrated'        // graphic illustration over photography
      | 'minimal-product'    // hero shot, neutral bg, premium
    /** How the brand typically photographs its products. */
    productStyle:
      | 'white-bg-hero'      // catalog/e-comm style
      | 'lifestyle-context'  // product in use
      | 'hand-held'          // human scale, intimate
      | 'flat-lay'           // top-down arrangement
      | 'extreme-close'      // texture/detail focus
    /** Decorative aesthetic for the entire deck (atmospheres, dividers, accents). */
    decorativeStyle:
      | 'minimal'
      | 'maximalist'
      | 'organic-soft'
      | 'geometric-strict'
      | 'retro'
      | 'brutalist'
    /** Lighting mood for AI image generation. */
    lightingStyle:
      | 'bright-clean'
      | 'golden-hour'
      | 'studio-flash'
      | 'moody-low-key'
      | 'natural-soft'
    /** Typography mood — guides font choice + scale. */
    typographyMood:
      | 'serif-editorial'
      | 'sans-tight'
      | 'sans-airy'
      | 'display-bold'
      | 'monospace-tech'
    /** Recurring visual element from the brand's site/packaging — woven into renderer. */
    recurringPattern?: {
      type: 'wave' | 'dots' | 'lines' | 'gradient' | 'grid' | 'none'
      description: string
    }
    /** Free-text description of the brand's visual mood — used as inspiration in image prompts. */
    moodDescription: string
  }

  marketPosition_implication?: string
  audience_implication?: string
  competitors_implication?: string

  // Sources
  sources: { title: string; url: string }[]

  // Confidence
  confidence: 'high' | 'medium' | 'low'
  researchNotes?: string
}

export interface ScrapedWebsite {
  url: string
  title: string
  description: string
  headings: string[]
  paragraphs: string[]
  socialLinks: string[]
}

export interface ResearchAngle {
  name: string
  description: string
  label: string // Hebrew label for UI
}

/**
 * Research angles — 4 consolidated agents (was 7) to reduce API concurrency.
 * Exported so client can show per-angle progress labels.
 */
export function getResearchAngles(brandName: string): ResearchAngle[] {
  return [
    {
      name: "Company & Market Position",
      label: "חברה ושוק",
      description: `<task>חקור את המותג "${brandName}" והחזר סיכום מקיף.</task>
<scope>
1. היסטוריה: שנת הקמה, מייסדים, מטה, חזון, מודל עסקי, מוצרים/שירותים מרכזיים.
2. שוק ומתחרים: מתחרים ישירים ועקיפים, פוזיציה (פרימיום/תקציב?), USP, נתח שוק.
3. מגמות תעשייה: טרנדים עדכניים, עונתיות, תאריכים שיווקיים רלוונטיים.
</scope>
<constraints>
- התמקד בנתונים עובדתיים בלבד. אם לא מצאת — כתוב "לא נמצא".
- ציין URLs של מקורות בסוף.
- 3-5 פסקאות מפורטות.
</constraints>`
    },
    {
      name: "Target Audience & Consumer",
      label: "קהל יעד",
      description: `<task>חקור את קהל היעד של המותג "${brandName}".</task>
<scope>
1. דמוגרפיה: גיל, מגדר, רמה סוציו-אקונומית, אזור גיאוגרפי.
2. פסיכוגרפיה: סגנון חיים, תחומי עניין, ערכים, שאיפות.
3. התנהגות צרכנית: כאבים שהמותג פותר, מניעי רכישה, התנהגות אונליין.
4. קהל משני: אם קיים.
</scope>
<constraints>
- התבסס על נתונים אמיתיים, לא הנחות.
- ציין URLs של מקורות בסוף.
- 3-4 פסקאות.
</constraints>`
    },
    {
      name: "Digital Presence & Campaigns",
      label: "דיגיטל וקמפיינים",
      description: `<task>חקור את הנוכחות הדיגיטלית והקמפיינים של "${brandName}" ושל מתחריו.</task>
<scope>
1. רשתות חברתיות: אינסטגרם, פייסבוק, טיקטוק, יוטיוב — handles, עוקבים, מעורבות, סגנון תוכן.
2. קמפיינים קודמים של המותג: שם, תיאור, תוצאות, שימוש במשפיענים.
3. קמפיינים של מתחרים ב-12 חודשים האחרונים: עם אילו משפיענים עבדו? מה עבד? מה המותג "פספס"?
4. מוניטין ציבורי ברשת.
</scope>
<constraints>
- שמות משפיענים ו-handles חייבים להיות אמיתיים (אמת בלבד).
- ציין URLs של מקורות בסוף.
- 3-5 פסקאות.
</constraints>`
    },
    {
      name: "Israeli Market & Brand Identity",
      label: "שוק ישראלי וזהות",
      description: `<task>חקור את "${brandName}" בהקשר הישראלי ואת זהות המותג.</task>
<scope>
1. הקשר ישראלי: באיזו פלטפורמה הקהל הישראלי הכי פעיל? הקשר ייחודי לשוק המקומי.
2. בטיחות מותג: האם התחום מוסדר? (פארמה, אלכוהול, ילדים, פיננסים, מזון/בריאות). הגבלות?
3. "למה עכשיו": מה הטריגר העסקי שמניע קמפיין בתקופה הזו?
4. זהות מותג: אישיות, ערכים, הבטחת מותג, טון דיבור, צבעים וסגנון ויזואלי.
</scope>
<constraints>
- התמקד בהקשר ישראלי ספציפי, לא גלובלי.
- ציין URLs של מקורות בסוף.
- 3-4 פסקאות.
</constraints>`
    },
  ]
}

/**
 * Run a single research agent — exported for per-angle client orchestration
 */
export async function runSingleAgent(
  brandName: string,
  angleName: string,
  angleDescription: string
): Promise<{ angle: string; data: string }> {
  console.log(`[Research Agent] Starting search for angle: ${angleName}`)

  // Load prompt template and angle description from admin config
  const angleConfigMap: Record<string, string> = {
    'Company & Market Position': 'brand_research.angle_1_company_market',
    'Target Audience & Consumer': 'brand_research.angle_2_target_audience',
    'Digital Presence & Campaigns': 'brand_research.angle_3_digital_campaigns',
    'Israeli Market & Brand Identity': 'brand_research.angle_4_israeli_identity',
  }
  const angleKey = angleConfigMap[angleName]
  const configDescription = angleKey
    ? (await getConfig('ai_prompts', angleKey, (PROMPT_DEFAULTS as Record<string, { value: unknown }>)[angleKey]?.value as string || angleDescription)).replace(/\{brandName\}/g, brandName)
    : angleDescription

  const agentTemplate = await getConfig('ai_prompts', 'brand_research.agent_prompt_template', PROMPT_DEFAULTS['brand_research.agent_prompt_template'].value as string)
  const prompt = agentTemplate.replace(/\{brandName\}/g, brandName).replace(/\{angleDescription\}/g, configDescription)

  const callAgent = async (model: string) => {
    const result = await callAI({
      model,
      prompt,
      geminiConfig: {
        thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
        maxOutputTokens: 4000,
      },
      thinkingLevel: 'MEDIUM',
      maxOutputTokens: 4000,
      useGoogleSearch: true,
      // Gemini 3 supports combining tools — model can scrape URLs it finds via search
      useUrlContext: true,
      callerId: `brand-research-agent-${angleName}`,
    })
    return result.text || `לא נאסף מידע עבור: ${angleName}`
  }

  // Primary model first, fallback if it fails
  const models = await getBrandResearchModels()
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const data = await callAgent(model)
      if (attempt > 0) console.log(`[Research Agent] ✅ ${angleName} succeeded with fallback model (${model})`)
      return { angle: angleName, data }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Research Agent] Attempt ${attempt + 1}/${models.length} failed for ${angleName} (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[Research Agent] ⚡ Falling back to Flash for ${angleName}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  return { angle: angleName, data: `שגיאה באיסוף מידע לאחר ${models.length} ניסיונות (Pro + Flash).` }
}

/**
 * Synthesize gathered agent data into a structured BrandResearch object.
 * Exported for use in /api/research/synthesize route.
 */
export async function synthesizeResearch(
  brandName: string,
  gatheredData: { angle: string; data: string }[],
  websiteData?: ScrapedWebsite
): Promise<BrandResearch> {
  console.log(`[Gemini Deep Research] Synthesizing ${gatheredData.length} agent results for: ${brandName}`)

  let rawLogsContent = ''
  gatheredData.forEach(result => {
    // Each agent produces up to 4000 tokens (~6000 chars). Keep the full output —
    // Flash input limit is 1M tokens, so 4×6000 chars is negligible.
    const truncated = result.data.length > 6000 ? result.data.slice(0, 6000) + '...[קוצר]' : result.data
    rawLogsContent += `\n--- ANGLE: ${result.angle} ---\n${truncated}\n`
  })

  const websiteContext = websiteData ? `
## מידע שחולץ מהאתר הרשמי:
- כתובת: ${websiteData.url}
- כותרת: ${websiteData.title}
- תיאור: ${websiteData.description}
- רשתות חברתיות שנמצאו: ${websiteData.socialLinks.join(', ')}
- תוכן מהאתר:
${websiteData.paragraphs.slice(0, 15).join('\n')}
` : ''

  const synthesisPrompt = `
אתה אסטרטג מותגים וחוקר שוק בכיר. המשימה שלך היא לבנות דוח מחקר עומק מקיף וקפדני על המותג "${brandName}" — לא סיכום אלא ניתוח.

להלן כל המידע הגולמי שנאסף על ידי סוכני המחקר שלנו מרחבי הרשת:
${rawLogsContent}

${websiteContext}

## הנחיות לסינתזה:
1. התבסס **אך ורק** על המידע הגולמי שסופק לך למעלה (ומהאתר הרשמי אם יש).
2. הצלב את הנתונים וצור תמונה עסקית מלאה, הגיונית ומעמיקה.
3. כתוב פסקאות מלאות ועשירות, במיוחד בתיאור החברה, קהל היעד והצעת הערך.
4. **אמינות היא מעל הכל!** אל תמציא מידע. אם נתון מסוים חסר לחלוטין במידע שנאסף, כתוב "לא נמצא מידע בסריקה".
5. אסוף את כל המקורות (URLs) שהסוכנים ציינו במידע הגולמי והכנס אותם לשדה ה-sources.
6. הצלב נתונים מהסוכנים השונים — אם סוכן אחד מצא X וסוכן שני מצא Y, מה המשמעות המשולבת?

## חובה — שכבת "אז מה?":
לכל שדה מרכזי, הוסף שדה _implication עם מסקנה בן משפט אחד:
- marketPosition_implication: "מה זה אומר לקמפיין"
- audience_implication: "מה זה אומר לבחירת משפיענים"
- competitors_implication: "מה אפשר לעשות אחרת"

## חובה — שדות חדשים:
- "tensions": [3-5 מתחים/פערים שזוהו בין המותג, הקהל, והשוק]
  דוגמה: "המותג מדבר על איכות אבל הקהל תופס אותו כזול"
  דוגמה: "הקהל רוצה אותנטיות אבל המותג מפרסם תוכן מסוגנן מדי"
- "opportunities": [2-3 הזדמנויות שעלו מהמחקר]
- "risks": [2-3 סיכונים שצריך לדעת עליהם]
- "brandVoiceGuide": { "personality": "3-5 תכונות מרכזיות", "toneSpectrum": "פורמלי — קז'ואל, היכן המותג?", "languageStyle": "לועזית? עברית נקייה? סלנג?", "avoid": "מה לא מתאים לטון הזה" }
- "visualDNA": { ה-DNA הוויזואלי של המותג. **קריטי לעיצוב מצגת שמרגישה כמו המותג**:
    "photoStyle": אחד מ: clinical / lifestyle / editorial / documentary / illustrated / minimal-product
    "productStyle": אחד מ: white-bg-hero / lifestyle-context / hand-held / flat-lay / extreme-close (איך המותג בדרך כלל מצלם מוצרים)
    "decorativeStyle": אחד מ: minimal / maximalist / organic-soft / geometric-strict / retro / brutalist
    "lightingStyle": אחד מ: bright-clean / golden-hour / studio-flash / moody-low-key / natural-soft
    "typographyMood": אחד מ: serif-editorial / sans-tight / sans-airy / display-bold / monospace-tech
    "recurringPattern": { "type": "wave/dots/lines/gradient/grid/none", "description": "תיאור הדפוס" } — אם זוהה דפוס חוזר באתר/אריזה
    "moodDescription": "תיאור 2-3 משפטים של ה-mood הוויזואלי. דוגמאות: 'sterile, premium, baby-safe — bright clean lighting on muted pastels with soft organic curves' או 'rugged, outdoor, israeli-grit — golden-hour lighting on natural textures with bold geometric typography'."
  }

החזר JSON מפורט בלבד, לפי המבנה המדויק הבא:
\`\`\`json
{
  "brandName": "שם המותג בעברית",
  "officialName": "השם הרשמי באנגלית",
  "tagline": "הסלוגן של המותג (אם נמצא)",
  "industry": "תעשייה ראשית",
  "subIndustry": "תת-תעשייה",
  "founded": "שנת הקמה",
  "headquarters": "מיקום המטה",
  "website": "כתובת האתר",
  "companyDescription": "תיאור מקיף של החברה ב-3-5 פסקאות...",
  "historyHighlights": ["אירוע 1", "אירוע 2"],
  "businessModel": "תיאור המודל העסקי",
  "marketPosition": "פסקה מפורטת על הפוזיציה בשוק...",
  "marketShare": "נתח שוק אם ידוע",
  "competitors": [{ "name": "שם מתחרה", "description": "תיאור", "differentiator": "מה מבדיל" }],
  "uniqueSellingPoints": ["יתרון 1", "יתרון 2"],
  "competitiveAdvantages": ["יתרון תחרותי 1"],
  "mainProducts": [{ "name": "שם מוצר", "description": "תיאור", "targetMarket": "קהל יעד למוצר" }],
  "pricePositioning": "budget/mid-range/premium/luxury",
  "targetDemographics": {
    "primaryAudience": {
      "gender": "פירוט מגדר",
      "ageRange": "טווח גילאים",
      "socioeconomic": "רמה סוציו-אקונומית",
      "lifestyle": "תיאור אורח החיים",
      "interests": ["עניין 1"],
      "painPoints": ["כאב 1"],
      "aspirations": ["שאיפה 1"]
    },
    "behavior": "תיאור התנהגות צרכנים",
    "purchaseDrivers": ["מניע 1"]
  },
  "brandPersonality": ["תכונה 1"],
  "brandValues": ["ערך 1"],
  "brandPromise": "הבטחת המותג",
  "toneOfVoice": "תיאור הטון",
  "visualIdentity": { "primaryColors": ["#XXXXXX"], "style": "תיאור הסגנון", "moodKeywords": ["מילה 1"] },
  "socialPresence": {
    "instagram": { "handle": "", "followers": "", "engagement": "", "contentStyle": "" },
    "tiktok": { "handle": "", "followers": "", "contentStyle": "" }
  },
  "websiteTraffic": "הערכה אם קיימת",
  "onlineReputation": "תיאור המוניטין",
  "previousCampaigns": [{ "name": "שם קמפיין", "description": "תיאור", "results": "תוצאות" }],
  "influencerTypes": ["סוג 1"],
  "contentThemes": ["נושא 1"],
  "suggestedApproach": "פסקה מפורטת על אסטרטגיה",
  "recommendedGoals": ["מטרה 1"],
  "potentialChallenges": ["אתגר 1"],
  "industryTrends": ["טרנד 1"],
  "seasonality": "תיאור עונתיות",
  "keyDates": ["תאריך 1"],
  "competitorCampaigns": [
    {
      "competitorName": "שם מתחרה",
      "campaignDescription": "תיאור הקמפיין שעשו",
      "influencersUsed": ["@handle1"],
      "whatWorked": "מה עבד להם",
      "opportunityForBrand": "איך המותג שלנו יכול לנצח אותם בדיוק בנקודה הזו"
    }
  ],
  "competitiveGap": "פסקה: מה המותג מפסיד לעומת מתחריו בזירת הדיגיטל/משפיענים — ומה ההזדמנות",
  "brandSafetyFlags": ["הגבלה 1 אם קיימת"],
  "dominantPlatformInIsrael": "אינסטגרם / טיקטוק / פייסבוק — עם הסבר קצר",
  "whyNowTrigger": "מה הרגע העסקי שמניע את הצורך בקמפיין עכשיו",
  "israeliMarketContext": "הקשר ייחודי של השוק הישראלי לתחום המותג",
  "tensions": ["מתח 1 שזוהה בין המותג/הקהל/השוק", "מתח 2", "מתח 3"],
  "opportunities": ["הזדמנות 1 שעלתה מהמחקר", "הזדמנות 2"],
  "risks": ["סיכון 1 שצריך לדעת עליו", "סיכון 2"],
  "visualDNA": {
    "photoStyle": "lifestyle",
    "productStyle": "hand-held",
    "decorativeStyle": "organic-soft",
    "lightingStyle": "natural-soft",
    "typographyMood": "sans-airy",
    "recurringPattern": { "type": "wave", "description": "soft horizontal waves echoing the packaging curves" },
    "moodDescription": "תיאור 2-3 משפטים של mood ויזואלי ספציפי למותג"
  },
  "brandVoiceGuide": {
    "personality": "3-5 תכונות מרכזיות של אישיות המותג",
    "toneSpectrum": "פורמלי — קז'ואל, היכן המותג?",
    "languageStyle": "לועזית? עברית נקייה? סלנג?",
    "avoid": "מה לא מתאים לטון הזה"
  },
  "marketPosition_implication": "מה זה אומר לקמפיין",
  "audience_implication": "מה זה אומר לבחירת משפיענים",
  "competitors_implication": "מה אפשר לעשות אחרת",
  "sources": [{ "title": "תיאור המקור", "url": "URL" }],
  "confidence": "high/medium/low",
  "researchNotes": "הערות על איכות המידע שנאסף"
}
\`\`\`
`

  // Try primary model first, fallback if overloaded
  const synthModels = await getBrandResearchModels()
  for (let attempt = 0; attempt < synthModels.length; attempt++) {
    const model = synthModels[attempt]
    try {
      const result = await callAI({
        model,
        prompt: synthesisPrompt,
        geminiConfig: {
          thinkingConfig: { thinkingLevel: 'HIGH' as any },
          maxOutputTokens: 16000,
        },
        thinkingLevel: 'HIGH',
        maxOutputTokens: 16000,
        callerId: `brand-research-synthesis`,
      })

      const text = result.text || ''
      console.log(`[Gemini Deep Research] Parsing synthesis JSON (model: ${model})...`)

      const research = parseGeminiJson<BrandResearch>(text)
      console.log(`[Gemini Deep Research] Complete. Confidence: ${research.confidence}`)
      console.log(`[Gemini Deep Research] Found ${research.competitors?.length || 0} competitors, ${research.sources?.length || 0} sources`)
      if (attempt > 0) console.log(`[Gemini Deep Research] ✅ Synthesis succeeded with fallback model (${model})`)

      // Visual DNA extraction — runs as a dedicated short-prompt call so the
      // model gives it 100% attention. The main synthesis prompt is ~30
      // fields long and Gemini routinely drops optional ones at the end.
      // Failure is non-fatal: the deck falls back to default decorativeStyle.
      try {
        if (!research.visualDNA) {
          research.visualDNA = await extractVisualDNA(brandName, research, websiteData)
        }
      } catch (vErr) {
        console.warn(`[Gemini Deep Research] Visual DNA extraction failed (non-fatal):`, vErr instanceof Error ? vErr.message : vErr)
      }

      return research
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Gemini Deep Research] Synthesis attempt ${attempt + 1}/${synthModels.length} failed (${model}): ${msg}`)
      if (attempt < synthModels.length - 1) {
        console.log(`[Gemini Deep Research] ⚡ Falling back to Flash for synthesis...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Gemini Deep Research] All synthesis attempts failed, using minimal fallback')
  return getMinimalResearch(brandName, websiteData)
}

/**
 * Deep research a brand using multi-phase Google Search grounding.
 * Convenience wrapper that runs all agents + synthesis in one call.
 * For Vercel-safe usage, use runSingleAgent() + synthesizeResearch() separately from the client.
 */
export async function researchBrand(
  brandName: string,
  websiteData?: ScrapedWebsite
): Promise<BrandResearch> {
  console.log(`[Gemini Deep Research] Starting comprehensive multi-phase research for: ${brandName}`)

  const researchAngles = getResearchAngles(brandName)
  console.log(`[Gemini Deep Research] Executing ${researchAngles.length} targeted search agents in parallel...`);
  
  const gatheredData = await Promise.all(
    researchAngles.map((angle: ResearchAngle) => runSingleAgent(brandName, angle.name, angle.description))
  )

  // Log raw results
  console.log(`\n========== RAW RESEARCH LOGS FOR: ${brandName} ==========`)
  gatheredData.forEach((result: { angle: string; data: string }) => {
    console.log(`\n--- ANGLE: ${result.angle} ---\n${result.data}\n`)
  })
  console.log(`=========================================================\n`)

  console.log(`[Gemini Deep Research] Data gathering complete. Synthesizing...`)
  return synthesizeResearch(brandName, gatheredData, websiteData)
}

/**
 * Dedicated Visual Brand DNA extractor. Runs as its own short-prompt call
 * with structured-output mode so Gemini cannot silently drop the field
 * (which it does in the long synthesis prompt). Always returns a complete
 * visualDNA object — falls back to a sensible default if the model errors.
 *
 * Two reasons this exists as a separate call:
 * 1. Reliability — long prompts (~30 required fields) cause Gemini to skip
 *    optional ones at the end. A focused ~10-field prompt has ~100% return.
 * 2. Quality — the model can think specifically about visual aesthetics
 *    instead of cramming it between competitors and risks.
 */
async function extractVisualDNA(
  brandName: string,
  research: BrandResearch,
  websiteData?: ScrapedWebsite,
): Promise<NonNullable<BrandResearch['visualDNA']>> {
  console.log(`[Visual DNA] Extracting for ${brandName}`)
  const prompt = `אתה Art Director ויזואלי בכיר. נתח את ה-DNA הוויזואלי של המותג "${brandName}" וסווג אותו ל-7 שדות מובנים.

## רקע על המותג
- תעשייה: ${research.industry || 'לא ידוע'}
- אישיות: ${research.brandPersonality?.join(', ') || 'מקצועי'}
- ערכים: ${research.brandValues?.join(', ') || 'לא צוין'}
- מיקום בשוק: ${research.marketPosition || 'לא ידוע'}
- מחיר: ${research.pricePositioning || 'לא ידוע'}
- קהל יעד: ${research.targetDemographics?.primaryAudience?.gender || ''} ${research.targetDemographics?.primaryAudience?.ageRange || ''}, ${research.targetDemographics?.primaryAudience?.lifestyle || ''}
- צבעי מותג: ${(research.visualIdentity?.primaryColors || []).join(', ') || 'לא ידוע'}
- mood keywords: ${(research.visualIdentity?.moodKeywords || []).join(', ') || 'לא צוין'}
${websiteData?.title ? `- כותרת אתר: ${websiteData.title}` : ''}
${websiteData?.description ? `- תיאור meta: ${websiteData.description}` : ''}

## משימה
החזר JSON בלבד עם המבנה הזה (כל השדות חובה — אסור null):
{
  "photoStyle": "אחד מ-EXACTLY: clinical | lifestyle | editorial | documentary | illustrated | minimal-product",
  "productStyle": "אחד מ-EXACTLY: white-bg-hero | lifestyle-context | hand-held | flat-lay | extreme-close",
  "decorativeStyle": "אחד מ-EXACTLY: minimal | maximalist | organic-soft | geometric-strict | retro | brutalist",
  "lightingStyle": "אחד מ-EXACTLY: bright-clean | golden-hour | studio-flash | moody-low-key | natural-soft",
  "typographyMood": "אחד מ-EXACTLY: serif-editorial | sans-tight | sans-airy | display-bold | monospace-tech",
  "recurringPattern": { "type": "אחד מ: wave | dots | lines | gradient | grid | none", "description": "תיאור 1 משפט (או 'אין' אם type=none)" },
  "moodDescription": "תיאור 2-3 משפטים של המראה הוויזואלי הכללי. דוגמה: 'sterile, premium, baby-safe — bright clean lighting on muted pastels with soft organic curves' או 'rugged outdoor israeli grit — golden hour on natural textures with bold geometric type'."
}

הנחיות:
- pharma/skincare → photoStyle="clinical" or "minimal-product", lightingStyle="bright-clean", decorativeStyle="organic-soft"
- outdoor/sports → photoStyle="documentary" or "lifestyle", lightingStyle="golden-hour", decorativeStyle="brutalist" or "geometric-strict"
- luxury/beauty → photoStyle="editorial", lightingStyle="studio-flash" or "moody-low-key", typographyMood="serif-editorial"
- food/F&B → photoStyle="lifestyle", productStyle="flat-lay" or "hand-held", lightingStyle="natural-soft"
- tech/SaaS → photoStyle="minimal-product", typographyMood="monospace-tech" or "sans-tight", decorativeStyle="geometric-strict"

JSON בלבד, ללא markdown, ללא הסבר. אסור null או undefined באף שדה.`

  const result = await callAI({
    model: PRO_MODEL_DEFAULT,
    prompt,
    callerId: `visual-dna-${brandName}`,
    geminiConfig: {
      thinkingConfig: { thinkingLevel: 'LOW' as never },
      responseMimeType: 'application/json',
      maxOutputTokens: 1500,
      temperature: 0.4,
    },
  })

  const parsed = parseGeminiJson<NonNullable<BrandResearch['visualDNA']>>(result.text)
  if (!parsed?.photoStyle || !parsed?.decorativeStyle) {
    throw new Error('Visual DNA extraction returned incomplete data')
  }
  console.log(`[Visual DNA] ✅ ${brandName}: ${parsed.photoStyle} / ${parsed.decorativeStyle} / ${parsed.lightingStyle}`)
  return parsed
}

/**
 * Get minimal research as fallback
 */
function getMinimalResearch(brandName: string, websiteData?: ScrapedWebsite): BrandResearch {
  return {
    brandName: brandName,
    officialName: brandName,
    industry: 'לא ידוע',
    founded: 'לא ידוע',
    headquarters: 'ישראל',
    website: websiteData?.url || '',
    
    companyDescription: `${brandName} הוא מותג. נדרש מחקר נוסף לקבלת מידע מפורט יותר.`,
    historyHighlights: [],
    businessModel: 'לא ידוע',
    
    marketPosition: 'נדרש מחקר נוסף',
    competitors: [],
    uniqueSellingPoints: [],
    competitiveAdvantages: [],
    
    mainProducts: [],
    pricePositioning: 'mid-range',
    
    targetDemographics: {
      primaryAudience: {
        gender: 'נשים וגברים',
        ageRange: '25-45',
        socioeconomic: 'בינוני-גבוה',
        lifestyle: 'לא ידוע',
        interests: [],
        painPoints: [],
        aspirations: [],
      },
      behavior: 'לא ידוע',
      purchaseDrivers: [],
    },
    
    brandPersonality: [],
    brandValues: [],
    brandPromise: '',
    toneOfVoice: 'מקצועי',
    visualIdentity: {
      primaryColors: [],
      style: 'לא ידוע',
      moodKeywords: [],
    },
    
    socialPresence: {},
    
    previousCampaigns: [],
    influencerTypes: ['לייפסטייל', 'מומחים בתחום'],
    contentThemes: [],
    suggestedApproach: 'שיתוף פעולה עם משפיענים רלוונטיים לקהל היעד',
    recommendedGoals: ['מודעות', 'חשיפה', 'אמינות'],
    potentialChallenges: [],
    
    industryTrends: [],

    competitorCampaigns: [],
    brandSafetyFlags: [],

    sources: [],
    confidence: 'low',
    researchNotes: 'המחקר האוטומטי לא הצליח לאסוף מידע מספק. מומלץ לבצע מחקר ידני נוסף.',
    _isFallback: true,
    _fallbackReason: 'כל ניסיונות המחקר נכשלו — הנתונים המוצגים הם ברירת מחדל בלבד',
  } as BrandResearch & { _isFallback: boolean; _fallbackReason: string }
}

/**
 * Quick brand summary (for initial validation)
 */
export async function quickBrandSummary(brandName: string): Promise<{
  description: string
  industry: string
  targetAudience: string
  toneOfVoice: string
}> {
  const prompt = `
ספק סיכום קצר על המותג "${brandName}" בפורמט JSON:
\`\`\`json
{
  "description": "תיאור קצר של המותג (2-3 משפטים)",
  "industry": "תעשייה/קטגוריה",
  "targetAudience": "תיאור קהל היעד",
  "toneOfVoice": "סגנון התקשורת של המותג"
}
\`\`\`
`

  try {
    const [primaryModel] = await getBrandResearchModels()
    const result = await callAI({
      model: primaryModel,
      prompt,
      useGoogleSearch: true,
      callerId: 'brand-research-quick-summary',
    })

    const text = result.text || ''
    return parseGeminiJson<{
      description: string
      industry: string
      targetAudience: string
      toneOfVoice: string
    }>(text)
  } catch (error) {
    console.error('[Gemini] Quick summary error:', error)
    return {
      description: `${brandName} הוא מותג`,
      industry: 'לא ידוע',
      targetAudience: 'צרכנים',
      toneOfVoice: 'מקצועי',
    }
  }
}