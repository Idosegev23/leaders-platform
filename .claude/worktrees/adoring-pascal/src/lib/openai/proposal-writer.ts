/**
 * GPT-5 Proposal Content Writer using Responses API
 * Generates high-quality, detailed proposal content
 */

import OpenAI from 'openai'
import type { BrandResearch } from '../gemini/brand-research'
import type { BrandColors } from '../gemini/color-extractor'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Use GPT-5.2 with Responses API
const MODEL = 'gpt-5.2'

export interface ProposalContent {
  // Cover (Slide 1)
  campaignName?: string
  campaignSubtitle?: string
  
  // Brief (Slide 2) - WHY are they coming to us?
  brandBrief?: string // The core challenge/need in one sentence
  brandPainPoints?: string[] // What's hurting them? (2-3 points)
  brandObjective?: string // What do they want to achieve?
  
  // Goals (Slide 3)
  goals: {
    title: string
    description: string // Keep SHORT - max 80 chars
  }[]
  targetAudience: {
    primary: {
      gender: string
      ageRange: string
      description: string // Rich description
    }
    secondary?: {
      gender: string
      ageRange: string
      description: string
    }
    behavior: string // Detailed behavior paragraph
    insights: string[] // Key insights about the audience
  }
  
  // Key Insight (Slide 5) - Research-based
  keyInsight?: string // The central insight that drives the campaign
  insightSource?: string // Where does this insight come from?
  
  // Strategy (Slide 6)
  strategyHeadline?: string // One sentence strategy summary
  strategyPillars?: { // 2-3 pillars
    title: string
    description: string
  }[]
  
  // Brand (Slide 7)
  brandDescription: string // 3-5 paragraphs, rich content
  brandHighlights: string[] // Key points about the brand
  brandOpportunity: string // Why influencer marketing fits
  
  // Activity (Slide 8)
  activityTitle: string
  activityConcept: string // The big idea - 2-3 sentences
  activityDescription: string // Detailed description paragraph
  activityApproach: {
    title: string
    description: string
  }[]
  activityDifferentiator: string // What makes this approach unique
  
  // Deliverables (Slide 5)
  deliverables: {
    type: string
    quantity: number
    description: string
    purpose: string // Why this deliverable
  }[]
  deliverablesSummary: string
  
  // Targets (Slide 6)
  metrics: {
    budget: number
    currency: string
    potentialReach: number
    potentialEngagement: number
    cpe: number
    cpm?: number
    estimatedImpressions?: number
  }
  metricsExplanation: string // Why these numbers make sense
  
  // Influencers context (Slides 7-8)
  influencerStrategy: string // Strategy paragraph
  influencerCriteria: string[] // What we look for
  contentGuidelines: string[] // How content should look
  
  // Closing (Slide 9)
  closingStatement: string
  nextSteps: string[]
  
  // Strategy Flow (Wizard flow - optional)
  strategyFlow?: {
    steps: { label: string; description: string }[]
  }

  // Creative Slides (Wizard flow - optional)
  creativeSlides?: {
    title: string
    description: string
    conceptType?: string
  }[]

  // Quantities Summary (Wizard flow - optional)
  quantitiesSummary?: {
    influencerCount: number
    contentTypes: { type: string; quantityPerInfluencer: number; totalQuantity: number }[]
    campaignDurationMonths: number
    totalDeliverables: number
    formula?: string
  }

  // Metadata
  toneUsed: string
  confidence: 'high' | 'medium' | 'low'
}

