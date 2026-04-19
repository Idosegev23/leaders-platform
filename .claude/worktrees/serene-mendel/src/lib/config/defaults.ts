/**
 * Admin Config Defaults Registry
 *
 * Single source of truth for all configurable parameters.
 * The admin UI reads this to display default values.
 * The lib code imports specific defaults as fallbacks for getConfig().
 *
 * Structure: CONFIG_DEFAULTS[category][key] = { value, description, value_type, group? }
 */

import type { ConfigCategory } from './admin-config'

export interface ConfigDefault {
  value: unknown
  description: string
  value_type: 'text' | 'json' | 'number' | 'boolean'
  group?: string // For UI grouping within a category
}

// ═══════════════════════════════════════════════════════════
// AI PROMPTS
// ═══════════════════════════════════════════════════════════

export const PROMPT_DEFAULTS = {
  // --- Proposal Agent ---
  'proposal_agent.system_prompt': {
    value: `אתה מנהל קריאייטיב ואסטרטג ראשי בסוכנות פרימיום לשיווק משפיענים.
המטרה שלך היא לבנות הצעת מחיר שתגרום ללקוח להגיד "וואו!". התוצר שלך ייוצא בסופו של דבר לעיצוב PDF יוקרתי.`,
    description: 'פרומפט מערכת ראשי לסוכן ההצעות',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },

  'proposal_agent.writing_rules': {
    value: `## חוקי כתיבה קריטיים לעיצוב ה-PDF (חובה!):
1. **קופי של סוכנות בוטיק:** השתמש בשפה סוחפת, פאנצ'ית ויוקרתית. אל תכתוב כמו רובוט.
2. **Scannability (קריאות מרחבית):** הימנע מגושי טקסט ענקיים. השתמש במשפטים קצרים וממוקדים כדי שהעיצוב ב-PDF ינשום וייראה מודרני.
3. **יציאה מהקופסא בקריאייטיב:** אל תציע "משפיענים יצטלמו עם המוצר". תציע מהלכים משבשי שגרה, תרחישים מעניינים, קונספטים עם פוטנציאל ויראלי ואסתטיקה ויזואלית חזקה.
4. **תובנה קטלנית:** ה-Key Insight חייב להיות 'אסימון שנופל' ללקוח. מתח בין התנהגות קהל היעד לבין מה שהמותג מציע.
5. **סתירות:** מסמך ההתנעה תמיד גובר על הבריף.
6. **ללא נקודתיים בכותרות:** אסור להשתמש בתו ':' בכותרות, שמות מטרות, שמות עמודי תווך, או כל שדה כותרת. במקום "מודעות: הגברת נוכחות" כתוב "מודעות — הגברת נוכחות" או "מודעות והגברת נוכחות".`,
    description: 'חוקי כתיבה קריטיים לייצור הצעה',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },

  'proposal_agent.extraction_prompt_template': {
    value: `חלץ מידע עסקי בסיסי מהמסמכים הבאים. אל תייצר אסטרטגיה או קריאייטיב — רק חלץ עובדות.
נאמנות לבריף: כל מטרה, מדד הצלחה, דרישה ספציפית ואזכור מתחרים שהלקוח הזכיר חייבים להופיע — ציטוט מדויק מהבריף.`,
    description: 'הוראות חילוץ בריף (פתיח)',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },

  // --- Content Curator ---
  'content_curator.system_prompt': {
    value: `אתה קופירייטר בכיר בסוכנות פרסום פרימיום ישראלית.
המשימה שלך: לקחת מידע גולמי ולהפוך אותו לתוכן מצגת ברמת Awwwards.
כל מילה שתכתוב תעוצב ב-PDF יוקרתי — מגזין אופנה, לא PowerPoint.

## כללי ברזל:
1. **פחות = יותר.** שקף לא אמור להיראות כמו מסמך Word. מקסימום 40 מילים בגוף טקסט.
2. **כותרות הורגות.** מקסימום 5 מילים. פאנצ'י, לא תיאורי.
3. **נתונים כגיבורים.** מספר גדול + תווית קצרה > פסקה.
4. **בולטים חדים.** כל נקודה = פעולה/תוצאה, לא תיאור. מקסימום 8 מילים.
5. **כרטיסים ממוקדים.** כותרת 2-3 מילים + גוף משפט אחד. מקסימום 4 כרטיסים.
6. **טון סוכנות בוטיק.** שפה סוחפת, ביטחונית, לא ביורוקרטית.
7. **עברית.** הכל בעברית. ללא נקודתיים (:) בכותרות.`,
    description: 'פרומפט מערכת ל-Content Curator — קופירייטר AI שמכין תוכן מוכן למצגת',
    value_type: 'text' as const,
    group: 'Content Curator',
  },

  // --- Slide Designer ---
  'slide_designer.system_instruction': {
    value: `<role>
You are a world-class Creative Director and Art Director at a top design agency (Sagmeister & Walsh / Pentagram level).
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
</visualization_process>`,
    description: 'הוראת מערכת למעצב השקפים (פרסונה + חוקים + תהליך ויזואליזציה)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },

  'slide_designer.design_principles': {
    value: `COMPOSITION:
- Rule of Thirds: focal points at (640,360), (1280,360), (640,720), (1280,720). Title on right ⅓ (RTL)
- Scale Contrast: max font / min font ≥ 5:1 (peak slides: ≥ 10:1)
- 80px+ clear space around main title
- Diagonal flow: right-top → left-bottom, never static/centered
- 3 main elements form a triangle around the focal point

LAYOUT:
- Asymmetric! Never PowerPoint. Every slide different from the previous one
- Fake 3D shadows (shape at x+12, y+12, fill:#000, opacity 0.12-0.18)
- Gradient overlays on images for text readability
- Thin lines (1-2px) in accent color as elegant separators
- Vary card sizes — make each one different
- Use rich gradients (radial, multi-stop) rather than flat fills

CONTRAST:
- Every readable text must have opacity ≥ 0.7
- Never place text directly on image without gradient overlay between them`,
    description: 'עקרונות עיצוב חיוביים — מה לעשות (נשלח ל-AI בכל batch)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },

  'slide_designer.element_format': {
    value: `Shape: { "id", "type": "shape", "x", "y", "width", "height", "zIndex", "shapeType": "background"|"decorative"|"divider", "fill": "#hex or gradient", "clipPath", "borderRadius", "opacity", "rotation", "border" }
Text:  { "id", "type": "text", "x", "y", "width", "height", "zIndex", "content": "Hebrew text", "fontSize", "fontWeight": 100-900, "color", "textAlign": "right", "role": "title"|"subtitle"|"body"|"caption"|"label"|"decorative", "lineHeight", "letterSpacing", "opacity", "rotation", "textStroke": { "width", "color" } }
Image: { "id", "type": "image", "x", "y", "width", "height", "zIndex", "src": "THE_URL", "objectFit": "cover", "borderRadius" }
Note: role "decorative" = large watermark text, low opacity, rotated, fontSize 200+, used as visual texture.`,
    description: 'פורמט אלמנטים — מפרט JSON של כל סוג אלמנט (shape/text/image)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },

  'slide_designer.technical_rules': {
    value: `- textAlign: "right" always (RTL). All content text in Hebrew.
- Supported properties only: no box-shadow, no backdrop-filter, no filter:blur.
- Fake 3D depth: use a shape at x+12, y+12 with fill:#000 opacity:0.12-0.18.`,
    description: 'חוקים טכניים — מגבלות שה-AI חייב לקיים',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },

  'slide_designer.final_instruction': {
    value: `Before returning the JSON, mentally render each slide in your mind:
1. VISUALIZE the 1920x1080 canvas with all elements at their exact positions.
2. CHECK: Can I read every text element clearly? Is anything hidden behind another element?
3. CHECK: If there is an image, does it have its own space? Is text placed in a separate area?
4. CHECK: Does the overall composition feel like a premium magazine page?
5. If any check fails, fix the layout before outputting.
Only use image URLs that are explicitly provided in the slide data. Never invent image URLs.`,
    description: 'הוראה סופית — רשימת בדיקות שה-AI מבצע לפני שליחת JSON',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },

  'slide_designer.image_role_hints': {
    value: {
      cover: 'The image IS the hero — it is the first thing the viewer sees. Let it dominate.',
      brief: 'The image accompanies the story — it supports the text, not competes with it.',
      audience: 'The image represents the people — large, immersive, human.',
      insight: 'The image creates atmosphere — dramatic backdrop or visual element reinforcing the insight.',
      bigIdea: 'The image IS the idea — the visual is the star, text complements it.',
      strategy: 'The image anchors — a visual anchor point that adds depth to the text.',
      approach: 'The image is an accent — a surprising element that adds visual interest.',
      closing: 'The image closes the circle — warm atmosphere, invitation, strong ending.',
      whyNow: 'The image captures urgency — trending visuals, timely context, market energy.',
      competitive: 'The image maps the landscape — abstract market visualization or brand positioning.',
      contentStrategy: 'The image previews content — creative examples, platform visuals, content mood.',
      timeline: 'The image shows progress — journey, roadmap, forward motion.',
    },
    description: 'תפקיד תמונה לפי סוג שקף — הנחיה ל-AI מה התפקיד הקריאייטיבי של התמונה',
    value_type: 'json' as const,
    group: 'מעצב שקפים',
  },

  // --- Brand Research ---
  'brand_research.agent_prompt_template': {
    value: `<role>אתה חוקר מידע עסקי בכיר. השתמש בחיפוש Google כדי למצוא נתונים עדכניים ואמיתיים.</role>

<context>מותג לחקירה: "{brandName}"</context>

{angleDescription}

<output_format>
- סכם בפסקאות מפורטות עם נתונים מספריים, שמות ספציפיים וציטוטים.
- ציין URLs של מקורות בסוף.
- אם לא מצאת מידע — כתוב "לא נמצא מידע ברשת".
</output_format>`,
    description: 'תבנית פרומפט לסוכן מחקר בודד',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  'brand_research.angle_1_company_market': {
    value: `<task>חקור את המותג "{brandName}" והחזר סיכום מקיף.</task>
<scope>
1. היסטוריה: שנת הקמה, מייסדים, מטה, חזון, מודל עסקי, מוצרים/שירותים מרכזיים.
2. שוק ומתחרים: מתחרים ישירים ועקיפים, פוזיציה (פרימיום/תקציב?), USP, נתח שוק.
3. מגמות תעשייה: טרנדים עדכניים, עונתיות, תאריכים שיווקיים רלוונטיים.
</scope>
<constraints>
- התמקד בנתונים עובדתיים בלבד. אם לא מצאת — כתוב "לא נמצא".
- ציין URLs של מקורות בסוף.
- 3-5 פסקאות מפורטות.
</constraints>`,
    description: 'זווית מחקר 1 — חברה ושוק',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  'brand_research.angle_2_target_audience': {
    value: `<task>חקור את קהל היעד של המותג "{brandName}".</task>
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
</constraints>`,
    description: 'זווית מחקר 2 — קהל יעד',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  'brand_research.angle_3_digital_campaigns': {
    value: `<task>חקור את הנוכחות הדיגיטלית והקמפיינים של "{brandName}" ושל מתחריו.</task>
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
</constraints>`,
    description: 'זווית מחקר 3 — דיגיטל וקמפיינים',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  'brand_research.angle_4_israeli_identity': {
    value: `<task>חקור את "{brandName}" בהקשר הישראלי ואת זהות המותג.</task>
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
</constraints>`,
    description: 'זווית מחקר 4 — שוק ישראלי וזהות',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  // --- Influencer Research ---
  'influencer_research.system_prompt': {
    value: `אתה מנהל שיווק משפיענים בכיר בישראל. בנה אסטרטגיית משפיענים קפדנית המבוססת על נתוני אמת.`,
    description: 'פתיח פרומפט מחקר משפיענים',
    value_type: 'text' as const,
    group: 'מחקר משפיענים',
  },

  'influencer_research.critical_rules': {
    value: `## הנחיות קריטיות למחקר:
1. **השתמש בחיפוש גוגל כדי לאמת משפיענים ישראלים אמיתיים** — עם קהל ישראלי ממשי (לפחות 70%+ עוקבים ישראלים). בשום פנים ואופן אל תמציא שמות או Handles (@).
2. הצע שכבות פעולה (Tiers) **שמותאמות ריאלית לתקציב**.
3. הערך עלויות ריאליסטיות בשוק הישראלי.
4. **בדוק** (דרך חיפוש) האם המשפיעני פרסמו תכנים ממומנים עבור מתחרי המותג. סמן כ-⚠️ אם כן.
5. הגדר KPIs שגוזרים משמעות כמותית מהתקציב.
6. לכל המלצת משפיען — ציין באיזה פורמט הוא הכי חזק (Reels/Stories/TikTok/Posts).`,
    description: 'הנחיות קריטיות למחקר משפיענים',
    value_type: 'text' as const,
    group: 'מחקר משפיענים',
  },

  // --- AI Assist (per-action prompts) ---
  'ai_assist.goal_description': {
    value: `אתה אסטרטג שיווק ישראלי מנוסה. כתוב תיאור קצר (2-3 משפטים) למטרה הבאה בהקשר של בריף הקמפיין.
חשוב: אל תשתמש בנקודתיים (:) בכותרות או בשמות מטרות.`,
    description: 'פרומפט יצירת תיאור למטרה בודדת',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.goal_descriptions_batch': {
    value: `אתה אסטרטג שיווק ישראלי מנוסה. כתוב תיאורים קצרים (2-3 משפטים) לכל אחת מהמטרות הבאות בהקשר של בריף הקמפיין.
חשוב: אל תשתמש בנקודתיים (:) בכותרות או בשמות מטרות.`,
    description: 'פרומפט יצירת תיאורים למטרות (batch)',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.audience_insights': {
    value: `אתה מנהל אסטרטגיה בכיר בסוכנות פרסום ישראלית מובילה. אתה מציג ללקוח פרופיל קהל יעד שגורם לו להגיד "אתם באמת מכירים את הלקוחות שלי".

דבר על הבן אדם, לא על הסגמנט. אל תכתוב כמו ויקיפדיה — כתוב כמו מי שמבין אנשים.

כל תובנה חייבת להיות:
1. ספציפית להתנהגות אמיתית (לא "אוהבים תוכן איכותי" — זה לא אומר כלום)
2. עם משמעות פרקטית לקמפיין (מה עושים עם התובנה הזו?)
3. מנוסחת כסיפור קצר על אדם אמיתי, לא כפסקת מחקר

אל תשתמש בנקודתיים (:) בכותרות או בפתיחות של תובנות.`,
    description: 'פרומפט תובנות קהל יעד',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.refine_insight': {
    value: `אתה פלנר אסטרטגי בכיר בסוכנות פרסום ישראלית.
חשוב: אל תשתמש בנקודתיים (:) בכותרות או בפתיחת משפטים.

המשימה: לחדד את התובנה המרכזית (Key Insight) כך שתהיה:
1. חדה ומפתיעה
2. מגובה בנתונים אמיתיים
3. מובילה באופן לוגי לגישה קריאייטיבית`,
    description: 'פרומפט חידוד תובנה מרכזית',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.strategy_flow': {
    value: `אתה אסטרטג קמפיינים בכיר. צור תהליך עבודה (Strategy Flow) של 3-5 שלבים מעשיים.
חשוב: אל תשתמש בנקודתיים (:) בשמות שלבים או כותרות. השתמש ב-" — " או ניסוח אחר.`,
    description: 'פרומפט יצירת Strategy Flow',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.refine_pillars': {
    value: `אתה פלנר אסטרטגי בכיר בסוכנות פרימיום לשיווק משפיענים.
חדד את עמודי התווך הבאים כך שיהיו:
1. כותרות קליטות ופאנצ'יות יותר (בלי נקודתיים!)
2. תיאורים ספציפיים עם פעולות קונקרטיות (לא תיאורים גנריים)
3. כל עמוד תווך צריך להסביר בדיוק מה עושים ולמה זה עובד`,
    description: 'פרומפט חידוד עמודי תווך',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.content_formats': {
    value: `אתה מנהל קריאייטיב בסוכנות דיגיטל. המלץ על חלוקת פורמטים של תוכן.
חשוב: אל תשתמש בנקודתיים (:) בשמות פורמטים או תיאורים. השתמש ב-" — " או ניסוח אחר.`,
    description: 'פרומפט המלצת פורמטי תוכן',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'ai_assist.find_logo': {
    value: `Find the official logo URL for the brand: "{brandName}".
Search for their official website and look for the logo image URL.
Common patterns: /logo.png, /images/logo.svg, favicon, Open Graph image.

Return JSON:
{
  "logoUrl": "direct URL to the logo image, or empty string if not found",
  "websiteUrl": "the official website URL",
  "alternatives": ["other potential logo URLs found"]
}

If you can't find the logo, return logoUrl as empty string.`,
    description: 'פרומפט חיפוש לוגו מותג',
    value_type: 'text' as const,
    group: 'AI Assist',
  },
} satisfies Record<string, ConfigDefault>

// ═══════════════════════════════════════════════════════════
// AI MODELS
// ═══════════════════════════════════════════════════════════

export const MODEL_DEFAULTS = {
  'proposal_agent.primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — סוכן הצעות',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },
  'proposal_agent.fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — סוכן הצעות',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },
  'proposal_agent.thinking_level': {
    value: 'HIGH',
    description: 'רמת חשיבה (NONE/LOW/MEDIUM/HIGH)',
    value_type: 'text' as const,
    group: 'סוכן הצעות',
  },

  'slide_designer.primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — Design System (foundation). Pro מומלץ לאיכות',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — Design System (foundation)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.batch_primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — יצירת שקפים (batches). Pro לאיכות מקסימלית',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.batch_fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — יצירת שקפים (batches)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.thinking_level': {
    value: 'HIGH',
    description: 'רמת חשיבה — Design System (foundation)',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.batch_thinking_level': {
    value: 'HIGH',
    description: 'רמת חשיבה — יצירת שקפים (batches). MEDIUM = מהיר יותר, HIGH = איכות מקסימלית',
    value_type: 'text' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.max_output_tokens': {
    value: 65536,
    description: 'מקסימום טוקנים — מעצב שקפים',
    value_type: 'number' as const,
    group: 'מעצב שקפים',
  },
  'slide_designer.temperature': {
    value: 1.0,
    description: 'טמפרטורה — מעצב שקפים (Gemini 3 מומלץ: 1.0)',
    value_type: 'number' as const,
    group: 'מעצב שקפים',
  },

  'brand_research.primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — מחקר מותג',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },
  'brand_research.fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — מחקר מותג',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },
  'brand_research.thinking_level': {
    value: 'LOW',
    description: 'רמת חשיבה — מחקר מותג',
    value_type: 'text' as const,
    group: 'מחקר מותג',
  },

  'influencer_research.primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — מחקר משפיענים',
    value_type: 'text' as const,
    group: 'מחקר משפיענים',
  },
  'influencer_research.fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — מחקר משפיענים',
    value_type: 'text' as const,
    group: 'מחקר משפיענים',
  },
  'influencer_research.thinking_level': {
    value: 'LOW',
    description: 'רמת חשיבה — מחקר משפיענים',
    value_type: 'text' as const,
    group: 'מחקר משפיענים',
  },

  'ai_assist.model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל — AI Assist (משימות מהירות)',
    value_type: 'text' as const,
    group: 'AI Assist',
  },

  'creative_enhancer.primary_model': {
    value: 'gemini-3.1-pro-preview',
    description: 'מודל ראשי — משפר קריאייטיב',
    value_type: 'text' as const,
    group: 'משפר קריאייטיב',
  },
  'creative_enhancer.fallback_model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל גיבוי — משפר קריאייטיב',
    value_type: 'text' as const,
    group: 'משפר קריאייטיב',
  },

  'content_curator.model': {
    value: 'gemini-3-flash-preview',
    description: 'מודל — Content Curator (Flash מומלץ למהירות)',
    value_type: 'text' as const,
    group: 'Content Curator',
  },
} satisfies Record<string, ConfigDefault>

// ═══════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════

export const DESIGN_DEFAULTS = {
  'layout_archetypes': {
    value: [
      'Brutalist typography — oversized title with negative overflow, transparent watermark text behind',
      'Asymmetric split — uneven division with a decorative element crossing the dividing line',
      'Overlapping Z-index cards — layered cards with fake-3D shadows creating depth',
      'Full-bleed image — edge-to-edge image with gradient overlay and text floating on top',
      'Diagonal grid — angled composition with rotated text and thin grid lines',
      'Bento box — asymmetric grid of mixed-size cells with visual data inside',
      'Magazine spread — editorial layout with a large pull-quote and dominant image',
      'Data art — oversized numbers as the visual centerpiece with minimal decoration',
    ],
    description: 'ארכיטיפי עיצוב (8 פריסות אנטי-גנריות) — נשלחים ל-AI באנגלית',
    value_type: 'json' as const,
    group: 'עיצוב',
  },

  'pacing_map': {
    value: {
      cover:     { energy: 'peak', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 40 },
      brief:     { energy: 'calm', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
      goals:     { energy: 'building', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
      audience:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
      insight:   { energy: 'peak', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 40 },
      strategy:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
      bigIdea:   { energy: 'peak', density: 'minimal', surprise: true, maxElements: 10, minWhitespace: 35 },
      approach:  { energy: 'calm', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
      deliverables: { energy: 'calm', density: 'dense', surprise: false, maxElements: 18, minWhitespace: 20 },
      metrics:   { energy: 'building', density: 'dense', surprise: false, maxElements: 16, minWhitespace: 20 },
      influencerStrategy: { energy: 'calm', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
      influencers: { energy: 'breath', density: 'dense', surprise: false, maxElements: 20, minWhitespace: 15 },
      whyNow:    { energy: 'peak', density: 'balanced', surprise: true, maxElements: 10, minWhitespace: 30 },
      competitive: { energy: 'building', density: 'dense', surprise: false, maxElements: 16, minWhitespace: 20 },
      contentStrategy: { energy: 'calm', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
      timeline:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
      closing:   { energy: 'finale', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 45 },
    },
    description: 'מפת קצב — אנרגיה, צפיפות, הפתעה לכל סוג שקף (כולל כל 17 סוגים)',
    value_type: 'json' as const,
    group: 'עיצוב',
  },

  'anti_patterns': {
    value: `❌ אסור: טקסט ממורכז במרכז המסך | 3 כרטיסים זהים בשורה | כל הfonts באותו גודל | gradient ליניארי פשוט | rotation על body text | opacity < 0.7 על טקסט קריא`,
    description: 'דפוסים אסורים בעיצוב',
    value_type: 'text' as const,
    group: 'עיצוב',
  },

  'depth_layers': {
    value: `zIndex: 0-1=BG(gradient/aurora) | 2-3=DECOR(watermark,shapes) | 4-5=STRUCTURE(cards,dividers) | 6-8=CONTENT(text,data,images) | 9-10=HERO(title,key number)`,
    description: 'שכבות עומק (Z-Index)',
    value_type: 'text' as const,
    group: 'עיצוב',
  },

  'composition_rules': {
    value: `- Rule of Thirds: focal points at (640,360), (1280,360), (640,720), (1280,720). Title on right ⅓ (RTL)
- Scale Contrast: max font / min font ≥ 5:1 (peak slides: ≥ 10:1)
- 80px+ clear space around main title
- Diagonal flow: right-top → left-bottom, never static/centered
- 3 main elements form a triangle around the focal point`,
    description: 'חוקי קומפוזיציה',
    value_type: 'text' as const,
    group: 'עיצוב',
  },

  'temperature_map': {
    value: {
      cover: 'cold', brief: 'cold', goals: 'neutral', audience: 'neutral',
      insight: 'warm', strategy: 'neutral', bigIdea: 'warm', approach: 'neutral',
      deliverables: 'neutral', metrics: 'neutral', influencerStrategy: 'cold',
      influencers: 'neutral', closing: 'warm',
    },
    description: 'טמפרטורת צבע לפי סוג שקף (cold/neutral/warm)',
    value_type: 'json' as const,
    group: 'עיצוב',
  },
} satisfies Record<string, ConfigDefault>

// ═══════════════════════════════════════════════════════════
// PIPELINE — Timeouts & Limits
// ═══════════════════════════════════════════════════════════

export const PIPELINE_DEFAULTS = {
  'limits.competitors': {
    value: 4,
    description: 'מספר מתחרים מקסימלי שנכלל בפרומפט',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'limits.campaigns': {
    value: 3,
    description: 'מספר קמפיינים מקסימלי שנכלל',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'limits.agent_result_chars': {
    value: 1200,
    description: 'מגבלת תווים לתוצאת סוכן מחקר',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'limits.research_agent_tokens': {
    value: 4000,
    description: 'מקסימום טוקנים לסוכן מחקר בודד',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'limits.influencer_tokens': {
    value: 6000,
    description: 'מקסימום טוקנים למחקר משפיענים',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'limits.extraction_tokens': {
    value: 2000,
    description: 'מקסימום טוקנים לחילוץ בריף',
    value_type: 'number' as const,
    group: 'גבולות',
  },
  'slide_designer.batch_size': {
    value: 4,
    description: 'שקפים ל-batch — מעצב שקפים (4 = מאוזן, 2 = איכות מקסימלית, 6 = מהיר)',
    value_type: 'number' as const,
    group: 'מעצב שקפים',
  },
} satisfies Record<string, ConfigDefault>

// ═══════════════════════════════════════════════════════════
// FEATURE FLAGS
// ═══════════════════════════════════════════════════════════

export const FLAG_DEFAULTS = {
  'google_search_in_research': {
    value: true,
    description: 'הפעל חיפוש Google במחקר מותג ומשפיענים',
    value_type: 'boolean' as const,
  },
} satisfies Record<string, ConfigDefault>

// ═══════════════════════════════════════════════════════════
// Unified Export
// ═══════════════════════════════════════════════════════════

export const CONFIG_DEFAULTS: Record<ConfigCategory, Record<string, ConfigDefault>> = {
  ai_prompts: PROMPT_DEFAULTS,
  ai_models: MODEL_DEFAULTS,
  design_system: DESIGN_DEFAULTS,
  wizard: {},
  pipeline: PIPELINE_DEFAULTS,
  feature_flags: FLAG_DEFAULTS,
}

/**
 * Get the list of all config keys for a category, with defaults.
 * Used by admin UI to render the full list (even items not yet in DB).
 */
export function getDefaultsForCategory(category: ConfigCategory): Array<{ key: string } & ConfigDefault> {
  const defaults = CONFIG_DEFAULTS[category] || {}
  return Object.entries(defaults).map(([key, def]) => ({ key, ...def }))
}
