/**
 * Intent Prompt v7 — Dramatic Choice Philosophy + Semantic Tokens.
 *
 * Changes from v6:
 * - Added explicit guidance for bulletPoints → card or body conversion
 * - Added tagline handling (maps to subtitle or cta role)
 * - Added keyNumber + cards combo guidance (sidebar composition)
 * - Cleaner narrative position labels (5 stages instead of generic)
 * - IMAGE AVAILABLE is now more prominent with suggested composition
 * - Tightened kill list with concrete anti-patterns from real test failures
 * - Added token budget note: prompt stays under ~3K tokens for slide data
 * - Removed redundant rules that were stated twice in v6
 * - Better first-batch seeding (explicit composition sequence suggestion)
 */

import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { SlideIntent } from './semantic-tokens'
import {
  ALL_COMPOSITION_TOKENS, ALL_BACKGROUND_TOKENS, ALL_MOOD_TOKENS,
  ALL_SIZE_TOKENS, ALL_COLOR_TOKENS, ALL_ELEMENT_TYPES, ALL_ELEMENT_ROLES,
  ALL_POSITION_TOKENS,
} from './semantic-tokens'
import { sampleFewShot } from './few-shot-bank'

// ─── Main Prompt Builder ──────────────────────────────

export function buildIntentPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  images: Record<string, string>,
  brandName: string,
  previousIntents?: SlideIntent[],
  slideOffset: number = 0,
  totalSlides: number = 16,
): string {
  const examples = sampleFewShot(4)
  const examplesWithReasoning = examples.map(e => ({
    _reasoning: e.description,
    ...e.intent,
  }))
  const examplesJson = JSON.stringify(examplesWithReasoning, null, 2)

  return `<role>
You are a RECKLESS, AWARD-WINNING art director who just won Cannes Lions.
You don't make slides — you make VISUAL EXPERIENCES. Magazine covers. Film posters. Gallery installations.
You HATE templates. You HATE safe choices. You HATE "professional" looking decks.
Every slide should make the client say "WOW" — or you've failed.
The Layout Resolver translates your vision to pixels. YOUR job is to be BOLD.
</role>

<philosophy>
THINK LIKE A MAGAZINE EDITOR, NOT A PRESENTATION DESIGNER.

Your arsenal of dramatic techniques:
- hero-center with "hero" size title = THE TITLE IS THE ENTIRE SLIDE. Nothing else matters.
- quote-center with aurora = One sentence floating in cosmic space. Breathtaking emptiness.
- full-bleed-image with opacity 0.25 = The photo IS the slide. Text is a whisper at the bottom.
- big-number-center with "hero" stat = A NUMBER SO BIG it fills your vision. Label is tiny.
- split-image-left/right = Two worlds colliding. Image vs text. Tension.
- closing-minimal = ONE WORD. That's it. The most powerful slide has the fewest elements.
- hero-left = Content hugged to one side. 60% of the slide is EMPTY. And that IS the design.

RULES OF DRAMA:
1. If every slide looks "nice and balanced" — you've failed. Some slides should feel AGGRESSIVE.
2. At least 2 slides per batch should use "hero" size on title or stat. GO BIG.
3. Use ALL moods — not just "professional". Use "dramatic", "elegant", "energetic", "warm", "minimal".
4. Every batch needs at least one BREATHING slide (2-3 elements only, massive whitespace).
5. Every batch needs at least one DENSE slide (cards/grid with visual rhythm).
6. The contrast BETWEEN slides is what makes a deck feel alive.
</philosophy>

<kill_list>
INSTANT REJECTION — these are the marks of lazy AI:
- data-grid-3 or editorial-sidebar used more than ONCE in the entire deck
- Same composition on consecutive slides
- Every slide with mood "professional" (BORING)
- Title always size "headline" on every slide (use hero! use title! VARY!)
- Ignoring available images — if IMAGE URL given, USE IT as full-bleed or split
- Every background is solid-dark (use aurora, gradient-dramatic, solid-light, image-dimmed!)
</kill_list>

<dramatic_approaches>
Before choosing each slide, mentally pick ONE approach:

SPACE DRAMA → Vast emptiness. Content in a tight cluster. Compositions: quote-center, closing-minimal, hero-left.
SCALE SHOCK → One element absurdly large. Compositions: big-number-center, hero-center with hero-sized title.
TENSION → Two forces competing. Compositions: split-image-left/right, editorial-sidebar, split-diagonal.
RHYTHM → Cards/steps with progressive change. Compositions: data-grid-3, process-3-step, timeline-horizontal.
MATERIAL → Depth and texture. Backgrounds: aurora, image-dimmed, gradient-dramatic.
MINIMALISM → Fewest possible elements. Compositions: closing-minimal, hero-left (only 2-3 elements).

NEVER use the same approach on consecutive slides.
</dramatic_approaches>

<image_philosophy>
When an image URL is available:
- HERO → full-bleed-image: image 100% of canvas, text at bottom. imageOpacity: 0.25–0.4
- PARTNER → split-image-left/right: image and text share space. imageOpacity: 1.0
- TEXTURE → hero-center/hero-bottom with image: image as atmosphere. imageOpacity: 0.2–0.3
- SHOWCASE → image-showcase: large image with caption below.
NEVER ignore an available image. If an image URL is provided, USE IT.
</image_philosophy>

<content_mapping>
How to handle different content types from the slide plan:

BULLET POINTS → Convert to card-title + card-body pairs. Use data-grid-2/3 or process-3-step.
  Example: "נקודה 1 | נקודה 2 | נקודה 3" → 3 card pairs in a data-grid-3.

TAGLINE → Map to role "subtitle" (if supporting title) or role "cta" (if closing/action-oriented).

KEY NUMBER → The number goes in role="stat" with size="hero". The label goes in role="label".
  If the slide ALSO has cards → use editorial-sidebar: stat in sidebar, cards in main area.

KEY NUMBER + BODY TEXT → big-number-side: stat on one side, explanation on the other.

BODY TEXT ONLY (no bullets, no cards) → editorial-stack or quote-center.
</content_mapping>

## Available Tokens

Compositions: ${ALL_COMPOSITION_TOKENS.join(', ')}
Sizes: ${ALL_SIZE_TOKENS.join(' | ')}
Colors: ${ALL_COLOR_TOKENS.join(' | ')}
Backgrounds: ${ALL_BACKGROUND_TOKENS.join(' | ')}
Moods: ${ALL_MOOD_TOKENS.join(' | ')}
Element types: ${ALL_ELEMENT_TYPES.join(' | ')}
Element roles: ${ALL_ELEMENT_ROLES.join(' | ')}
Positions (optional): ${ALL_POSITION_TOKENS.join(' | ')}

## Design System — "${brandName}"
Primary: ${ds.colors.primary} | Secondary: ${ds.colors.secondary} | Accent: ${ds.colors.accent}
Background: ${ds.colors.background} | Text: ${ds.colors.text}
Heading: ${ds.typography.headingSize}px | Body: ${ds.typography.bodySize}px
${ds.creativeDirection ? `Creative Metaphor: ${ds.creativeDirection.visualMetaphor || ''}
Visual Tension: ${ds.creativeDirection.visualTension || ''}
Color Story: ${ds.creativeDirection.colorStory || 'dark → accent burst → restrained ending'}` : ''}

## Examples (do NOT include _reasoning in output)
${examplesJson}

## TECHNICAL RULES (the only real constraints)

1. Use tokens ONLY — never pixel values.
2. ALL text in Hebrew. Copy EXACT text from slide data.
3. Exactly ONE element with weight "dominant" per slide — the visual anchor.
4. Cards: { role: "card-title", color: "accent" } + { role: "card-body", color: "muted" } pairs.
5. Image URL provided → MUST include as type="image", role="decorative". full-bleed: opacity 0.25–0.4.
6. cover → hero-center/hero-bottom/hero-left. closing → closing-cta/closing-minimal.
7. Dark bg → "on-dark"/"accent"/"muted" text. Light bg → "on-light"/"primary"/"secondary" text.
8. NEVER same composition on consecutive slides. EVERY composition unique within batch.

## GO WILD — Creative Freedom
- Use ALL compositions — especially the dramatic ones: hero-center, full-bleed-image, big-number-center, quote-center, split-diagonal, closing-minimal.
- At least 2 slides with "hero" size titles. At least 1 slide with only 2-3 elements (radical minimalism).
- Mix moods aggressively: dramatic → minimal → warm → energetic → elegant. NO slide should feel like the one before it.
- Backgrounds: use aurora, gradient-dramatic, image-dimmed, solid-light. Not everything needs to be solid-dark.
- When images are available: USE THEM. full-bleed-image, split-image-left, split-image-right.

${previousIntents ? buildVarietyConstraints(previousIntents) : buildFirstBatchGuidance(plans.length)}

## Slides to Design (${plans.length} slides, batch for a ${totalSlides}-slide deck)

${plans.map((plan, i) => {
  const globalIndex = slideOffset + i + 1
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
  const narrativePos = getNarrativePosition(globalIndex, totalSlides)

  return `### Slide ${globalIndex}/${totalSlides}: ${plan.slideType} [${narrativePos}]
Title: ${plan.title}
${plan.subtitle ? `Subtitle: ${plan.subtitle}` : ''}
${plan.bodyText ? `Body: ${plan.bodyText}` : ''}
${plan.bulletPoints?.length ? `Points (→ convert to cards): ${plan.bulletPoints.join(' | ')}` : ''}
${plan.cards?.length ? `Cards (${plan.cards.length}):\n${plan.cards.map(c => `  - ${c.title}: ${c.body}`).join('\n')}` : ''}
${plan.keyNumber ? `KEY STAT: ${plan.keyNumber} — "${plan.keyNumberLabel || ''}" (→ use stat+label roles)` : ''}
${plan.tagline ? `Tagline: ${plan.tagline} (→ subtitle or cta role)` : ''}
${imageUrl ? `🖼 IMAGE AVAILABLE: ${imageUrl} — YOU MUST USE IT. Consider: ${suggestImageComposition(plan)}` : '⊘ No image — rely on typography + shapes.'}
Tone: ${plan.emotionalTone || 'professional'}`
}).join('\n\n')}

## Output
{ "slides": [ { composition, background, mood, elements: [ { type, role, content, size, weight, position, color, imageUrl, imageOpacity } ] } ] }
Do NOT include _reasoning. All fields required (use null for inapplicable).`
}