const PROPOSAL_SYSTEM_PROMPT = `אתה מנהל אסטרטגיה בכיר בסוכנות שיווק משפיענים מובילה. תפקידך לכתוב הצעות מחיר מקצועיות ומשכנעות.

## עקרונות הכתיבה שלך:
1. **עומק ותוכן** - כל פסקה צריכה להיות משמעותית ומלאה במידע
2. **טון מותאם** - התאם את הטון לאופי המותג (מהמחקר)
3. **ללא סופרלטיבים ריקים** - אל תכתוב "הכי טוב" או "מוביל" ללא ביסוס
4. **ספציפיות** - מספרים, עובדות, תובנות קונקרטיות
5. **זרימה נרטיבית** - ההצעה צריכה לספר סיפור הגיוני
6. **ביטחון שקט** - מוכר בביטחון, לא בלחץ

## מבנה התוכן:
- כל מטרה עם הסבר למה היא רלוונטית
- תיאור מותג עשיר ומפורט (3-5 פסקאות)
- אסטרטגיית פעילות עם "רעיון גדול"
- תוצרים עם הסבר למה כל אחד חשוב
- מספרים עם הסבר לוגי

## סעיפים אופציונליים (הוסף אותם כשיש מספיק מידע):
1. **אסטרטגיה כ-flow chart** - אם יש לך מספיק מידע, צור שלבי אסטרטגיה (3-5 שלבים) כ-flow chart בשדה strategyFlow. כל שלב עם label קצר ו-description ברור.
2. **כיווני קריאייטיב** - צור 2-3 כיווני קריאייטיב עם כותרת ותיאור לכל אחד בשדה creativeSlides. ציין את סוג הקונספט (וידאו, סטוריז, פוסט וכו').
3. **פירוט כמויות** - חשב כמויות תוצרים: מספר משפיענים × כמות לכל אחד × חודשים בשדה quantitiesSummary. כלול נוסחה ברורה.

## כלל זהב:
הלקוח צריך לקרוא את ההצעה ולהגיד "וואו, הם באמת מבינים אותי".

## פורמט פלט:
תמיד תחזיר JSON תקין בלבד, ללא טקסט נוסף מחוץ ל-JSON.`

// JSON Schema for structured output
const proposalSchema = {
  type: 'object',
  properties: {
    campaignName: { type: 'string', description: 'שם הקמפיין - קצר וקליט' },
    campaignSubtitle: { type: 'string', description: 'תת-כותרת שמסבירה את הכיוון' },
    // NEW: Brief - Why are they coming to us?
    brandBrief: { type: 'string', description: 'משפט אחד - מהו האתגר או הצורך שהביא את הלקוח אלינו' },
    brandPainPoints: { 
      type: 'array', 
      items: { type: 'string' },
      description: '2-3 נקודות כאב קצרות - מה כואב להם?'
    },
    brandObjective: { type: 'string', description: 'מה הם רוצים להשיג - משפט אחד' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'הסבר קצר - מקסימום 80 תווים!' }
        },
        required: ['title', 'description'],
        additionalProperties: false
      }
    },
    targetAudience: {
      type: 'object',
      properties: {
        primary: {
          type: 'object',
          properties: {
            gender: { type: 'string' },
            ageRange: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['gender', 'ageRange', 'description'],
          additionalProperties: false
        },
        behavior: { type: 'string' },
        insights: { type: 'array', items: { type: 'string' } }
      },
      required: ['primary', 'behavior', 'insights'],
      additionalProperties: false
    },
    // NEW: Key Insight
    keyInsight: { type: 'string', description: 'התובנה המרכזית שמניעה את הקמפיין - משפט אחד חזק' },
    insightSource: { type: 'string', description: 'מקור התובנה - לדוגמה: מחקר שוק, ניתוח מתחרים' },
    // NEW: Strategy
    strategyHeadline: { type: 'string', description: 'משפט אחד שמסכם את האסטרטגיה' },
    strategyPillars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['title', 'description'],
        additionalProperties: false
      },
      description: '2-3 עמודי תווך של האסטרטגיה'
    },
    brandDescription: { type: 'string', description: '3-5 פסקאות מפורטות' },
    brandHighlights: { type: 'array', items: { type: 'string' } },
    brandOpportunity: { type: 'string' },
    activityTitle: { type: 'string' },
    activityConcept: { type: 'string' },
    activityDescription: { type: 'string' },
    activityApproach: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['title', 'description'],
        additionalProperties: false
      }
    },
    activityDifferentiator: { type: 'string' },
    deliverables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          quantity: { type: 'number' },
          description: { type: 'string' },
          purpose: { type: 'string' }
        },
        required: ['type', 'quantity', 'description', 'purpose'],
        additionalProperties: false
      }
    },
    deliverablesSummary: { type: 'string' },
    metrics: {
      type: 'object',
      properties: {
        budget: { type: 'number' },
        currency: { type: 'string' },
        potentialReach: { type: 'number' },
        potentialEngagement: { type: 'number' },
        cpe: { type: 'number' },
        cpm: { type: 'number' },
        estimatedImpressions: { type: 'number' }
      },
      required: ['budget', 'currency', 'potentialReach', 'potentialEngagement', 'cpe', 'cpm', 'estimatedImpressions'],
      additionalProperties: false
    },
    metricsExplanation: { type: 'string' },
    influencerStrategy: { type: 'string' },
    influencerCriteria: { type: 'array', items: { type: 'string' } },
    contentGuidelines: { type: 'array', items: { type: 'string' } },
    closingStatement: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } },
    // NEW: Strategy Flow (wizard flow - optional)
    strategyFlow: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'שם השלב - קצר וברור' },
              description: { type: 'string', description: 'הסבר קצר על השלב' }
            },
            required: ['label', 'description'],
            additionalProperties: false
          }
        }
      },
      required: ['steps'],
      additionalProperties: false,
      description: 'שלבי אסטרטגיה כ-flow chart - 3-5 שלבים'
    },
    // NEW: Creative Slides (wizard flow - optional)
    creativeSlides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'כותרת כיוון הקריאייטיב' },
          description: { type: 'string', description: 'תיאור מפורט של כיוון הקריאייטיב' },
          conceptType: { type: 'string', description: 'סוג הקונספט - לדוגמה: וידאו, סטוריז, פוסט' }
        },
        required: ['title', 'description'],
        additionalProperties: false
      },
      description: '2-3 כיווני קריאייטיב עם כותרת ותיאור'
    },
    // NEW: Quantities Summary (wizard flow - optional)
    quantitiesSummary: {
      type: 'object',
      properties: {
        influencerCount: { type: 'number', description: 'מספר המשפיענים' },
        contentTypes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'סוג התוכן - רילז, סטוריז, פוסט וכו' },
              quantityPerInfluencer: { type: 'number', description: 'כמות לכל משפיען' },
              totalQuantity: { type: 'number', description: 'כמות כוללת' }
            },
            required: ['type', 'quantityPerInfluencer', 'totalQuantity'],
            additionalProperties: false
          }
        },
        campaignDurationMonths: { type: 'number', description: 'משך הקמפיין בחודשים' },
        totalDeliverables: { type: 'number', description: 'סך כל התוצרים' },
        formula: { type: 'string', description: 'נוסחת החישוב - לדוגמה: 5 משפיענים × 3 רילז × 2 חודשים = 30' }
      },
      required: ['influencerCount', 'contentTypes', 'campaignDurationMonths', 'totalDeliverables'],
      additionalProperties: false,
      description: 'פירוט כמויות תוצרים'
    },
    toneUsed: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  },
  required: [
    'campaignName', 'campaignSubtitle', 
    // NEW fields
    'brandBrief', 'brandPainPoints', 'brandObjective', 'keyInsight', 'insightSource',
    'strategyHeadline', 'strategyPillars',
    // Existing fields
    'goals', 'targetAudience', 'brandDescription',
    'brandHighlights', 'brandOpportunity', 'activityTitle', 'activityConcept',
    'activityDescription', 'activityApproach', 'activityDifferentiator', 'deliverables',
    'deliverablesSummary', 'metrics', 'metricsExplanation', 'influencerStrategy',
    'influencerCriteria', 'contentGuidelines', 'closingStatement', 'nextSteps', 'toneUsed', 'confidence'
  ],
  additionalProperties: false
}

