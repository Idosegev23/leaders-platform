import type { WizardStepId, WizardStepMeta, StepStatus } from '@/types/wizard'

// Liran feedback (April 2026): simplify to 9 steps — removed "quantities" (merged into KPI)
// Flow: בריף → מטרות → קהלים → תובנה → אסטרטגיה → קריאייטיב → תוצרים → משפיענים → KPI
export const WIZARD_STEPS: WizardStepMeta[] = [
  {
    id: 'brief',
    label: 'בריף ורקע',
    labelShort: 'בריף',
    description: 'למה פנו אלינו? מה האתגר?',
    required: true,
    order: 1,
    helpText: 'כאן מופיע המידע שחולץ מהבריף. בדקו שהפרטים נכונים — במיוחד "למה הבריף הזה?" שמגדיר את האתגר.',
    whyItMatters: 'המידע הזה מזין את כל השלבים הבאים. ככל שהוא מדויק יותר, ההצעה תהיה חדה יותר.',
  },
  {
    id: 'goals',
    label: 'מטרות',
    labelShort: 'מטרות',
    description: 'מטרות הקמפיין',
    required: true,
    order: 2,
    helpText: 'בחרו 2-3 מטרות ממוקדות. פחות = יותר.',
    whyItMatters: 'המטרות מגדירות את ה-"למה". הן ישפיעו על האסטרטגיה והמדדים.',
  },
  {
    id: 'target_audience',
    label: 'קהל יעד',
    labelShort: 'קהל',
    description: 'מי הם?',
    required: true,
    order: 3,
    helpText: 'הגדירו את קהל היעד בצורה ספציפית — מי האדם הזה באמת.',
    whyItMatters: 'פרופיל קהל חד מוביל לתובנה חדה שפוגעת בול.',
  },
  {
    id: 'key_insight',
    label: 'תובנה',
    labelShort: 'תובנה',
    description: 'התובנה שמחברת הכל',
    required: true,
    order: 4,
    helpText: 'התובנה = "אסימון שנופל". חדד עם AI ליצירת תובנה חדה ומבוססת נתון.',
    whyItMatters: 'תובנה חזקה = ההבדל בין הצעה גנרית להצעה שגורמת ללקוח להגיד "וואו".',
  },
  {
    id: 'strategy',
    label: 'אסטרטגיה',
    labelShort: 'אסטרטגיה',
    description: 'הגישה + 3 עמודי תווך',
    required: true,
    order: 5,
    helpText: 'כותרת אסטרטגית + 3 pillars קונקרטיים. כל pillar = מה עושים + באיזה ערוץ + מה צפוי.',
    whyItMatters: 'האסטרטגיה מתרגמת תובנה לתוכנית פעולה. לא "באוויר" — קונקרטי.',
  },
  {
    id: 'creative',
    label: 'קריאייטיב',
    labelShort: 'קריאייטיב',
    description: 'שם קמפיין, קונספט, פורמט',
    required: true,
    order: 6,
    helpText: 'שם הקמפיין + קונספט + פורמט תוכן (UGC? הפקה? mashup?).',
    whyItMatters: 'הקריאייטיב הופך אסטרטגיה לרעיון שאפשר לדמיין.',
  },
  {
    id: 'deliverables',
    label: 'תוצרים',
    labelShort: 'תוצרים',
    description: 'סוגי תוכן + כמויות',
    required: true,
    order: 7,
    helpText: 'רילז, סטוריז, טיקטוק — כמות ותיאור לכל סוג.',
    whyItMatters: 'זה מה שהלקוח "קונה". בהירות = אמון.',
  },
  {
    id: 'influencers',
    label: 'משפיענים',
    labelShort: 'משפיענים',
    description: 'ליהוק משפיענים',
    required: true,
    order: 8,
    helpText: 'פרופילי משפיענים מומלצים. חפש ב-IMAI או ערוך את המלצות ה-AI.',
    whyItMatters: 'הליהוק הנכון = חצי מהקמפיין.',
  },
  {
    id: 'media_targets',
    label: 'KPI',
    labelShort: 'KPI',
    description: 'תקציב, כמויות, מדדים',
    required: true,
    order: 9,
    helpText: 'תקציב + מספר משפיענים + משך קמפיין + CPE + reach. המדדים שמוכיחים ROI.',
    whyItMatters: 'מדדים ריאליים מוכיחים מקצועיות. הלקוח רוצה לדעת שאתם יודעים לחשב.',
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
