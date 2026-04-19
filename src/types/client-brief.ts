import { z } from 'zod'

// Schema definition with validation (Hebrew)
export const formSchema = z.object({
  // מסך 1 - פרטים כלליים
  date: z.string().min(1, 'שדה חובה'),
  submitterName: z.string().min(1, 'שדה חובה'),
  clientName: z.string().min(1, 'שדה חובה'),
  productService: z.string().min(1, 'שדה חובה'),
  campaignLaunchDate: z.string().min(1, 'שדה חובה'),
  services: z.array(z.string()).min(1, 'יש לבחור לפחות שירות אחד'),
  platforms: z.array(z.string()).min(1, 'יש לבחור לפחות פלטפורמה אחת'),

  // מסך 2 - רקע
  marketCategory: z.string().min(1, 'שדה חובה'),
  productDescription: z.string().min(1, 'שדה חובה'),
  competitors: z.string().min(1, 'שדה חובה'),
  challenge: z.string().min(1, 'שדה חובה'),

  // מסך 3 - קהל היעד
  targetAudience: z.string().min(1, 'שדה חובה'),
  audienceCharacteristics: z.string().min(1, 'שדה חובה'),
  audienceInsights: z.string().min(1, 'שדה חובה'),

  // מסך 4 - מטרות
  campaignGoalTypes: z.array(z.string()).min(1, 'יש לבחור לפחות מטרה אחת'),
  campaignGoalsDescription: z.string().min(1, 'שדה חובה'),
  desiredResponse: z.string().min(1, 'שדה חובה'),
  timingType: z.string().min(1, 'שדה חובה'),
  timingDetails: z.string().optional(),

  // מסך 5 - תובנה ומסר
  insight: z.string().min(1, 'שדה חובה'),
  solution: z.string().min(1, 'שדה חובה'),
  mainMessage: z.string().min(1, 'שדה חובה'),
  keyTakeaway: z.string().min(1, 'שדה חובה'),

  // מסך 6 - דרישות ותקציב
  requirements: z.string().min(1, 'שדה חובה'),
  campaignType: z.string().min(1, 'שדה חובה'),
  budget: z.string().min(1, 'שדה חובה'),
  notes: z.string().optional(),
})

// Schema definition with validation (English)
export const formSchemaEn = z.object({
  date: z.string().min(1, 'Required field'),
  submitterName: z.string().min(1, 'Required field'),
  clientName: z.string().min(1, 'Required field'),
  productService: z.string().min(1, 'Required field'),
  campaignLaunchDate: z.string().min(1, 'Required field'),
  services: z.array(z.string()).min(1, 'Please select at least one service'),
  platforms: z.array(z.string()).min(1, 'Please select at least one platform'),

  marketCategory: z.string().min(1, 'Required field'),
  productDescription: z.string().min(1, 'Required field'),
  competitors: z.string().min(1, 'Required field'),
  challenge: z.string().min(1, 'Required field'),

  targetAudience: z.string().min(1, 'Required field'),
  audienceCharacteristics: z.string().min(1, 'Required field'),
  audienceInsights: z.string().min(1, 'Required field'),

  campaignGoalTypes: z.array(z.string()).min(1, 'Please select at least one goal'),
  campaignGoalsDescription: z.string().min(1, 'Required field'),
  desiredResponse: z.string().min(1, 'Required field'),
  timingType: z.string().min(1, 'Required field'),
  timingDetails: z.string().optional(),

  insight: z.string().min(1, 'Required field'),
  solution: z.string().min(1, 'Required field'),
  mainMessage: z.string().min(1, 'Required field'),
  keyTakeaway: z.string().min(1, 'Required field'),

  requirements: z.string().min(1, 'Required field'),
  campaignType: z.string().min(1, 'Required field'),
  budget: z.string().min(1, 'Required field'),
  notes: z.string().optional(),
})

export type FormData = z.infer<typeof formSchema>

export interface StepConfig {
  title: string
  description: string
  fields: {
    name: keyof FormData
    label: string
    type: 'text' | 'textarea' | 'date' | 'checkbox-group' | 'select'
    placeholder?: string
    required?: boolean
    options?: string[]
  }[]
}

// רשימות אפשרויות
export const SERVICES_LIST = [
  'ניהול משפיענים',
  'ניהול סושיאל',
  'ניהול משפיעני הפצה וUGC',
  'קידום ממומן',
  'אימייל מרקטינג',
  'שירותי קריאטיב',
  'שימוש במערכת IMAI',
  'הפקות',
  'ימי צילום',
];

export const PLATFORMS_LIST = [
  'אינסטגרם',
  'טיקטוק',
  'פייסבוק',
  'יוטיוב',
  'פינטרסט',
  'לינקדאין',
  'X (טוויטר)',
  'ספוטיפיי',
  'אחר',
];

export const CAMPAIGN_GOAL_TYPES = [
  'הנעה למכר',
  'מודעות',
  'נחשקות',
  'חדירה לשוק',
];

export const TIMING_TYPES = [
  'שנתי',
  'חציוני',
  'רבעוני',
  'חודשי',
];

// English option lists
export const SERVICES_LIST_EN = [
  'Influencer Management',
  'Social Media Management',
  'Distribution Influencer & UGC Management',
  'Paid Advertising',
  'Email Marketing',
  'Creative Services',
  'IMAI System Usage',
  'Productions',
  'Shooting Days',
];

export const PLATFORMS_LIST_EN = [
  'Instagram',
  'TikTok',
  'Facebook',
  'YouTube',
  'Pinterest',
  'LinkedIn',
  'X (Twitter)',
  'Spotify',
  'Other',
];

export const CAMPAIGN_GOAL_TYPES_EN = [
  'Sales activation (Drive to purchase)',
  'Awareness',
  'Desirability',
  'Market penetration',
];

export const TIMING_TYPES_EN = [
  'Annual',
  'Semi-annual',
  'Quarterly',
  'Monthly',
];

