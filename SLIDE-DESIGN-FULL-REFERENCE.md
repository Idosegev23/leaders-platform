# Slide Designer — Full Technical Reference

> מסמך מלא של כל מערכת עיצוב השקופיות: פרומפטים, סכמות, תלויות, זרימה, ולידציה.
> מטרה: התייעצות עם מודל אחר לשיפור איכות הפלט.

---

## תוכן עניינים

1. [סקירת ארכיטקטורה](#1-סקירת-ארכיטקטורה)
2. [תלויות ומודלים](#2-תלויות-ומודלים)
3. [שלב 0 — Content Curator](#3-שלב-0--content-curator)
4. [שלב 1 — Design System (Foundation)](#4-שלב-1--design-system-foundation)
5. [שלב 2 — Slide Content Builder (Data → Batches)](#5-שלב-2--slide-content-builder)
6. [שלב 3 — Batch Slide Generation (הפרומפט המרכזי)](#6-שלב-3--batch-slide-generation)
7. [שלב 4 — Post-Processing](#7-שלב-4--post-processing)
8. [JSON Schema — מבנה הפלט](#8-json-schema)
9. [TypeScript Types](#9-typescript-types)
10. [בעיות ידועות בפלט](#10-בעיות-ידועות-בפלט)
11. [קבצי מקור מלאים](#11-קבצי-מקור)

---

## 1. סקירת ארכיטקטורה

### זרימה מלאה (Pipeline)

```
┌─────────────────┐
│  Proposal Data   │  (מה-wizard + מחקר מותג + מחקר משפיענים)
│  brandName,      │
│  goals, strategy │
│  influencers...  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Content Curator  │  שלב 0: קופירייטר AI → תוכן מוכן למצגת
│ (Flash, LOW)     │  input: raw JSON   output: punchy headlines, bullets, cards
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Design System    │  שלב 1: Creative Direction + Design System
│ (Pro, MEDIUM)    │  input: brand info   output: colors, fonts, effects, motif
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Content Builder  │  שלב 2: מחלק ל-3 באצ'ים קבועים
│ (לא AI — קוד)   │  input: proposal data   output: SlideContentInput[][]
└────────┬────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
┌──────┐┌──────┐┌──────┐
│Batch1││Batch2││Batch3│  שלב 3: 3 קריאות AI **במקביל**
│5 slds││3-5   ││5-7   │  (Pro MEDIUM → Pro LOW → Flash HIGH)
└──┬───┘└──┬───┘└──┬───┘
   │       │       │
   └───────┼───────┘
           ▼
┌─────────────────┐
│ Post-Processing  │  שלב 4: sanitize → validate → autoFix →
│ (קוד, לא AI)    │  consistency → logo injection
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Presentation    │  פלט סופי: JSON AST
│  { slides: [] }  │  → ast-to-html → PDF
└─────────────────┘
```

### קבצים מעורבים

| קובץ | תפקיד |
|------|--------|
| `src/lib/gemini/slide-designer.ts` | אורקסטרציה ראשית — Design System, Batch Generation, Pipeline |
| `src/lib/gemini/content-curator.ts` | קופירייטר AI — מכין תוכן לפני העיצוב |
| `src/lib/gemini/slide-design/config-loaders.ts` | טוען הגדרות מ-admin panel / defaults |
| `src/lib/gemini/slide-design/schemas.ts` | JSON schemas ל-Gemini Structured Output |
| `src/lib/gemini/slide-design/slide-content-builder.ts` | בונה SlideContentInput מ-proposal data |
| `src/lib/gemini/slide-design/validation.ts` | ולידציה + auto-fix |
| `src/lib/gemini/slide-design/types.ts` | TypeScript types פנימיים |
| `src/lib/gemini/slide-design/color-utils.ts` | WCAG contrast, luminance, color adjust |
| `src/lib/gemini/slide-design/spatial-utils.ts` | AABB overlap, balance score, image placement |
| `src/lib/gemini/slide-design/fallbacks.ts` | fallback slides כשהמודל נכשל |
| `src/lib/gemini/slide-design/logo-injection.ts` | הזרקת לוגו Leaders + לוגו לקוח |
| `src/lib/ai-provider.ts` | ראוטר AI — Gemini / Claude / OpenAI |
| `src/lib/config/defaults.ts` | כל ה-defaults (פרומפטים, מודלים, עיצוב, pipeline) |

---

## 2. תלויות ומודלים

### מודלים בשימוש

| שלב | מודל ראשי | Fallback | Thinking | Structured Output |
|------|-----------|----------|----------|-------------------|
| Content Curator | `gemini-3-flash-preview` | global fallback | LOW | כן (responseSchema) |
| Design System | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` | MEDIUM | כן (responseSchema) |
| Slide Batches | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` | MEDIUM → LOW → HIGH(flash) | כן (responseSchema) |

### שרשרת Fallback לבאצ'ים

```
Attempt 1: gemini-3.1-pro-preview (MEDIUM thinking)
    ↓ fail (503/overloaded/timeout)
Attempt 2: gemini-3.1-pro-preview (LOW thinking)  ← חוסך tokens
    ↓ fail
Attempt 3: gemini-3-flash-preview (HIGH thinking)  ← מודל אחר
    ↓ fail
Fallback:  קוד TypeScript יוצר שקף בסיסי עם כותרת + רקע
```

### Sticky Fallback

משתנה module-level `_proUnavailable`. ברגע ש-Pro מחזיר 503/overloaded:
- כל קריאות הבאצ'ים הבאות **מדלגות ישירות** ל-Flash
- מתאפס בתחילת כל `generateAIPresentation()` חדש

### ספריות חיצוניות

```
@google/genai         — Gemini SDK (generateContent, structured output, thinking)
@anthropic-ai/sdk     — Claude SDK (fallback provider)
openai                — OpenAI SDK (fallback provider)
@supabase/supabase-js — DB + Storage
```

### הגדרות מודל (defaults.ts)

```typescript
// Design System
'slide_designer.primary_model':       'gemini-3.1-pro-preview'
'slide_designer.fallback_model':      'gemini-3-flash-preview'
'slide_designer.thinking_level':      'MEDIUM'

// Batch Slides
'slide_designer.batch_primary_model': 'gemini-3.1-pro-preview'
'slide_designer.batch_fallback_model':'gemini-3-flash-preview'
'slide_designer.batch_thinking_level':'MEDIUM'

// Output
'slide_designer.max_output_tokens':   65536
'slide_designer.temperature':         1.0

// Content Curator
'content_curator.model':              'gemini-3-flash-preview'
```

---

## 3. שלב 0 — Content Curator

**מטרה**: להפוך JSON גולמי (goals arrays, nested objects, paragraphs) לתוכן מצגת מוכן — כותרות קצרות, bullets חדים, מספרים דרמטיים.

**למה**: כדי שמודל העיצוב יתמקד רק בלייאוט, לא בכתיבה.

### System Prompt

```
אתה קופירייטר בכיר בסוכנות פרסום פרימיום ישראלית.
המשימה שלך: לקחת מידע גולמי ולהפוך אותו לתוכן מצגת ברמת Awwwards.
כל מילה שתכתוב תעוצב ב-PDF יוקרתי — מגזין אופנה, לא PowerPoint.

## כללי ברזל:
1. **פחות = יותר.** מקסימום 40 מילים בגוף טקסט.
2. **כותרות הורגות.** מקסימום 5 מילים. פאנצ'י, לא תיאורי.
3. **נתונים כגיבורים.** מספר גדול + תווית קצרה > פסקה.
4. **בולטים חדים.** כל נקודה = פעולה/תוצאה. מקסימום 8 מילים.
5. **כרטיסים ממוקדים.** כותרת 2-3 מילים + גוף משפט אחד. מקסימום 4 כרטיסים.
6. **טון סוכנות בוטיק.** שפה סוחפת, ביטחונית, לא ביורוקרטית.
7. **עברית.** הכל בעברית. ללא נקודתיים (:) בכותרות.
```

### Prompt Template

```xml
<task>
Transform the raw data below into presentation-ready content for "{brandName}".
Each slide must feel like a page from a premium brand book — punchy, visual, zero fluff.
</task>

<creative_direction>
Visual Metaphor: {from Design System}
Master Rule: {from Design System}
Emotional Arc: {from Design System}
Typography Voice: {from Design System}
</creative_direction>

<rules>
1. **title**: Max 5 Hebrew words. Punchy. No colons.
2. **subtitle**: Optional. One short line. Max 8 words.
3. **bodyText**: Max ~40 words.
4. **bulletPoints**: 3-5 items, max 8 words each.
5. **keyNumber**: THE most impressive stat. "500K+", "₪120K", "4.2%"
6. **keyNumberLabel**: 2-4 words explaining the number.
7. **cards**: Max 4. Title = 2-3 words. Body = one sentence.
8. **tagline**: Only for cover/closing/bigIdea.
9. **imageRole**: hero | accent | background | portrait | icon
10. **emotionalNote**: One word: "סקרנות", "ביטחון", "התלהבות"

CRITICAL: Not every field is needed. Empty fields are BETTER than weak content.
</rules>

<slides_to_curate>
  <slide index="1" type="cover" title="שער">
    <pacing maxWords="12" prefer="tagline + brand" tone="bold, confident" />
    <has_image>true</has_image>
    <raw_content>{...JSON...}</raw_content>
  </slide>
  ...
</slides_to_curate>
```

### Pacing Map (per slide type)

```typescript
cover:             { maxWords: 12, prefer: 'tagline + brand',           tone: 'bold, confident' }
brief:             { maxWords: 50, prefer: 'bodyText + bullets',        tone: 'professional, empathetic' }
goals:             { maxWords: 40, prefer: 'cards or bullets + keyNumber', tone: 'ambitious, clear' }
audience:          { maxWords: 45, prefer: 'bodyText + bullets',        tone: 'human, vivid' }
insight:           { maxWords: 25, prefer: 'keyNumber + bold bodyText', tone: 'provocative, aha-moment' }
whyNow:            { maxWords: 35, prefer: 'keyNumber + bullets',       tone: 'urgent, timely' }
strategy:          { maxWords: 40, prefer: 'cards (pillars)',           tone: 'strategic, visionary' }
competitive:       { maxWords: 45, prefer: 'cards + keyNumber',         tone: 'analytical, sharp' }
bigIdea:           { maxWords: 30, prefer: 'bold title + short bodyText', tone: 'exciting, creative, wow' }
approach:          { maxWords: 45, prefer: 'cards (approaches)',        tone: 'practical, innovative' }
deliverables:      { maxWords: 50, prefer: 'cards + keyNumber (total)', tone: 'concrete, organized' }
metrics:           { maxWords: 40, prefer: 'keyNumber + cards (KPIs)',  tone: 'data-driven, confident' }
influencerStrategy:{ maxWords: 45, prefer: 'bullets + bodyText',        tone: 'strategic, insider' }
contentStrategy:   { maxWords: 45, prefer: 'cards (themes)',            tone: 'creative, structured' }
influencers:       { maxWords: 50, prefer: 'cards (profiles)',          tone: 'exciting, curated' }
timeline:          { maxWords: 45, prefer: 'cards (phases) + keyNumber',tone: 'organized, progressive' }
closing:           { maxWords: 15, prefer: 'tagline + subtitle',        tone: 'warm, inviting, memorable' }
```

### Output Schema (Curator)

```typescript
{
  slides: [{
    slideType: string,
    title: string,           // כותרת חדה (max 5 words)
    subtitle?: string,       // תת-כותרת (max 8 words)
    bodyText?: string,       // טקסט גוף (max 40 words)
    bulletPoints?: string[], // 3-5 נקודות (max 8 words each)
    keyNumber?: string,      // "500K+", "₪120K"
    keyNumberLabel?: string, // "חשיפות צפויות"
    cards?: [{ title: string, body: string }],  // max 4
    tagline?: string,        // only cover/closing/bigIdea
    imageRole?: 'hero' | 'accent' | 'background' | 'portrait' | 'icon',
    emotionalNote?: string,  // "סקרנות", "ביטחון"
  }]
}
```

---

## 4. שלב 1 — Design System (Foundation)

**מטרה**: יצירת כיוון קריאטיבי + Design System מלא שיחול על כל השקפים.

### System Instruction (נשלח כ-systemPrompt)

```xml
<role>
You are a world-class Creative Director and Art Director at a top design agency
(Sagmeister & Walsh / Pentagram level).
Your specialty: editorial-quality presentation design that wins Awwwards.
Every presentation must feel like a premium fashion magazine — never like PowerPoint.
</role>

<constraints>
- Output language: Hebrew (RTL). Font: Heebo. Canvas: 1920x1080px.
- Output format: JSON AST only — no HTML, no CSS.
- Every slide must have a unique layout — never repeat the same composition.
</constraints>

<visualization_process>
Before outputting each slide, you MUST mentally visualize it as if looking at the final rendered result:
1. Picture every element on the 1920x1080 canvas at its exact x, y, width, height.
2. Verify no text overlaps other text unintentionally.
3. Verify no text sits on top of an image without a readable contrast layer between them.
4. Verify images don't cover important text elements.
5. Confirm the overall composition feels balanced, intentional, and magazine-quality.
If any issue is found, fix it before outputting the JSON.
</visualization_process>
```

### Prompt (בעברית)

```
המשימה: לייצר כיוון קריאטיבי + Design System מלא למצגת ברמת Awwwards עבור "{brandName}".

## מידע על המותג:
- תעשייה: {industry}
- אישיות: {brandPersonality}
- צבע ראשי: {primary}
- צבע משני: {secondary}
- צבע הדגשה: {accent}
- סגנון: {style}
- קהל יעד: {targetAudience}

═══════════════════════════════
🧠 PART 1: CREATIVE DIRECTION
═══════════════════════════════
חשוב כמו Creative Director. כל מותג חייב להרגיש אחרת.
אל תחזור על "מודרני ונקי" — זה ריק מתוכן.

### creativeDirection:
1. **visualMetaphor** — מטאפורה ויזואלית קונקרטית. לא "מקצועי" אלא
   "ארכיטקטורה ברוטליסטית של בטון חשוף" או "גלריית אמנות מינימליסטית יפנית"
2. **visualTension** — ההפתעה. "טקסט ענק שבור + מינימליזם יפני"
3. **oneRule** — חוק אחד שכל שקף חייב לקיים.
   "תמיד יש אלמנט אחד שחורג מהמסגרת"
4. **colorStory** — נרטיב: "מתחילה בחושך וקור, מתחממת באמצע..."
5. **typographyVoice** — "צורחת — כותרות ענקיות 900 weight לצד גוף רזה 300"
6. **emotionalArc** — סקרנות → הבנה → התלהבות → ביטחון → רצון לפעול

═══════════════════════════════
🎨 PART 2: DESIGN SYSTEM
═══════════════════════════════

### צבעים (14 colors):
- primary, secondary, accent — מבוססים על צבעי המותג
- background — כהה מאוד (לא שחור טהור — עם hint של צבע)
- text — בהיר מספיק ל-WCAG AA (4.5:1 contrast מול background)
- cardBg — נבדל מהרקע (10-15%)
- cardBorder — עדין (opacity נמוך)
- gradientStart, gradientEnd
- muted — צבע טקסט מושתק (3:1 contrast minimum)
- highlight — accent שני
- auroraA, auroraB, auroraC — 3 צבעים ל-mesh gradient

### טיפוגרפיה:
- displaySize: 80-140 (שער!)
- headingSize: 48-64
- subheadingSize: 28-36
- bodySize: 20-24
- captionSize: 14-16
- letterSpacingTight: -5 עד -1 (כותרות)
- letterSpacingWide: 2 עד 8 (labels)
- lineHeightTight: 0.9-1.05
- lineHeightRelaxed: 1.4-1.6
- weightPairs: [[heading, body]] — [[900,300]] — חובה ניגוד חד!

### מרווחים:
- unit: 8, cardPadding: 32-48, cardGap: 24-40, safeMargin: 80

### אפקטים:
- borderRadius: "sharp" / "soft" / "pill" + borderRadiusValue
- decorativeStyle: "geometric" / "organic" / "minimal" / "brutalist"
- shadowStyle: "none" / "fake-3d" / "glow"
- auroraGradient: CSS radial-gradient mesh מ-3 צבעים

### מוטיב חוזר:
- type: diagonal-lines / dots / circles / angular-cuts / wave / grid-lines / organic-blobs / triangles
- opacity: 0.05-0.2, color: צבע, implementation: תיאור CSS

פונט: Heebo.
```

### Output Schema (Design System)

```typescript
{
  creativeDirection: {
    visualMetaphor: string,
    visualTension: string,
    oneRule: string,
    colorStory: string,
    typographyVoice: string,
    emotionalArc: string,
  },
  colors: {
    primary: string, secondary: string, accent: string,
    background: string, text: string, cardBg: string, cardBorder: string,
    gradientStart: string, gradientEnd: string, muted: string, highlight: string,
    auroraA: string, auroraB: string, auroraC: string,
  },
  fonts: { heading: string, body: string },
  typography: {
    displaySize: number,    // 80-140
    headingSize: number,    // 48-64
    subheadingSize: number, // 28-36
    bodySize: number,       // 20-24
    captionSize: number,    // 14-16
    letterSpacingTight: number,  // -5 to -1
    letterSpacingWide: number,   // 2 to 8
    lineHeightTight: number,     // 0.9-1.05
    lineHeightRelaxed: number,   // 1.4-1.6
    weightPairs: [number, number][],  // e.g. [[900, 300]]
  },
  spacing: {
    unit: number,        // 8
    cardPadding: number, // 32-48
    cardGap: number,     // 24-40
    safeMargin: number,  // 80
  },
  effects: {
    borderRadius: 'sharp' | 'soft' | 'pill',
    borderRadiusValue: number,
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist',
    shadowStyle: 'none' | 'fake-3d' | 'glow',
    auroraGradient: string,  // CSS radial-gradient
  },
  motif: {
    type: string,
    opacity: number,
    color: string,
    implementation: string,  // CSS description
  },
}
```

### Post-processing ב-Design System

אחרי שהמודל מחזיר את ה-JSON:
1. `validateAndFixColors()` — מוודא WCAG AA contrast לכל צבע:
   - text vs background: ≥ 4.5:1
   - accent vs background: ≥ 3:1
   - muted vs background: ≥ 3:1
   - cardBg vs background: luminance difference ≥ 0.03
2. `fonts.heading = fonts.body = 'Heebo'` (force)
3. `direction = 'rtl'` (force)

---

## 5. שלב 2 — Slide Content Builder

**מטרה**: להפוך את proposal data ל-`SlideContentInput[][]` — 3 באצ'ים.

**קובץ**: `slide-content-builder.ts`

### 17 סוגי שקפים (לפי סדר)

| # | slideType | כותרת | תנאי | Batch |
|---|-----------|--------|-------|-------|
| 1 | cover | שער | תמיד | 1 |
| 2 | brief | למה התכנסנו? | תמיד | 1 |
| 3 | goals | מטרות הקמפיין | תמיד | 1 |
| 4 | audience | קהל היעד | תמיד | 1 |
| 5 | insight | התובנה המרכזית | תמיד | 1 |
| 6 | whyNow | למה עכשיו? | אם יש whyNowTrigger או industryTrends | 2 |
| 7 | strategy | האסטרטגיה | תמיד | 2 |
| 8 | competitive | נוף תחרותי | אם ≥2 מתחרים | 2 |
| 9 | bigIdea | הרעיון המרכזי | תמיד | 2 |
| 10 | approach | הגישה שלנו | תמיד | 2 |
| 11 | deliverables | תוצרים | תמיד | 3 |
| 12 | metrics | יעדים ומדדים | תמיד | 3 |
| 13 | influencerStrategy | אסטרטגיית משפיענים | תמיד | 3 |
| 14 | contentStrategy | אסטרטגיית תוכן | אם ≥2 content themes או ≥2 tiers | 3 |
| 15 | influencers | משפיענים מומלצים | אם יש influencers/recommendations | 3 |
| 16 | timeline | מפת דרכים | אם יש measurableTargets או suggestedTimeline | 3 |
| 17 | closing | סיום | תמיד (אחרון) | 3 |

### חלוקה ל-3 באצ'ים

```typescript
const GROUP1 = ['cover', 'brief', 'goals', 'audience', 'insight']
const GROUP2 = ['whyNow', 'strategy', 'competitive', 'bigIdea', 'approach']
const GROUP3 = // everything else (deliverables → closing)
```

טיפוסי: Batch 1 = 5 שקפים, Batch 2 = 3-5, Batch 3 = 5-7.

### מבנה SlideContentInput

```typescript
interface SlideContentInput {
  slideType: string    // e.g. 'cover'
  title: string        // e.g. 'שער'
  content: Record<string, unknown>  // cleaned JSON with brand data
  imageUrl?: string    // if available for this slide
}
```

### תמונות

- `coverImage` → cover slide
- `brandImage` → brief + bigIdea
- `audienceImage` → audience
- `activityImage` → bigIdea (primary)
- `extraImages` — mapped by `placement` field (goals, insight, strategy, etc.)

---

## 6. שלב 3 — Batch Slide Generation (הפרומפט המרכזי)

זה הפרומפט הכי חשוב — הוא קובע את איכות העיצוב.

### מבנה הפרומפט (~200 שורות)

הפרומפט בנוי מ-11 חלקים:

---

### חלק 1: פתיח + Creative Brief

```
אתה ארט דיירקטור גאון ברמת Awwwards / Pentagram / Sagmeister & Walsh.
המצגת חייבת להיראות כמו **מגזין אופנה פרימיום / editorial design** — לא כמו PowerPoint!

עצב {slideCount} שקפים למותג "{brandName}".

══════════════════════════════════
🧠 THE CREATIVE BRIEF
══════════════════════════════════

**מטאפורה ויזואלית:** {cd.visualMetaphor}
**מתח ויזואלי:** {cd.visualTension}
**חוק-על (כל שקף חייב לקיים):** {cd.oneRule}
**סיפור צבע:** {cd.colorStory}
**קול טיפוגרפי:** {cd.typographyVoice}
**מסע רגשי:** {cd.emotionalArc}
```

---

### חלק 2: Design System (נתונים)

```
══════════════════════════════════
🎨 DESIGN SYSTEM
══════════════════════════════════
Canvas: 1920×1080px | RTL (עברית) | פונט: Heebo

צבעים: primary {colors.primary} | secondary {colors.secondary} | accent {colors.accent}
רקע: {colors.background} | טקסט: {colors.text} | כרטיסים: {colors.cardBg}
מושתק: {colors.muted} | highlight: {colors.highlight}
Aurora: {effects.auroraGradient}

טיפוגרפיה: display {typo.displaySize}px | heading {typo.headingSize}px
            | body {typo.bodySize}px | caption {typo.captionSize}px
Spacing tight: {typo.letterSpacingTight} | wide: {typo.letterSpacingWide}
Weight pairs: {typo.weightPairs}  (e.g. "900/300")
Line height: tight {typo.lineHeightTight} | relaxed {typo.lineHeightRelaxed}

Card: padding {spacing.cardPadding}px | gap {spacing.cardGap}px | radius {effects.borderRadiusValue}px
Decorative style: {effects.decorativeStyle} | Shadow: {effects.shadowStyle}

Motif: {motif.type} (opacity: {motif.opacity}, color: {motif.color})
{motif.implementation}
```

---

### חלק 3: Composition Rules

```
══════════════════════════════════
📐 COMPOSITION & QUALITY RULES
══════════════════════════════════

## חוקי קומפוזיציה:

### Rule of Thirds:
נקודות העניין הויזואליות חייבות לשבת על אחד מ-4 צמתי ⅓:
- נקודה A: x=640, y=360
- נקודה B: x=1280, y=360
- נקודה C: x=640, y=720
- נקודה D: x=1280, y=720
הכותרת הראשית תמיד על נקודה A או B (צד ימין — RTL).

### Diagonal Dominance:
אלמנטים צריכים ליצור קו אלכסוני מנחה דינמי (מימין-למעלה לשמאל-למטה).

### Focal Point Triangle:
3 האלמנטים הראשיים (title, visual, supporting) — כמשולש שמקיף את מרכז העניין.

### Scale Contrast (חובה):
היחס בין הפונט הגדול ביותר לפונט הקטן ביותר בשקף חייב להיות לפחות 5:1.
שקפי peak (cover, insight, bigIdea, closing): יחס 10:1 לפחות.
```

---

### חלק 4: Depth Layers

```
## שכבות עומק — כל אלמנט חייב לשבת בשכבה אחת:
- Layer 0 (zIndex: 0-1):    BACKGROUND — aurora, gradient, texture, full-bleed color
- Layer 1 (zIndex: 2-3):    DECORATIVE — watermark text, geometric shapes, motif patterns
- Layer 2 (zIndex: 4-5):    STRUCTURE — cards, containers, dividers, image frames
- Layer 3 (zIndex: 6-8):    CONTENT — body text, data, images, influencer cards
- Layer 4 (zIndex: 9-10):   HERO — main title, key number, focal element, brand name

חוק: אלמנטים מאותה שכבה לא חופפים (אלא אם decorative עם opacity < 0.3).
```

---

### חלק 5: Anti-Patterns (10 חוקים)

```
## ❌ Anti-Patterns (הפרה = פסילה):
1. ❌ טקסט ממורכז בדיוק באמצע המסך (x:960, y:540) — BORING
2. ❌ כל האלמנטים על אותו קו אנכי / 3 כרטיסים זהים ברוחב שווה — PowerPoint
3. ❌ כל הטקסטים באותו fontSize — חייב היררכיה (יחס ≥5:1)
4. ❌ opacity < 0.7 על טקסט קריא / rotation על body text
5. ❌ טקסט חופף טקסט אחר — כל אלמנט חייב שטח משלו עם 20px+ רווח
6. ❌ תמונה שמכסה טקסט בלי gradient overlay
7. ❌ כרטיס (shape card) ריק — כל card MUST have text elements positioned INSIDE it
8. ❌ טקסט בלי color — text MUST ALWAYS have color property
9. ❌ shape בלי fill — shapes MUST ALWAYS have fill property
10. ❌ טקסט שגולש מהתיבה — width חייב להתאים לאורך הטקסט × fontSize
```

---

### חלק 6: Typography Rules

```
## Typography:
- כותרות 60px+: letterSpacing {typo.letterSpacingTight}, lineHeight {typo.lineHeightTight},
  fontWeight {typo.weightPairs[0][0]}
- Labels: letterSpacing {typo.letterSpacingWide}, fontWeight {typo.weightPairs[0][1]}
- מספרים גדולים: fontSize 80-140px, fontWeight 900, letterSpacing -4
- רווח לבן = אלמנט עיצובי. כותרת ראשית: 80px+ מכל אלמנט אחר
```

---

### חלק 7: Editorial Design Rules (WOW Factor)

```
══════════════════════════════════
🛠️ EDITORIAL DESIGN RULES (THE WOW FACTOR!)
══════════════════════════════════

1. **שבור את התבנית:** אף שקף לא נראה כמו PowerPoint. לייאוט א-סימטרי!
2. **Watermarks ענקיים:** בכל שקף — טקסט רקע עצום (200-400px) עם opacity 0.03-0.08,
   rotation -5 עד -15. זה נותן עומק!
3. **clip-path / shapes דינמיים:** אל תעשה רק ריבועים. shapes בזווית, עיגולים שגולשים
   מחוץ למסך, קווים אלכסוניים
4. **טיפוגרפיה אדירה:** כותרות שחותכות את המסך. textStroke לטקסט דקורטיבי.
   ניגוד חד בין weight 900 ל-300
5. **מספרים = drama:** נתון של "500K" מקבל fontSize: 120+, accent color, ושטח ענק
6. **Gradient overlays:** גרדיאנטים מעל תמונות (linear-gradient to top)
7. **קווים ומפרידים אלגנטיים:** קווים דקים (1-2px) ב-accent color
8. **כרטיסים = לא סתם ריבועים:** offset borders, רקעים מדורגים, fake-3d shadow (+12px)
```

---

### חלק 8: Element Specs (3 סוגים) — Mandatory Fields

```
══════════════════════════════════
📦 ELEMENT TYPES — MANDATORY FIELDS PER TYPE
══════════════════════════════════

### Shape (MUST include: fill, shapeType):
{ "id": "el-X", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080,
  "zIndex": 0, "shapeType": "background"|"decorative"|"divider"|"card",
  "fill": "#hex or gradient or transparent",
  "clipPath": "...", "borderRadius": px, "opacity": 0-1, "rotation": degrees,
  "border": "1px solid rgba(...)" }
⚠️ fill חובה! "transparent" אם רוצים שקוף. NEVER omit fill.
⚠️ card shapes MUST have visible fill (cardBg or gradient), not transparent!

### Text (MUST include: content, fontSize, fontWeight, color, role, textAlign):
{ "id": "el-X", "type": "text", "x": 80, "y": 120, "width": 800, "height": 80,
  "zIndex": 10, "content": "טקסט", "fontSize": px, "fontWeight": 100-900,
  "color": "{colors.text}", "textAlign": "right",
  "role": "title"|"subtitle"|"body"|"caption"|"label"|"decorative",
  "lineHeight": 0.9-1.6, "letterSpacing": px, "opacity": 0-1, "rotation": degrees,
  "textStroke": { "width": 2, "color": "#hex" } }
⚠️ color חובה! ALWAYS use "{colors.text}" for readable text
⚠️ role "decorative" = watermark text ענק, opacity נמוך, rotation, fontSize 200+
⚠️ width חייב להתאים! עברית: כל תו ≈ 0.6×fontSize

### Image (MUST include: src, objectFit):
{ "id": "el-X", "type": "image", "x": 960, "y": 0, "width": 960, "height": 1080,
  "zIndex": 5, "src": "THE_URL", "objectFit": "cover",
  "borderRadius": px, "clipPath": "..." }
⚠️ src חובה! Use the EXACT URL from <image> tag. NEVER invent URLs.
⚠️ אם יש imageUrl לשקף → חובה element מסוג "image", גודל ≥40% מהשקף
```

---

### חלק 9: Reference Example (Cover JSON)

```json
{
  "id": "slide-1", "slideType": "cover", "label": "שער",
  "background": { "type": "solid", "value": "{colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080,
      "zIndex": 0, "shapeType": "background",
      "fill": "radial-gradient(circle at 20% 30%, {primary}50 0%, transparent 50%), radial-gradient(circle at 80% 80%, {accent}50 0%, transparent 50%)",
      "opacity": 0.7 },
    { "id": "watermark", "type": "text", "x": -150, "y": 180, "width": 2200, "height": 500,
      "zIndex": 2, "content": "BRAND", "fontSize": 380, "fontWeight": 900,
      "color": "transparent", "textAlign": "center", "lineHeight": 0.9,
      "letterSpacing": -8, "opacity": 0.12, "rotation": -8,
      "textStroke": { "width": 2, "color": "#ffffff" }, "role": "decorative" },
    { "id": "line", "type": "shape", "x": 160, "y": 620, "width": 340, "height": 1,
      "zIndex": 2, "shapeType": "decorative", "fill": "{text}30", "opacity": 1 },
    { "id": "accent-circle", "type": "shape", "x": 1450, "y": -80, "width": 400, "height": 400,
      "zIndex": 2, "shapeType": "decorative", "fill": "{accent}",
      "clipPath": "circle(50%)", "opacity": 0.12 },
    { "id": "title", "type": "text", "x": 120, "y": 380, "width": 900, "height": 200,
      "zIndex": 10, "content": "שם המותג", "fontSize": 120, "fontWeight": 900,
      "color": "{text}", "textAlign": "right", "lineHeight": 1.0,
      "letterSpacing": -4, "role": "title" },
    { "id": "subtitle", "type": "text", "x": 120, "y": 610, "width": 600, "height": 50,
      "zIndex": 8, "content": "הצעת שיתוף פעולה", "fontSize": 22, "fontWeight": 300,
      "color": "{text}70", "textAlign": "right", "letterSpacing": 6, "role": "subtitle" },
    { "id": "date", "type": "text", "x": 120, "y": 680, "width": 300, "height": 30,
      "zIndex": 8, "content": "ינואר 2025", "fontSize": 16, "fontWeight": 300,
      "color": "{text}40", "textAlign": "right", "letterSpacing": 3, "role": "caption" }
  ]
}
```

---

### חלק 10: Per-Slide Directives (XML)

כל שקף בבאצ' מקבל בלוק XML עם metadata:

```xml
<slide index="1" total="17" type="cover">
  <color_temperature>cold</color_temperature>
  <energy>peak</energy>
  <density>minimal</density>
  <max_elements>8</max_elements>
  <min_whitespace>40%</min_whitespace>
  <layout_directive>MANDATORY: Typographic Brutalism — oversized brand name 300px+
    with textStroke, Aurora BG, dramatic negative space</layout_directive>
  <tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>
  <image url="https://..." role="The image IS the hero" visual_role="hero"
         sizing="Full-bleed (1920×1080) or right-half (960×1080)" />
  <emotion>סקרנות</emotion>
  <master_rule>{cd.oneRule}</master_rule>
  <content>
    <headline>שם המותג</headline>
    <subtitle>הצעת שיתוף פעולה</subtitle>
    <tagline>One memorable line</tagline>
  </content>
</slide>
```

#### LAYOUT_MAP — layout קבוע לכל סוג שקף

```typescript
const LAYOUT_MAP = {
  cover:              'Typographic Brutalism — oversized brand name 300px+ with textStroke, Aurora BG',
  brief:              'Editorial Bleed — image bleeds 60% of canvas with borderRadius capsule',
  goals:              'Bento Box — asymmetric grid of mixed-size rounded cells with numbers',
  audience:           'Magazine Spread — large pull-quote with dominant image, editorial feel',
  insight:            'Typographic Brutalism — insight quote 48px centered, keyword 250px+ hollow',
  whyNow:             'Data Art — oversized numbers as visual centerpiece',
  strategy:           'Split Screen Asymmetry — right side dark with title, left floating cards',
  competitive:        'Bento Box — competitor cards in asymmetric grid with highlights',
  bigIdea:            'Typographic Brutalism — idea name 80px, hollow keyword 300px+ rotated',
  approach:           'Overlapping Z-index cards — layered cards with fake-3D shadows',
  deliverables:       'Swiss Grid — structured grid, each deliverable in own cell',
  metrics:            'Data Art — each metric as oversized number 80-140px',
  influencerStrategy: 'Diagonal Grid — angled composition with criteria as floating tags',
  contentStrategy:    'Overlapping Z-index cards — content themes as layered cards',
  influencers:        'Bento Box — influencer cards in tight grid with circular profiles',
  timeline:           'Cinematic Widescreen — horizontal flow with connected phases',
  closing:            'Typographic Brutalism — BRAND name 350px+ hollow, CTA 80px, Aurora BG',
}
```

#### Pacing Map — energy / density / maxElements

```typescript
const PACING_MAP = {
  cover:     { energy: 'peak',     density: 'minimal',  maxElements: 8,  minWhitespace: 40% },
  brief:     { energy: 'calm',     density: 'balanced', maxElements: 12, minWhitespace: 30% },
  goals:     { energy: 'building', density: 'balanced', maxElements: 14, minWhitespace: 25% },
  audience:  { energy: 'building', density: 'balanced', maxElements: 12, minWhitespace: 30% },
  insight:   { energy: 'peak',     density: 'minimal',  maxElements: 8,  minWhitespace: 40% },
  strategy:  { energy: 'building', density: 'balanced', maxElements: 12, minWhitespace: 30% },
  bigIdea:   { energy: 'peak',     density: 'minimal',  maxElements: 10, minWhitespace: 35% },
  approach:  { energy: 'calm',     density: 'balanced', maxElements: 14, minWhitespace: 25% },
  deliverables: { energy: 'calm',  density: 'dense',    maxElements: 18, minWhitespace: 20% },
  metrics:   { energy: 'building', density: 'dense',    maxElements: 16, minWhitespace: 20% },
  influencerStrategy: { energy: 'calm', density: 'balanced', maxElements: 12, minWhitespace: 30% },
  influencers: { energy: 'breath', density: 'dense',    maxElements: 20, minWhitespace: 15% },
  whyNow:    { energy: 'peak',     density: 'balanced', maxElements: 10, minWhitespace: 30% },
  competitive: { energy: 'building', density: 'dense',  maxElements: 16, minWhitespace: 20% },
  contentStrategy: { energy: 'calm', density: 'balanced', maxElements: 14, minWhitespace: 25% },
  timeline:  { energy: 'building', density: 'balanced', maxElements: 14, minWhitespace: 25% },
  closing:   { energy: 'finale',   density: 'minimal',  maxElements: 8,  minWhitespace: 45% },
}
```

#### Color Temperature Map

```typescript
const TEMPERATURE_MAP = {
  cover: 'cold', brief: 'cold', goals: 'neutral', audience: 'neutral',
  insight: 'warm', strategy: 'neutral', bigIdea: 'warm', approach: 'neutral',
  deliverables: 'neutral', metrics: 'neutral', influencerStrategy: 'cold',
  influencers: 'neutral', closing: 'warm',
}
```

#### Tension Slides (get extra `<tension>` tag)

```typescript
const TENSION_SLIDES = ['cover', 'insight', 'bigIdea', 'closing']
```

#### Image Size Hints

```typescript
const IMAGE_SIZE_HINTS = {
  cover:    'Full-bleed (1920×1080) or right-half (960×1080). Image is the hero.',
  brief:    'Right 40% (768×800), vertically centered.',
  audience: 'Right 45% (864×900). People-focused, large and immersive.',
  insight:  'Background overlay (1920×1080) with gradient on top, or right 50%.',
  bigIdea:  'Right 60% (1152×1080) full height. The visual IS the idea.',
  strategy: 'Accent image, 30% (576×600), positioned as visual anchor.',
  approach: 'Small accent (480×480), at rule-of-thirds intersection.',
  closing:  'Background overlay (1920×1080) at low opacity, or centered accent.',
}
```

#### Image Role Hints

```typescript
const IMAGE_ROLE_HINTS = {
  cover:    'The image IS the hero — first thing the viewer sees. Let it dominate.',
  brief:    'The image accompanies the story — supports, not competes.',
  audience: 'The image represents the people — large, immersive, human.',
  insight:  'The image creates atmosphere — dramatic backdrop.',
  bigIdea:  'The image IS the idea — the visual is the star.',
  strategy: 'The image anchors — visual anchor adding depth.',
  approach: 'The image is an accent — surprising visual interest.',
  closing:  'The image closes the circle — warm, invitation, strong ending.',
}
```

---

### חלק 11: Final Checklist (Mental Render)

```
לפני שליחת ה-JSON, דמיין כל שקף מנטלית ב-1920×1080:
1. האם כל text element יש לו color, role, fontSize, fontWeight? (אם לא — הוסף!)
2. האם כל shape יש לו fill ו-shapeType? (אם לא — הוסף!)
3. האם כל image יש לו src ו-objectFit? (אם לא — הוסף!)
4. האם אני קורא כל טקסט בבירור? color != background? opacity >= 0.7 לטקסט קריא?
5. האם width מתאים לתוכן? כותרת ב-120px עם 10 תווים צריכה width >= 720px
6. שום דבר לא מוסתר מאחורי אלמנט אחר? כל card shape יש בו text?
7. אם יש תמונה — יש לה מקום משלה? טקסט לא עולה עליה ישירות?
8. הקומפוזיציה מרגישה כמו עמוד מגזין פרימיום?
9. אם בדיקה נכשלת — תקן לפני שליחת ה-JSON.
רק תמונות עם URL שסופק בתוכן. לעולם אל תמציא URL.
```

### סיום הפרומפט

```
החזר JSON:
{
  "slides": [{
    "id": "slide-N",
    "slideType": "TYPE",
    "label": "שם בעברית",
    "background": { "type": "solid"|"gradient", "value": "..." },
    "elements": [...]
  }]
}
```

---

## 7. שלב 4 — Post-Processing

### 4.1 sanitizeElement()

ממלא שדות חסרים מה-Design System. רץ על **כל אלמנט** שחוזר מהמודל.

**Text elements:**
- `role`: infer from fontSize (≥80 → title, ≥40 → subtitle, ≤16 → caption, else → body)
- `color`: decorative → `{text}15`, caption/label → `{muted}`, else → `{text}`
- `textAlign`: always "right" (RTL)
- `fontWeight`: title → 900, subtitle → 700, decorative → 900, label → 300, else → 400
- `fontSize`: title → 64, subtitle → 32, caption → 14, label → 14, else → 20
- `opacity`: decorative + fontSize≥150 + opacity>0.3 → force to 0.08
- `content`: if empty → ""

**Shape elements:**
- `fill`: if has border/borderRadius → `cardBg`, else → "transparent"
- `shapeType`: default "decorative"

**Image elements:**
- `objectFit`: default "cover"
- `src`: if empty → ""

**Cross-type cleanup:**
- Text elements: remove `fill`, `src`, `shapeType`, `objectFit` if empty
- Shape elements: remove `content`, `color`, `role`, `src`, `objectFit`, `fontSize`, `fontWeight`
- Image elements: remove `content`, `color`, `role`, `fill`, `shapeType`, `fontSize`, `fontWeight`

### 4.2 validateSlide()

מחזיר `ValidationResult` עם `score` (0-100) ורשימת `issues`.

**בדיקות:**

| Category | Severity | Score Impact | AutoFixable |
|----------|----------|-------------|-------------|
| contrast | critical | -15 | כן — adjust lightness until WCAG 4.5:1 |
| density | warning | -10 | לא |
| whitespace | warning | -8 | לא |
| safe-zone | warning | -5 | כן — clamp to 80px margins |
| scale | suggestion | -5 | לא |
| hierarchy | warning | -10 | לא |
| missing-image | warning | -20 | כן — findBestImagePlacement + inject |
| image-bounds | warning | -10 | כן — clamp to canvas |
| image-small | suggestion | -5 | כן — scale up to 25% canvas |
| image-overlap-title | warning | -12 | כן — move image to opposite side |
| text-text-overlap (>15%) | warning | -8 | כן — nudge below + 20px gap |
| text-text-overlap (>50%) | critical | -15 | כן — nudge below + 20px gap |
| text-overflow | warning | -8 | כן — widen box / increase height / reduce font |
| balance | suggestion | -5 | לא |

### 4.3 autoFixSlide()

מתקן רק issues עם `autoFixable: true`:

- **missing-image**: מוצא מקום פנוי בקנבס, מזריק image element + gradient overlay
- **contrast**: מעלה lightness בלולאה עד WCAG 4.5:1
- **safe-zone**: clamp x/y לשוליים של 80px
- **image-bounds**: clamp לגבולות הקנבס
- **image-small**: scale up לפחות 25% של הקנבס
- **image-overlap-title**: מזיז תמונה לצד הנגדי של הכותרת
- **text-overflow**: 3 אסטרטגיות בסדר:
  1. מרחיב width אם יש מקום
  2. מגדיל height לשורות נוספות
  3. מקטין fontSize (מינימום 14px)
- **text-text-overlap**: מזיז אלמנט מתחת לאחר + 20px gap (או הצידה אם יורד מהקנבס)

### 4.4 checkVisualConsistency()

מנרמל בין שקפים:

1. **Title Y alignment**: מאתר Y חציוני של כותרות (לא cover/closing), מיישר כותרות שחורגות ב->60px
2. **Title fontSize**: מאתר fontSize חציוני, מנרמל כותרות שחורגות ב-6-30px

### 4.5 Logo Injection

- **injectLeadersLogo()**: לוגו Leaders בפינה שמאלית תחתונה (זהה בכל שקף)
  - לבן/שחור לפי luminance של הרקע
- **injectClientLogo()**: לוגו לקוח בשקפי cover, bigIdea, closing

---

## 8. JSON Schema

### Slide Batch Schema (Gemini Structured Output)

```typescript
SLIDE_BATCH_SCHEMA = {
  type: OBJECT,
  properties: {
    slides: {
      type: ARRAY,
      items: {
        type: OBJECT,
        properties: {
          id: STRING,
          slideType: STRING,
          label: STRING,
          background: {
            type: OBJECT,
            properties: {
              type: STRING (enum: ['solid', 'gradient', 'image']),
              value: STRING,
            },
            required: ['type', 'value'],
          },
          elements: {
            type: ARRAY,
            items: SLIDE_ELEMENT_SCHEMA,
          },
        },
        required: ['id', 'slideType', 'label', 'background', 'elements'],
      },
    },
  },
  required: ['slides'],
}
```

### Element Schema (Flat — all types combined)

הסכמה שטוחה — כל השדות של כל הסוגים ביחד. שדות type-specific הם אופציונליים אבל `required` מאלץ את המודל להחזיר ערך (גם אם ריק):

```typescript
SLIDE_ELEMENT_SCHEMA = {
  properties: {
    id: STRING,
    type: STRING (enum: ['text', 'shape', 'image']),
    x: NUMBER, y: NUMBER, width: NUMBER, height: NUMBER,
    zIndex: INTEGER,
    opacity: NUMBER, rotation: NUMBER,

    // Text fields
    content: STRING,     // "Required for type=text"
    fontSize: NUMBER,    // "Titles: 60-140, body: 18-24, caption: 14-16"
    fontWeight: INTEGER, // "Titles: 700-900, body: 300-400"
    color: STRING,       // "Must contrast with background"
    textAlign: STRING,   // 'Always "right" for RTL Hebrew'
    role: STRING,        // "title|subtitle|body|caption|label|decorative"
    lineHeight: NUMBER,
    letterSpacing: NUMBER,
    textStroke: { width: NUMBER, color: STRING },

    // Shape fields
    shapeType: STRING,   // "background|decorative|divider|card"
    fill: STRING,        // "#hex or gradient or transparent"
    borderRadius: NUMBER,
    clipPath: STRING,
    border: STRING,

    // Image fields
    src: STRING,         // "Exact URL from content"
    alt: STRING,
    objectFit: STRING,   // "cover" or "contain"
  },
  // Forces model to always output these — even if empty for non-applicable types
  required: ['id', 'type', 'x', 'y', 'width', 'height', 'zIndex',
    'color', 'fill', 'role', 'content', 'fontSize', 'fontWeight',
    'shapeType', 'src', 'objectFit'],
}
```

**בעיה ידועה**: הסכמה שטוחה מאלצת shape elements להחזיר `color`, `role`, `fontSize` וכו' — הם מחזירים ערכים ריקים/מיותרים. `sanitizeElement()` מנקה אותם אחר כך.

---

## 9. TypeScript Types

### PremiumDesignSystem

```typescript
interface PremiumDesignSystem extends DesignSystem {
  colors: {
    primary: string; secondary: string; accent: string;
    background: string; text: string; cardBg: string; cardBorder: string;
    gradientStart: string; gradientEnd: string; muted: string; highlight: string;
    auroraA: string; auroraB: string; auroraC: string;
  }
  fonts: { heading: string; body: string }  // always 'Heebo'
  direction: 'rtl' | 'ltr'                  // always 'rtl'
  typography: {
    displaySize: number; headingSize: number; subheadingSize: number;
    bodySize: number; captionSize: number;
    letterSpacingTight: number; letterSpacingWide: number;
    lineHeightTight: number; lineHeightRelaxed: number;
    weightPairs: [number, number][];
  }
  spacing: { unit: number; cardPadding: number; cardGap: number; safeMargin: number }
  effects: {
    borderRadius: 'sharp' | 'soft' | 'pill';
    borderRadiusValue: number;
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist';
    shadowStyle: 'none' | 'fake-3d' | 'glow';
    auroraGradient: string;
  }
  motif: { type: string; opacity: number; color: string; implementation: string }
  creativeDirection?: {
    visualMetaphor: string; visualTension: string; oneRule: string;
    colorStory: string; typographyVoice: string; emotionalArc: string;
  }
}
```

### Slide (Output)

```typescript
interface Slide {
  id: string
  slideType: SlideType
  label: string
  background: { type: 'solid' | 'gradient' | 'image'; value: string }
  elements: SlideElement[]
}

type SlideElement = TextElement | ShapeElement | ImageElement

interface TextElement {
  id: string; type: 'text'
  x: number; y: number; width: number; height: number; zIndex: number
  content: string; fontSize: number; fontWeight: number; color: string
  textAlign: string; role: 'title'|'subtitle'|'body'|'caption'|'label'|'decorative'
  lineHeight?: number; letterSpacing?: number; opacity?: number; rotation?: number
  textStroke?: { width: number; color: string }
}

interface ShapeElement {
  id: string; type: 'shape'
  x: number; y: number; width: number; height: number; zIndex: number
  shapeType: 'background'|'decorative'|'divider'|'card'
  fill: string
  clipPath?: string; borderRadius?: number; border?: string
  opacity?: number; rotation?: number
}

interface ImageElement {
  id: string; type: 'image'
  x: number; y: number; width: number; height: number; zIndex: number
  src: string; objectFit: 'cover' | 'contain'
  borderRadius?: number; clipPath?: string; alt?: string; opacity?: number
}
```

### Presentation (Final Output)

```typescript
interface Presentation {
  id: string
  title: string
  designSystem: PremiumDesignSystem
  slides: Slide[]
  metadata?: {
    brandName?: string
    createdAt: string
    version: number
    pipeline: string
    qualityScore?: number
    duration?: number
  }
}
```

---

## 10. בעיות ידועות בפלט

### בעיות שזוהו (מתוך ביקורת ארט דיירקטור על הפלט)

| בעיה | חומרה | שקפים מושפעים | סטטוס |
|------|--------|---------------|--------|
| **טקסט חופף טקסט** — decorative/watermark (200-400px) מכסה תוכן קריא | קריטי | ~6 מתוך 17 | ולידציה מזהה, auto-fix לא מספיק אגרסיבי |
| **כרטיסים ריקים** — shape card בלי text elements בתוכו | קריטי | 2-3 | anti-pattern #7 בפרומפט, אין ולידציה |
| **תוכן דליל** — שקפים עם רק כותרת + 1-2 אלמנטים | בינוני | 3-4 (deliverables, timeline) | אין minimum elements check |
| **רקעים מונוטוניים** — כל השקפים כהים (#0D0D0F) | בינוני | כולם | Design System מייצר background כהה תמיד |
| **textStroke/hollow text אגרסיבי** — watermark ענק עם stroke חזק | בינוני | 4-5 | sanitizeElement מתקן opacity אבל לא stroke |
| **Flat schema forces garbage values** — shape מחזיר `color: ""`, `role: ""` | קל | כולם | sanitizeElement מנקה |

### בעיות ארכיטקטוריות

1. **הפרומפט ארוך מדי** (~200 שורות) — המודל עלול "לשכוח" כללים שבתחילת הפרומפט
2. **דוגמה אחת בלבד** (cover) — המודל חוזר על אותו סגנון
3. **Watermark ב-editorial rules** ("200-400px עם opacity 0.03-0.08") סותר את anti-pattern #5 ("טקסט חופף טקסט אחר")
4. **אין בדיקת "כרטיס ריק"** — ולידציה לא בודקת שכל card shape מכיל text
5. **previousSlidesVisualSummary** תמיד ריק (מועבר כ-'' בגלל parallel batches) — אין הקשר בין באצ'ים

---

## 11. קבצי מקור

### File Tree

```
src/lib/gemini/
├── slide-designer.ts              # Main orchestration (~1100 lines)
│   ├── generateDesignSystem()     # Step 1: Creative Direction + Design System
│   ├── generateSlidesBatchAST()   # Step 2: Batch slide generation (5-7 slides per call)
│   ├── sanitizeElement()          # Post: fill missing fields from Design System
│   ├── buildBatchPrompt()         # THE prompt builder (~200 lines)
│   ├── generateAIPresentation()   # Full pipeline: DS → Content → 3 parallel batches → validate
│   ├── pipelineFoundation()       # Staged: DS + Content Curator (for Vercel timeout)
│   ├── pipelineBatch()            # Staged: one batch of slides
│   ├── pipelineFinalize()         # Staged: validate + logos
│   └── regenerateSingleSlide()    # Re-gen one slide with optional instruction
│
├── content-curator.ts             # Content Curator — AI copywriter (~285 lines)
│   ├── curateSlideContent()       # Transform raw JSON → punchy presentation content
│   └── buildFallbackCurated()     # Minimal fallback when AI fails
│
└── slide-design/                  # Sub-modules
    ├── index.ts                   # Re-exports
    ├── types.ts                   # Internal TypeScript types (~239 lines)
    ├── schemas.ts                 # Gemini Structured Output schemas (~154 lines)
    ├── config-loaders.ts          # Loads settings from admin panel / defaults (~100 lines)
    ├── slide-content-builder.ts   # Proposal data → SlideContentInput[][] (~262 lines)
    ├── validation.ts              # validateSlide() + autoFixSlide() + checkVisualConsistency() (~408 lines)
    ├── color-utils.ts             # WCAG contrast, luminance, color adjustment (~88 lines)
    ├── spatial-utils.ts           # AABB overlap, balance score, image placement (~89 lines)
    ├── fallbacks.ts               # Fallback slide builders (~165 lines)
    └── logo-injection.ts          # Leaders/client logo injection (~88 lines)

src/lib/
├── ai-provider.ts                 # AI router: Gemini / Claude / OpenAI (~408 lines)
└── config/
    ├── defaults.ts                # All defaults: prompts, models, design, pipeline (~680 lines)
    └── admin-config.ts            # Reads overrides from Supabase admin_config table
```

### AI Provider Call Flow

```typescript
// slide-designer.ts calls:
callAI({
  model: 'gemini-3.1-pro-preview',
  prompt: buildBatchPrompt(...),
  systemPrompt: systemInstruction,
  geminiConfig: {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: SLIDE_BATCH_SCHEMA,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    maxOutputTokens: 65536,
    temperature: 1.0,
  },
  responseSchema: SLIDE_BATCH_SCHEMA,
  noGlobalFallback: true,  // manages own retries
})

// ai-provider.ts routes to:
callGeminiDirect() → GoogleGenAI.models.generateContent({
  model, contents: prompt,
  config: { ...geminiConfig, responseSchema, responseMimeType }
})
```

### Rendering (after generation)

```
Presentation (JSON AST)
    → presentationToHtmlSlides() (ast-to-html.ts)
    → HTML string per slide (1920x1080 with inline styles)
    → Browser/puppeteer renders at scale
    → PDF via generateMultiPagePdf()
```
