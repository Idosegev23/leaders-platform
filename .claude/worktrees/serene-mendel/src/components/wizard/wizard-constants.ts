import type { WizardStepId, WizardStepMeta, StepStatus } from '@/types/wizard'

export const WIZARD_STEPS: WizardStepMeta[] = [
  {
    id: 'brief',
    label: 'בריף ורקע',
    labelShort: 'בריף',
    description: 'רקע על המותג והבריף שהתקבל',
    required: true,
    order: 1,
    helpText: 'כאן מופיע המידע שחולץ מהבריף שהעלתם. בדקו שהפרטים נכונים ותקנו אם צריך — זה הבסיס לכל מה שיבוא אחרי.',
    whyItMatters: 'המידע הזה מזין את כל השלבים הבאים. ככל שהוא מדויק יותר, ההצעה שתיווצר תהיה חדה יותר.',
  },
  {
    id: 'goals',
    label: 'מטרות ויעדים',
    labelShort: 'מטרות',
    description: 'מטרות הקמפיין ויעדים מדידים',
    required: true,
    order: 2,
    helpText: 'בחרו מטרות מהרשימה או הוסיפו מטרות מותאמות. ה-AI יכתוב תיאור לכל מטרה — תוכלו לערוך אותו.',
    whyItMatters: 'המטרות מגדירות את ה-"למה" של הקמפיין. הן ישפיעו על האסטרטגיה, התוכן והמדדים.',
  },
  {
    id: 'target_audience',
    label: 'קהל יעד',
    labelShort: 'קהל',
    description: 'קהלי היעד של הקמפיין',
    required: true,
    order: 3,
    helpText: 'הגדירו את קהל היעד בצורה ספציפית — לא "נשים 25-34" אלא מי האדם הזה באמת. ה-AI יחפש תובנות מחקריות.',
    whyItMatters: 'פרופיל קהל חד מוביל לתובנה חדה, שמובילה לקריאייטיב שפוגע בול.',
  },
  {
    id: 'key_insight',
    label: 'תובנה',
    labelShort: 'תובנה',
    description: 'תובנה מרכזית מבוססת מחקר',
    required: true,
    order: 4,
    helpText: 'התובנה היא ה-"אסימון שנופל" — הממצא שמקשר בין הקהל לבין מה שהמותג מציע. ה-AI ינסה לחדד אותה עם מחקר.',
    whyItMatters: 'תובנה חזקה היא ההבדל בין הצעה גנרית להצעה שגורמת ללקוח להגיד "וואו, אתם מבינים אותי".',
  },
  {
    id: 'strategy',
    label: 'אסטרטגיה',
    labelShort: 'אסטרטגיה',
    description: 'הגישה האסטרטגית והפעולות',
    required: true,
    order: 5,
    helpText: 'הגדירו את הכותרת האסטרטגית ועמודי התווך. תוכלו לבקש מה-AI לחדד כל עמוד תווך בנפרד או את כולם ביחד.',
    whyItMatters: 'האסטרטגיה מתרגמת את התובנה לתוכנית פעולה — היא מראה ללקוח שיש שיטה, לא רק רעיון.',
  },
  {
    id: 'creative',
    label: 'קריאייטיב',
    labelShort: 'קריאייטיב',
    description: 'כיוון קריאייטיבי ורפרנסים',
    required: false,
    order: 6,
    helpText: 'תנו שם לקמפיין, הגדירו את הקונספט ואת ה-Vibe. אפשר גם להעלות תמונות רפרנס.',
    whyItMatters: 'הקריאייטיב הופך אסטרטגיה יבשה לרעיון שאפשר לדמיין. הלקוח רוצה לראות חזון, לא רק תוכנית.',
  },
  {
    id: 'deliverables',
    label: 'תוצרים',
    labelShort: 'תוצרים',
    description: 'מסגרת התוצרים והתכנים',
    required: true,
    order: 7,
    helpText: 'הגדירו את סוגי התכנים — רילז, סטוריז, טיקטוק וכו\'. לכל תוצר ציינו כמות, תיאור ומטרה.',
    whyItMatters: 'זה מה שהלקוח "קונה" בפועל. הבהירות כאן מונעת אי-הבנות אחרי חתימת העסקה.',
  },
  {
    id: 'quantities',
    label: 'כמויות',
    labelShort: 'כמויות',
    description: 'סיכום כמויות תוצרים ומשפיענים',
    required: true,
    order: 8,
    helpText: 'ציינו כמה משפיענים ומה משך הקמפיין. הכמויות יחושבו אוטומטית לפי מה שהגדרתם בתוצרים.',
    whyItMatters: 'הנוסחה הברורה מראה ללקוח בדיוק מה הוא מקבל — שקיפות שבונה אמון.',
  },
  {
    id: 'media_targets',
    label: 'יעדי מדיה',
    labelShort: 'יעדים',
    description: 'תקציב, צפיות, מעורבות ו-CPE',
    required: true,
    order: 9,
    helpText: 'הזינו תקציב ויעדי ביצועים. המדדים עוזרים ללקוח להבין את ה-ROI הצפוי.',
    whyItMatters: 'מדדים ריאליים מוכיחים מקצועיות. הלקוח רוצה לדעת שאתם יודעים לחשב, לא רק לחלום.',
  },
  {
    id: 'influencers',
    label: 'משפיענים',
    labelShort: 'משפיענים',
    description: 'פרופילי משפיענים מומלצים',
    required: true,
    order: 10,
    helpText: 'הוסיפו פרופילי משפיענים מומלצים. ה-AI הציע כמה על בסיס המחקר — תוכלו לערוך או להוסיף.',
    whyItMatters: 'הליהוק הנכון הוא חצי מהקמפיין. הלקוח רוצה לראות פרצופים, לא רק מספרים.',
  },
]

export const WIZARD_STEP_ORDER: WizardStepId[] = WIZARD_STEPS.map((s) => s.id)

export function getStepMeta(id: WizardStepId): WizardStepMeta {
  return WIZARD_STEPS.find((s) => s.id === id)!
}

export function getStepIndex(id: WizardStepId): number {
  return WIZARD_STEP_ORDER.indexOf(id)
}

export function getNextStep(id: WizardStepId): WizardStepId | null {
  const idx = getStepIndex(id)
  return idx < WIZARD_STEP_ORDER.length - 1 ? WIZARD_STEP_ORDER[idx + 1] : null
}

export function getPrevStep(id: WizardStepId): WizardStepId | null {
  const idx = getStepIndex(id)
  return idx > 0 ? WIZARD_STEP_ORDER[idx - 1] : null
}

export function getInitialStatuses(): Record<WizardStepId, StepStatus> {
  const statuses = {} as Record<WizardStepId, StepStatus>
  for (const step of WIZARD_STEP_ORDER) {
    statuses[step] = 'pending'
  }
  return statuses
}
