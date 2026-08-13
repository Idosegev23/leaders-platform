/**
 * Smart Brief Engine — template registry.
 * תבנית = סכמת שדות; המנוע (עורך + AI + עמוד נמען) גנרי לחלוטין.
 * הוספת בריף חדש = אובייקט חדש במערך + (רשות) שורה בספריית המסמכים.
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
}

export type SmartBriefTemplate = {
  slug: string
  name: string
  english: string
  description: string
  /** מי הנמען של הבריף (מוצג בעמוד הציבורי) */
  audienceLabel: string
  fields: TemplateField[]
}

/** ערך שדה בטופס ממולא */
export type FieldValue = string | string[]
export type BriefFields = Record<string, FieldValue>

const COMMON_CONTEXT: TemplateField[] = [
  { key: 'campaign_name', label: 'שם הקמפיין', type: 'text', required: true, section: 'רקע' },
  { key: 'background', label: 'רקע על המותג והקמפיין', type: 'textarea', required: true, aiHint: 'פסקה קצרה שנותנת לנמען הקשר מלא: מי המותג, מה הקמפיין ולמה עכשיו' },
  { key: 'goal', label: 'מטרת שיתוף הפעולה', type: 'textarea', required: true, aiHint: 'מה רוצים להשיג — מודעות / המרות / UGC וכו׳, כמה שיותר קונקרטי' },
  { key: 'target_audience', label: 'קהל היעד', type: 'textarea', required: true, aiHint: 'דמוגרפיה, תחומי עניין, שפה ופלטפורמות' },
]

const COMMON_CLOSING: TemplateField[] = [
  { key: 'timeline', label: 'לוחות זמנים', type: 'textarea', section: 'תפעול', aiHint: 'דדליין לטיוטה, לאישור ולפרסום' },
  { key: 'approval_process', label: 'תהליך אישורים', type: 'textarea', aiHint: 'מי מאשר, תוך כמה זמן, וכמה סבבי תיקונים' },
  { key: 'contact', label: 'איש קשר בלידרס', type: 'text', placeholder: 'שם + טלפון/מייל' },
]