/**
 * Generate comprehensive proposal content using GPT-5 Responses API
 */
export async function generateProposalContent(
  brandResearch: BrandResearch,
  userInputs: {
    budget: number
    currency?: string
    goals?: string[]
  },
  brandColors?: BrandColors
): Promise<ProposalContent> {
  console.log(`[GPT-5 Responses] Generating rich proposal for: ${brandResearch.brandName}`)
  
  const userPrompt = `
## מחקר מותג מפורט:
${JSON.stringify(brandResearch, null, 2)}

## קלט מהלקוח:
- תקציב: ${userInputs.budget.toLocaleString()} ${userInputs.currency || '₪'}
- מטרות שנבחרו: ${userInputs.goals?.join(', ') || 'מודעות, חשיפה'}

## צבעי המותג:
${brandColors ? JSON.stringify(brandColors, null, 2) : 'לא זוהו'}

---

כתוב תוכן מלא ועשיר להצעת המחיר. 
**חשוב: כתוב פסקאות מלאות, לא רק נקודות. התוכן צריך להיות משכנע ומקצועי.**

## הנחיות קריטיות:
1. brandDescription חייב להיות לפחות 3 פסקאות מלאות
2. כל "description" חייב להיות לפחות 2 משפטים
3. התאם את הטון לאופי המותג
4. המספרים צריכים להיות הגיוניים ביחס לתקציב
5. CPE סביר: 1.5-5 ש"ח, CPM סביר: 10-30 ש"ח

## שדות אופציונליים (הוסף אם יש מספיק מידע):
6. strategyFlow - צור 3-5 שלבי אסטרטגיה עם label ו-description לכל שלב. לדוגמה: מחקר → תכנון → הפקה → הפצה → מדידה
7. creativeSlides - צור 2-3 כיווני קריאייטיב, כל אחד עם title, description, ו-conceptType (סוג התוכן)
8. quantitiesSummary - חשב כמויות על בסיס התקציב: כמה משפיענים, כמה תוצרים לכל אחד, כמה חודשים. כלול formula עם הנוסחה
`

  try {
    // Use Responses API with structured output
    const response = await openai.responses.create({
      model: MODEL,
      instructions: PROPOSAL_SYSTEM_PROMPT,
      input: userPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'proposal_content',
          strict: true,
          schema: proposalSchema
        }
      }
    })

    const content = JSON.parse(response.output_text) as ProposalContent
    console.log(`[GPT-5 Responses] Success - tone: ${content.toneUsed}`)
    return content
  } catch (error) {
    console.error('[GPT-5.2 Responses] Error:', error)
    console.log('[GPT-5.2] Falling back to default content')
    return getDefaultContent(brandResearch, userInputs)
  }
}