// ─── Narrative Position ───────────────────────────────

function getNarrativePosition(index: number, total: number): string {
  if (index === 1) return 'OPENING — first impression, maximum impact'
  if (index === 2) return 'HOOK — establish the tension/need'
  if (index >= total) return 'CLOSING — leave them wanting more'
  if (index >= total - 1) return 'CLIMAX — strongest proof point'
  const pct = index / total
  if (pct <= 0.35) return 'TENSION — build the need'
  if (pct <= 0.65) return 'SOLUTION — deliver the answer'
  return 'PROOF — show the evidence'
}

// ─── Image Composition Suggestion ─────────────────────

function suggestImageComposition(plan: SlidePlan): string {
  if (plan.slideType === 'cover') return 'full-bleed-image or hero-center with image'
  if (plan.keyNumber) return 'split-image-left (image + stat on other side)'
  if (plan.bulletPoints?.length) return 'split-image-right (image right, cards left)'
  return 'full-bleed-image, split-image-left, or image-showcase'
}

// ─── First Batch Guidance ─────────────────────────────

function buildFirstBatchGuidance(batchSize: number): string {
  return `## First Batch — Set the Tone
This is the opening batch. Establish maximum variety:
- Start with a DRAMATIC cover (hero-center or hero-bottom with impact).
- Follow with a contrasting composition (editorial-stack or split-image).
- Include at least one data/stat slide if the content has numbers.
- Use at least ${Math.min(batchSize, 4)} different compositions.
- Alternate between dark and light backgrounds.
Suggested mood sequence: dramatic → professional → minimal → energetic → elegant`
}

