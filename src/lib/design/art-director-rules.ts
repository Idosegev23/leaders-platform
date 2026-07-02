/**
 * Art-director rules — codified design expertise for deck generation (spec C5).
 *
 * Web research on deck-craft failed adversarial verification, so the rulebook
 * lives here as a first-party artifact: a prompt-injectable numbered rulebook
 * (ART_DIRECTOR_RULES) plus programmatic assertions (auditDesignSystem) that
 * enforce the contrast floors in code — the model is told the rules, the code
 * guarantees the non-negotiable ones.
 *
 * Canvas: 1920×1080 HTML, Hebrew RTL (see gemini/layout-prototypes/renderer.tsx).
 * Contrast math is intentionally reimplemented (not imported from export code).
 */

// ─── Prompt-injectable rulebook ───────────────────────────────────────────

export const ART_DIRECTOR_RULES = `<art_director_rules>
טיפוגרפיה:   eyebrow 14px · body 20–24px · display 96–180px. סולם ברור, בלי ביניים מטושטש.
ניגודיות:    body ≥ 4.5:1 · display ≥ 3:1. אף פעם לא טקסט בהיר על רקע בהיר.
צבע:         60-30-10 (רקע / משני / אקצנט). אקצנט אחד דומיננטי לכל המצגת.
פונטים:      זיווג של פונט כותרת חזק + פונט גוף קריא (Heebo/Assistant/Ploni). לא יותר משניים.
ההחלטה הדרמטית: לכל שקף החלטה ויזואלית אחת נועזת (טקסט שגולש מהקצה · 70% חלל ריק ·
             תמונה מלאה · מילה בודדת כסימן מים). כל השאר משרת אותה.
קצב:         כמה שקפים שהסיפור דורש (לרוב 14–22) בקשת מתח — פתיחה שקטה, שיא
             באמצע (insight/bigIdea), נחיתה בטוחה (metrics/closing). כל beat יכול
             להתפרש על כמה שקפים; אין תקרה שרירותית.
איסורי קלישאה: אין stock גנרי · אין אייקונים דקורטיביים חסרי מובן ·
             אין gradient סגול-כחול דיפולטי · אין "מילוי" ויזואלי.
RTL:         יישור לימין, כיווניות נכונה, מספרים ואנגלית LTR בתוך טקסט RTL.
</art_director_rules>

ART DIRECTION RULES — 1920x1080 slides, Hebrew RTL. Hard constraints, not suggestions.

TYPE SCALE
1. One modular scale per deck (ratio 1.25–1.333) anchored to the 1920px canvas: eyebrow 14px, body 20–24px, h3 28–32px, h2 48–64px, display 96–180px. Never invent sizes between steps.
2. Display type (>=96px): weight 800–900, line-height 0.9–1.05, letter-spacing -3px to -6px. Body: weight 300–400, line-height 1.5–1.7, letter-spacing 0.
3. Max 4 distinct font sizes on any slide (eyebrow / body / subhead / display).

CONTRAST FLOORS
4. Body text >= 4.5:1 WCAG contrast against what it actually sits on (background, card, or scrimmed image). No exceptions for brand colors.
5. Display text (>=48px) >= 3:1 vs background. If brand primary fails, substitute accent, then secondary, then text — never fade a headline to preserve a swatch.
6. Muted/caption copy still >= 3:1 vs its surface; if a caption fails, raise its color, don't shrink the text.

COLOR ROLES (60-30-10)
7. 60% of the canvas = background/neutral surface, 30% = brand secondary (cards, bands, ghost numerals), 10% = accent pops.
8. Accent appears ONLY on data points and CTAs — never on headlines, body copy, or decoration.
9. Max 3 chromatic colors per slide (background and text don't count), same role assignment on every slide of the deck.

WHITESPACE & FOCUS
10. Canvas margins >= 80px on all four sides; only full-bleed imagery may touch an edge.
11. One focal point per slide. If the eye lands on two elements first, shrink or delete one.
12. >= 48px vertical gap between content groups; leave at least one empty zone of ~25% of the canvas.

IMAGE TREATMENT
13. Text over image = full-bleed image + 40–55% scrim (solid, or a gradient darkening the text side); rule 4 then applies against the scrimmed result.
14. Framed (non-bleed) images: 24px border-radius, generous inset (>=64px clearance from neighbors), crop to fill — never squash the aspect ratio.
15. Images stay text-free (Hebrew renders only in the HTML layer) and photographic/product-real — no clip-art, no generic stock metaphors.

HEBREW TYPE PAIRING
16. Pick exactly ONE pairing per deck: serif-editorial → Frank Ruhl Libre (display) + Heebo (body); display-bold → Rubik 900 (Anton-like display) + Assistant (body); sans-tight → Heebo 900 + Heebo 300; sans-airy → Assistant 700 + Assistant 300; monospace-tech → IBM Plex Mono (labels/numerals) + Heebo (body).
17. Never more than 2 font families per deck. Allowed set: Heebo, Rubik, Assistant, Frank Ruhl Libre, Anton, IBM Plex Mono.

DRAMA
18. Exactly one dramatic choice per slide: an oversized numeral (>=180px) OR a full-bleed image OR a giant quote — never two on the same slide.

NARRATIVE RHYTHM (~15 slides)
19. Cover = image-dominant: full-bleed brand scene, display title, one line of copy max. After it, alternate text-dominant / image-dominant — never two of the same density in a row.
20. Insight slides = sparse + centered: one sentence, one oversized data point, >=40% of the canvas left empty.
21. Numbers slides = oversized numerals (120–180px) carry the slide; accent lands on the single most important figure only.
22. Closing = mirror of the cover (same background treatment, same type), minimal copy plus one CTA.

BANNED CLICHES
23. No bullet walls: max 4 bullets per slide, <=12 words each — more content means split the slide or promote to pillars.
24. No centered-everything decks: at most 1/3 of slides centered; default composition is asymmetric with RTL reading gravity (heavy side right).
25. Max one stats-grid layout in a row; every content slide carries an uppercase, letterspaced (>=4px) eyebrow label.

COMPOSITION INTEGRITY
26. Card/stat rows are vertically balanced on the canvas — never stranded at the top with a dead lower half. Whitespace is a deliberate zone (rule 12), not leftover void: a row of 3 cards leaving >40% empty below must be centered or enlarged, and an uneven last row (3 on top, 1 orphaned below) must be re-balanced.
27. Every slide's eyebrow label and any watermark word must name THIS slide's own section — never a label copied from another beat. A "Risk Management" slide reading "INSIGHT" is a defect; an empty content slide is a defect.

IMAGE TRUTH
28. A product shown as hero = the client's real product from verified brand imagery only. Never a generated product carrying a fabricated logo, and never imagery from a different product category (clay pots for a steel-cookware brand is a defect). No verified product image → use a logo-free atmospheric background, not an invented product.
29. No repeated or near-duplicate background across slides; vary imagery deck-wide. The closing may echo the cover's treatment but must not reuse the same file.

CONTENT INTEGRITY
30. Never render a placeholder or partial token (@@, TBD, lorem, "@handle", blank name, unsourced round number). Every handle, name, and figure is real or the element is omitted.
31. A count stated in words must equal what is shown ("7 creators" → 7 cards); numbered sequences (weeks/steps) are consecutive with no gaps.`

