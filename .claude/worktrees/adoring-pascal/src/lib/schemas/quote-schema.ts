// Quote Schema - structured questions flow for "הצעת מחיר רזה"
export interface QuoteField {
  id: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'enum' | 'multi_select' | 'array' | 'file' | 'url' | 'file_or_url' | 'influencer_list'
  label: string
  question: string // The friendly chat question
  required: boolean
  placeholder?: string
  options?: string[]
  default?: string | number | boolean
  maxLength?: number
  min?: number
  max?: number
  accept?: string[]
  group: string
  order: number
  skipIf?: { field: string; equals: unknown } // Conditional skip
}

// Influencer data structure
export interface InfluencerData {
  name: string
  imageUrl?: string
  followers: number
  avgLikes?: number
  avgComments?: number
  engagementRate?: number
  platform?: 'instagram' | 'tiktok' | 'youtube' | 'other'
}

// Groups aligned with the 9-slide structure
export const QUOTE_GROUPS = [
  { id: 'meta', name: 'פתיחה' },
  { id: 'goals', name: 'מטרות וקהלים' },
  { id: 'brand', name: 'המותג' },
  { id: 'activity', name: 'פעילות' },
  { id: 'deliverables', name: 'תוצרים' },
  { id: 'targets', name: 'יעדים ותקציב' },
  { id: 'influencers', name: 'משפיענים' },
  { id: 'closing', name: 'סיום' },
]

export const QUOTE_FIELDS: QuoteField[] = [
  // === META (Slide 1 - Cover) ===
  {
    id: 'brandName',
    type: 'text',
    label: 'שם המותג',
    question: 'מה שם המותג?',
    required: true,
    group: 'meta',
    order: 1,
  },
  {
    id: 'issueDate',
    type: 'date',
    label: 'תאריך',
    question: 'מה התאריך?',
    required: false,
    group: 'meta',
    order: 2,
  },
  {
    id: 'brandLogoFile',
    type: 'file',
    label: 'לוגו מותג',
    question: 'העלה את לוגו המותג',
    required: true,
    accept: ['.png', '.jpg', '.jpeg', '.svg', '.webp'],
    group: 'meta',
    order: 3,
  },
  {
    id: 'coverImage',
    type: 'file_or_url',
    label: 'תמונת פתיחה',
    question: 'העלה תמונת פתיחה (full bleed)',
    required: false,
    accept: ['.png', '.jpg', '.jpeg', '.webp'],
    group: 'meta',
    order: 4,
  },

  // === GOALS (Slide 2 - Goals & Audience) ===
  {
    id: 'goals',
    type: 'multi_select',
    label: 'מטרות',
    question: 'מה מטרות הקמפיין? (3-5 מטרות)',
    required: true,
    options: ['מודעות', 'חינוך שוק', 'נוכחות', 'נחשקות ו-FOMO', 'הנעה למכר'],
    group: 'goals',
    order: 1,
  },
  {
    id: 'targetGender',
    type: 'enum',
    label: 'מגדר',
    question: 'מה המגדר של קהל היעד?',
    required: true,
    options: ['נשים', 'גברים', 'נשים וגברים'],
    group: 'goals',
    order: 2,
  },
  {
    id: 'targetAgeRange',
    type: 'text',
    label: 'גילאים',
    question: 'מה טווח הגילאים?',
    required: true,
    placeholder: '20-45',
    group: 'goals',
    order: 3,
  },
  {
    id: 'targetBehavior',
    type: 'text',
    label: 'מאפיינים',
    question: 'תאר את קהל היעד במשפט אחד קונקרטי',
    required: false,
    placeholder: 'מתאמנים לפחות פעמיים בשבוע, מעוניינים לרדת במשקל',
    maxLength: 200,
    group: 'goals',
    order: 4,
  },

  // === BRAND (Slide 3 - About the Brand) ===
  {
    id: 'brandDescription',
    type: 'textarea',
    label: 'על המותג',
    question: 'תאר את המותג ב-3-5 שורות. מה הוא עושה? איפה פועל? מה הערך שלו?',
    required: true,
    maxLength: 400,
    placeholder: 'המותג מתמחה ב...',
    group: 'brand',
    order: 1,
  },
  {
    id: 'brandImage',
    type: 'file_or_url',
    label: 'תמונה מותגית',
    question: 'העלה תמונה מותגית לשקף המותג',
    required: false,
    accept: ['.png', '.jpg', '.jpeg', '.webp'],
    group: 'brand',
    order: 2,
  },

  // === ACTIVITY (Slide 4 - What will happen) ===
  {
    id: 'activityDescription',
    type: 'textarea',
    label: 'תיאור הפעילות',
    question: 'מה הולך לקרות בפועל? תאר ב-3-4 משפטים בגוף פעיל',
    required: true,
    maxLength: 500,
    placeholder: 'משפיענים יציגו את השגרה האמיתית עם המוצר. דגש על חוויית שימוש ולא מכירה. תוכן טבעי, לא פרסומי.',
    group: 'activity',
    order: 1,
  },

  // === DELIVERABLES (Slide 5 - Outputs) ===
  {
    id: 'deliverables',
    type: 'array',
    label: 'תוצרים',
    question: 'מה התוצרים? (למשל: 4 רילים, 12 סטוריז)',
    required: true,
    placeholder: '4 רילים',
    group: 'deliverables',
    order: 1,
  },

  // === TARGETS (Slide 6 - Numbers) ===
  {
    id: 'budget',
    type: 'number',
    label: 'תקציב',
    question: 'מה התקציב?',
    required: true,
    min: 0,
    group: 'targets',
    order: 1,
  },
  {
    id: 'currency',
    type: 'enum',
    label: 'מטבע',
    question: 'באיזה מטבע?',
    required: true,
    options: ['₪ (ILS)', '$ (USD)', '€ (EUR)'],
    default: '₪ (ILS)',
    group: 'targets',
    order: 2,
  },
  {
    id: 'potentialEngagement',
    type: 'number',
    label: 'Potential Engagement',
    question: 'מה ה-Potential Engagement הצפוי?',
    required: true,
    min: 0,
    group: 'targets',
    order: 3,
  },
  {
    id: 'primaryInfluencers',
    type: 'number',
    label: 'משפיענים מרכזיים',
    question: 'כמה משפיענים מרכזיים?',
    required: true,
    min: 0,
    group: 'targets',
    order: 4,
  },
  {
    id: 'distributionInfluencers',
    type: 'number',
    label: 'משפיעני הפצה',
    question: 'כמה משפיעני הפצה?',
    required: false,
    min: 0,
    group: 'targets',
    order: 5,
  },

  // === INFLUENCERS (Slides 7-8) ===
  {
    id: 'influencerCount',
    type: 'number',
    label: 'כמות משפיענים',
    question: 'כמה משפיענים להציג במצגת? (1-6)',
    required: true,
    min: 1,
    max: 6,
    group: 'influencers',
    order: 1,
  },
  {
    id: 'influencerData',
    type: 'influencer_list',
    label: 'פרטי משפיענים',
    question: 'הזן את פרטי המשפיען',
    required: true,
    group: 'influencers',
    order: 2,
  },
  {
    id: 'influencerNote',
    type: 'text',
    label: 'הערה',
    question: 'הערה לשקפי המשפיענים (למשל: Potential - לא התחייבות סופית)',
    required: false,
    default: 'Potential Influencers',
    group: 'influencers',
    order: 3,
  },

  // === CLOSING (Slide 9) ===
  {
    id: 'closingHeadline',
    type: 'text',
    label: 'כותרת סיום',
    question: 'מה משפט הסיום?',
    required: false,
    default: "LET'S GET STARTED",
    group: 'closing',
    order: 1,
  },
]