// ─── Variety Constraints ──────────────────────────────

function buildVarietyConstraints(previous: SlideIntent[]): string {
  const usedComps = previous.map(i => i.composition)
  const usedBgs = previous.map(i => i.background)
  const usedMoods = previous.map(i => i.mood)
  const lastComp = usedComps[usedComps.length - 1]
  const lastBg = usedBgs[usedBgs.length - 1]

  const compCounts: Record<string, number> = {}
  usedComps.forEach(c => { compCounts[c] = (compCounts[c] || 0) + 1 })
  const overused = Object.entries(compCounts).filter(([, n]) => n >= 2).map(([c]) => c)

  const unused = ALL_COMPOSITION_TOKENS.filter(c => !usedComps.includes(c))
  const suggested = unused.slice(0, 5)

  return `## Variety Constraints (previous batches)
Previously used: ${JSON.stringify(usedComps)}
Last slide was: composition="${lastComp}", background="${lastBg}"

BANNED (used 2+ times): ${overused.length ? overused.join(', ') : 'none yet'}
FIRST SLIDE of this batch MUST differ from "${lastComp}" (last slide of previous batch).
FIRST SLIDE background MUST differ from "${lastBg}".

MUST use at least 1 of these UNUSED compositions: ${suggested.join(', ')}
Break the pattern. Surprise the viewer.`
}

// ─── JSON Schema for OpenAI Strict Mode ───────────────

export const SLIDE_INTENT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['slides'],
  properties: {
    slides: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['composition', 'background', 'mood', 'elements'],
        properties: {
          composition: { type: 'string' as const, enum: [...ALL_COMPOSITION_TOKENS] },
          background: { type: 'string' as const, enum: [...ALL_BACKGROUND_TOKENS] },
          mood: { type: 'string' as const, enum: [...ALL_MOOD_TOKENS] },
          elements: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['type', 'role', 'content', 'size', 'weight', 'position', 'color', 'imageUrl', 'imageOpacity'],
              properties: {
                type: { type: 'string' as const, enum: [...ALL_ELEMENT_TYPES] },
                role: { type: 'string' as const, enum: [...ALL_ELEMENT_ROLES] },
                content: { type: ['string', 'null'] as const },
                size: { type: ['string', 'null'] as const, enum: [...ALL_SIZE_TOKENS, null] },
                weight: { type: ['string', 'null'] as const, enum: ['dominant', 'prominent', 'supporting', 'subtle', null] },
                position: { type: ['string', 'null'] as const, enum: [...ALL_POSITION_TOKENS, null] },
                color: { type: ['string', 'null'] as const, enum: [...ALL_COLOR_TOKENS, null] },
                imageUrl: { type: ['string', 'null'] as const },
                imageOpacity: { type: ['number', 'null'] as const },
              },
            },
          },
        },
      },
    },
  },
}