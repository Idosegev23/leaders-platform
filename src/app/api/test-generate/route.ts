/**
 * POST /api/test-generate
 * Generates a test presentation using GPT-5.4 Art Director + Layout Engine v3.
 * Saves to /tmp/test-presentation.json → load via /edit/test-local
 */

import { NextResponse } from 'next/server'

export const maxDuration = 30
import { writeFileSync } from 'fs'
import OpenAI from 'openai'
import {
  generateSlides,
  buildArtDirectionPrompt,
  parseArtDirection,
  buildFallbackArtDirection,
} from '@/lib/slide-engine'
import type { ArtDirectionResult } from '@/lib/slide-engine'
import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { Presentation } from '@/types/presentation'

// ─── Design System ──────────────────────────────────────

const designSystem: PremiumDesignSystem = {
  colors: {
    primary: '#E94560', secondary: '#1A1A2E', accent: '#E94560',
    background: '#0F0F1A', text: '#F5F5F7', cardBg: '#1A1A2E', cardBorder: '#2A2A3E',
    gradientStart: '#1A1A2E', gradientEnd: '#0F0F1A', muted: '#8B8B9E', highlight: '#FF6B8A',
    auroraA: '#E9456040', auroraB: '#6C63FF30', auroraC: '#1A1A2E20',
  },
  fonts: { heading: 'Heebo', body: 'Heebo' },
  direction: 'rtl',
  typography: {
    displaySize: 104, headingSize: 56, subheadingSize: 32, bodySize: 22, captionSize: 15,
    letterSpacingTight: -2, letterSpacingWide: 4, lineHeightTight: 1.05, lineHeightRelaxed: 1.5,
    weightPairs: [[800, 400]],
  },
  spacing: { unit: 8, cardPadding: 32, cardGap: 24, safeMargin: 80 },
  effects: {
    borderRadius: 'soft', borderRadiusValue: 16, decorativeStyle: 'geometric', shadowStyle: 'fake-3d',
    auroraGradient: 'radial-gradient(ellipse at 20% 50%, #E9456040, transparent 50%), radial-gradient(ellipse at 80% 20%, #6C63FF30, transparent 50%), #0F0F1A',
  },
  motif: { type: 'diagonal-lines', opacity: 0.06, color: '#E94560', implementation: '' },
  creativeDirection: {
    visualMetaphor: 'Japanese gallery minimalism meets automotive power',
    visualTension: 'giant broken text + zen whitespace',
    oneRule: 'One element always bleeds off-canvas',
    colorStory: 'dark silence → red explosion → calm authority',
    typographyVoice: '800 headings screaming, 400 body whispering',
    emotionalArc: 'intrigue → excitement → trust → commitment → power → action',
  },
}

// ─── Content Plans ──────────────────────────────────────