/**
 * Generate just the brand description (for quick edits)
 */
export async function generateBrandDescription(
  brandResearch: BrandResearch
): Promise<string> {
  const prompt = `
כתוב תיאור מקצועי ועשיר על המותג "${brandResearch.brandName}".

מידע על המותג:
${JSON.stringify(brandResearch, null, 2)}

הנחיות:
- כתוב 3-5 פסקאות מלאות
- כלול: מה המותג עושה, ההיסטוריה, מה מייחד אותו, הערכים
- כתוב בטון ${brandResearch.toneOfVoice || 'מקצועי'}
- ללא סופרלטיבים ריקים
- התוכן צריך להרגיש כמו סיפור, לא רשימת עובדות
`

  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: prompt,
    })

    return response.output_text?.trim() || ''
  } catch (error) {
    console.error('[GPT] Brand description error:', error)
    return brandResearch.companyDescription || `${brandResearch.brandName} הוא מותג ${brandResearch.industry} הפועל בישראל.`
  }
}

/**
 * Generate activity description
 */
export async function generateActivityDescription(
  brandResearch: BrandResearch,
  goals: string[]
): Promise<{ title: string; concept: string; description: string; approaches: { title: string; description: string }[] }> {
  const prompt = `
כתוב תיאור פעילות שיווקית עם משפיענים עבור "${brandResearch.brandName}".

מטרות: ${goals.join(', ')}
קהל יעד: ${JSON.stringify(brandResearch.targetDemographics)}
טון: ${brandResearch.toneOfVoice}
תובנות מהמחקר: ${brandResearch.suggestedApproach}

החזר JSON בלבד:
{
  "title": "כותרת הפעילות - הרעיון הגדול",
  "concept": "2-3 משפטים שמסבירים את הרעיון",
  "description": "פסקה מפורטת על הפעילות",
  "approaches": [
    { "title": "גישה 1", "description": "הסבר" },
    { "title": "גישה 2", "description": "הסבר" },
    { "title": "גישה 3", "description": "הסבר" }
  ]
}
`

  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'activity_description',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              concept: { type: 'string' },
              description: { type: 'string' },
              approaches: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['title', 'description'],
                  additionalProperties: false
                }
              }
            },
            required: ['title', 'concept', 'description', 'approaches'],
            additionalProperties: false
          }
        }
      }
    })

    return JSON.parse(response.output_text)
  } catch (error) {
    console.error('[GPT] Activity description error:', error)
    return {
      title: 'פעילות משפיענים',
      concept: 'שיתוף פעולה עם משפיענים להגברת המודעות למותג',
      description: 'משפיענים יציגו את המותג בסיטואציות אותנטיות, תוך דגש על חוויית שימוש אמיתית ותוכן טבעי.',
      approaches: [
        { title: 'תוכן אותנטי', description: 'משפיענים יציגו את המוצר בשגרה האמיתית שלהם' },
        { title: 'סיפור אישי', description: 'כל משפיען יספר את החוויה האישית שלו עם המותג' },
        { title: 'קריאה לפעולה', description: 'תוכן שמעודד אינטראקציה ומעורבות' }
      ]
    }
  }
}

/**
 * Default content fallback
 */
