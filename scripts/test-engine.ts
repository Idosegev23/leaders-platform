/**
 * Test script — generates a presentation using the REAL AI Art Director Engine
 * Run: npx tsx scripts/test-engine.ts
 * Output: saves to /tmp/test-presentation.json
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import {
  generateSlides,
  buildArtDirectionPrompt,
  ART_DIRECTION_SCHEMA,
  parseArtDirection,
  buildFallbackArtDirection,
} from '../src/lib/slide-engine'
import type { PremiumDesignSystem, SlidePlan } from '../src/lib/gemini/slide-design/types'
import type { Presentation } from '../src/types/presentation'
import { writeFileSync } from 'fs'

// ─── Gemini Client ──────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) { console.error('❌ GEMINI_API_KEY not found in .env.local'); process.exit(1) }

const ai = new GoogleGenAI({ apiKey })

// ─── Design System (CHERY-inspired) ─────────────────────

const designSystem: PremiumDesignSystem = {
  colors: {
    primary: '#E94560',
    secondary: '#1A1A2E',
    accent: '#E94560',
    background: '#0F0F1A',
    text: '#F5F5F7',
    cardBg: '#1A1A2E',
    cardBorder: '#2A2A3E',
    gradientStart: '#1A1A2E',
    gradientEnd: '#0F0F1A',
    muted: '#8B8B9E',
    highlight: '#FF6B8A',
    auroraA: '#E9456040',
    auroraB: '#6C63FF30',
    auroraC: '#1A1A2E20',
  },
  fonts: { heading: 'Heebo', body: 'Heebo' },
  direction: 'rtl',
  typography: {
    displaySize: 104,
    headingSize: 56,
    subheadingSize: 32,
    bodySize: 22,
    captionSize: 15,
    letterSpacingTight: -2,
    letterSpacingWide: 4,
    lineHeightTight: 1.05,
    lineHeightRelaxed: 1.5,
    weightPairs: [[800, 400]],
  },
  spacing: { unit: 8, cardPadding: 32, cardGap: 24, safeMargin: 80 },
  effects: {
    borderRadius: 'soft',
    borderRadiusValue: 16,
    decorativeStyle: 'geometric',
    shadowStyle: 'fake-3d',
    auroraGradient: 'radial-gradient(ellipse at 20% 50%, #E9456040, transparent 50%), radial-gradient(ellipse at 80% 20%, #6C63FF30, transparent 50%), #0F0F1A',
  },
  motif: {
    type: 'diagonal-lines',
    opacity: 0.06,
    color: '#E94560',
    implementation: 'repeating-linear-gradient(45deg, transparent, transparent 40px, #E9456010 40px, #E9456010 41px)',
  },
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
  { slideType: 'goals', title: 'יעדי הקמפיין', subtitle: '4 יעדים מרכזיים', cards: [{ title: 'מודעות', body: 'העלאת מודעות ב-40%' }, { title: 'תפיסה', body: 'שיפור תפיסת האיכות' }, { title: 'לידים', body: '5,000 לידים איכותיים' }, { title: 'מכירות', body: '2,000 רכבים בשנה' }], keyNumber: '40%', keyNumberLabel: 'עלייה במודעות', emotionalTone: 'confident' },
  { slideType: 'audience', title: 'קהל היעד', subtitle: 'מי הם', bodyText: 'גברים ונשים 28-45, הכנסה בינונית-גבוהה, מחפשים איכות במחיר הוגן.', keyNumber: '28-45', keyNumberLabel: 'טווח גילאים', emotionalTone: 'warm', existingImageKey: 'audienceImage' },
  { slideType: 'insight', title: 'התובנה', bodyText: 'ישראלים לא קונים רכב — הם קונים ביטחון. כשמישהו בוחר רכב, הוא בוחר את הסיפור שהוא מספר לעצמו.', keyNumber: '87%', keyNumberLabel: 'לפי המלצות', emotionalTone: 'dramatic' },
  { slideType: 'whyNow', title: 'למה עכשיו', bodyText: 'שוק הרכב הישראלי עובר טלטלה. המותגים הסיניים צומחים אבל אף אחד לא ביסס מובילות.', keyNumber: '23%', keyNumberLabel: 'צמיחת סיניים', emotionalTone: 'urgent' },
  { slideType: 'strategy', title: 'האסטרטגיה', subtitle: 'שלושה צירים', cards: [{ title: 'דיגיטל', body: 'קמפיין ממוקד עם תוכן UGC' }, { title: 'משפיענים', body: '15 משפיענים מובילים' }, { title: 'חוויה', body: '5 אירועי נסיעת מבחן' }], emotionalTone: 'confident', existingImageKey: 'strategyImage' },
  { slideType: 'bigIdea', title: 'לא מפחדים', tagline: 'לא מפחדים מהדרך', subtitle: 'קמפיין שמאתגר את הפחד', emotionalTone: 'dramatic', existingImageKey: 'activityImage' },
  { slideType: 'approach', title: 'הגישה היצירתית', cards: [{ title: 'סקרנות', body: 'טיזרים מסתוריים' }, { title: 'חשיפה', body: 'סיפורי נהגים אמיתיים' }, { title: 'הוכחה', body: 'נתוני בטיחות ויזואליים' }, { title: 'פעולה', body: 'הזמנה לנסיעת מבחן' }], emotionalTone: 'energetic' },
  { slideType: 'deliverables', title: 'תוצרים', cards: [{ title: 'TVC', body: '30 שניות לטלוויזיה' }, { title: 'סושיאל', body: '40 פוסטים לחודש' }, { title: 'OOH', body: '8 שלטי חוצות' }, { title: 'אירועים', body: '5 אירועי חוויה' }], emotionalTone: 'structured' },
  { slideType: 'metrics', title: 'מדדי הצלחה', cards: [{ title: '5M', body: 'חשיפות דיגיטל' }, { title: '50K', body: 'אינטראקציות' }, { title: '5,000', body: 'לידים' }, { title: '2,000', body: 'מכירות' }], keyNumber: '₪2.5M', keyNumberLabel: 'ROI צפוי', emotionalTone: 'confident' },
  { slideType: 'timeline', title: 'לוח זמנים', cards: [{ title: 'חודש 1-2', body: 'הכנה ופיתוח' }, { title: 'חודש 2-3', body: 'השקה + טיזרים' }, { title: 'חודש 3-4', body: 'שיא + אירועים' }, { title: 'חודש 5-6', body: 'אופטימיזציה' }], emotionalTone: 'structured' },
  { slideType: 'closing', title: 'בואו נצא לדרך', tagline: 'CHERY × Leaders', emotionalTone: 'dramatic' },
]

const images: Record<string, string> = {
  coverImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1920&h=1080&fit=crop',
  brandImage: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=960&h=1080&fit=crop',
  audienceImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=960&h=1080&fit=crop',
  activityImage: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1920&h=1080&fit=crop',
  strategyImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=960&h=1080&fit=crop',
}

// ─── Main: Call REAL AI ─────────────────────────────────

async function main() {
  console.log('🎨 Art Director Engine v3 — REAL AI Generation')
  console.log(`📋 ${plans.length} slides | 🖼️ ${Object.keys(images).length} images`)
  console.log()

  // Build the art direction prompt
  const prompt = buildArtDirectionPrompt(plans, designSystem, 'CHERY')
  console.log(`📝 Art Direction prompt: ${prompt.length} chars`)
  console.log()

  let artDirection
  try {
    console.log('🤖 Calling Gemini for art direction...')
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are a senior art director at a top Israeli agency creating premium RTL Hebrew presentations. Make each slide feel like a different page in a luxury brand lookbook. Bold, unexpected, always readable.',
        responseMimeType: 'application/json',
        responseSchema: ART_DIRECTION_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 6144,
      } as GenerateContentConfig,
    })

    const rawText = result.text || '{}'
    console.log(`✅ AI responded: ${rawText.length} chars`)
    artDirection = parseArtDirection(rawText, plans)

    console.log('\n🎯 AI Art Direction:')
    for (const s of artDirection.slides) {
      console.log(`  ${s.slideType.padEnd(20)} → ${s.composition.padEnd(15)} | title: ${s.titlePlacement}/${s.titleScale} | bg: ${s.backgroundStyle} | deco: ${s.decorativeElement}`)
      console.log(`    💡 ${s.dramaticChoice}`)
    }
  } catch (err) {
    console.error('❌ AI call failed, using fallback:', err)
    artDirection = buildFallbackArtDirection(plans)
  }

  console.log()

  // Generate slides with the REAL AI decisions
  const slides = generateSlides(artDirection, plans, designSystem, images, 'CHERY')

  console.log(`✅ Generated ${slides.length} slides:`)
  for (const slide of slides) {
    const imgs = slide.elements.filter(e => e.type === 'image').length
    console.log(`  ${slide.slideType.padEnd(20)} | ${slide.elements.length.toString().padStart(2)} elements | ${imgs} imgs | bg: ${slide.background.type} | ${slide.archetype}`)
  }

  // Assemble presentation
  const presentation: Presentation = {
    id: `test-${Date.now()}`,
    title: 'CHERY ישראל — הצעת קמפיין',
    designSystem: {
      colors: {
        primary: designSystem.colors.primary,
        secondary: designSystem.colors.secondary,
        accent: designSystem.colors.accent,
        background: designSystem.colors.background,
        text: designSystem.colors.text,
        cardBg: designSystem.colors.cardBg,
        cardBorder: designSystem.colors.cardBorder,
      },
      fonts: designSystem.fonts,
      direction: 'rtl',
    },
    slides,
    metadata: {
      brandName: 'CHERY',
      createdAt: new Date().toISOString(),
      version: 2,
      pipeline: 'art-director-engine-v3-real-ai',
    },
  }

  const outPath = '/tmp/test-presentation.json'
  writeFileSync(outPath, JSON.stringify(presentation, null, 2), 'utf-8')
  console.log(`\n💾 Saved to ${outPath} (${(JSON.stringify(presentation).length / 1024).toFixed(1)} KB)`)
}

main().catch(console.error)