const plans: SlidePlan[] = [
  { slideType: 'cover', title: 'CHERY ישראל', tagline: 'הדרך החדשה קדימה', emotionalTone: 'dramatic', existingImageKey: 'coverImage' },
  { slideType: 'brief', title: 'הבריף', subtitle: 'מה CHERY צריכה', bodyText: 'צ\'רי ישראל פונה אלינו עם אתגר: לבסס את המותג כשחקן רציני בשוק הרכב הישראלי.', bulletPoints: ['מיצוב מחדש', 'בניית אמון צרכני', 'הגדלת מודעות', 'חיבור לקהל צעיר'], emotionalTone: 'analytical', existingImageKey: 'brandImage' },
  { slideType: 'goals', title: 'יעדי הקמפיין', subtitle: '4 יעדים', cards: [{ title: 'מודעות', body: 'העלאת מודעות ב-40%' }, { title: 'תפיסה', body: 'שיפור תפיסת האיכות' }, { title: 'לידים', body: '5,000 לידים איכותיים' }, { title: 'מכירות', body: '2,000 רכבים בשנה' }], keyNumber: '40%', keyNumberLabel: 'עלייה במודעות', emotionalTone: 'confident' },
  { slideType: 'audience', title: 'קהל היעד', subtitle: 'מי הם', bodyText: 'גברים ונשים 28-45, הכנסה בינונית-גבוהה, מחפשים איכות במחיר הוגן.', keyNumber: '28-45', keyNumberLabel: 'טווח גילאים', emotionalTone: 'warm', existingImageKey: 'audienceImage' },
  { slideType: 'insight', title: 'התובנה', bodyText: 'ישראלים לא קונים רכב — הם קונים ביטחון. כשמישהו בוחר רכב, הוא בוחר את הסיפור שהוא מספר לעצמו.', keyNumber: '87%', keyNumberLabel: 'לפי המלצות', emotionalTone: 'dramatic' },
  { slideType: 'whyNow', title: 'למה עכשיו', bodyText: 'שוק הרכב הישראלי עובר טלטלה. מותגים סיניים צומחים אבל אף אחד לא ביסס מובילות.', keyNumber: '23%', keyNumberLabel: 'צמיחת סיניים', emotionalTone: 'urgent' },
  { slideType: 'strategy', title: 'האסטרטגיה', subtitle: 'שלושה צירים', cards: [{ title: 'דיגיטל', body: 'קמפיין ממוקד עם UGC' }, { title: 'משפיענים', body: '15 משפיענים מובילים' }, { title: 'חוויה', body: '5 אירועי נסיעת מבחן' }], emotionalTone: 'confident', existingImageKey: 'strategyImage' },
  { slideType: 'bigIdea', title: 'לא מפחדים', tagline: 'לא מפחדים מהדרך', subtitle: 'קמפיין שמאתגר את הפחד', emotionalTone: 'dramatic', existingImageKey: 'activityImage' },
  { slideType: 'approach', title: 'הגישה היצירתית', cards: [{ title: 'סקרנות', body: 'טיזרים מסתוריים' }, { title: 'חשיפה', body: 'סיפורי נהגים אמיתיים' }, { title: 'הוכחה', body: 'נתוני בטיחות' }, { title: 'פעולה', body: 'הזמנה לנסיעת מבחן' }], emotionalTone: 'energetic' },
  { slideType: 'deliverables', title: 'תוצרים', cards: [{ title: 'TVC', body: '30 שניות לטלוויזיה' }, { title: 'סושיאל', body: '40 פוסטים לחודש' }, { title: 'OOH', body: '8 שלטי חוצות' }, { title: 'אירועים', body: '5 אירועי חוויה' }], emotionalTone: 'structured' },
  { slideType: 'metrics', title: 'מדדי הצלחה', cards: [{ title: '5M', body: 'חשיפות' }, { title: '50K', body: 'אינטראקציות' }, { title: '5,000', body: 'לידים' }, { title: '2,000', body: 'מכירות' }], keyNumber: '₪2.5M', keyNumberLabel: 'ROI צפוי', emotionalTone: 'confident' },
  { slideType: 'timeline', title: 'לוח זמנים', cards: [{ title: 'חודש 1-2', body: 'הכנה' }, { title: 'חודש 2-3', body: 'השקה' }, { title: 'חודש 3-4', body: 'שיא' }, { title: 'חודש 5-6', body: 'אופטימיזציה' }], emotionalTone: 'structured' },
  { slideType: 'closing', title: 'בואו נצא לדרך', tagline: 'CHERY × Leaders', emotionalTone: 'dramatic' },
]

const images: Record<string, string> = {
  coverImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1920&h=1080&fit=crop',
  brandImage: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=960&h=1080&fit=crop',
  audienceImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=960&h=1080&fit=crop',
  activityImage: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1920&h=1080&fit=crop',
  strategyImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=960&h=1080&fit=crop',
}

// ─── Handler ────────────────────────────────────────────

