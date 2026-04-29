/**
 * Gamma-model prototype — structured slide generation.
 *
 * Gemini picks a layout archetype per slide and fills typed slots.
 * The renderer owns all styling (CSS arsenal) — no free HTML from model.
 *
 * Output: StructuredPresentation { brandName, designSystem, slides[] }
 */

import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type {
  StructuredPresentation,
  StructuredSlide,
  DesignSystem,
  LayoutId,
} from './types'

// ─── JSON schema for Gemini structured output ─────────────

const DESIGN_SYSTEM_SCHEMA = {
  type: 'object',
  properties: {
    colors: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        background: { type: 'string' },
        text: { type: 'string' },
        muted: { type: 'string' },
        cardBg: { type: 'string' },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'muted', 'cardBg'],
    },
    fonts: {
      type: 'object',
      properties: {
        heading: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['heading', 'body'],
    },
    creativeDirection: {
      type: 'object',
      properties: {
        visualMetaphor: { type: 'string' },
        oneRule: { type: 'string' },
      },
    },
  },
  required: ['colors', 'fonts'],
}

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    slideType: { type: 'string' },
    layout: {
      type: 'string',
      enum: [
        'hero-cover',
        'full-bleed-image-text',
        'split-image-text',
        'centered-insight',
        'three-pillars-grid',
        'numbered-stats',
        'influencer-grid',
        'closing-cta',
      ],
    },
    slots: { type: 'object' },
  },
  required: ['slideType', 'layout', 'slots'],
}

const PRESENTATION_SCHEMA = {
  type: 'object',
  properties: {
    brandName: { type: 'string' },
    designSystem: DESIGN_SYSTEM_SCHEMA,
    slides: { type: 'array', items: SLIDE_SCHEMA },
  },
  required: ['brandName', 'designSystem', 'slides'],
}

// ─── Prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `את/ה איש/אשת פרסום, שיווק, קריאייטיב ואסטרטגיה בכיר/ה שמתמחה בפעילות תוכן דיגיטלית ומהלכי סושיאל.
את/ה מפצח/ת בריפים שיווקיים דרך מבנה קבוע של מצגת קריאייטיב — לסוכנות Leaders AI שמציעה שיתופי פעולה עם משפיענים.
הפלט: מצגת עברית RTL, 1920×1080, כ-StructuredPresentation JSON. אסור HTML.

## 7 שלבים קבועים של פיצוח בריף — כל מצגת חייבת לכלול אותם בסדר הזה:

