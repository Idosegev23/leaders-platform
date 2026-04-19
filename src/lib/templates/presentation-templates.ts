/**
 * Presentation Templates — industry-specific design presets.
 *
 * Each template provides:
 * - Visual direction hints for the design system
 * - Color mood
 * - Typography personality
 * - Image treatment guidelines
 *
 * Selected in the generate page BEFORE generation starts.
 * Passed to pipelineFoundation → influences Design System generation.
 */

export interface PresentationTemplate {
  id: string
  name: string          // Hebrew display name
  nameEn: string        // English name
  industry: string      // Target industry
  description: string   // Hebrew description
  thumbnail: string     // URL or emoji
  designHints: {
    visualMetaphor: string
    colorMood: string
    typographyVoice: string
    imageTreatment: string
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist'
  }
  colorOverrides?: {
    primary?: string
    accent?: string
    background?: string
  }
}

export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  {
    id: 'tech-dark',
    name: 'טכנולוגיה כהה',
    nameEn: 'Dark Tech',
    industry: 'Technology / SaaS',
    description: 'עיצוב כהה ומינימליסטי עם גלואים ניאון. מושלם לסטארטאפים וחברות טכנולוגיה.',
    thumbnail: '🖥️',
    designHints: {
      visualMetaphor: 'Futuristic control room with holographic displays',
      colorMood: 'כהה, טכנולוגי, עם ניצוצות ניאון',
      typographyVoice: '900 headings vs 300 body — precision meets clarity',
      imageTreatment: 'full-bleed with dark overlay, cyan/blue glow accents',
      decorativeStyle: 'geometric',
    },
  },
  {
    id: 'fashion-editorial',
    name: 'אופנה אדיטוריאלית',
    nameEn: 'Fashion Editorial',
    industry: 'Fashion / Lifestyle',
    description: 'סטייל מגזין אופנה. ניגודיות חזקה, טיפוגרפיה דרמטית, הרבה whitespace.',
    thumbnail: '👗',
    designHints: {
      visualMetaphor: 'Vogue Italia spread meets Bauhaus grid',
      colorMood: 'מונוכרומטי עם נגיעת צבע אחת חזקה',
      typographyVoice: 'Ultra-thin body (100) vs ultra-bold display (900)',
      imageTreatment: 'full-bleed editorial photography, desaturated with one accent color',
      decorativeStyle: 'minimal',
    },
  },
  {
    id: 'food-warm',
    name: 'מזון חם',
    nameEn: 'Warm Food',
    industry: 'Food / FMCG / Restaurant',
    description: 'צבעים חמים, תחושת בית, תמונות אוכל מרהיבות. מושלם למותגי מזון.',
    thumbnail: '🍽️',
    designHints: {
      visualMetaphor: 'Rustic Italian trattoria meets modern food photography',
      colorMood: 'חם, אורגני, שוקולד וזהב',
      typographyVoice: 'Warm serif-like weight (700) with gentle body (400)',
      imageTreatment: 'warm tones, close-up food macro, golden hour lighting',
      decorativeStyle: 'organic',
    },
    colorOverrides: {
      background: '#1A150F',
      accent: '#D4A855',
    },
  },
  {
    id: 'auto-premium',
    name: 'רכב פרימיום',
    nameEn: 'Premium Auto',
    industry: 'Automotive',
    description: 'דיוק יפני, אלגנטיות תעשייתית. מושלם לרכב ותעבורה.',
    thumbnail: '🚗',
    designHints: {
      visualMetaphor: 'Japanese precision engineering meets wind tunnel aerodynamics',
      colorMood: 'תעשייתי, מדויק, פס אדום חד',
      typographyVoice: '900 condensed headings — industrial strength',
      imageTreatment: 'cinematic widescreen, motion blur, reflective surfaces',
      decorativeStyle: 'geometric',
    },
  },
  {
    id: 'beauty-glow',
    name: 'ביוטי ורוד',
    nameEn: 'Beauty Glow',
    industry: 'Beauty / Cosmetics / Wellness',
    description: 'עדין, זוהר, אישי. גרדיאנטים רכים ותמונות מוארות.',
    thumbnail: '✨',
    designHints: {
      visualMetaphor: 'Soft-focus beauty editorial with ethereal glow',
      colorMood: 'ורוד-זהב, רך, זוהר פנימי',
      typographyVoice: 'Light (300) body with medium (600) titles — gentle authority',
      imageTreatment: 'soft diffused light, skin textures, product close-ups with bokeh',
      decorativeStyle: 'organic',
    },
    colorOverrides: {
      primary: '#E8AEB7',
      accent: '#D4A855',
      background: '#1A1118',
    },
  },
  {
    id: 'finance-corporate',
    name: 'פיננסי מקצועי',
    nameEn: 'Corporate Finance',
    industry: 'Finance / Insurance / B2B',
    description: 'רציני, מקצועי, data-first. מושלם לפיננסים, ביטוח, B2B.',
    thumbnail: '📊',
    designHints: {
      visualMetaphor: 'Bloomberg terminal meets Swiss banking precision',
      colorMood: 'כחול כהה, זהב, רציני ואמין',
      typographyVoice: 'Medium weight throughout — professionalism without drama',
      imageTreatment: 'data visualizations, clean infographics, muted photography',
      decorativeStyle: 'geometric',
    },
    colorOverrides: {
      primary: '#1E3A5F',
      accent: '#C9A96E',
    },
  },
  {
    id: 'kids-playful',
    name: 'ילדים צבעוני',
    nameEn: 'Kids Playful',
    industry: 'Kids / Education / Family',
    description: 'צבעוני, שמח, אנרגטי. מושלם למותגי ילדים ומשפחה.',
    thumbnail: '🎨',
    designHints: {
      visualMetaphor: 'Pixar movie poster meets modern playground',
      colorMood: 'צבעוני, אנרגטי, שמחה טהורה',
      typographyVoice: 'Bold rounded (800) with friendly body (500)',
      imageTreatment: 'bright saturated colors, candid family moments, illustrated elements',
      decorativeStyle: 'organic',
    },
    colorOverrides: {
      primary: '#FF6B6B',
      accent: '#4ECDC4',
      background: '#1A1A2E',
    },
  },
  {
    id: 'sport-energy',
    name: 'ספורט אנרגטי',
    nameEn: 'Sport Energy',
    industry: 'Sports / Fitness / Active',
    description: 'דינמי, חד, אנרגטי. מושלם לספורט, כושר, אקטיב.',
    thumbnail: '⚡',
    designHints: {
      visualMetaphor: 'Nike campaign meets ESPN highlight reel',
      colorMood: 'שחור-אדום, אנרגיה גולמית, כוח',
      typographyVoice: 'Ultra-bold condensed (900) — shouts from the page',
      imageTreatment: 'high contrast action shots, motion blur, dramatic angles',
      decorativeStyle: 'brutalist',
    },
  },
]

export function getTemplateById(id: string): PresentationTemplate | undefined {
  return PRESENTATION_TEMPLATES.find(t => t.id === id)
}

export function getTemplatesForIndustry(industry: string): PresentationTemplate[] {
  const lower = industry.toLowerCase()
  return PRESENTATION_TEMPLATES.filter(t =>
    t.industry.toLowerCase().includes(lower) ||
    lower.includes(t.industry.split('/')[0].trim().toLowerCase())
  )
}
