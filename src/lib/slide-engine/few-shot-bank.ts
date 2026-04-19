/**
 * Few-Shot Example Bank v7 — Editorial reasoning + full composition coverage.
 *
 * Changes from v6:
 * - 15 examples (was 12) — covers ALL major composition families
 * - Better mood distribution: not everything is "dramatic"
 * - Added missing compositions: image-showcase, team-grid, editorial-stack, data-grid-2, closing-minimal
 * - Descriptions rewritten as editorial REASONING that teaches GPT how to think
 * - Reduced card-body text length in examples (GPT was generating long card text)
 * - Sampling function now ensures variety: at least 1 dark + 1 light bg in every sample
 */

import type { SlideIntent } from './semantic-tokens'

export interface FewShotExample {
  /** Editorial reasoning — WHY this composition was chosen. GPT learns the thinking. */
  description: string
  intent: SlideIntent
}

export const FEW_SHOT_BANK: FewShotExample[] = [

  // ═══════════════════════════════════════════════════
  // OPENERS / HEROES
  // ═══════════════════════════════════════════════════

  {
    description: 'OPENING SLIDE needs maximum impact. hero-center with gradient-dramatic creates a bold first impression. One giant title, zero clutter. The subtitle is whisper-small to create scale contrast. Typography IS the visual — no image needed.',
    intent: {
      composition: 'hero-center', background: 'gradient-dramatic', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'title', content: 'מהפכה שמתחילה מלמטה', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'אסטרטגיית מותג 2025', size: 'caption', weight: 'subtle', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'SPACE DRAMA — vast emptiness with content in tight cluster at the left. 70% of the slide is negative space. This is deliberate: the emptiness communicates confidence. Only works with hero-left.',
    intent: {
      composition: 'hero-left', background: 'gradient-dramatic', mood: 'elegant',
      elements: [
        { type: 'text', role: 'title', content: 'הכוח של מה שלא נאמר', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'שטח ריק הוא לא חולשה — הוא ביטחון.', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // DATA / STATS
  // ═══════════════════════════════════════════════════

  {
    description: 'DATA DRAMA — one massive number dominates the entire slide. The stat screams, everything else whispers. aurora background adds depth without competing. Only 3 elements needed.',
    intent: {
      composition: 'big-number-center', background: 'aurora', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'stat', content: '73%', size: 'hero', weight: 'dominant', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'מהקמפיינים עוברים את היעד', size: 'subtitle', weight: 'supporting', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'title', content: 'מדדי הצלחה', size: 'title', weight: 'prominent', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'SIDEBAR STAT — asymmetric tension. Main content on one side, massive stat on the other. Two worlds on one slide. editorial-sidebar creates this split naturally. Good for "why now" arguments.',
    intent: {
      composition: 'editorial-sidebar', background: 'solid-dark', mood: 'minimal',
      elements: [
        { type: 'text', role: 'title', content: 'למה עכשיו?', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'השוק הישראלי עובר שינוי מבני', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'stat', content: '+42%', size: 'hero', weight: 'prominent', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'גידול בביקוש', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // CARD GRIDS
  // ═══════════════════════════════════════════════════

  {
    description: 'THREE-COLUMN GRID — cards with progressive hierarchy. card-title + card-body pairs, max 3 cards. Light gradient background so cards can be glass panels. Professional mood keeps it clean.',
    intent: {
      composition: 'data-grid-3', background: 'gradient-subtle', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: '3 יעדים שישנו את המותג', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מודעות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'חשיפה של 2M', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מכירות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'גידול 35% בהמרות', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'נאמנות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'שיפור retention 20%', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'TWO-COLUMN COMPARISON — when you have exactly 2 things to compare. Wider cards than 3-col. Light background keeps it airy. Keep card text SHORT — one line max.',
    intent: {
      composition: 'data-grid-2', background: 'solid-light', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'לפני ואחרי', size: 'headline', weight: 'dominant', position: null, color: 'on-light', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'לפני הקמפיין', size: null, weight: null, position: null, color: 'secondary', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: '12K עוקבים, 2% engagement', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'אחרי הקמפיין', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: '85K עוקבים, 8.5% engagement', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // IMAGE-DRIVEN
  // ═══════════════════════════════════════════════════

  {
    description: 'FULL BLEED — image fills everything, text is a thin whisper at the bottom. The image does ALL the work. Less than 20% text. image-dimmed background ensures text is readable over the image.',
    intent: {
      composition: 'full-bleed-image', background: 'image-dimmed', mood: 'warm',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: 'full-bleed', color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 0.35 },
        { type: 'text', role: 'title', content: 'הם לא מחכים — הם כבר בדרך', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'דור שגדל על תוכן אותנטי', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'SPLIT WITH IMAGE — image and text share the stage. Image bleeds off left edge for tension. Content sits on the right with plenty of breathing room. Solid dark bg makes the image pop.',
    intent: {
      composition: 'split-image-left', background: 'solid-dark', mood: 'dramatic',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'הלקוחות שלכם כבר לא שם', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: '73% מקהל היעד עבר לפלטפורמות חדשות', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'IMAGE SHOWCASE — one large, beautiful image with a caption. Let the image speak. Minimal mood because the image is the design. Good for portfolio/case study moments.',
    intent: {
      composition: 'image-showcase', background: 'solid-dark', mood: 'minimal',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'קמפיין קיץ 2024', size: 'title', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'caption', content: '2.4M צפיות | 340K שיתופים', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // EDITORIAL / TEXT-HEAVY
  // ═══════════════════════════════════════════════════

  {
    description: 'EDITORIAL STACK — title at top, body text below. Clean and readable. This is the workhorse slide for explanations. Light background + on-light text = easy reading. Every presentation needs at least one.',
    intent: {
      composition: 'editorial-stack', background: 'solid-light', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'הגישה שלנו', size: 'headline', weight: 'dominant', position: null, color: 'on-light', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'אנחנו מאמינים בתוכן שנולד מתוך הקהילה, לא כזה שנכפה עליה. כל קמפיין מתחיל מהקשבה.', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'QUOTE — minimalist centered thought with aurora glow. Nothing else competes. The slide breathes. Only 2 elements. Works for customer quotes, market insights, or bold claims.',
    intent: {
      composition: 'quote-center', background: 'aurora', mood: 'elegant',
      elements: [
        { type: 'text', role: 'quote', content: 'כשהבית הופך לסנקטואריה — הטכנולוגיה חייבת להרגיש בלתי נראית', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'caption', content: 'מחקר שוק 2025', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // PROCESS / TIMELINE
  // ═══════════════════════════════════════════════════

  {
    description: 'TIMELINE — horizontal flow for phased plans. Each step is a card-title + card-body pair. Title names the phase, body explains it briefly. Energetic mood suggests forward motion.',
    intent: {
      composition: 'timeline-horizontal', background: 'gradient-subtle', mood: 'energetic',
      elements: [
        { type: 'text', role: 'title', content: 'לוח זמנים — 90 יום', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 1', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'אפיון ומחקר', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 2', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פיתוח ויישום', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 3', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'השקה ואופטימיזציה', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'THREE-STEP PROCESS — structured but with personality. Glass cards on dark background. Big decorative step numbers would be rendered by the layout resolver. Good for methodology slides.',
    intent: {
      composition: 'process-3-step', background: 'solid-dark', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'איך זה עובד', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מיפוי', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'זיהוי רגעי מפתח', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'יצירה', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'תוכן בשפת החוויה', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'הפצה', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פלטפורמות ממוקדות', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ═══════════════════════════════════════════════════
  // CLOSERS
  // ═══════════════════════════════════════════════════

  {
    description: 'DRAMATIC CLOSER — the last slide needs to LAND. One sentence, maximum presence. hero-sized title with glow. CTA in accent. Nothing else. Audience leaves with this image.',
    intent: {
      composition: 'closing-cta', background: 'gradient-dramatic', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'title', content: 'בואו נתחיל', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'cta', content: 'Leaders × Brand', size: 'subtitle', weight: 'supporting', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  {
    description: 'MINIMAL CLOSER — sometimes a quiet exit is more powerful than a dramatic one. Thank you + contact info. Elegant and understated. Good contrast after an energetic presentation.',
    intent: {
      composition: 'closing-minimal', background: 'solid-dark', mood: 'elegant',
      elements: [
        { type: 'text', role: 'title', content: 'תודה', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'hello@leaders.co.il | 050-0000000', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },
]

// ─── Smart Sampling ────────────────────────────────────

/**
 * Sample few-shot examples with guaranteed variety:
 * - At least 1 example with a dark background
 * - At least 1 example with a light/subtle background
 * - No two examples share the same composition
 * - At least 1 card-based example (data-grid or process)
 */
export function sampleFewShot(count: number = 4): FewShotExample[] {
  const pool = [...FEW_SHOT_BANK]

  // Categorize
  const darkBg = pool.filter(e =>
    ['gradient-dramatic', 'solid-dark', 'aurora', 'image-dimmed'].includes(e.intent.background),
  )
  const lightBg = pool.filter(e =>
    ['solid-light', 'gradient-subtle', 'solid-primary'].includes(e.intent.background),
  )
  const cardBased = pool.filter(e =>
    ['data-grid-2', 'data-grid-3', 'data-grid-4', 'process-3-step', 'timeline-horizontal'].includes(e.intent.composition),
  )

  const selected: FewShotExample[] = []
  const usedCompositions = new Set<string>()

  // Helper: pick random from array, avoiding used compositions
  function pickUnique(arr: FewShotExample[]): FewShotExample | undefined {
    const available = arr.filter(e => !usedCompositions.has(e.intent.composition))
    if (available.length === 0) return undefined
    const pick = available[Math.floor(Math.random() * available.length)]
    usedCompositions.add(pick.intent.composition)
    return pick
  }

  // 1. Guarantee at least 1 dark bg example
  const dark = pickUnique(darkBg)
  if (dark) selected.push(dark)

  // 2. Guarantee at least 1 light bg example
  const light = pickUnique(lightBg)
  if (light) selected.push(light)

  // 3. Guarantee at least 1 card-based example
  const card = pickUnique(cardBased)
  if (card) selected.push(card)

  // 4. Fill remaining slots randomly
  while (selected.length < count) {
    const remaining = pool.filter(e => !usedCompositions.has(e.intent.composition))
    if (remaining.length === 0) break
    const pick = remaining[Math.floor(Math.random() * remaining.length)]
    usedCompositions.add(pick.intent.composition)
    selected.push(pick)
  }

  // Shuffle final order so guaranteed picks aren't always first
  return selected.sort(() => Math.random() - 0.5)
}