1. **על המותג** — מי הם, מה הם מוכרים, מה ה-value proposition. נתונים עסקיים אם יש.
2. **מטרות** — מטרות עסקיות/שיווקיות ספציפיות ומדידות. KPI אם אפשר.
3. **קהלי יעד** — פרסונה חדה: דמוגרפיה + פסיכוגרפיה + מה מניע אותם.
4. **תובנה מבוססת מחקר** — לא דעה. נתון/סטטיסטיקה/מחקר עם ציון מקור מפורש (Nielsen / eMarketer / Ipsos / YouGov / MOA / סטודיו דאטה-מקומי וכו'). חובה source.
5. **אסטרטגיה** — עומק: קו פעולה מנומק, למה זה יעבוד, אילו מנופים (behavioral / cultural / category shift). יכול להתפרש על 2-3 שקפים.
6. **קריאייטיב** — מפותח ומפורט: תיאור מהלך, נראות, סיפור מרכזי, ערוצים. כולל רפרנסים לקמפיינים מהעולם ("Dove Real Beauty 2004", "Spotify Wrapped", "Nike Dream Crazy" וכו').
7. **תוצרים** — deliverables מוחשיים: מספר רילסים/סטוריז, הפקות, משפיענים, timeline, תקציב אם מוצהר.

## כללי איכות:

- חדות, מקצועיות, רהיטות. לא חוזר/ת על עצמך. לא מבזבז/ת מילים.
- ערך אמיתי בכל שקף — לא מילוי.
- תובנות תמיד עם source מפורש ב-slot "source" (לא להמציא מחקרים).
- קריאייטיב כולל רפרנס לקמפיין-עולם ב-body/bodyText.
- גם אם חסר מידע — משלים/מציע כיוונים רלוונטיים ולא משאיר ריק.

## מבנה — 14 שקפי ליבה חובה תמיד, עד 4 אופציונליים לפי עושר הבריף.

### 14 שקפי הליבה (חובה, בסדר הזה):

1. **cover** → layout: \`hero-cover\` — פתיחה. רק brandName + title + subtitle/tagline. אין body.
2. **brief** → layout: \`full-bleed-image-text\` — האתגר/הבעיה (לא סיפור המותג!). למה הלקוח פנה אלינו? slot body = 2-3 משפטים על הבעיה.
3. **goals** → layout: \`three-pillars-grid\` — 3 מטרות מדידות. כל pillar = number + title + description קצר.
4. **audience** → layout: \`split-image-text\` — פרסונה חדה. bullets = 3-5 מאפיינים מניעים.
5. **insight** → layout: \`centered-insight\` — **חייב dataPoint + dataLabel + source אמיתי** (Nielsen / eMarketer / Ipsos / YouGov / MOA / לא להמציא).
6. **strategy** → layout: \`three-pillars-grid\` — title = headline אסטרטגי קונקרטי, pillars = 3 עמודי פעולה. כל pillar עם תיאור 1-משפט שמחבר לתוצר ספציפי. **לא "באוויר".**
7. **bigIdea** → layout: \`full-bleed-image-text\` — שם הקמפיין + קונספט. **חובה רפרנס-עולם בbody** ("Spotify Wrapped 2023 — אישי, חוגג את המשתמש, viral").
8. **deliverables** → layout: \`three-pillars-grid\` או \`numbered-stats\` — תוצרים מוחשיים: סוגי תוכן + כמויות. דוגמה: pillars [{number:"24", title:"רילסים", description:"6 משפיענים × 4 רילסים"}, ...].
9. **influencers** → layout: \`influencer-grid\` — לפחות 4 משפיענים מהמחקר. **חובה profilePicUrl** מהקלט אם קיים.
10. **metrics** → layout: \`numbered-stats\` — **חייב לכלול CPE עם בנצ'מארק התעשייה מהבלוק \`<industry_benchmark>\`**. דוגמה stats: [{value:"₪3.20", label:"יעד CPE — אגרסיבי מול ממוצע התעשייה"}, {value:"1.5M", label:"reach"}, {value:"3.2%", label:"ER"}]. ה-CPE שתבחר חייב להיות נמוך מ-cpe.high של התעשייה ואידיאלית קרוב ל-cpe.mid או נמוך ממנו.
11. **caseStudies** → layout: \`numbered-stats\` או \`split-image-text\` — **בחר 1-2 case studies מהבלוק \`<leaders_case_studies>\` בלבד**. אסור להמציא. אם הבלוק ריק — ב-numbered-stats כתוב stat אחד "150+" עם label "קמפיינים מאז 2020" ועוד 2 stats מצטברים. **לעולם אל תכתוב מותג שלא קיים בבלוק.**
12. **risks** → layout: \`three-pillars-grid\` — 2-3 סיכונים ריאליים + תגובה לכל אחד. דוגמה: pillars [{number:"01", title:"השקה ברגע מתגעש", description:"דחייה של 48 שעות אם יש משבר תקשורתי"}, ...].
13. **nextSteps** → layout: \`three-pillars-grid\` או \`numbered-stats\` — 3-4 פעולות עם תאריכים. דוגמה: stats [{value:"15.05", label:"kickoff"}, {value:"01.06", label:"השקה"}, {value:"30.06", label:"דוח ביצועים"}].
14. **closing** → layout: \`closing-cta\` — title="בואו נתחיל" או דומה, tagline="Leaders × ${'\\${brandName}'}".

### שקפים אופציונליים — תוסף רק אם הדאטה תומך:

- **competitiveAnalysis** (full-bleed-image-text או three-pillars-grid) — **חובה אם יש competitors ב-research**. מיקום: אחרי brief, לפני goals.
- **mediaMix** (numbered-stats) — פילוח ערוצים %. רק אם הדאטה כוללת platform breakdown.
- **timeline** (three-pillars-grid) — 3 phases של הקמפיין. רק אם יש לוח זמנים מוגדר.
- **moodBoard** (split-image-text) — לוח השראה ויזואלי. רק אם יש תמונות client אותנטיות.

### החלטה כמה שקפים — תלוי בעושר הבריף:

- **בריף דק** (פסקה אחת, ללא מתחרים, ללא timeline, ללא platform mix): 14 שקפי הליבה.
- **בריף בינוני** (יש מתחרים *או* פלטפורמות *או* timeline): 15-16.
- **בריף עשיר** (מתחרים + פלטפורמות + timeline + תמונות client אותנטיות + ניחוח חזק): 17-18.

**אסור למתוח שקף ריק כדי להגיע למספר.** אם אין מה לכתוב על timeline — דלג, גם אם יוצא 14.

סדר עדיפויות להוספה: (1) competitiveAnalysis אם יש מתחרים, (2) mediaMix, (3) timeline, (4) moodBoard.

חובה תמיד: insight **עם source אמיתי**, bigIdea **עם רפרנס-עולם**, caseStudies **רק מהבלוק \`<leaders_case_studies>\`**, metrics **עם בנצ'מארק תעשייה**.

## עקרונות תמונות — חובה לפני בחירת layout/slot:

1. **תמונות אמיתיות של המותג קודם.** אם יש לך URL בבלוק \`<scraped_assets>\` (productImages / heroImages / lifestyleImages) — חובה להעדיף אותו על תמונה מ-\`<generated_images>\`. שקפים שמדברים על **תוצרים, big idea, מוצרים, שימוש אמיתי** — תמיד תמונה סקרייפ אמיתית, לא AI.
2. **חלוקת התמונות:**
   - **bigIdea**: תמונת hero/lifestyle אמיתית (sneaker אמיתי, משחה אמיתית, מוצר ספציפי). לא AI גנרי.
   - **deliverables**: אם יש 1+ productImages — השתמש ב-split-image-text עם תמונה אמיתית של מוצר; אחרת three-pillars-grid עם sideImage של productImage.
   - **brief**: תמונת hero/lifestyle אמיתית של המותג, או fallback ל-brand AI.
   - **audience**: תמונה אמיתית של הקהל בשטח (lifestyleImages) אם קיימת; אחרת AI audience.
   - **caseStudies**: אם יש caseStudy עם hero_image בבלוק <leaders_case_studies> — שקול split-image-text עם התמונה האמיתית. אחרת numbered-stats עם backgroundImage של productImage.
   - **closing**: תמונת cover או hero אמיתית.
   - **goals/strategy/risks (three-pillars-grid)**: כששיש lifestyle/product image רלוונטית — חובה לשים אותה ב-sideImage. שקף ללא תמונה כשיש תמונה זמינה זה כשל.
   - **metrics/nextSteps (numbered-stats)**: כששיש lifestyle/hero image רלוונטית — שים אותה ב-backgroundImage. הסטטיסטיקה תישאר ברורה אבל יהיה הקשר ויזואלי.
3. **לעולם אל תכניס** placeholder/empty-cart/loading/favicon כתמונה. אם הפיד מציע משהו כזה — דלג ועבור לתמונה הבאה.
4. **לוגו של המותג** (brandLogoUrl) ירונדר אוטומטית בכל שקף — אסור לך לעשות slot ללוגו ידנית.
5. **כשאין תמונת מוצר אמיתית של המותג ב-<scraped_assets> והמשתמש מצפה לראות את המוצר** (bigIdea/deliverables של מוצר פיזי כמו משחה/נעל/בקבוק):
   - **עדיף לבחור layout טקסטואלי** (centered-insight או full-bleed-image-text עם תמונת brand AI ועם הלוגו המוטמע) — מאשר להציג תמונת AI כללית של מוצר כללי בלי הלוגו של המותג.
   - אסור להציג "משחה גנרית" כשהמותג הוא Bepanthen — או יש לך משחה אמיתית של Bepanthen מ-scraped_assets, או שתעבור ל-layout שמדגיש את הקופי במקום את "המוצר" המומצא.

## עקרון מגוון לייאאוט (חובה — אסור שמצגת תיראה משעממת):

**מקסימום 2 שקפים מאותו layout.** אם הגעת ל-2 פעמים של three-pillars-grid או numbered-stats — בחר layout אחר לפעם הבאה.

**מיפוי מומלץ (ניתן לסטות אבל מפזר את המגוון):**
- cover → hero-cover
- brief → full-bleed-image-text (תמונה אמיתית גדולה)
- competitiveAnalysis → split-image-text (לוגואי מתחרים מימין, יתרון שלנו משמאל)
- goals → three-pillars-grid או numbered-stats (מגוון!)
- audience → split-image-text
- insight → centered-insight
- strategy → three-pillars-grid (3 pillars)
- bigIdea → full-bleed-image-text **עם תמונה אמיתית** או centered-insight אם יש משפט מנצח
- deliverables → split-image-text **אם יש productImages אמיתיות** אחרת three-pillars-grid או numbered-stats
- influencers → influencer-grid
- metrics → numbered-stats
- caseStudies → split-image-text (אם יש hero_image) או numbered-stats
- risks → split-image-text (אם יש lifestyleImage רלוונטי) או three-pillars-grid
- nextSteps → numbered-stats (תאריכים) או three-pillars-grid
- closing → closing-cta

**התוצאה:** מצגת של 14-18 שקפים צריכה לכלול **לפחות 6 layouts שונים מתוך 8**. אם בדיקה מראה שכל ה-deliverables/risks/nextSteps זהים — אתה כושל. תפזר.

## 8 ארכיטיפים של פריסה — בחר/י אחד לכל שקף:

1. **hero-cover** — שקף פתיחה: כותרת ענקית + רקע תמונה/גרדיאנט
   slots: { brandName, title, subtitle?, tagline?, backgroundImage?, eyebrowLabel? }

2. **full-bleed-image-text** — תמונה ממלאת + טקסט על גבי אוברליי
   slots: { image, eyebrowLabel?, title, subtitle?, body? }

3. **split-image-text** — 60/40: תמונה בצד אחד, טקסט בשני
   slots: { image, imageSide: 'left'|'right', eyebrowLabel?, title, bodyText?, bullets? }

4. **centered-insight** — תובנה גדולה במרכז + נתון סטטיסטי
   slots: { eyebrowLabel?, title, dataPoint?, dataLabel?, source? }

5. **three-pillars-grid** — 3 עמודות שוות (מטרות/אסטרטגיה/ערכים)
   slots: { eyebrowLabel?, title, pillars: [{number, title, description}×3], **sideImage?** }
   הערה: כששיש תמונת מותג אמיתית רלוונטית — חובה למלא sideImage. הוא יהפוך את השקף ל-band 30% משמאל עם תמונה אמיתית + 60% עמודות מימין. שקף text-only הוא אובדן.

6. **numbered-stats** — נתונים גדולים בולטים (יעדי KPI, מטריקות)
   slots: { eyebrowLabel?, title, stats: [{value, label, accent?}], **backgroundImage?** }
   הערה: כששיש תמונה רלוונטית — חובה למלא backgroundImage. היא תרונדר ברקע מטושטש (28% opacity) מאחורי הסטטיסטיקות. הסטטיסטיקה בולטת אבל יש הקשר ויזואלי.

7. **influencer-grid** — גריד משפיענים עם פרופיל
   slots: { eyebrowLabel?, title, subtitle?, influencers: [{name, handle, followers, engagement, profilePicUrl?, isVerified?}] }

8. **closing-cta** — שקף סיום עם CTA
   slots: { brandName, title, tagline?, backgroundImage? }

## DesignSystem — חובה:

- colors.background — כהה (bg כהה מרגיש פרימיום). לדוגמה: #0C0C10, #0A0B14.
- colors.primary / accent — מתוך זהות המותג (אם יש).
- colors.text — בהיר (#F5F5F7).
- fonts.heading / body — שניהם 'Heebo' אלא אם יש כוונה אחרת.
- creativeDirection.visualMetaphor — רעיון מרכזי במשפט (לא חובה).
- creativeDirection.oneRule — כלל אחד שמתווה את כל ההחלטות (לא חובה).

## כללי תוכן:

- כל הטקסטים בעברית, קצרים וחדים. לא מילולי, לא buzzwords ריקים.
- eyebrowLabel: תווית קטנה באנגלית או מספר ("01 // BRAND", "STRATEGIC SHIFT", "INSIGHT").
- title: כותרת ראשית, 3-8 מילים. חדה, ממוקדת.
- subtitle/body: 1-3 משפטים מקסימום. כל משפט נושא ערך.
- bullets: 3-5 פריטים לכל היותר — action-oriented.
- stats.value: מספר + יחידה ("1.5M", "₪150K", "3.2%").
- influencers: לפחות 4 אם קיימים במחקר. **חובה**: אם הקלט כולל "pic: URL" למשפיען — חובה להעתיק אותו לשדה profilePicUrl של אותו משפיען בשקף.
- **insight**: dataPoint = נתון ספציפי (לא "רוב הצעירים" אלא "73%"), dataLabel = ההקשר, **source = מקור אמיתי ומפורש**.
- **creative**: כלול רפרנס ספציפי לקמפיין מהעולם ב-body (שם קמפיין + שנה + מהלך בשורה).

## פורמט פלט — JSON בדיוק כך:

\`\`\`json
{
  "brandName": "...",
  "designSystem": {
    "colors": { "primary": "#...", "secondary": "#...", "accent": "#...", "background": "#0C0C10", "text": "#F5F5F7", "muted": "#8B8D98", "cardBg": "rgba(255,255,255,0.04)" },
    "fonts": { "heading": "Heebo", "body": "Heebo" },
    "creativeDirection": { "visualMetaphor": "...", "oneRule": "..." }
  },
  "slides": [
    { "slideType": "cover", "layout": "hero-cover", "slots": { "brandName": "...", "title": "...", "subtitle": "...", "tagline": "...", "eyebrowLabel": "01" } },
    { "slideType": "brief", "layout": "full-bleed-image-text", "slots": { "image": "https://...", "eyebrowLabel": "BRIEF // 02", "title": "...", "subtitle": "...", "body": "..." } },
    { "slideType": "audience", "layout": "split-image-text", "slots": { "image": "https://...", "imageSide": "left", "eyebrowLabel": "AUDIENCE", "title": "...", "bodyText": "...", "bullets": ["...", "..."] } },
    { "slideType": "insight", "layout": "centered-insight", "slots": { "eyebrowLabel": "INSIGHT // 04", "title": "...", "dataPoint": "73%", "dataLabel": "...", "source": "Nielsen Trust in Advertising 2023" } },
    { "slideType": "goals", "layout": "three-pillars-grid", "slots": { "eyebrowLabel": "GOALS", "title": "...", "pillars": [{"number":"01","title":"...","description":"..."},{"number":"02","title":"...","description":"..."},{"number":"03","title":"...","description":"..."}] } },
    { "slideType": "stats", "layout": "numbered-stats", "slots": { "eyebrowLabel": "KPI", "title": "...", "stats": [{"value":"1.5M","label":"..."},{"value":"₪150K","label":"..."},{"value":"3.2%","label":"..."}] } },
    { "slideType": "influencers", "layout": "influencer-grid", "slots": { "eyebrowLabel": "TALENT", "title": "...", "influencers": [{"name":"...","handle":"...","followers":"250K","engagement":"3.5%","profilePicUrl":"https://...","isVerified":true}] } },
    { "slideType": "closing", "layout": "closing-cta", "slots": { "brandName":"...", "title":"בואו נתחיל", "tagline":"Leaders × ..." } }
  ]
}
\`\`\`

חובה: כל slot חייב להכיל את כל השדות שלו. אסור slots ריקים. החזר JSON בלבד.`

// ─── Main entry ───────────────────────────────────────────

export interface GenerateStructuredInput {
  brandName: string
  brief: string
  research?: string
  influencers?: Array<{
    name: string
    handle: string
    followers: string
    engagement: string
    profilePicUrl?: string
    isVerified?: boolean
  }>
  brandColors?: { primary?: string; secondary?: string; accent?: string }
  images?: { cover?: string; brand?: string; audience?: string; activity?: string }
  /** Industry slug or Hebrew label — used to look up CPE / ER benchmarks for the metrics slide. */
  industry?: string
  /** Brand voice — used so the deck doesn't sound like generic AI copy. */
  brandVoice?: {
    personality?: string
    toneSpectrum?: string
    languageStyle?: string
    avoid?: string
  }
  /** True if research surfaced competitors — drives the optional competitiveAnalysis slide. */
  hasCompetitors?: boolean
  /** True if research includes a platform breakdown — drives mediaMix. */
  hasPlatformMix?: boolean
  /** True if research/brief includes timeline phases — drives the timeline slide. */
  hasTimeline?: boolean
  /**
   * Authentic assets scraped from the brand's website. These are REAL product
   * photos / lifestyle shots / the brand's actual logo — must be preferred
   * over AI-generated imagery for any slot depicting real products.
   */
  scrapedAssets?: {
    brandLogoUrl?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  }
  /** Visual brand DNA extracted from research — drives renderer atmosphere. */
  visualDNA?: {
    decorativeStyle?:
      | 'minimal' | 'maximalist' | 'organic-soft'
      | 'geometric-strict' | 'retro' | 'brutalist'
    typographyMood?:
      | 'serif-editorial' | 'sans-tight' | 'sans-airy'
      | 'display-bold' | 'monospace-tech'
    recurringPattern?: {
      type: 'wave' | 'dots' | 'lines' | 'gradient' | 'grid' | 'none'
      description?: string
    }
    moodDescription?: string
  }
}

export async function generateStructuredPresentation(
  input: GenerateStructuredInput,
): Promise<StructuredPresentation> {
  const userPrompt = await buildUserPrompt(input)

  const result = await callAI({
    model: 'gemini-3-pro-preview',
    prompt: userPrompt,
    callerId: 'gamma-proto',
    maxOutputTokens: 32000,
    geminiConfig: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  })

  console.log('[gamma-proto] raw response length:', result.text.length, 'first 500 chars:', result.text.slice(0, 500))
  const parsed = parseGeminiJson<StructuredPresentation>(result.text)
  console.log('[gamma-proto] parsed slides:', parsed?.slides?.length, 'first slot keys:', Object.keys(parsed?.slides?.[0]?.slots || {}))
  const normalized = normalizePresentation(parsed, input)
  backfillInfluencerPics(normalized, input)
  return normalized
}

/** Even if Gemini drops profilePicUrl, match by handle/name from the input and inject. */
function backfillInfluencerPics(
  pres: StructuredPresentation,
  input: GenerateStructuredInput,
): void {
  if (!input.influencers?.length) return
  type InfluencerInput = NonNullable<GenerateStructuredInput['influencers']>[number]
  const byHandle = new Map<string, InfluencerInput>()
  const byName = new Map<string, InfluencerInput>()
  for (const inf of input.influencers) {
    if (inf.handle) byHandle.set(inf.handle.toLowerCase().replace(/^@/, ''), inf)
    if (inf.name) byName.set(inf.name.toLowerCase(), inf)
  }
  for (const slide of pres.slides) {
    if (slide.layout !== 'influencer-grid') continue
    const slots = slide.slots as { influencers?: Array<Record<string, unknown>> }
    if (!Array.isArray(slots.influencers)) continue
    for (const inf of slots.influencers) {
      if (inf.profilePicUrl) continue
      const handle = String(inf.handle || '').toLowerCase().replace(/^@/, '')
      const name = String(inf.name || '').toLowerCase()
      const match: InfluencerInput | undefined =
        (handle ? byHandle.get(handle) : undefined) || (name ? byName.get(name) : undefined)
      if (match?.profilePicUrl) {
        inf.profilePicUrl = match.profilePicUrl
        if (match.isVerified !== undefined) inf.isVerified = match.isVerified
      }
    }
  }
}

async function buildUserPrompt(input: GenerateStructuredInput): Promise<string> {
  const lines: string[] = []
  lines.push(`# מותג: ${input.brandName}`)
  lines.push(`\n## הבריף:\n${input.brief}`)

  if (input.research) {
    lines.push(`\n## מחקר:\n${input.research}`)
  }

  if (input.brandColors?.primary) {
    lines.push(`\n## צבעי מותג:`)
    lines.push(`- primary: ${input.brandColors.primary}`)
    if (input.brandColors.secondary) lines.push(`- secondary: ${input.brandColors.secondary}`)
    if (input.brandColors.accent) lines.push(`- accent: ${input.brandColors.accent}`)
  }

  // Brand voice — enforced verbatim. Same shape as slide-designer's <brand_voice> block.
  if (input.brandVoice && (input.brandVoice.personality || input.brandVoice.toneSpectrum)) {
    lines.push(`\n## <brand_voice>`)
    lines.push(`Personality: ${input.brandVoice.personality || 'unspecified'}`)
    lines.push(`Tone spectrum: ${input.brandVoice.toneSpectrum || 'professional'}`)
    lines.push(`Language style: ${input.brandVoice.languageStyle || 'standard Hebrew'}`)
    lines.push(`AVOID: ${input.brandVoice.avoid || 'corporate jargon, generic claims'}`)
    lines.push(`</brand_voice>`)
    lines.push(
      `**טון המותג הוא חוק.** כל שורת קופי חייבת להישמע כמו המותג מדבר, לא כמו AI כותב. אם יש AVOID list — אל תיגע באף מילה משם.`,
    )
  }

  // Industry CPE / ER benchmark — feeds the metrics slide
  const { lookupIndustryBenchmark, formatBenchmarkForPrompt } = await import('@/lib/benchmarks/industry')
  const benchmark = lookupIndustryBenchmark(input.industry)
  lines.push(`\n## <industry_benchmark>`)
  lines.push(formatBenchmarkForPrompt(benchmark))
  lines.push(`</industry_benchmark>`)
  lines.push(
    `בשקף metrics — קבע יעד CPE/ER ספציפי וציין את הבנצ'מארק התעשייתי. דוגמה: "יעד CPE ₪3.20 — ממוצע התעשייה ₪${benchmark.cpe.mid.toFixed(2)}". אסור להמציא מספרים שאין להם בסיס.`,
  )

  // Real Leaders case studies — feeds the caseStudies slide
  const { fetchRelevantCaseStudies, formatCaseStudiesForPrompt } = await import('@/lib/case-studies/fetch')
  const caseStudies = await fetchRelevantCaseStudies(benchmark.slug, 3)
  if (caseStudies.length > 0) {
    lines.push(`\n## <leaders_case_studies>`)
    lines.push(`קמפיינים אמיתיים מהארכיון של Leaders. בחר 1-2 הכי רלוונטיים לשקף caseStudies. אסור להמציא:`)
    lines.push(formatCaseStudiesForPrompt(caseStudies))
    lines.push(`</leaders_case_studies>`)
  } else {
    lines.push(`\n## <leaders_case_studies>`)
    lines.push(
      `אין case studies זמינים לקטגוריה זו. בשקף caseStudies השתמש ב-numbered-stats עם 3 stats מצטברים של הסוכנות (כמו "150+" קמפיינים, "12M+" reach מצטבר, "3.4%" ER ממוצע). אל תמציא שמות מותגים.`,
    )
    lines.push(`</leaders_case_studies>`)
  }

  if (input.influencers?.length) {
    lines.push(`\n## <influencers> — רשימה אמיתית מאומתת. השתמש/י **רק** בה לשקף influencer-grid.`)
    input.influencers.forEach((inf) => {
      lines.push(
        `- ${inf.name} (@${inf.handle}) — ${inf.followers} עוקבים, ${inf.engagement} מעורבות${
          inf.isVerified ? ' ✓' : ''
        }${inf.profilePicUrl ? ` | pic: ${inf.profilePicUrl}` : ''}`,
      )
    })
    lines.push(`</influencers>`)
    lines.push(
      `**אסור להוסיף שמות נוספים מעבר לרשימה. אסור להמציא handle או profilePicUrl.** העתק את ה-pic URL מילה במילה לשדה profilePicUrl של כל משפיען בשקף.`,
    )
  } else {
    lines.push(`\n## <influencers>אין רשימה זמינה</influencers>`)
    lines.push(
      `**אזהרה: אסור להמציא שמות משפיענים.** בשקף influencer-grid השתמש ב-subtitle="פרופילים ספציפיים יוצגו לאחר אישור ההצעה" ושים influencers=[] (מערך ריק). הרנדרר יציג מצב placeholder. אסור לשלוף שמות מטקסט אחר בבריף — גם אם נזכרים שם שמות, הם לא משפיענים שאושרו לקמפיין.`,
    )
  }

  // Scraped real-brand assets — ALWAYS prefer over AI for product/lifestyle slots
  const sa = input.scrapedAssets
  const hasScraped =
    !!sa?.brandLogoUrl ||
    !!sa?.heroImages?.length ||
    !!sa?.productImages?.length ||
    !!sa?.lifestyleImages?.length
  if (hasScraped) {
    lines.push(`\n## <scraped_assets> — תמונות אמיתיות של המותג מהאתר. **חובה להעדיף אותן על AI.**`)
    if (sa?.brandLogoUrl) lines.push(`- brandLogo: ${sa.brandLogoUrl}  (ירונדר אוטומטית, אל תכלול ב-slot)`)
    if (sa?.heroImages?.length) {
      lines.push(`- heroImages (${sa.heroImages.length}) — לתפקיד hero/cover/closing:`)
      sa.heroImages.forEach((u, i) => lines.push(`  - hero${i + 1}: ${u}`))
    }
    if (sa?.productImages?.length) {
      lines.push(`- productImages (${sa.productImages.length}) — **לתפקיד bigIdea + deliverables**:`)
      sa.productImages.forEach((u, i) => lines.push(`  - product${i + 1}: ${u}`))
    }
    if (sa?.lifestyleImages?.length) {
      lines.push(`- lifestyleImages (${sa.lifestyleImages.length}) — לתפקיד audience/brief/risks:`)
      sa.lifestyleImages.forEach((u, i) => lines.push(`  - lifestyle${i + 1}: ${u}`))
    }
    lines.push(`</scraped_assets>`)
  }

  if (input.images) {
    lines.push(`\n## <generated_images> — תמונות AI לגיבוי. **השתמש רק אם אין תמונה סקרייפ מתאימה לסלוט.**`)
    if (input.images.cover) lines.push(`- cover: ${input.images.cover}`)
    if (input.images.brand) lines.push(`- brand: ${input.images.brand}`)
    if (input.images.audience) lines.push(`- audience: ${input.images.audience}`)
    if (input.images.activity) lines.push(`- activity: ${input.images.activity}`)
    lines.push(`</generated_images>`)
  }

  // Structural signals — drive optional slide decisions
  const optionalHints: string[] = []
  if (input.hasCompetitors) optionalHints.push(`competitiveAnalysis (יש מתחרים ב-research — חובה)`)
  if (input.hasPlatformMix) optionalHints.push(`mediaMix (יש platform breakdown)`)
  if (input.hasTimeline) optionalHints.push(`timeline (יש שלבי זמן)`)
  if (optionalHints.length) {
    lines.push(`\n## שקפים אופציונליים שיש להם דאטה:\n- ${optionalHints.join('\n- ')}`)
  }

  lines.push(
    `\n## פלט: JSON של StructuredPresentation. **חובה 14 שקפי הליבה בסדר** (cover→brief→goals→audience→insight→strategy→bigIdea→deliverables→influencers→metrics→caseStudies→risks→nextSteps→closing). הוסף אופציונליים רק אם יש להם דאטה אמיתי. insight=source אמיתי. bigIdea=רפרנס-עולם. caseStudies=רק מ-<leaders_case_studies>. metrics=עם בנצ'מארק. JSON בלבד.`,
  )

  return lines.join('\n')
}

// ─── Normalization / safety ───────────────────────────────

/**
 * Pick a Hebrew-capable Google Font for a given typography mood. All fall back
 * to Heebo (the existing default) so existing decks render identically.
 */
function pickFontForMood(
  mood: GenerateStructuredInput['visualDNA'] extends infer T
    ? T extends { typographyMood?: infer M } ? M : undefined : undefined,
  slot: 'heading' | 'body',
): string {
  switch (mood) {
    case 'serif-editorial':
      return slot === 'heading' ? 'Frank Ruhl Libre' : 'Heebo'
    case 'display-bold':
      return slot === 'heading' ? 'Anton' : 'Heebo'
    case 'sans-tight':
      return 'Rubik'
    case 'sans-airy':
      return 'Assistant'
    case 'monospace-tech':
      return slot === 'heading' ? 'IBM Plex Mono' : 'Heebo'
    case 'sans-airy' as never:
    default:
      return 'Heebo'
  }
}

const ALLOWED_LAYOUTS: LayoutId[] = [
  'hero-cover',
  'full-bleed-image-text',
  'split-image-text',
  'centered-insight',
  'three-pillars-grid',
  'numbered-stats',
  'influencer-grid',
  'closing-cta',
]

function normalizePresentation(
  pres: StructuredPresentation,
  input: GenerateStructuredInput,
): StructuredPresentation {
  const ds: DesignSystem = {
    colors: {
      primary: pres.designSystem?.colors?.primary || input.brandColors?.primary || '#E94560',
      secondary: pres.designSystem?.colors?.secondary || '#16213E',
      accent: pres.designSystem?.colors?.accent || input.brandColors?.accent || '#F39C12',
      background: pres.designSystem?.colors?.background || '#0C0C10',
      text: pres.designSystem?.colors?.text || '#F5F5F7',
      muted: pres.designSystem?.colors?.muted || '#8B8D98',
      cardBg: pres.designSystem?.colors?.cardBg || 'rgba(255,255,255,0.04)',
    },
    fonts: {
      heading: pres.designSystem?.fonts?.heading || pickFontForMood(input.visualDNA?.typographyMood, 'heading'),
      body: pres.designSystem?.fonts?.body || pickFontForMood(input.visualDNA?.typographyMood, 'body'),
    },
    creativeDirection: pres.designSystem?.creativeDirection,
    visualDNA: input.visualDNA
      ? {
          decorativeStyle: input.visualDNA.decorativeStyle,
          typographyMood: input.visualDNA.typographyMood,
          recurringPattern: input.visualDNA.recurringPattern,
        }
      : pres.designSystem?.visualDNA,
  }

  const slides: StructuredSlide[] = (pres.slides || [])
    .filter((s) => ALLOWED_LAYOUTS.includes(s.layout as LayoutId))
    .map((s, i) => ({ ...s, slideNumber: i + 1 }))

  return {
    brandName: pres.brandName || input.brandName,
    brandLogoUrl: pres.brandLogoUrl || input.scrapedAssets?.brandLogoUrl,
    designSystem: ds,
    slides,
  }
}

// ─── Render helper ────────────────────────────────────────

export async function generateAndRender(
  input: GenerateStructuredInput,
): Promise<{ presentation: StructuredPresentation; htmlSlides: string[] }> {
  const { renderStructuredSlide } = await import('./renderer')
  const presentation = await generateStructuredPresentation(input)
  const htmlSlides = presentation.slides.map((s) =>
    renderStructuredSlide(s, presentation.designSystem, {
      brandLogoUrl: presentation.brandLogoUrl,
    }),
  )
  return { presentation, htmlSlides }
}
