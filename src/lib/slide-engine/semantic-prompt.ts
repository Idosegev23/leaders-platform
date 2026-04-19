/**
 * Semantic Prompt — gives GPT-5.4 full creative freedom.
 * Instead of choosing from fixed compositions, GPT-5.4 designs each slide
 * by assembling semantic elements (title, image, cards, watermark, etc.)
 */

import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { SemanticPresentation, SemanticSlide, SemanticElement } from './semantic-types'

export function buildSemanticPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  brandName: string,
): string {
  const cd = ds.creativeDirection
  const metaphor = cd?.visualMetaphor || 'premium editorial'
  const tension = cd?.visualTension || 'bold typography vs minimal whitespace'

  const slideList = plans.map((p, i) => {
    const hasImage = !!p.existingImageKey
    const hasCards = (p.cards?.length || 0) > 0
    const hasBullets = (p.bulletPoints?.length || 0) > 0
    const titleLen = p.title.length
    return `  ${i + 1}. type="${p.slideType}" title="${p.title}"(${titleLen}ch) subtitle="${p.subtitle || ''}" bodyText="${(p.bodyText || '').slice(0, 60)}" image=${hasImage} cards=${p.cards?.length || 0} bullets=${p.bulletPoints?.length || 0} number=${p.keyNumber ? `"${p.keyNumber}"` : 'none'} numberLabel="${p.keyNumberLabel || ''}" tagline="${p.tagline || ''}" tone="${p.emotionalTone}"`
  }).join('\n')

  return `You are a world-class art director designing slides for "${brandName}".

CREATIVE DIRECTION:
  Visual metaphor: ${metaphor}
  Visual tension: ${tension}
  Rule: ${cd?.oneRule || 'every slide must feel like a different magazine page'}
  Color story: ${cd?.colorStory || 'dark → accent burst → restrained ending'}

BRAND COLORS: primary=${ds.colors.primary} accent=${ds.colors.accent} bg=${ds.colors.background} text=${ds.colors.text} cardBg=${ds.colors.cardBg}

SLIDES TO DESIGN:
${slideList}

YOUR JOB: For each slide, choose a BACKGROUND and assemble ELEMENTS from the toolkit below.
You have COMPLETE creative freedom. Mix and match. Layer. Surprise.

ELEMENT TOOLKIT (use any combination):

TYPOGRAPHY:
  { "kind": "title", "size": "giant|large|medium|small", "position": "top|center|bottom", "align": "right|center|left", "effect": "hollow-stroke|glow|heavy-shadow|none" }
  { "kind": "subtitle", "position": "below-title|top|center|bottom", "align": "right|center" }
  { "kind": "body", "position": "below-subtitle|below-title|right-half|left-half|center", "align": "right|center", "maxLines": 3 }
  { "kind": "bullets", "items": ["..."], "position": "below-subtitle|center|right-half", "style": "dots|numbers|dashes" }
  { "kind": "quote-mark", "position": "top-left|top-right", "size": "large|small" }
  { "kind": "tag", "text": "...", "position": "top-right|top-left|bottom-right", "color": "accent|primary" }
  { "kind": "watermark", "text": "BRAND", "size": "massive|large", "opacity": 0.03-0.06 }

DATA:
  { "kind": "key-number", "value": "400%", "label": "ROI צפוי", "size": "massive|large|medium", "position": "center|top|below-title", "color": "accent|primary|text" }
  { "kind": "number-grid", "items": [{"value": "5M", "label": "חשיפות"}], "columns": 2|3|4 }

LAYOUT:
  { "kind": "cards", "items": [{"title":"...", "body":"..."}], "layout": "grid-2x2|grid-3|grid-2|horizontal|stacked|bento", "style": "glass|solid|outlined|accent-first" }
  { "kind": "timeline", "phases": [{"title":"...", "body":"..."}], "style": "horizontal|vertical" }

VISUAL:
  { "kind": "image", "placement": "full-bleed|right-half|left-half|top-right|bottom-left|center-contained", "opacity": 0.3, "filter": "darken|blur|saturate|none", "borderRadius": "large|small|none" }
  { "kind": "accent-line", "position": "below-title|below-subtitle|left-edge|right-edge|top", "color": "accent|primary" }
  { "kind": "decorative-shape", "shape": "circle|square|blob", "position": "top-right|top-left|bottom-right|bottom-left", "color": "accent|primary|secondary", "opacity": 0.05-0.15, "size": "large|medium|small" }
  { "kind": "gradient-overlay", "direction": 180, "from": "background", "to": "primary", "opacity": 0.8 }
  { "kind": "divider", "orientation": "vertical|horizontal", "position": "center|left-third|right-third" }
  { "kind": "glass-card", "position": "center|bottom|top-right", "width": "full|half|third", "content": "..." }

BACKGROUNDS:
  { "style": "gradient", "colors": ["background", "secondary"], "angle": 135 }
  { "style": "aurora" }
  { "style": "solid", "colors": ["background"] }
  { "style": "dark-gradient", "angle": 180 }
  { "style": "image-overlay" }  ← use with { "kind": "image", "placement": "full-bleed" } + { "kind": "gradient-overlay" }

RULES:
1. COVER: must feel dramatic. Use giant/large title + at least one visual effect (watermark/shape/image)
2. CLOSING: minimal but powerful. Large title centered, maybe a tagline
3. Every slide needs AT LEAST: title + one more element. 5-10 elements is ideal
4. VARIETY: never repeat the same layout pattern on consecutive slides
5. Use the actual Hebrew text from the slide data. Don't invent text
6. If image=true, USE IT. Place it prominently (full-bleed, half, or contained)
7. If cards exist, show them (grid, stacked, bento, etc.)
8. If keyNumber exists, make it BIG and prominent
9. Title position must VARY across the deck (don't put all titles at top)
10. At least 3 slides should use decorative elements (shapes, watermarks, accent lines)
11. At least 2 slides should use glass-card or gradient-overlay effects
12. RTL: text align defaults to "right" (Hebrew)

RESPOND WITH JSON:
{
  "slides": [
    {
      "slideType": "cover",
      "background": { "style": "aurora" },
      "elements": [
        { "kind": "image", "placement": "full-bleed", "opacity": 0.25, "filter": "darken" },
        { "kind": "gradient-overlay", "direction": 180, "from": "background", "to": "background", "opacity": 0.7 },
        { "kind": "watermark", "text": "${brandName}", "size": "massive", "opacity": 0.04 },
        { "kind": "title", "size": "giant", "position": "center", "align": "center", "effect": "heavy-shadow" },
        { "kind": "subtitle", "position": "below-title", "align": "center" },
        { "kind": "accent-line", "position": "below-subtitle", "color": "accent" },
        { "kind": "decorative-shape", "shape": "circle", "position": "top-right", "color": "accent", "opacity": 0.08, "size": "large" }
      ],
      "dramaticChoice": "Full-bleed image behind massive centered title with aurora glow"
    }
  ]
}`
}