function getDefaultContent(
  brandResearch: BrandResearch,
  userInputs: { budget: number; goals?: string[]; currency?: string }
): ProposalContent {
  const cpe = 2.5
  const engagement = Math.round(userInputs.budget / cpe)
  const reach = engagement * 3
  
  return {
    campaignName: `קמפיין ${brandResearch.brandName}`,
    campaignSubtitle: 'שיתוף פעולה עם משפיענים',
    
    goals: (userInputs.goals || ['מודעות', 'חשיפה']).map(g => ({
      title: g,
      description: `השגת ${g} באמצעות תוכן אותנטי ומשכנע`
    })),
    
    targetAudience: {
      primary: {
        gender: brandResearch.targetDemographics?.primaryAudience?.gender || 'נשים וגברים',
        ageRange: brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45',
        description: 'קהל יעד מגוון המתעניין במוצרי המותג',
      },
      behavior: brandResearch.targetDemographics?.behavior || 'צרכנים פעילים ברשתות החברתיות',
      insights: ['מושפעים מתוכן אותנטי', 'מחפשים המלצות אמיתיות'],
    },
    
    brandDescription: brandResearch.companyDescription || `${brandResearch.brandName} הוא מותג ${brandResearch.industry} הפועל בישראל.`,
    brandHighlights: brandResearch.uniqueSellingPoints || [],
    brandOpportunity: 'שיווק משפיענים יאפשר למותג להגיע לקהלים חדשים בצורה אותנטית',
    
    activityTitle: 'פעילות משפיענים',
    activityConcept: 'שיתוף פעולה עם משפיענים להגברת המודעות למותג',
    activityDescription: 'משפיענים יציגו את המותג בסיטואציות אותנטיות',
    activityApproach: [
      { title: 'תוכן אותנטי', description: 'הצגת המוצר בשגרה אמיתית' },
      { title: 'סיפור אישי', description: 'שיתוף חוויה אישית' },
    ],
    activityDifferentiator: 'דגש על אותנטיות ותוכן איכותי',
    
    deliverables: [
      { type: 'רילים', quantity: 4, description: 'תוכן וידאו קצר', purpose: 'חשיפה גבוהה' },
      { type: 'סטוריז', quantity: 12, description: 'תוכן אותנטי', purpose: 'מעורבות' },
    ],
    deliverablesSummary: 'חבילה מאוזנת של תוכן',
    
    metrics: {
      budget: userInputs.budget,
      currency: userInputs.currency || '₪',
      potentialReach: reach,
      potentialEngagement: engagement,
      cpe,
      cpm: 15,
    },
    metricsExplanation: 'המספרים מבוססים על ביצועים ממוצעים בתעשייה',
    
    influencerStrategy: 'בחירת משפיענים רלוונטיים לקהל היעד',
    influencerCriteria: ['התאמה לקהל', 'איכות תוכן', 'אותנטיות'],
    contentGuidelines: ['תוכן טבעי', 'שיתוף חוויה אישית'],
    
    closingStatement: "LET'S GET STARTED",
    nextSteps: ['אישור הצעה', 'בחירת משפיענים', 'תחילת עבודה'],

    // New wizard flow fields (defaults)
    strategyFlow: {
      steps: [
        { label: 'מחקר', description: 'ניתוח המותג, הקהל והמתחרים' },
        { label: 'תכנון', description: 'בחירת משפיענים והגדרת כיווני תוכן' },
        { label: 'הפקה', description: 'יצירת תוכן בשיתוף המשפיענים' },
        { label: 'הפצה', description: 'פרסום התוכן בפלטפורמות הנבחרות' },
        { label: 'מדידה', description: 'ניתוח תוצאות ואופטימיזציה' },
      ]
    },
    creativeSlides: [
      { title: 'תוכן אותנטי יומיומי', description: 'משפיענים משלבים את המוצר בשגרה האמיתית שלהם, בצורה טבעית ולא מאולצת', conceptType: 'סטוריז + רילז' },
      { title: 'סיפור חוויה אישית', description: 'כל משפיען מספר את הסיפור האישי שלו עם המותג - למה הוא בחר, מה השתנה', conceptType: 'רילז' },
      { title: 'אתגר קהילתי', description: 'יצירת אתגר או טרנד שמעודד את העוקבים להשתתף וליצור תוכן משלהם', conceptType: 'רילז + פוסט' },
    ],
    quantitiesSummary: {
      influencerCount: 4,
      contentTypes: [
        { type: 'רילז', quantityPerInfluencer: 2, totalQuantity: 8 },
        { type: 'סטוריז', quantityPerInfluencer: 3, totalQuantity: 12 },
      ],
      campaignDurationMonths: 1,
      totalDeliverables: 20,
      formula: '4 משפיענים × (2 רילז + 3 סטוריז) × 1 חודש = 20 תוצרים',
    },

    toneUsed: brandResearch.toneOfVoice || 'מקצועי',
    confidence: 'low',
  }
}