// Get fields for a specific group, sorted by order
export function getFieldsByGroup(groupId: string): QuoteField[] {
  return QUOTE_FIELDS
    .filter(f => f.group === groupId)
    .sort((a, b) => a.order - b.order)
}

// Get all required fields
export function getRequiredFields(): QuoteField[] {
  return QUOTE_FIELDS.filter(f => f.required)
}

// Get the next unanswered field
export function getNextField(answers: Record<string, unknown>): QuoteField | null {
  for (const group of QUOTE_GROUPS) {
    const fields = getFieldsByGroup(group.id)
    for (const field of fields) {
      // Check if field has skip condition
      if (field.skipIf) {
        const skipValue = answers[field.skipIf.field]
        if (skipValue === field.skipIf.equals) continue
      }
      
      // Check if field is answered (including skipped)
      const answer = answers[field.id]
      const isAnswered = answer !== undefined && answer !== null && answer !== ''
      
      if (!isAnswered) {
        return field
      }
    }
  }
  return null // All fields answered
}

// Calculate progress
export function calculateProgress(answers: Record<string, unknown>): { 
  current: number
  total: number
  percentage: number 
  currentGroup: string
} {
  const requiredFields = getRequiredFields()
  const answeredRequired = requiredFields.filter(f => {
    const answer = answers[f.id]
    return answer !== undefined && answer !== null && answer !== ''
  })
  
  const currentField = getNextField(answers)
  const currentGroup = currentField?.group || 'closing'
  
  return {
    current: answeredRequired.length,
    total: requiredFields.length,
    percentage: Math.round((answeredRequired.length / requiredFields.length) * 100),
    currentGroup,
  }
}
