/**
 * Smart Brief Engine — template registry.
 * תבנית = סכמת שדות; המנוע (עורך + AI + עמוד נמען) גנרי לחלוטין.
 * הוספת תבנית = אובייקט חדש במערך + (רשות) שורה בספריית המסמכים.
 *
 * הסכמות מדויקות לפי מסמכי המקור של לידרס בדרייב (לא הומצאו):
 * בריף יוצרת תוכן, בריף סושיאל, בריף טיקטוק, פלואו קריאייטיב להפקה,
 * סיכום חודשי עובד, סיכום חודשי מנהל. (בריף באנרים — מסמך המקור ריק,
 * הסכמה הורכבה לפי בריף העיצוב המקביל.)
 */

export type FieldType = 'text' | 'textarea' | 'list' | 'select' | 'date'

export type TemplateField = {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  /** הנחיה ל-AI איך למלא את השדה הזה */
  aiHint?: string
  options?: string[]
  /** section header rendered above this field */
  section?: string
  /** תוכן מוכן מהטמפלט המקורי — ממולא מראש בכל בריף חדש */
  defaultValue?: string | string[]
}

export type SmartBriefTemplate = {
  slug: string
  name: string
  english: string
  description: string
  /** מי הנמען של הבריף (מוצג בעמוד הציבורי) */
  audienceLabel: string
  /** קיבוץ בעמוד הבחירה */
  category: string
  fields: TemplateField[]
}

/** ערך שדה בטופס ממולא */
export type FieldValue = string | string[]
export type BriefFields = Record<string, FieldValue>

const isEmpty = (v: FieldValue | undefined) =>
  v === undefined || (Array.isArray(v) ? v.every((x) => !String(x).trim()) : !String(v).trim())

/** ממזג ערכי ברירת מחדל מהטמפלט לשדות ריקים (התוכן המוכן מנצח רק ריק) */
export function applyTemplateDefaults(template: SmartBriefTemplate, fields: BriefFields): BriefFields {
  const out: BriefFields = { ...fields }
  for (const f of template.fields) {
    if (f.defaultValue !== undefined && isEmpty(out[f.key])) out[f.key] = f.defaultValue
  }
  return out
}