/** Parse GPT-5.4 semantic response with robust fallback */
export function parseSemanticResponse(raw: string, plans: SlidePlan[]): SemanticPresentation {
  // Try to extract JSON from response (might have markdown fences)
  let jsonStr = raw
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1]

  let parsed: { slides?: SemanticSlide[] }
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // Try to find JSON object in response
    const objMatch = jsonStr.match(/\{[\s\S]*"slides"[\s\S]*\}/)
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]) } catch { parsed = { slides: [] } }
    } else {
      parsed = { slides: [] }
    }
  }

  // Ensure we have slides for every plan
  const slides: SemanticSlide[] = []
  for (let i = 0; i < plans.length; i++) {
    const raw = parsed.slides?.[i]
    if (raw && raw.elements?.length > 0) {
      // Validate and use AI slide
      slides.push({
        slideType: plans[i].slideType,
        background: raw.background || { style: 'dark-gradient' },
        elements: raw.elements.filter((e: SemanticElement) => e && e.kind),
        dramaticChoice: raw.dramaticChoice || 'AI designed slide',
      })
    } else {
      // Fallback: basic slide
      slides.push(buildFallbackSemanticSlide(plans[i]))
    }
  }

  return { slides }
}

function buildFallbackSemanticSlide(plan: SlidePlan): SemanticSlide {
  const elements: SemanticElement[] = [
    { kind: 'title', size: plan.slideType === 'cover' || plan.slideType === 'closing' ? 'giant' : 'large', position: 'center', align: 'center', effect: 'heavy-shadow' },
  ]
  if (plan.subtitle || plan.tagline) {
    elements.push({ kind: 'subtitle', position: 'below-title', align: 'center' })
  }
  if (plan.bodyText) {
    elements.push({ kind: 'body', position: 'below-subtitle', align: 'center' })
  }
  if (plan.cards?.length) {
    elements.push({ kind: 'cards', items: plan.cards, layout: 'grid-2', style: 'solid' })
  }
  if (plan.keyNumber) {
    elements.push({ kind: 'key-number', value: plan.keyNumber, label: plan.keyNumberLabel, size: 'large', position: 'below-title', color: 'accent' })
  }
  elements.push({ kind: 'accent-line', position: 'below-title', color: 'accent' })

  return {
    slideType: plan.slideType,
    background: { style: 'dark-gradient', angle: 135 },
    elements,
    dramaticChoice: 'Fallback layout',
  }
}

/** Build fallback for entire presentation (no AI) */
export function buildFallbackSemanticPresentation(plans: SlidePlan[]): SemanticPresentation {
  return { slides: plans.map(buildFallbackSemanticSlide) }
}