export async function POST() {
  const requestId = `test-${Date.now()}`
  console.log(`[${requestId}] 🎨 Art Director Engine v3 — GPT-5.4`)

  let artDirection: ArtDirectionResult
  let aiModel = 'fallback'
  let aiError = ''

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = buildArtDirectionPrompt(plans, designSystem, 'CHERY')

    console.log(`[${requestId}] 🤖 Calling gpt-5.4 (medium reasoning)...`)

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content: 'You are a senior art director at a top Israeli agency creating premium RTL Hebrew presentations. Each slide should feel like a different page in a luxury brand lookbook. Bold, unexpected, always readable. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nReturn a JSON object: { "slides": [ { "slideType": "...", "composition": "hero-center|hero-left|hero-right|split-screen|bento-grid|data-art|editorial|cards-float|full-bleed|timeline-flow", "heroElement": "title|number|image|quote|cards", "titlePlacement": "top|center|bottom", "titleScale": "md|lg|xl|xxl", "backgroundStyle": "solid|gradient|aurora|image-overlay", "gradientAngle": 135, "decorativeElement": "watermark|accent-line|motif-pattern|floating-shape|none", "colorEmphasis": "primary|accent|dark|light", "dramaticChoice": "One bold sentence" } ] }`,
        },
      ],
      max_completion_tokens: 8192,
      reasoning_effort: 'medium',
      response_format: { type: 'json_object' },
    })

    const rawText = completion.choices[0]?.message?.content || '{}'
    aiModel = 'gpt-5.4'
    console.log(`[${requestId}] ✅ GPT-5.4 responded: ${rawText.length} chars`)

    artDirection = parseArtDirection(rawText, plans)

    console.log(`[${requestId}] 🎯 Art Direction:`)
    for (const s of artDirection.slides) {
      console.log(`  ${s.slideType.padEnd(18)} → ${s.composition.padEnd(15)} | ${s.titlePlacement}/${s.titleScale} | ${s.dramaticChoice.slice(0, 60)}`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    aiError = msg.slice(0, 200)
    console.error(`[${requestId}] ❌ GPT-5.4 failed: ${msg}`)

    // Fallback to gpt-5.4-mini
    try {
      console.log(`[${requestId}] 🔄 Trying gpt-5.4-mini...`)
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const prompt = buildArtDirectionPrompt(plans, designSystem, 'CHERY')

      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: 'Senior art director. RTL Hebrew presentations. Return ONLY valid JSON.' },
          { role: 'user', content: `${prompt}\n\nReturn JSON: { "slides": [ { "slideType", "composition", "heroElement", "titlePlacement", "titleScale", "backgroundStyle", "gradientAngle", "decorativeElement", "colorEmphasis", "dramaticChoice" } ] }` },
        ],
        max_completion_tokens: 6144,
        reasoning_effort: 'medium',
        response_format: { type: 'json_object' },
      })

      const rawText = completion.choices[0]?.message?.content || '{}'
      aiModel = 'gpt-5.4-mini'
      artDirection = parseArtDirection(rawText, plans)
      console.log(`[${requestId}] ✅ gpt-5.4-mini responded`)
    } catch {
      console.error(`[${requestId}] ❌ All AI failed, using fallback`)
      artDirection = buildFallbackArtDirection(plans)
    }
  }

  // Layout engine
  const slides = generateSlides(artDirection, plans, designSystem, images, 'CHERY')
  console.log(`[${requestId}] ✅ ${slides.length} slides generated by ${aiModel}`)

  // Save
  const presentation: Presentation = {
    id: `test-${Date.now()}`,
    title: 'CHERY ישראל — הצעת קמפיין',
    designSystem: {
      colors: {
        primary: designSystem.colors.primary, secondary: designSystem.colors.secondary,
        accent: designSystem.colors.accent, background: designSystem.colors.background,
        text: designSystem.colors.text, cardBg: designSystem.colors.cardBg, cardBorder: designSystem.colors.cardBorder,
      },
      fonts: designSystem.fonts, direction: 'rtl',
    },
    slides,
    metadata: { brandName: 'CHERY', createdAt: new Date().toISOString(), version: 2, pipeline: `art-director-v3-${aiModel}` },
  }

  writeFileSync('/tmp/test-presentation.json', JSON.stringify(presentation, null, 2), 'utf-8')

  const usedAI = artDirection.slides[0]?.dramaticChoice !== 'Art direction fallback'

  return NextResponse.json({
    success: true,
    usedAI,
    aiModel,
    aiError: aiError || undefined,
    slides: slides.length,
    artDirection: artDirection.slides.map(s => ({
      type: s.slideType, composition: s.composition, placement: s.titlePlacement,
      scale: s.titleScale, bg: s.backgroundStyle, deco: s.decorativeElement,
      dramatic: s.dramaticChoice,
    })),
  })
}
