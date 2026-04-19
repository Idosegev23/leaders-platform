/**
 * SlideContextBuilder — Central context engine for AI-aware editor operations.
 * Pure function: extracts structured context from presentation + document data.
 * Used by: AI Rewrite, AI Image generation, Slide Regeneration.
 */

import type {
  Presentation,
  DesignSystem,
  TextElement,
  SlideElement,
} from '@/types/presentation'
import { isTextElement, isImageElement } from '@/types/presentation'

// ─── Types ──────────────────────────────────────────

export interface SlideContext {
  // Slide-level
  slideType: string
  slideLabel: string
  slideIndex: number
  totalSlides: number
  archetype: string

  // Content
  slideTextSummary: string
  mainTitle: string
  elementCount: number

  // Presentation-level
  brandName: string
  industry: string
  targetAudience: string
  brandPersonality: string
  designSystem: DesignSystem

  // Visual
  dominantColors: string[]
  currentImageAlts: string[]

  // Adjacent slides (for regeneration context)
  prevSlideLabel: string | null
  nextSlideLabel: string | null
}

// ─── Slide type purpose map ─────────────────────────

const SLIDE_PURPOSE: Record<string, string> = {
  cover: 'שקף פתיחה — רושם ראשוני חזק, לוגו ושם המותג',
  brief: 'תקציר הבריף — סקירה קצרה של מה שהלקוח ביקש',
  goals: 'יעדי הקמפיין — מטרות מדידות ותוצאות רצויות',
  audience: 'קהל יעד — פרופיל הקהל, דמוגרפיה והתנהגות',
  insight: 'תובנה מרכזית — ה-insight שמניע את האסטרטגיה',
  whyNow: 'למה עכשיו — הזדמנות או דחיפות תזמונית',
  strategy: 'אסטרטגיה — הגישה המרכזית ליעד',
  competitive: 'ניתוח תחרותי — מיצוב מול מתחרים',
  bigIdea: 'הרעיון הגדול — הקריאייטיב המרכזי',
  approach: 'גישה — כיצד מוציאים את האסטרטגיה לפועל',
  deliverables: 'תוצרים — מה הלקוח מקבל',
  metrics: 'מדדי הצלחה — KPIs ויעדים מספריים',
  influencerStrategy: 'אסטרטגיית משפיענים — גישה לשיתופי פעולה',
  contentStrategy: 'אסטרטגיית תוכן — סוגי תוכן וערוצים',
  influencers: 'משפיענים מומלצים — רשימת משפיענים',
  timeline: 'לוח זמנים — שלבי הביצוע',
  closing: 'סגירה — סיכום ו-CTA',
}

// ─── Quick suggestions by slide type ────────────────

const IMAGE_SUGGESTIONS: Record<string, string[]> = {
  cover: ['לוגו המותג על רקע יוקרתי', 'צילום מוצר מרכזי', 'אווירת מותג בסגנון לייפסטייל', 'רקע אבסטרקטי בצבעי המותג'],
  brief: ['אייקונים עסקיים מודרניים', 'צילום פגישה מקצועית', 'אינפוגרפיקה מינימליסטית'],
  goals: ['גרף צמיחה עולה', 'מטרה עם חצים', 'צילום צוות חוגג הצלחה'],
  audience: ['דיוקן קהל יעד', 'סצנת שימוש במוצר', 'צילום רחוב של הקהל הרלוונטי'],
  insight: ['מטאפורה ויזואלית', 'נורה דולקת – רעיון', 'צילום אמנותי עם מסר'],
  strategy: ['תרשים אסטרטגי', 'שחמט – מהלך מנצח', 'מסלול ניווט'],
  competitive: ['השוואה ויזואלית', 'גרף מיקום שוק', 'תמונת מירוץ'],
  bigIdea: ['ויזואל יצירתי ומפתיע', 'אמנות מודרנית', 'אילוסטרציה ייחודית'],
  approach: ['תהליך עבודה בשלבים', 'ידיים בונות', 'צילום ציוד מקצועי'],
  deliverables: ['מוקאפים של תוצרים', 'צילום מסכים', 'חבילת עיצוב'],
  metrics: ['דשבורד נתונים', 'גרפים ותרשימים', 'מספרים בולטים'],
  influencerStrategy: ['רשתות חברתיות', 'צילום משפיען', 'אייקוני engagement'],
  contentStrategy: ['לוח תוכן', 'צילומי תוכן מגוונים', 'ערוצי מדיה'],
  influencers: ['קולאז\' פרופילים', 'צילום בלוגר', 'סטטיסטיקות עוקבים'],
  timeline: ['ציר זמן ויזואלי', 'לוח שנה', 'שעון חול'],
  closing: ['לחיצת יד עסקית', 'לוגו המותג', 'רקע מסכם אלגנטי'],
}