export const SMART_BRIEF_TEMPLATES: SmartBriefTemplate[] = [
  // ── סושיאל וקריאייטיב ─────────────────────────────────
  {
    slug: 'content-creator',
    category: 'סושיאל וקריאייטיב',
    name: 'בריף יוצרת תוכן',
    english: 'Content Creator Brief',
    description: 'לפי הטמפלט המקורי — מטרה, תוצרים, מוצרים לצילום וטבלת תכנים',
    audienceLabel: 'ליוצרת התוכן',
    fields: [
      { key: 'brand_name', label: 'שם המותג', type: 'text', required: true, section: 'רקע' },
      { key: 'campaign_goal', label: 'מטרת הקמפיין', type: 'select', required: true, options: ['העלאת מודעות', 'יצירת טראסט', 'הדגשת USP', 'קידום מבצע'] },
      { key: 'target_audience', label: 'קהל יעד', type: 'text', required: true, placeholder: "נשים 25–40 / אמהות צעירות / סטודנטים וכו'" },
      { key: 'total_deliverables', label: 'סך הכל תוצרים', type: 'text', required: true, section: 'תוצרים', placeholder: 'למשל: 3 פוסטים + 5 סטוריז' },
      { key: 'post_story_format', label: 'גודל פוסט + סטורי', type: 'text', aiHint: 'פורמטים ומידות של התוצרים' },
      { key: 'products_to_shoot', label: 'מוצרים לצילום', type: 'list', aiHint: 'כל מוצר בשורה' },
      { key: 'content_plan', label: 'תכנים — טבלת תכנון', type: 'list', required: true, section: 'תכנים', aiHint: 'כל שורה פריט תוכן במבנה: נושא — דגשים — רפרנסים', placeholder: 'נושא — דגשים — רפרנסים' },
      {
        key: 'guidelines', label: 'דגשים', type: 'list', section: 'דגשים',
        defaultValue: ['לא להזכיר מתחרים', 'יש לשלב מוזיקה עם זכויות קידום', 'אין לעלות ללא אישור'],
        aiHint: 'שמור על שלושת הדגשים הקבועים והוסף דגשים ספציפיים לקמפיין',
      },
      { key: 'contact', label: 'איש קשר בלידרס', type: 'text', section: 'תפעול' },
    ],
  },
  {
    slug: 'social-posts',
    category: 'סושיאל וקריאייטיב',
    name: 'בריף סושיאל — פוסטים וסטוריז',
    english: 'Social Content Brief',
    description: 'לפי הטמפלט המקורי — תכנון גאנט תוכן לרשתות החברתיות',
    audienceLabel: 'לצוות הסושיאל',
    fields: [
      { key: 'brand_name', label: 'שם מותג', type: 'text', required: true, section: 'רקע' },
      { key: 'content_goal', label: 'מטרת התוכן', type: 'select', required: true, options: ['העלאת מודעות', 'טראסט', 'הנעה לפעולה', 'מכר'] },
      { key: 'concept', label: 'קונספט מרכזי / קמפיין (אם יש)', type: 'textarea' },
      {
        key: 'content_plan', label: 'תכנון תוכן', type: 'list', required: true, section: 'תכנון',
        aiHint: 'כל שורה פריט במבנה: תאריך — סוג תוכן (סטורי/פוסט) — קופי — פורמט (תמונה/וידאו/קרוסלה) — דגשים/קריאייטיב — קוד קופון',
        placeholder: 'תאריך — סוג — קופי — פורמט — דגשים — קוד קופון',
      },
      { key: 'contact', label: 'איש קשר בלידרס', type: 'text', section: 'תפעול' },
    ],
  },
  {
    slug: 'tiktok',
    category: 'סושיאל וקריאייטיב',
    name: 'בריף טיקטוק',
    english: 'TikTok Brief',
    description: 'לפי הטמפלט המקורי — תכנון תכנים שבועי/חודשי לטיקטוק',
    audienceLabel: 'ליוצר/ת התוכן',
    fields: [
      { key: 'brand_name', label: 'מותג', type: 'text', required: true, section: 'רקע' },
      { key: 'content_goal', label: 'מטרת התוכן', type: 'select', required: true, options: ['העלאת מודעות', 'יצירת מעורבות', 'בידול', 'מכירה'] },
      { key: 'concept_trends', label: 'קונספט / טרנדים / האשטגים מובילים', type: 'textarea', aiHint: 'טרנדים וסאונדים רלוונטיים לרכוב עליהם + האשטגים' },
      {
        key: 'content_plan', label: 'טבלת תכנון תוכן', type: 'list', required: true, section: 'תכנון',
        aiHint: 'כל שורה סרטון במבנה: תאריך — נושא/פורמט — תוכן/תסריט — אורך משוער — דגשים קריאייטיביים/טון — כתוביות',
        placeholder: 'תאריך — נושא — תסריט — אורך — דגשים — כתוביות',
      },
      { key: 'contact', label: 'איש קשר בלידרס', type: 'text', section: 'תפעול' },
    ],
  },
  {
    slug: 'banners',
    category: 'סושיאל וקריאייטיב',
    name: 'בריף באנרים',
    english: 'Banners Brief',
    description: 'בריף עיצוב באנרים — מסר, קופי, מידות ופורמטים',
    audienceLabel: 'למעצב/ת',
    fields: [
      { key: 'brand_name', label: 'שם המותג', type: 'text', required: true, section: 'רקע' },
      { key: 'campaign_goal', label: 'מטרת הקמפיין', type: 'textarea', required: true },
      { key: 'main_message', label: 'מסר מרכזי', type: 'textarea', required: true, section: 'קריאייטיב', aiHint: 'המסר האחד שהבאנר צריך להעביר במבט' },
      { key: 'copy_text', label: 'קופי לבאנר', type: 'textarea', required: true, aiHint: 'כותרת, תת-כותרת וטקסט כפתור — קצר וממוקד' },
      { key: 'sizes', label: 'מידות נדרשות', type: 'list', required: true, aiHint: 'כל שורה מידה אחת, למשל: 300x250, 970x250, 1080x1080' },
      { key: 'formats', label: 'פורמט', type: 'select', options: ['סטטי', 'אנימציה (GIF/HTML5)', 'וידאו', 'שילוב'] },
      { key: 'brand_assets', label: 'קבצי מותג', type: 'textarea', aiHint: 'קישורים ללוגו, פונטים, תמונות ומדריך מותג' },
      { key: 'references', label: 'רפרנסים', type: 'textarea' },
      { key: 'deadline', label: 'דדליין', type: 'date', section: 'תפעול' },
      { key: 'contact', label: 'איש קשר בלידרס', type: 'text' },
    ],
  },

  // ── הפקות וימי צילום ──────────────────────────────────
  {
    slug: 'production-flow',
    category: 'הפקות וימי צילום',
    name: 'פלואו קריאייטיב להפקה',
    english: 'Production Flow',
    description: 'לפי המסמך המקורי — כל שלבי ההפקה עם בעלי התפקידים, מוכן לסימון',
    audienceLabel: 'לצוות ההפקה',
    fields: [
      { key: 'production_name', label: 'שם ההפקה', type: 'text', required: true, section: 'כללי' },
      { key: 'client_brand', label: 'לקוח / מותג', type: 'text' },
      { key: 'shoot_date', label: 'תאריך צילום משוער', type: 'date' },
      {
        key: 'stages', label: 'שלבי הפלואו', type: 'list', required: true, section: 'הפלואו',
        aiHint: 'שמור על סדר השלבים המקורי; עדכן סטטוס או הערות בסוף שורה לפי ההקשר',
        defaultValue: [
          'הצעת קריאייטיב (אסטרטגיה + קריאייטיב + רפרנסים) — קריאייטיב',
          'הצגת קריאייטיב פנימית — קריאייטיב + ניהול לקוח',
          'הצגת קריאייטיב מול לקוח לאישור יציאה לדרך — קריאייטיב + ניהול לקוח',
          'מצגת הפקה בסיסית: לו״ז, תקציב, לוקיישנים, ליהוק, סטיילינג, ארט — קריאייטיב + ניהול לקוח',
          'הצגת מצגת הפקה ללקוח וחתימה על תקציב — קריאייטיב + ניהול לקוח',
          'חיבור למפיקה / חברת הפקה — ניהול לקוח',
          'התנעה פנימית עם מפיקה: צילום רחב/ורטיקלי, קריינות, מסגרת תוצרים, גרסאות, פס קול — קריאייטיב + ניהול לקוח',
          'ליהוק אנשי צוות ראשונים: במאי + צלם — מפיקה + ניהול לקוח + קריאייטיב',
          'סיור לוקיישן — מפיקה + במאי + צלם + קריאייטיב + ניהול לקוח',
          'יצירת סטורי בורד / תסריט — במאי + צלם + קריאייטיב',
          'יצירת שוטינג סקריפט — במאי + צלם + קריאייטיב',
          'סגירת כלל אנשי הצוות: ארט, תאורה, הלבשה, איפור, לוקיישן, ע. במאי — הפקה',
          'פגישה פנימית ליישור קו על כל האלמנטים — כולם',
          'הצגת סטורי בורד ומצגת הפקה מעודכנת ללקוח לאישור סופי — כולם',
          'בניית ברייקדאון יום צילום — הפקה',
          'פגישה פנימית לפני צילומים + סגירת קופה קטנה ורכישת הארדיסקים — כולם',
          'צילומים',
          'עבודת פוסט',
          'אופליין ראשון — פנימי מול קריאייטיב וניהול לקוח — הפקה/במאי',
          'גרסה ראשונה ללקוח — הפקה/במאי',
          'אונליין: קריינות, צבע, סאונד — אישור פנימי — הפקה/במאי',
          'גרסה סופית ללקוח — קריאייטיב + ניהול לקוח',
          'עריכת גרסאות נוספות: ורטיקלי / ריבועי / טיזר / באמפר — הפקה/במאי',
          'לשלוח מילות תודה לצוות ההפקה',
          'העלאת התוכן בנכסי לידרס — קריאייטיב + ניהול לקוח',
        ],
      },
      { key: 'notes', label: 'הערות', type: 'textarea', section: 'תפעול' },
      { key: 'contact', label: 'מנהל/ת ההפקה', type: 'text' },
    ],
  },

  // ── ניהול ודיווח ──────────────────────────────────────
  {
    slug: 'monthly-employee',
    category: 'ניהול ודיווח',
    name: 'סיכום חודשי — עובד',
    english: 'Monthly Summary — Employee',
    description: 'לפי הטמפלט המקורי — סטטוס פרויקטים, תרומה אישית והיילייטס',
    audienceLabel: 'למנהל/ת הישיר/ה',
    fields: [
      { key: 'month', label: 'חודש הדיווח', type: 'text', required: true, section: 'כללי', placeholder: 'למשל: אוגוסט 2026' },
      {
        key: 'projects_status', label: 'סטטוס פרויקטים פעילים', type: 'list', required: true, section: '1. פרויקטים',
        aiHint: 'לכל פרויקט שורה: שם — שלב (הצעה/סגירה/תכנון/הפקה/באוויר/סיכום) — מה בוצע החודש — מה מתוכנן לחודש הבא. יש להוסיף דוגמאות ולינקים לתכנים',
      },
      { key: 'challenges', label: 'אתגרים / חסמים', type: 'list', aiHint: 'עיכובים מצד לקוח, בעיות בתוצרים, תקציב לא אושר וכו׳' },
      {
        key: 'personal_contribution', label: 'תרומה אישית לפעילות', type: 'list', required: true, section: '2. תרומה אישית',
        aiHint: 'יזמות, הצעות חדשות, שיתופי פעולה, סיוע לצוותים אחרים, איפה נלקחה אחריות נוספת',
      },
      {
        key: 'personal_highlights', label: 'היילייטס אישיים מהחודש', type: 'list', section: '3. היילייטס',
        aiHint: 'מהלך קריאייטיבי בולט, תוצר מרגש, פידבק חיובי, הצלחה מול ספק/צוות, נתון חזק מהקמפיינים',
      },
    ],
  },
  {
    slug: 'monthly-manager',
    category: 'ניהול ודיווח',
    name: 'סיכום חודשי — מנהל',
    english: 'Monthly Summary — Manager',
    description: 'לפי הטמפלט המקורי — יעדים כספיים, פרויקטים, נושא מקודם והיילייטס',
    audienceLabel: 'להנהלה',
    fields: [
      { key: 'month', label: 'חודש הדיווח', type: 'text', required: true, section: 'כללי', placeholder: 'למשל: אוגוסט 2026' },
      { key: 'financial_target', label: 'יעד כספי (₪)', type: 'text', required: true, section: '1. סטטוס יעד החודש' },
      { key: 'actual_amount', label: 'בוצע בפועל (₪)', type: 'text', required: true },
      { key: 'target_percent', label: '% מהיעד', type: 'text' },
      { key: 'quotes_sent', label: 'הצעות מחיר שנשלחו', type: 'text', placeholder: 'כמות + סה״כ סכום' },
      { key: 'quotes_closed', label: 'הצעות שאושרו / נסגרו', type: 'text', placeholder: 'כמות + סה״כ סכום' },
      {
        key: 'target_actions', label: 'מה נעשה כדי להגיע ליעד', type: 'list', required: true, section: '2. פעולות',
        aiHint: 'שיחות יזומות, upsell, הצעות יצירתיות, קמפיינים מיוחדים וכו׳',
      },
      {
        key: 'projects_status', label: 'עדכון על כלל הפרויקטים הפעילים', type: 'list', required: true, section: '3. פרויקטים',
        aiHint: 'לכל פרויקט: שלב נוכחי — מה בוצע החודש — מה מתוכנן להמשך',
      },
      { key: 'challenges', label: 'אתגרים / חסמים', type: 'list' },
      {
        key: 'focus_topic', label: 'התייחסות לנושא מקודם מתוכנית העבודה', type: 'textarea', section: '4. נושא מקודם',
        aiHint: 'איך התקדם החודש, אבני דרך שהושגו, חסמים ונקודות לעבודה בחודש הבא',
      },
      {
        key: 'highlights', label: 'היילייטים מהחודש', type: 'list', section: '5. היילייטס',
        aiHint: 'מהלך קריאייטיבי בולט / תוצר טוב (עם לינקים), משוב חיובי מלקוח, הצלחה מול משפיען/ספק, נתון חשוב',
      },
    ],
  },
]

export function getTemplate(slug: string): SmartBriefTemplate | undefined {
  return SMART_BRIEF_TEMPLATES.find((t) => t.slug === slug)
}