// ─── Color math (WCAG, local reimplementation) ────────────────────────────

const BODY_CONTRAST_FLOOR = 4.5
const DISPLAY_PRIMARY_FLOOR = 1.8

interface Rgb { r: number; g: number; b: number }

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/

/** hex (#RGB/#RGBA/#RRGGBB/#RRGGBBAA) or rgb()/rgba(); alpha ignored. */
function parseColor(value: string | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim()
  const hexMatch = v.match(HEX_RE)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length <= 4) hex = hex.split('').map((c) => c + c).join('')
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }
  const rgbMatch = v.match(RGB_RE)
  if (rgbMatch) {
    const [r, g, b] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => Math.min(255, parseInt(n, 10)))
    return { r, g, b }
  }
  return null
}

function luminance({ r, g, b }: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((n) => {
    const c = n / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** WCAG contrast between two css colors; null if either is unparseable. */
export function cssContrast(a: string | undefined, b: string | undefined): number | null {
  const [ra, rb] = [parseColor(a), parseColor(b)]
  return ra && rb ? contrastRatio(ra, rb) : null
}

// ─── Design-system audit ──────────────────────────────────────────────────

export interface DesignSpecIssue {
  field: string
  problem: string
  fix: string
}

/** Per-role substitutes for unparseable/missing colors (dark-deck defaults). */
const COLOR_FALLBACKS: Record<string, string> = {
  primary: '#8AB4FF',
  secondary: '#94A3B8',
  accent: '#FFD166',
  background: '#101014',
  text: '#F5F5F5',
  muted: '#9CA3AF',
  cardBg: '#1A1A22',
}
const GENERIC_COLOR_FALLBACK = '#888888'

export const ALLOWED_HEBREW_FONTS = [
  'Heebo',
  'Rubik',
  'Assistant',
  'Frank Ruhl Libre',
  'Anton',
  'IBM Plex Mono',
] as const
const FALLBACK_FONT = 'Heebo'

/** "'Frank Ruhl Libre', serif" → "Frank Ruhl Libre" */
function normalizeFontFamily(value: string): string {
  return value.split(',')[0].trim().replace(/^['"]|['"]$/g, '').trim()
}

/**
 * Programmatic assertions over a DesignSystem-shaped spec. Never throws —
 * returns a corrected copy plus the list of what was wrong. Checks:
 *  - every color parses (hex/rgb); unparseable → per-role fallback
 *  - text vs background >= 4.5:1 (auto-substitute black/white, whichever wins)
 *  - primary vs background >= 1.8:1 (substitute accent → secondary → text,
 *    mirroring pickDisplayPrimary in the pptx exporter)
 *  - fonts belong to the allowed Hebrew set (else fallback Heebo)
 */
export function auditDesignSystem(ds: {
  colors: Record<string, string>
  fonts?: Record<string, string>
}): { issues: DesignSpecIssue[]; corrected: typeof ds } {
  const issues: DesignSpecIssue[] = []
  const colors: Record<string, string> = { ...ds.colors }

  // Unparseable colors → per-role fallback.
  for (const [key, value] of Object.entries(colors)) {
    if (parseColor(value)) continue
    const fallback = COLOR_FALLBACKS[key] ?? GENERIC_COLOR_FALLBACK
    issues.push({
      field: `colors.${key}`,
      problem: `unparseable color "${value}" (expected hex or rgb/rgba)`,
      fix: `replaced with ${fallback}`,
    })
    colors[key] = fallback
  }

  // The two load-bearing roles must exist for the contrast checks.
  for (const key of ['background', 'text'] as const) {
    if (colors[key]) continue
    colors[key] = COLOR_FALLBACKS[key]
    issues.push({ field: `colors.${key}`, problem: 'missing', fix: `set to ${COLOR_FALLBACKS[key]}` })
  }

  const bg = parseColor(colors.background) as Rgb

  // Body floor: text vs background >= 4.5:1.
  const textRgb = parseColor(colors.text) as Rgb
  const textRatio = contrastRatio(textRgb, bg)
  if (textRatio < BODY_CONTRAST_FLOOR) {
    const white: Rgb = { r: 255, g: 255, b: 255 }
    const dark: Rgb = { r: 17, g: 17, b: 17 }
    const replacement = contrastRatio(white, bg) >= contrastRatio(dark, bg) ? '#FFFFFF' : '#111111'
    issues.push({
      field: 'colors.text',
      problem: `text/background contrast ${textRatio.toFixed(2)}:1 is below the ${BODY_CONTRAST_FLOOR}:1 body floor`,
      fix: `text replaced with ${replacement}`,
    })
    colors.text = replacement
  }

  // Display floor: primary vs background >= 1.8:1 (else it vanishes without
  // the HTML renderer's glow). Substitution chain mirrors pickDisplayPrimary.
  if (colors.primary) {
    const primaryRgb = parseColor(colors.primary) as Rgb
    const primaryRatio = contrastRatio(primaryRgb, bg)
    if (primaryRatio < DISPLAY_PRIMARY_FLOOR) {
      const substitute =
        [colors.accent, colors.secondary, colors.text].find((cand) => {
          const rgb = cand ? parseColor(cand) : null
          return rgb !== null && contrastRatio(rgb, bg) >= DISPLAY_PRIMARY_FLOOR
        }) ?? colors.text
      issues.push({
        field: 'colors.primary',
        problem: `primary/background contrast ${primaryRatio.toFixed(2)}:1 is below the ${DISPLAY_PRIMARY_FLOOR}:1 display floor`,
        fix: `primary replaced with ${substitute} (accent → secondary → text chain)`,
      })
      colors.primary = substitute
    }
  }

  // Fonts: allowed Hebrew set only; quoted/stacked values normalize silently.
  let fonts: Record<string, string> | undefined
  if (ds.fonts) {
    fonts = { ...ds.fonts }
    for (const [key, value] of Object.entries(fonts)) {
      const family = normalizeFontFamily(value)
      const canonical = ALLOWED_HEBREW_FONTS.find((f) => f.toLowerCase() === family.toLowerCase())
      if (canonical) {
        if (canonical !== value) fonts[key] = canonical
        continue
      }
      issues.push({
        field: `fonts.${key}`,
        problem: `"${value}" is not in the allowed Hebrew font set (${ALLOWED_HEBREW_FONTS.join(', ')})`,
        fix: `replaced with ${FALLBACK_FONT}`,
      })
      fonts[key] = FALLBACK_FONT
    }
  }

  const corrected: typeof ds = { ...ds, colors }
  if (fonts) corrected.fonts = fonts
  return { issues, corrected }
}

// ─── Narrative-rhythm hints ───────────────────────────────────────────────

/**
 * One-line art-direction hint for a slide's position in the narrative arc.
 * Injected next to the slide's content brief in the generation prompt.
 */
export function slideRhythmHint(slideIndex: number, slideCount: number, slideType: string): string {
  const t = slideType.toLowerCase()
  if (slideIndex <= 0) {
    return 'Cover: image-dominant — full-bleed brand scene, display title 120–180px, one line of copy max, no body text.'
  }
  if (slideIndex >= slideCount - 1) {
    return 'Closing: mirror the cover (same background treatment + type), minimal centered copy, one CTA — no new visual ideas.'
  }
  if (/insight|quote|key-?message/.test(t)) {
    return 'Insight beat: sparse + centered — one sentence, one oversized data point, >=40% of the canvas left empty.'
  }
  if (/stat|number|metric|budget|kpi|reach|data/.test(t)) {
    return 'Numbers beat: oversized numerals (120–180px) carry the slide; accent on the single key figure only; never two stats-grids in a row.'
  }
  const third = slideCount / 3
  const phase =
    slideIndex < third ? 'establish the story'
    : slideIndex < 2 * third ? 'build the argument'
    : 'accelerate toward the ask'
  // Cover (index 0) is image-dominant, so even indices stay image-heavy.
  return slideIndex % 2 === 0
    ? `Image-dominant beat (${phase}): full-bleed or 60/40 split with a verified brand image; text held to a title + <=3 short lines.`
    : `Text-dominant beat (${phase}): asymmetric composition with RTL reading gravity (heavy side right), one focal headline, accent only on data/CTA.`
}