export const SMART_BRIEF_TEMPLATES: SmartBriefTemplate[] = [
  {
    slug: 'content-creator',
    name: 'בריף יוצרת תוכן',
    english: 'Content Creator Brief',
    description: 'בריף מלא ליוצרת תוכן — רקע, מסרים, תוצרים והנחיות סגנון',
    audienceLabel: 'ליוצרת התוכן',
    fields: [
      ...COMMON_CONTEXT,
      { key: 'key_messages', label: 'מסרים מרכזיים', type: 'list', required: true, section: 'תוכן', aiHint: '3–5 מסרים שחייבים לעבור בתוכן' },
      { key: 'deliverables', label: 'תוצרים נדרשים', type: 'list', required: true, aiHint: 'כל שורה: סוג תוצר + כמות + פירוט (למשל: ריל אחד עד 45 שניות)' },
      { key: 'style_tone', label: 'סגנון וטון', type: 'textarea', aiHint: 'איך התוכן צריך להרגיש — אותנטי/הומוריסטי/פרימיום, שפה ודוגמאות' },
      { key: 'dos_donts', label: 'עשה / אל תעשה', type: 'list', aiHint: 'שורות שמתחילות ב"כן:" או "לא:" — כולל מגבלות רגולציה ומתחרים שאסור להזכיר' },
      { key: 'hashtags_mentions', label: 'האשטגים ותיוגים', type: 'text', aiHint: 'תיוג המותג, האשטג הקמפיין, וסימון תוכן ממומן' },
      ...COMMON_CLOSING,
    ],
  },
  {
    slug: 'tiktok',
    name: 'בריף טיקטוק',
    english: 'TikTok Brief',
    description: 'בריף וידאו לטיקטוק — קונספט, הוק, טרנדים ו-CTA',
    audienceLabel: 'ליוצר/ת התוכן',
    fields: [
      ...COMMON_CONTEXT,
      { key: 'concept', label: 'קונספט הסרטון', type: 'textarea', required: true, section: 'קריאייטיב', aiHint: 'הרעיון המרכזי של הסרטון במשפט–שניים' },
      { key: 'hook', label: 'הוק — 3 השניות הראשונות', type: 'textarea', required: true, aiHint: 'מה עוצר את הגלילה — ויזואלית או במשפט הפתיחה' },
      { key: 'video_length', label: 'אורך הסרטון', type: 'select', options: ['עד 15 שניות', '15–30 שניות', '30–60 שניות', 'מעל דקה'] },
      { key: 'trends_sounds', label: 'טרנדים וסאונדים', type: 'textarea', aiHint: 'טרנדים או סאונדים רלוונטיים לרכוב עליהם, אם יש' },
      { key: 'key_messages', label: 'מסרים מרכזיים', type: 'list', required: true, aiHint: '2–3 מסרים — בטיקטוק פחות זה יותר' },
      { key: 'cta', label: 'קריאה לפעולה (CTA)', type: 'text', required: true, aiHint: 'מה הצופה אמור לעשות בסוף' },
      { key: 'dos_donts', label: 'עשה / אל תעשה', type: 'list', aiHint: 'שורות שמתחילות ב"כן:" או "לא:"' },
      { key: 'hashtags_mentions', label: 'האשטגים ותיוגים', type: 'text' },
      ...COMMON_CLOSING,
    ],
  },
  {
    slug: 'social-posts',
    name: 'בריף פוסטים וסטוריז',
    english: 'Posts & Stories Brief',
    description: 'בריף סושיאל שוטף — עוגני תוכן, כמויות, קופי וויז׳ואל',
    audienceLabel: 'לצוות הסושיאל',
    fields: [
      ...COMMON_CONTEXT,
      { key: 'content_pillars', label: 'עוגני תוכן', type: 'list', required: true, section: 'תוכן', aiHint: '3–4 עוגנים שסביבם נבנה התוכן החודשי' },
      { key: 'posts_count', label: 'כמות פוסטים', type: 'text', required: true, placeholder: 'למשל: 8 פוסטים בחודש' },
      { key: 'stories_count', label: 'כמות סטוריז', type: 'text', placeholder: 'למשל: 12 סטוריז בחודש' },
      { key: 'copy_guidelines', label: 'הנחיות קופי', type: 'textarea', aiHint: 'טון, אורך, שימוש באימוג׳ים, פנייה לקהל' },
      { key: 'visual_guidelines', label: 'הנחיות ויז׳ואל', type: 'textarea', aiHint: 'פלטת צבעים, פונטים, סגנון צילום, מה אסור' },
      { key: 'key_messages', label: 'מסרים מרכזיים', type: 'list' },
      { key: 'hashtags_mentions', label: 'האשטגים ותיוגים', type: 'text' },
      { key: 'schedule', label: 'פריסת פרסום', type: 'textarea', aiHint: 'באילו ימים/שעות מפרסמים ובאילו פלטפורמות' },
      ...COMMON_CLOSING,
    ],
  },
  {
    slug: 'banners',
    name: 'בריף באנרים',
    english: 'Banners Brief',
    description: 'בריף עיצוב באנרים — מסר, קופי, מידות ופורמטים',
    audienceLabel: 'למעצב/ת',
    fields: [
      ...COMMON_CONTEXT,
      { key: 'main_message', label: 'מסר מרכזי', type: 'textarea', required: true, section: 'קריאייטיב', aiHint: 'המסר האחד שהבאנר צריך להעביר במבט' },
      { key: 'copy_text', label: 'קופי לבאנר', type: 'textarea', required: true, aiHint: 'כותרת, תת-כותרת וטקסט כפתור — קצר וממוקד' },
      { key: 'sizes', label: 'מידות נדרשות', type: 'list', required: true, aiHint: 'כל שורה מידה אחת, למשל: 300x250, 970x250, 1080x1080' },
      { key: 'formats', label: 'פורמט', type: 'select', options: ['סטטי', 'אנימציה (GIF/HTML5)', 'וידאו', 'שילוב'] },
      { key: 'brand_assets', label: 'קבצי מותג', type: 'textarea', aiHint: 'קישורים ללוגו, פונטים, תמונות ומדריך מותג' },
      { key: 'variants', label: 'כמות וריאציות', type: 'text', placeholder: 'למשל: 2 כיווני קריאייטיב' },
      { key: 'references', label: 'רפרנסים', type: 'textarea', aiHint: 'דוגמאות לבאנרים שאהבנו — קישורים או תיאור' },
      { key: 'deadline', label: 'דדליין', type: 'date', section: 'תפעול' },
      { key: 'approval_process', label: 'תהליך אישורים', type: 'textarea' },
      { key: 'contact', label: 'איש קשר בלידרס', type: 'text' },
    ],
  },
]

export function getTemplate(slug: string): SmartBriefTemplate | undefined {
  return SMART_BRIEF_TEMPLATES.find((t) => t.slug === slug)
}