// ─── Builder ────────────────────────────────────────

export function buildSlideContext(
  presentation: Presentation,
  slideIndex: number,
  documentData?: Record<string, unknown>,
): SlideContext {
  const slide = presentation.slides[slideIndex]
  if (!slide) {
    return emptyContext(presentation, slideIndex)
  }

  // Extract text content from slide
  const textElements = slide.elements.filter(isTextElement) as TextElement[]
  const titleEl = textElements.find(e => e.role === 'title')
  const allTexts = textElements
    .filter(e => e.role !== 'decorative')
    .map(e => e.content)
    .filter(Boolean)

  // Extract image alts
  const imageAlts = slide.elements
    .filter(isImageElement)
    .map(e => e.alt)
    .filter(Boolean) as string[]

  // Extract from document data
  const brandName = (documentData?.brandName as string)
    || presentation.metadata?.brandName
    || ''
  const industry = (documentData?.industry as string) || ''
  const targetAudience = extractAudienceSummary(documentData)
  const brandPersonality = (documentData?.brandPersonality as string)
    || (documentData?.brandValues as string)
    || ''

  // Design system colors
  const ds = presentation.designSystem
  const dominantColors = [
    ds.colors.primary,
    ds.colors.secondary,
    ds.colors.accent,
  ].filter(Boolean)

  // Adjacent slides
  const prevSlide = slideIndex > 0 ? presentation.slides[slideIndex - 1] : null
  const nextSlide = slideIndex < presentation.slides.length - 1 ? presentation.slides[slideIndex + 1] : null

  return {
    slideType: slide.slideType,
    slideLabel: slide.label,
    slideIndex,
    totalSlides: presentation.slides.length,
    archetype: slide.archetype || '',

    slideTextSummary: allTexts.join(' | ').slice(0, 500),
    mainTitle: titleEl?.content || slide.label,
    elementCount: slide.elements.length,

    brandName,
    industry,
    targetAudience,
    brandPersonality,

    designSystem: ds,
    dominantColors,
    currentImageAlts: imageAlts,

    prevSlideLabel: prevSlide?.label || null,
    nextSlideLabel: nextSlide?.label || null,
  }
}

// ─── Smart image prompt builder ─────────────────────

export function buildSmartImagePrompt(ctx: SlideContext): string {
  const parts: string[] = []

  if (ctx.brandName) {
    parts.push(`תמונה מקצועית עבור מצגת של ${ctx.brandName}`)
  } else {
    parts.push('תמונה מקצועית למצגת עסקית')
  }

  if (ctx.slideLabel) {
    parts.push(`שקף: ${ctx.slideLabel}`)
  }

  if (ctx.mainTitle && ctx.mainTitle !== ctx.slideLabel) {
    parts.push(`נושא: ${ctx.mainTitle}`)
  }

  if (ctx.industry) {
    parts.push(`תעשייה: ${ctx.industry}`)
  }

  return parts.join('. ') + '.'
}

export function getImageSuggestions(slideType: string): string[] {
  return IMAGE_SUGGESTIONS[slideType] || IMAGE_SUGGESTIONS.brief
}

export function getSlidePurpose(slideType: string): string {
  return SLIDE_PURPOSE[slideType] || 'שקף במצגת עסקית'
}

// ─── Helpers ────────────────────────────────────────

function extractAudienceSummary(data?: Record<string, unknown>): string {
  if (!data) return ''
  // Try common field names
  const audience = data.targetAudience || data.audience || data.targetMarket
  if (typeof audience === 'string') return audience
  if (audience && typeof audience === 'object') {
    const obj = audience as Record<string, unknown>
    return (obj.description as string) || (obj.summary as string) || JSON.stringify(obj).slice(0, 200)
  }
  return ''
}

function emptyContext(presentation: Presentation, slideIndex: number): SlideContext {
  return {
    slideType: 'brief',
    slideLabel: '',
    slideIndex,
    totalSlides: presentation.slides.length,
    archetype: '',
    slideTextSummary: '',
    mainTitle: '',
    elementCount: 0,
    brandName: presentation.metadata?.brandName || '',
    industry: '',
    targetAudience: '',
    brandPersonality: '',
    designSystem: presentation.designSystem,
    dominantColors: [presentation.designSystem.colors.primary],
    currentImageAlts: [],
    prevSlideLabel: null,
    nextSlideLabel: null,
  }
}
