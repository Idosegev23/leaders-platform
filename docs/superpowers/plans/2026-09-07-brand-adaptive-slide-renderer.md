# Brand-Adaptive Slide Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hash-picked, model-colored slide renderer with a deterministic brand-token engine plus a fixed library of 17 Canva-safe layouts, behind a `DECK_RENDERER` flag, measured in Canva before it becomes the default.

**Architecture:** `generate-full` derives `DeckTokens` once per deck from real brand signals (scraped palette → logo pixels → product images → category default) and persists them at `data._deckTokens`. The agent emits content shapes only (no `designColors`); `renderSlide()` picks a layout from the content shape and renders it with the tokens through shared Canva-safe primitives. A lint (`lintCanvaSafe`) fails tests and warns in production on any effect Canva's HTML import drops.

**Tech Stack:** Next.js 14 / TypeScript strict, vitest (`npm test`), `sharp` ^0.34 (already a dependency, already used server-side), Supabase storage + Canva url-import helpers already in `src/lib/canva`, `tsx` ^4 for the gallery script.

**Spec:** `docs/superpowers/specs/2026-09-07-brand-adaptive-slide-renderer-design.md`

## Global Constraints

- Canvas 1920×1080, `dir="rtl"`, `lang="he"`. 12-column grid: 120px side margins, 96px top/bottom, 24px gutters (column = 118px; 3col = 402, 4col = 544, 5col = 686, 6col = 828, 8col = 1112, 9col = 1254).
- Banned CSS (Canva drops it): `box-shadow`, `backdrop-filter`, `text-shadow`, `filter`, `mix-blend-mode`, any `1px` line, `border-radius` on a wrapper that clips an `<img>`. Radius/clip-path go on the `<img>` itself. Minimum line weight 2px.
- Fonts: only `Heebo`, `Rubik`, `Assistant`, `Frank Ruhl Libre`, `Anton`, `IBM Plex Mono`. Anton and IBM Plex Mono must never receive Hebrew text (digits, units, Latin only).
- Hebrew typography: no italics, no negative tracking, eyebrow tracking 0.04–0.08em. At most 4 distinct `font-size` values per slide.
- Contrast: body text ≥ 4.5:1 on its surface, display text ≥ 3:1, accent used as text ≥ 3:1.
- Eyebrow markup stays exactly `<div class="eyebrow">LABEL // NN</div>` with plain text inside (the renumbering pass and the repair guard depend on it). Absent on cover, divider and closing.
- The renderer never throws into the agent loop; every failure degrades to a simpler layout or a warning.
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer. Do not push. Do not touch `deck-critique`, `slide-repair`, `deck-structure`, `html-import` behaviour.
- Run tests with `npx vitest run <file>`; run the full suite with `npm test`; type-check with `npx tsc --noEmit`.

---

## File structure

Created:
- `src/lib/design/color.ts` — hex/luminance/contrast/mix/saturation helpers (moved out of `slide-personas.ts`, which keeps a local copy until deleted in rollout).
- `src/lib/design/canva-safe.ts` — `lintCanvaSafe(html, opts)`; the banned-effects and premium-tells lint.
- `src/lib/design/brand-tokens.ts` — types (`DeckTokens`, `Archetype`, `ColorCandidate`, `TokenSignals`) and the pure `buildTokens(signals)`.
- `src/lib/design/brand-signals.ts` — I/O side: `loadImagePixels(url)` via `sharp`, `extractImageColors(pixels)`, `collectSignals(input)`, `deriveDeckTokens(input)`.
- `src/lib/design/slide-layouts/types.ts` — `SlideContent`, `SlideCtx`, `LayoutId`, `LayoutFn`.
- `src/lib/design/slide-layouts/content.ts` — `normalizeContent(args)` (alias folding).
- `src/lib/design/slide-layouts/document.ts` — `slideDocument(tokens, inner, opts)`: the `<html>` wrapper with fonts and base CSS.
- `src/lib/design/slide-layouts/primitives.ts` — `eyebrow`, `hebrewLabel`, `statBlock`, `card`, `rule`, `img`, `scrim`, `pill`, `numeral`, `esc`.
- `src/lib/design/slide-layouts/layouts-cover.ts` — `coverCinematic`, `coverSplit`, `closing`, `divider`, `statement`.
- `src/lib/design/slide-layouts/layouts-content.ts` — `bigNumber`, `statRow`, `pillars3`, `bento`, `indexList`, `textImage`, `textTwoCol`.
- `src/lib/design/slide-layouts/layouts-structured.ts` — `timeline`, `comparison`, `quote`, `peopleGrid`, `imageGrid`.
- `src/lib/design/slide-layouts/index.ts` — `LAYOUTS`, `selectLayout`, `renderSlide`.
- `src/lib/design/fixtures.ts` — shared Hebrew test fixtures (SEACRET tokens + one content object per layout).
- `scripts/render-layout-gallery.ts` — renders every layout with SEACRET tokens, imports to Canva, prints the edit URL.
- Tests next to each module: `color.test.ts`, `canva-safe.test.ts`, `brand-tokens.test.ts`, `brand-signals.test.ts`, `slide-layouts/layouts.test.ts`, `slide-layouts/select.test.ts`.

Modified:
- `src/lib/gemini/presentation-agent.ts` — tool schema (drop `designColors`, add shapes), `AgentInput.tokens`, both render call sites, provenance for `people[].imageUrl` / `imageUrls[]`.
- `src/app/api/generate-full/route.ts` — derive + persist `_deckTokens`, `DECK_RENDERER` / `_renderer` switch, seed `designSystem` from tokens.
- `src/lib/canva/html-import.test.ts` — one v2 deck case.
- `CLAUDE.md` — start-here note on the flag and the gallery.

---

### Task 1: Color utilities

**Files:**
- Create: `src/lib/design/color.ts`
- Test: `src/lib/design/color.test.ts`

**Interfaces:**
- Produces: `hexToRgb(hex): Rgb | null`, `rgbToHex(rgb): string`, `luminance(hex): number`, `contrast(a, b): number`, `mix(color, into, t): string`, `ensureContrast(color, bg, ratio): string`, `saturation(hex): number`, `luma(hex): number` (perceived lightness 0–1 from gamma-encoded channels — NOT the WCAG linear luminance; used for the chromatic range and the dark-mood test), `alpha(hex, a): string`, `isChromatic(hex): boolean`. All take 6-digit hex (with or without `#`); invalid input → `hexToRgb` returns `null`, the others treat it as `#808080`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/color.test.ts
import { describe, it, expect } from 'vitest'
import { hexToRgb, rgbToHex, luminance, luma, contrast, mix, ensureContrast, saturation, alpha, isChromatic } from './color'

describe('color', () => {
  it('parses and formats hex', () => {
    expect(hexToRgb('#D8A456')).toEqual([216, 164, 86])
    expect(hexToRgb('d8a456')).toEqual([216, 164, 86])
    expect(hexToRgb('#fff')).toBeNull()
    expect(rgbToHex([216, 164, 86])).toBe('#d8a456')
    expect(rgbToHex([300, -4, 12.6])).toBe('#ff000d')
  })
  it('measures WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })
  it('mixes linearly', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000')
  })
  it('pushes a color until it reaches the ratio', () => {
    const c = ensureContrast('#d8a456', '#faf8f4', 4.5)
    expect(contrast(c, '#faf8f4')).toBeGreaterThanOrEqual(4.5)
    expect(ensureContrast('#000000', '#ffffff', 4.5)).toBe('#000000')
  })
  it('classifies chromatic colors', () => {
    expect(saturation('#181818')).toBe(0)
    expect(saturation('#d8a456')).toBeCloseTo(0.6, 1)
    expect(isChromatic('#181818')).toBe(false)   // SEACRET logo: achromatic
    expect(isChromatic('#604830')).toBe(true)    // SEACRET hero tan — linear luminance is only 0.07, luma is 0.30
    expect(luma('#604830')).toBeCloseTo(0.3, 1)
    expect(luma('#666666')).toBeCloseTo(0.4, 1)
    expect(isChromatic('#fffbe6')).toBe(false)   // too light
  })
  it('formats rgba', () => {
    expect(alpha('#d8a456', 0.12)).toBe('rgba(216,164,86,0.12)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/color.test.ts`
Expected: FAIL — cannot resolve `./color`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/design/color.ts
/**
 * Color math for the deck renderer. Pure, hex-in/hex-out, no dependencies.
 * Lifted from slide-personas.ts (which keeps its private copy until it is
 * deleted) and extended with saturation + alpha for the token engine.
 */
export type Rgb = [number, number, number]

const FALLBACK: Rgb = [128, 128, 128]

export function hexToRgb(hex: string): Rgb | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function rgb(hex: string): Rgb {
  return hexToRgb(hex) ?? FALLBACK
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** mix(color, into, t) — t=0 → color, t=1 → into */
export function mix(color: string, into: string, t: number): string {
  const c1 = rgb(color)
  const c2 = rgb(into)
  return rgbToHex([c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t])
}

/** Darken/lighten `color` (towards black on light bg, white on dark) until it reaches `ratio` against `bg`. */
export function ensureContrast(color: string, bg: string, ratio: number): string {
  if (contrast(color, bg) >= ratio) return color
  const towards = luminance(bg) > 0.4 ? '#111111' : '#ffffff'
  let c = color
  for (let i = 0; i < 14 && contrast(c, bg) < ratio; i++) c = mix(c, towards, 0.18)
  return c
}

/** HSV-style saturation: (max − min) / max, 0 for grays. */
export function saturation(hex: string): number {
  const [r, g, b] = rgb(hex)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Perceived lightness 0–1 straight from the gamma-encoded channels. Brand colors are judged on this, not on
 *  WCAG linear luminance: a warm brown like #604830 is 0.07 linear but plainly mid-dark to the eye (0.30). */
export function luma(hex: string): number {
  const [r, g, b] = rgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** A color that can carry a brand: saturated enough and neither near-white nor near-black. */
export function isChromatic(hex: string): boolean {
  const l = luma(hex)
  return saturation(hex) >= 0.25 && l > 0.12 && l < 0.92
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/design/color.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/color.ts src/lib/design/color.test.ts
git commit -m "feat(design): color utilities for the brand token engine"
```

---

### Task 2: Canva-safe lint

**Files:**
- Create: `src/lib/design/canva-safe.ts`
- Test: `src/lib/design/canva-safe.test.ts`

**Interfaces:**
- Consumes: `ALLOWED_HEBREW_FONTS` from `@/lib/design/art-director-rules`.
- Produces: `lintCanvaSafe(html: string, opts?: { slideType?: string }): Violation[]` where `Violation = { rule: CanvaRule; detail: string }` and `CanvaRule = 'box-shadow' | 'backdrop-filter' | 'text-shadow' | 'filter' | 'mix-blend-mode' | 'hairline' | 'wrapper-clips-img' | 'font-not-allowed' | 'latin-font-on-hebrew' | 'too-many-sizes' | 'eyebrow-count'`. `EYEBROW_FREE_TYPES = ['cover', 'divider', 'closing']`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/canva-safe.test.ts
import { describe, it, expect } from 'vitest'
import { lintCanvaSafe } from './canva-safe'

const rules = (html: string, slideType?: string) => lintCanvaSafe(html, { slideType }).map((v) => v.rule)
const wrap = (inner: string) => `<html><body><div class="slide">${inner}</div></body></html>`

describe('lintCanvaSafe — banned effects', () => {
  it('catches every property Canva drops', () => {
    expect(rules(wrap('<div style="box-shadow:0 4px 12px #000"></div>'))).toContain('box-shadow')
    expect(rules(wrap('<div style="backdrop-filter:blur(8px)"></div>'))).toContain('backdrop-filter')
    expect(rules(wrap('<h1 style="text-shadow:0 1px 2px #000">x</h1>'))).toContain('text-shadow')
    expect(rules(wrap('<img style="filter:grayscale(1)">'))).toContain('filter')
    expect(rules(wrap('<div style="mix-blend-mode:multiply"></div>'))).toContain('mix-blend-mode')
  })
  it('catches hairlines but allows 2px and up', () => {
    expect(rules(wrap('<div style="border:1px solid #000"></div>'))).toContain('hairline')
    expect(rules(wrap('<div style="height:1px;background:#000"></div>'))).toContain('hairline')
    expect(rules(wrap('<div style="border-top:2px solid #000"></div>'))).not.toContain('hairline')
  })
  it('catches a rounded wrapper clipping an img, allows radius on the img', () => {
    expect(rules(wrap('<div style="border-radius:50%;overflow:hidden"><img src="a.png"></div>'))).toContain('wrapper-clips-img')
    expect(rules(wrap('<img src="a.png" style="border-radius:50%;object-fit:cover">'))).not.toContain('wrapper-clips-img')
  })
})

describe('lintCanvaSafe — fonts', () => {
  it('rejects fonts outside the allowed list', () => {
    expect(rules(wrap('<p style="font-family:Inter,sans-serif">x</p>'))).toContain('font-not-allowed')
    expect(rules(wrap("<p style=\"font-family:'Frank Ruhl Libre',serif\">x</p>"))).not.toContain('font-not-allowed')
  })
  it('rejects Hebrew set in Anton or IBM Plex Mono', () => {
    expect(rules(wrap('<div style="font-family:Anton">יעדים</div>'))).toContain('latin-font-on-hebrew')
    expect(rules(wrap('<div style="font-family:Anton">42%</div>'))).not.toContain('latin-font-on-hebrew')
    expect(rules(wrap("<div style=\"font-family:'IBM Plex Mono'\">01</div>"))).not.toContain('latin-font-on-hebrew')
  })
})

describe('lintCanvaSafe — premium tells', () => {
  it('limits distinct font sizes to four', () => {
    const five = ['72', '28', '22', '20', '18'].map((s) => `<p style="font-size:${s}px">x</p>`).join('')
    expect(rules(wrap(five))).toContain('too-many-sizes')
    const four = ['72', '28', '22', '22', '20'].map((s) => `<p style="font-size:${s}px">x</p>`).join('')
    expect(rules(wrap(four))).not.toContain('too-many-sizes')
  })
  it('requires exactly one eyebrow on content slides and none on cover/divider/closing', () => {
    expect(rules(wrap('<h1>x</h1>'), 'goals')).toContain('eyebrow-count')
    expect(rules(wrap('<div class="eyebrow">יעדים // 03</div><h1>x</h1>'), 'goals')).not.toContain('eyebrow-count')
    expect(rules(wrap('<div class="eyebrow">COVER // 01</div>'), 'cover')).toContain('eyebrow-count')
    expect(rules(wrap('<h1>x</h1>'), 'closing')).not.toContain('eyebrow-count')
  })
  it('returns no violations for a clean slide', () => {
    const clean = wrap('<div class="eyebrow">יעדים // 03</div><h1 style="font-size:72px">x</h1><p style="font-size:28px;border-top:2px solid rgba(0,0,0,0.12)">y</p>')
    expect(lintCanvaSafe(clean, { slideType: 'goals' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/canva-safe.test.ts`
Expected: FAIL — cannot resolve `./canva-safe`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/design/canva-safe.ts
/**
 * Lint for the effects Canva's HTML import drops (measured 2026-09-07 on
 * probes DAHUfoIodjo and DAHUfgBVkXw) plus the premium-tells that are
 * checkable from markup. Pure; regex-based on inline styles and <style>
 * blocks. Used by tests (must be empty), by the renderer at generation time
 * (warn only), and by the gallery script.
 */
import { ALLOWED_HEBREW_FONTS } from '@/lib/design/art-director-rules'

export type CanvaRule =
  | 'box-shadow' | 'backdrop-filter' | 'text-shadow' | 'filter' | 'mix-blend-mode'
  | 'hairline' | 'wrapper-clips-img' | 'font-not-allowed' | 'latin-font-on-hebrew'
  | 'too-many-sizes' | 'eyebrow-count'

export interface Violation { rule: CanvaRule; detail: string }

export const EYEBROW_FREE_TYPES = ['cover', 'divider', 'closing']
const MAX_FONT_SIZES = 4
const LATIN_ONLY_FONTS = ['Anton', 'IBM Plex Mono']
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'inherit'])
const HEBREW_RE = /[֐-׿]/

const BANNED: Array<[CanvaRule, RegExp]> = [
  ['box-shadow', /box-shadow\s*:/i],
  ['backdrop-filter', /backdrop-filter\s*:/i],
  ['text-shadow', /text-shadow\s*:/i],
  ['filter', /(^|[^-\w])filter\s*:/i],
  ['mix-blend-mode', /mix-blend-mode\s*:/i],
]

/** Every CSS declaration block in the document: inline styles + <style> rule bodies. */
function cssText(html: string): string {
  const inline = Array.from(html.matchAll(/style="([^"]*)"/gi)).map((m) => m[1])
  const blocks = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1])
  return [...inline, ...blocks].join('\n')
}

export function lintCanvaSafe(html: string, opts: { slideType?: string } = {}): Violation[] {
  const out: Violation[] = []
  const css = cssText(html)

  for (const [rule, re] of BANNED) {
    if (re.test(css)) out.push({ rule, detail: `${rule} is dropped by Canva's HTML import` })
  }

  // 1px anything used as a line: borders, outlines, and 1px-tall/wide boxes.
  if (/(border(-(top|right|bottom|left))?|outline)\s*:\s*1px/i.test(css) || /(height|width)\s*:\s*1px/i.test(css)) {
    out.push({ rule: 'hairline', detail: '1px lines vanish; use 2px or thicker' })
  }

  // A wrapper that both clips and rounds, directly containing an <img>.
  const wrapperRe = /<(div|section|figure)\b[^>]*style="[^"]*(?:overflow\s*:\s*hidden[^"]*border-radius|border-radius[^"]*overflow\s*:\s*hidden)[^"]*"[^>]*>\s*<img/i
  if (wrapperRe.test(html)) out.push({ rule: 'wrapper-clips-img', detail: 'put border-radius / clip-path on the <img>, not on a clipping wrapper' })

  // Fonts.
  const families = Array.from(css.matchAll(/font-family\s*:\s*([^;}"]+)/gi)).flatMap((m) =>
    m[1].split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
  )
  const allowed = new Set<string>(ALLOWED_HEBREW_FONTS)
  for (const f of families) {
    if (!allowed.has(f) && !GENERIC_FAMILIES.has(f.toLowerCase())) {
      out.push({ rule: 'font-not-allowed', detail: `font "${f}" is not in the allowed Hebrew set` })
      break
    }
  }
  const latinRe = new RegExp(`<([a-z0-9]+)\\b[^>]*style="[^"]*font-family\\s*:[^;"]*(${LATIN_ONLY_FONTS.join('|')})[^"]*"[^>]*>([^<]*)<`, 'gi')
  for (const m of html.matchAll(latinRe)) {
    if (HEBREW_RE.test(m[3])) { out.push({ rule: 'latin-font-on-hebrew', detail: `${m[2]} has no Hebrew glyphs: "${m[3].trim().slice(0, 30)}"` }); break }
  }

  // Premium tells.
  const sizes = new Set(Array.from(css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)).map((m) => m[1]))
  if (sizes.size > MAX_FONT_SIZES) out.push({ rule: 'too-many-sizes', detail: `${sizes.size} distinct font sizes (max ${MAX_FONT_SIZES}): ${[...sizes].join(', ')}` })

  if (opts.slideType) {
    const count = (html.match(/class="eyebrow"/g) || []).length
    const expected = EYEBROW_FREE_TYPES.includes(opts.slideType) ? 0 : 1
    if (count !== expected) out.push({ rule: 'eyebrow-count', detail: `${opts.slideType} slide has ${count} eyebrow(s), expected ${expected}` })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/design/canva-safe.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/canva-safe.ts src/lib/design/canva-safe.test.ts
git commit -m "feat(design): lint for effects Canva's HTML import drops"
```

---
### Task 3: Brand token engine (pure)

**Files:**
- Create: `src/lib/design/brand-tokens.ts`
- Test: `src/lib/design/brand-tokens.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces:
  ```ts
  export type Archetype = 'editorial-luxury' | 'cinematic-dark' | 'bold-flat' | 'soft-warm'
  export type Category = 'editorial' | 'bold' | 'soft' | 'cinematic' | 'unknown'
  export type CandidateSource = 'declared' | 'logo' | 'image' | 'palette'
  export interface ColorCandidate { hex: string; weight: number; source: CandidateSource }
  export interface TokenSignals {
    brandName: string
    briefText: string
    candidates: ColorCandidate[]      // chromatic only, any order
    logoAchromatic: boolean
    siteColors: string[]              // raw scraped palette head (grays included), for the mood test
  }
  export interface DeckFonts { display: string; body: string; numeral: string; fontsQuery: string }
  export interface DeckTokens {
    version: 1; archetype: Archetype
    paper: string; ink: string; muted: string; surface: string; rule: string; ruleStrong: string
    accent: string; accentText: string; accentTint: string; accentDark: string; scrim: string
    fonts: DeckFonts; radius: 24 | 28 | 32; provenance: string[]
  }
  export function classifyCategory(briefText: string): Category
  export function pickArchetype(args: { category: Category; dark: boolean; accentSaturation: number; brandName: string }): Archetype
  export function buildTokens(signals: TokenSignals): DeckTokens   // pure, sync, never throws
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/brand-tokens.test.ts
import { describe, it, expect } from 'vitest'
import { buildTokens, classifyCategory, pickArchetype, type TokenSignals } from './brand-tokens'
import { contrast, saturation } from './color'

const base: TokenSignals = { brandName: 'SEACRET SPA', briefText: 'מותג ספא וקוסמטיקה מים המלח', candidates: [], logoAchromatic: true, siteColors: ['#666666', '#999999'] }
const seacret: TokenSignals = { ...base, candidates: [{ hex: '#604830', weight: 2, source: 'image' }, { hex: '#786048', weight: 1, source: 'image' }] }

describe('classifyCategory', () => {
  it('reads Hebrew and English keywords', () => {
    expect(classifyCategory('מותג ספא וקוסמטיקה')).toBe('editorial')
    expect(classifyCategory('a fintech app for traders')).toBe('bold')
    expect(classifyCategory('חטיפים לילדים')).toBe('soft')
    expect(classifyCategory('מותג אופנה')).toBe('cinematic')
    expect(classifyCategory('')).toBe('unknown')
  })
})

describe('buildTokens', () => {
  it('is deterministic', () => {
    expect(buildTokens(seacret)).toEqual(buildTokens(seacret))
  })
  it('takes the accent from the heaviest chromatic candidate and records provenance', () => {
    const t = buildTokens(seacret)
    expect(t.accent).toBe('#604830')
    expect(t.provenance.join('\n')).toMatch(/accent ← image #604830/)
    expect(t.archetype).toBe('editorial-luxury')
  })
  it('merges near-duplicate candidates before weighing', () => {
    const t = buildTokens({ ...base, candidates: [
      { hex: '#2b5cff', weight: 1, source: 'palette' }, { hex: '#2e5efc', weight: 1, source: 'image' },
      { hex: '#ff4d2e', weight: 1.5, source: 'declared' },
    ] })
    expect(t.accent).toBe('#2b5cff')
  })
  it('falls back to the category default when nothing chromatic exists', () => {
    const t = buildTokens(base)
    expect(saturation(t.accent)).toBeGreaterThan(0.25)
    expect(t.provenance.join('\n')).toMatch(/accent ← default/)
  })
  it('goes dark when the site is dark', () => {
    const t = buildTokens({ ...seacret, siteColors: ['#101014', '#222'] })
    expect(t.archetype).toBe('cinematic-dark')
  })
  it('breaks unknown-category ties by brand name, stably', () => {
    const a = pickArchetype({ category: 'unknown', dark: false, accentSaturation: 0.4, brandName: 'Alpha' })
    expect(pickArchetype({ category: 'unknown', dark: false, accentSaturation: 0.4, brandName: 'Alpha' })).toBe(a)
    expect(['editorial-luxury', 'cinematic-dark']).toContain(a)
  })
  it('guarantees contrast on every archetype with hostile accents', () => {
    const hostile = ['#ffff00', '#0a0a3a', '#ff00ff', '#7fff7f']
    const briefs: Record<string, string> = { editorial: 'ספא', bold: 'fintech', soft: 'ילדים', cinematic: 'אופנה' }
    for (const brief of Object.values(briefs)) for (const hex of hostile) {
      const t = buildTokens({ ...base, briefText: brief, candidates: [{ hex, weight: 3, source: 'declared' }] })
      expect(contrast(t.ink, t.paper), `${t.archetype} ${hex} ink`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.muted, t.paper), `${t.archetype} ${hex} muted`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accentText, t.paper), `${t.archetype} ${hex} accentText`).toBeGreaterThanOrEqual(3)
    }
  })
  it('keeps Anton and Plex Mono out of display/body fonts', () => {
    for (const brief of ['ספא', 'fintech', 'ילדים', 'אופנה']) {
      const t = buildTokens({ ...base, briefText: brief })
      expect(t.fonts.display).not.toMatch(/Anton|Plex/)
      expect(t.fonts.body).not.toMatch(/Anton|Plex/)
      expect(t.fonts.fontsQuery).toMatch(/^family=/)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/brand-tokens.test.ts`
Expected: FAIL — cannot resolve `./brand-tokens`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/design/brand-tokens.ts
/**
 * Deterministic brand → design tokens. Pure: the I/O that gathers signals
 * lives in brand-signals.ts. Same signals in → same tokens out, so a deck
 * regenerates consistently and a resumed run needs no network.
 *
 * Why a chain and not one source (measured on SEACRET SPA 2026-09-07): the
 * scraped palette was all grays, the logo a single #181818, and only the hero
 * photos carried the brand's warm Dead Sea tans.
 */
import { alpha, contrast, ensureContrast, hexToRgb, isChromatic, luma, mix, saturation } from './color'

export type Archetype = 'editorial-luxury' | 'cinematic-dark' | 'bold-flat' | 'soft-warm'
export type Category = 'editorial' | 'bold' | 'soft' | 'cinematic' | 'unknown'
export type CandidateSource = 'declared' | 'logo' | 'image' | 'palette'
export interface ColorCandidate { hex: string; weight: number; source: CandidateSource }
export interface TokenSignals {
  brandName: string
  briefText: string
  candidates: ColorCandidate[]
  logoAchromatic: boolean
  siteColors: string[]
}
export interface DeckFonts { display: string; body: string; numeral: string; fontsQuery: string }
export interface DeckTokens {
  version: 1
  archetype: Archetype
  paper: string; ink: string; muted: string; surface: string; rule: string; ruleStrong: string
  accent: string; accentText: string; accentTint: string; accentDark: string; scrim: string
  fonts: DeckFonts
  radius: 24 | 28 | 32
  provenance: string[]
}

const CATEGORY_KEYWORDS: Record<Exclude<Category, 'unknown'>, string[]> = {
  editorial: ['spa', 'ספא', 'beauty', 'יופי', 'קוסמטיק', 'cosmetic', 'luxury', 'יוקר', 'jewel', 'תכשיט', 'hotel', 'מלון', 'wine', 'יין', 'skincare', 'טיפוח'],
  bold: ['tech', 'טכנולוג', 'fintech', 'פינטק', 'gaming', 'גיימינג', 'sport', 'ספורט', 'energy', 'אנרגי', 'startup', 'סטארטאפ', 'app', 'אפליקצי', 'saas'],
  soft: ['food', 'אוכל', 'מזון', 'snack', 'חטיף', 'kids', 'ילדים', 'family', 'משפח', 'health', 'בריאות', 'baby', 'תינוק', 'pet', 'חיות'],
  cinematic: ['fashion', 'אופנה', 'automotive', 'רכב', 'nightlife', 'מועדון', 'music', 'מוזיק', 'cinema', 'קולנוע', 'perfume', 'בושם'],
}
const CATEGORY_DEFAULT_ACCENTS: Record<Category, [string, string]> = {
  editorial: ['#b9924f', '#7a5c3a'], bold: ['#2b5cff', '#ff4d2e'], soft: ['#e07a5f', '#3d8b6e'],
  cinematic: ['#c9a227', '#8b1e3f'], unknown: ['#2f6f8f', '#b9924f'],
}
const FONTS: Record<Archetype, DeckFonts> = {
  'editorial-luxury': { display: "'Frank Ruhl Libre', 'Heebo', serif", body: "'Heebo', sans-serif", numeral: "'Heebo', sans-serif", fontsQuery: 'family=Frank+Ruhl+Libre:wght@400;500;700&family=Heebo:wght@400;500;700;900' },
  'cinematic-dark': { display: "'Heebo', sans-serif", body: "'Heebo', sans-serif", numeral: "'Anton', 'Heebo', sans-serif", fontsQuery: 'family=Heebo:wght@300;400;500;700;800;900&family=Anton' },
  'bold-flat': { display: "'Rubik', 'Heebo', sans-serif", body: "'Rubik', 'Heebo', sans-serif", numeral: "'Anton', 'Rubik', sans-serif", fontsQuery: 'family=Rubik:wght@400;500;700;800&family=Anton' },
  'soft-warm': { display: "'Heebo', sans-serif", body: "'Assistant', 'Heebo', sans-serif", numeral: "'Heebo', sans-serif", fontsQuery: 'family=Heebo:wght@400;700&family=Assistant:wght@400;600;800' },
}
const RADIUS: Record<Archetype, 24 | 28 | 32> = { 'editorial-luxury': 24, 'cinematic-dark': 28, 'bold-flat': 24, 'soft-warm': 32 }

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function classifyCategory(briefText: string): Category {
  const text = briefText.toLowerCase()
  let best: Category = 'unknown'
  let bestHits = 0
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as Array<[Exclude<Category, 'unknown'>, string[]]>) {
    const hits = words.filter((w) => text.includes(w)).length
    if (hits > bestHits) { best = cat; bestHits = hits }
  }
  return best
}

export function pickArchetype(args: { category: Category; dark: boolean; accentSaturation: number; brandName: string }): Archetype {
  if (args.dark || args.category === 'cinematic') return 'cinematic-dark'
  if (args.category === 'editorial') return 'editorial-luxury'
  if (args.category === 'bold' && args.accentSaturation >= 0.5) return 'bold-flat'
  if (args.category === 'soft') return 'soft-warm'
  return hash(args.brandName) % 2 === 0 ? 'editorial-luxury' : 'cinematic-dark'
}

function rgbDistance(a: string, b: string): number {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  if (!x || !y) return Infinity
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** Sum the weight of near-identical candidates into the first one seen. */
function mergeCandidates(cands: ColorCandidate[]): ColorCandidate[] {
  const out: ColorCandidate[] = []
  for (const c of cands) {
    if (!isChromatic(c.hex)) continue
    const near = out.find((o) => rgbDistance(o.hex, c.hex) < 40)
    if (near) near.weight += c.weight
    else out.push({ ...c, hex: c.hex.toLowerCase() })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

export function buildTokens(signals: TokenSignals): DeckTokens {
  const provenance: string[] = []
  const category = classifyCategory(signals.briefText)
  const merged = mergeCandidates(signals.candidates)

  let accent: string
  if (merged.length) {
    accent = merged[0].hex
    provenance.push(`accent ← ${merged[0].source} ${accent} (weight ${merged[0].weight})`)
  } else {
    const pair = CATEGORY_DEFAULT_ACCENTS[category]
    accent = pair[hash(signals.brandName) % 2]
    provenance.push(`accent ← default for category "${category}" ${accent}${signals.logoAchromatic ? ' (logo achromatic)' : ''}`)
  }

  // Perceived lightness, not linear luminance: #666666 is 0.13 linear (would read as dark) but 0.40 to the eye.
  const dark = signals.siteColors.length > 0 && luma(signals.siteColors[0]) < 0.25
  const archetype = pickArchetype({ category, dark, accentSaturation: saturation(accent), brandName: signals.brandName })
  provenance.push(`archetype ← category "${category}", mood ${dark ? 'dark' : 'light'} → ${archetype}`)

  const lightPaper = archetype !== 'cinematic-dark'
  const paper = archetype === 'editorial-luxury' ? mix('#fbf8f2', accent, 0.05)
    : archetype === 'bold-flat' ? mix('#f3f1ea', accent, 0.03)
    : archetype === 'soft-warm' ? mix('#f7f3ec', accent, 0.06)
    : mix('#0b0f14', accent, 0.10)
  const inkBase = lightPaper ? mix('#1b1a17', accent, 0.06) : '#f4f1ec'
  const ink = ensureContrast(inkBase, paper, 4.5)
  const muted = ensureContrast(mix(ink, paper, 0.45), paper, 4.5)
  const accentText = ensureContrast(accent, paper, 3)
  const scrimBase = mix('#0b0f14', accent, 0.2)

  return {
    version: 1,
    archetype,
    paper, ink, muted,
    surface: mix(paper, accent, lightPaper ? 0.08 : 0.12),
    rule: alpha(ink, 0.12),
    ruleStrong: ink,
    accent, accentText,
    accentTint: alpha(accent, 0.12),
    accentDark: mix(accent, '#000000', 0.35),
    scrim: `linear-gradient(to left, ${alpha(scrimBase, 0.78)} 0%, ${alpha(scrimBase, 0.42)} 45%, ${alpha(scrimBase, 0)} 72%)`,
    fonts: FONTS[archetype],
    radius: RADIUS[archetype],
    provenance: [...provenance, `contrast ink/paper ${contrast(ink, paper).toFixed(1)}, accentText/paper ${contrast(accentText, paper).toFixed(1)}`],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/design/brand-tokens.test.ts`
Expected: PASS (9 tests). If the near-duplicate test picks `#ff4d2e`, the merge threshold is wrong: `#2b5cff` vs `#2e5efc` are 5 units apart and must merge to weight 2 > 1.5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/brand-tokens.ts src/lib/design/brand-tokens.test.ts
git commit -m "feat(design): deterministic brand token engine"
```

---

### Task 4: Brand signal collection (sharp + fetch)

**Files:**
- Create: `src/lib/design/brand-signals.ts`
- Test: `src/lib/design/brand-signals.test.ts`

**Interfaces:**
- Consumes: `buildTokens`, `TokenSignals`, `ColorCandidate`, `DeckTokens` (Task 3); `isChromatic` (Task 1); `BrandAssets` from `@/lib/brand/types`.
- Produces:
  ```ts
  export interface Pixels { data: Uint8Array; width: number; height: number }   // RGBA, row-major
  export function extractImageColors(px: Pixels): { chromatic: Array<{ hex: string; share: number }>; achromatic: boolean }
  export async function decodePixels(buf: Buffer): Promise<Pixels>               // sharp: resize ≤48px, ensureAlpha, raw
  export async function loadImagePixels(url: string, timeoutMs?: number): Promise<Pixels | null>   // fetch + decodePixels, null on any failure
  export interface SignalInput {
    brandName: string; briefText: string
    brandAssets?: BrandAssets
    scraped?: { colorPalette?: string[] }
    load?: (url: string) => Promise<Pixels | null>   // injectable for tests; defaults to loadImagePixels
  }
  export async function collectSignals(input: SignalInput): Promise<TokenSignals>
  export async function deriveDeckTokens(input: SignalInput): Promise<DeckTokens>   // never throws
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/brand-signals.test.ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { extractImageColors, decodePixels, collectSignals, deriveDeckTokens, type Pixels } from './brand-signals'

/** Build an RGBA buffer from a list of [r,g,b,a] pixels. */
function pixels(px: number[][]): Pixels {
  return { data: Uint8Array.from(px.flat()), width: px.length, height: 1 }
}
const TAN = [96, 72, 48, 255]
const GRAY = [24, 24, 24, 255]
const CLEAR = [255, 0, 0, 0]

describe('extractImageColors', () => {
  it('ranks chromatic colors by share and ignores transparent pixels', () => {
    const out = extractImageColors(pixels([TAN, TAN, TAN, GRAY, GRAY, CLEAR, CLEAR]))
    expect(out.chromatic[0].hex).toBe('#604830')
    expect(out.chromatic[0].share).toBeCloseTo(0.6, 1)
    expect(out.achromatic).toBe(false)
  })
  it('flags an achromatic image (the SEACRET logo case)', () => {
    const out = extractImageColors(pixels([GRAY, GRAY, GRAY, [255, 255, 255, 255]]))
    expect(out.chromatic).toEqual([])
    expect(out.achromatic).toBe(true)
  })
})

describe('decodePixels', () => {
  it('decodes a real PNG through sharp', async () => {
    const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 96, g: 72, b: 48, alpha: 1 } } }).png().toBuffer()
    const px = await decodePixels(png)
    expect(px.width).toBeLessThanOrEqual(48)
    expect(extractImageColors(px).chromatic[0].hex).toBe('#604830')
  })
})

describe('collectSignals', () => {
  const tanImage = pixels([TAN, TAN, TAN, TAN])
  const grayLogo = pixels([GRAY, GRAY, GRAY, GRAY])
  const load = async (url: string) => (url.includes('logo') ? grayLogo : url.includes('boom') ? null : tanImage)

  it('walks the chain: declared palette, logo, images', async () => {
    const s = await collectSignals({
      brandName: 'SEACRET SPA', briefText: 'ספא',
      brandAssets: { logo: { url: 'https://x/logo.png', status: 'verified', source: 'site-scrape' }, productImages: [{ url: 'https://x/p1.jpg', status: 'verified' }] },
      scraped: { colorPalette: ['#666666', '#2b5cff', '#999999'] },
      load,
    })
    expect(s.logoAchromatic).toBe(true)
    expect(s.siteColors).toEqual(['#666666', '#2b5cff', '#999999'])
    expect(s.candidates).toContainEqual({ hex: '#2b5cff', weight: 3, source: 'declared' })
    expect(s.candidates.find((c) => c.source === 'logo')).toBeUndefined()
    expect(s.candidates.find((c) => c.source === 'image')?.hex).toBe('#604830')
  })
  it('skips images that fail to load and caps image fetches at three', async () => {
    const seen: string[] = []
    const s = await collectSignals({
      brandName: 'X', briefText: '',
      brandAssets: { productImages: ['boom', 'a', 'b', 'c', 'd'].map((u) => ({ url: `https://x/${u}.jpg`, status: 'verified' as const })) },
      load: async (u) => { seen.push(u); return load(u) },
    })
    expect(seen).toHaveLength(3)
    expect(s.candidates.filter((c) => c.source === 'image').length).toBeGreaterThan(0)
  })
  it('ignores rejected assets', async () => {
    const s = await collectSignals({ brandName: 'X', briefText: '', brandAssets: { productImages: [{ url: 'https://x/a.jpg', status: 'rejected' }] }, load })
    expect(s.candidates).toEqual([])
  })
})

describe('deriveDeckTokens', () => {
  it('never throws, even when every loader explodes', async () => {
    const t = await deriveDeckTokens({ brandName: 'X', briefText: 'fintech', brandAssets: { logo: { url: 'https://x/logo.png', status: 'verified', source: 'logodev' } }, load: async () => { throw new Error('network') } })
    expect(t.archetype).toBeDefined()
    expect(t.provenance.join()).toMatch(/default/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/brand-signals.test.ts`
Expected: FAIL — cannot resolve `./brand-signals`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/design/brand-signals.ts
/**
 * Gathers the brand signals buildTokens() needs. This is the only I/O in the
 * token engine: image bytes via fetch, pixels via sharp (already a server-side
 * dependency — see image-compositor.ts). Every source is best-effort; a
 * failure skips the source, never the deck.
 */
import sharp from 'sharp'
import type { BrandAssets } from '@/lib/brand/types'
import { isChromatic, rgbToHex } from './color'
import { buildTokens, type ColorCandidate, type DeckTokens, type TokenSignals } from './brand-tokens'

export interface Pixels { data: Uint8Array; width: number; height: number }

const SAMPLE_PX = 48
const QUANT = 24
const MAX_IMAGES = 3
const FETCH_TIMEOUT_MS = 5000

export function extractImageColors(px: Pixels): { chromatic: Array<{ hex: string; share: number }>; achromatic: boolean } {
  const counts = new Map<string, number>()
  let total = 0
  for (let i = 0; i + 3 < px.data.length; i += 4) {
    if (px.data[i + 3] < 128) continue
    const q = [px.data[i], px.data[i + 1], px.data[i + 2]].map((v) => Math.min(255, Math.round(v / QUANT) * QUANT)) as [number, number, number]
    const hex = rgbToHex(q)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
    total++
  }
  const chromatic = Array.from(counts.entries())
    .filter(([hex]) => isChromatic(hex))
    .map(([hex, n]) => ({ hex, share: n / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 4)
  return { chromatic, achromatic: total > 0 && chromatic.length === 0 }
}

export async function decodePixels(buf: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(buf).resize(SAMPLE_PX, SAMPLE_PX, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height }
}

export async function loadImagePixels(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Pixels | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return await decodePixels(Buffer.from(await res.arrayBuffer()))
  } catch {
    return null
  }
}

export interface SignalInput {
  brandName: string
  briefText: string
  brandAssets?: BrandAssets
  scraped?: { colorPalette?: string[] }
  load?: (url: string) => Promise<Pixels | null>
}

async function safeLoad(load: NonNullable<SignalInput['load']>, url: string): Promise<Pixels | null> {
  try { return await load(url) } catch { return null }
}

export async function collectSignals(input: SignalInput): Promise<TokenSignals> {
  const load = input.load ?? loadImagePixels
  const candidates: ColorCandidate[] = []
  const palette = (input.scraped?.colorPalette ?? []).filter((h) => /^#[0-9a-f]{6}$/i.test(h))

  // 1. Scraper palette — weight-ordered by the scraper (theme-color and
  //    --primary vars boosted), so the head counts as "declared".
  palette.forEach((hex, i) => {
    if (isChromatic(hex)) candidates.push({ hex, weight: i < 2 ? 3 : 1, source: i < 2 ? 'declared' : 'palette' })
  })

  // 2. Logo pixels.
  let logoAchromatic = false
  if (input.brandAssets?.logo?.url && input.brandAssets.logo.status !== 'rejected') {
    const px = await safeLoad(load, input.brandAssets.logo.url)
    if (px) {
      const { chromatic, achromatic } = extractImageColors(px)
      logoAchromatic = achromatic
      chromatic.slice(0, 2).forEach((c) => candidates.push({ hex: c.hex, weight: 2 * c.share + 1, source: 'logo' }))
    }
  }

  // 3. Product / scene images, max three fetches.
  const imageUrls = [...(input.brandAssets?.productImages ?? []), ...(input.brandAssets?.sceneImages ?? [])]
    .filter((a) => a.status !== 'rejected').map((a) => a.url).slice(0, MAX_IMAGES)
  for (const url of imageUrls) {
    const px = await safeLoad(load, url)
    if (!px) continue
    extractImageColors(px).chromatic.slice(0, 2).forEach((c) => candidates.push({ hex: c.hex, weight: c.share + 0.5, source: 'image' }))
  }

  return { brandName: input.brandName, briefText: input.briefText, candidates, logoAchromatic, siteColors: palette.slice(0, 3) }
}

export async function deriveDeckTokens(input: SignalInput): Promise<DeckTokens> {
  try {
    return buildTokens(await collectSignals(input))
  } catch (e) {
    console.warn('[brand-tokens] signal collection failed — using category defaults:', e instanceof Error ? e.message : e)
    return buildTokens({ brandName: input.brandName, briefText: input.briefText, candidates: [], logoAchromatic: false, siteColors: [] })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/design/brand-signals.test.ts`
Expected: PASS (7 tests). The sharp test needs the native binary that `npm install` already built; if it fails with a module-load error, run `npm rebuild sharp`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/brand-signals.ts src/lib/design/brand-signals.test.ts
git commit -m "feat(design): collect brand color signals from palette, logo and product images"
```

---
### Task 5: Layout foundation — types, content normalization, document wrapper, primitives, fixtures

**Files:**
- Create: `src/lib/design/slide-layouts/types.ts`, `src/lib/design/slide-layouts/content.ts`, `src/lib/design/slide-layouts/document.ts`, `src/lib/design/slide-layouts/primitives.ts`, `src/lib/design/fixtures.ts`
- Test: `src/lib/design/slide-layouts/foundation.test.ts`

**Interfaces:**
- Consumes: `DeckTokens`, `buildTokens` (Task 3); `lintCanvaSafe` (Task 2); `renumberEyebrows` from `@/lib/qa/deck-structure` (existing).
- Produces (used verbatim by Tasks 6–9):
  ```ts
  // types.ts
  export interface Stat { value: string; label: string; context?: string }
  export interface Person { name: string; handle?: string; imageUrl?: string; metric?: string; metricLabel?: string; tags?: string[] }
  export interface Step { label?: string; title: string; body?: string }
  export interface Quote { text: string; attribution: string; role?: string }
  export interface Comparison { columns: string[]; rows: Array<{ attribute: string; cells: string[] }>; highlightColumn?: number }
  export interface Card { title: string; body: string }
  export interface SlideContent {
    slideType: string; title: string; subtitle: string; body: string
    bullets: string[]; cards: Card[]; stats: Stat[]; people: Person[]; steps: Step[]
    quote?: Quote; comparison?: Comparison; imageUrl: string; imageUrls: string[]
  }
  export type LayoutId = 'cover-cinematic' | 'cover-split' | 'statement' | 'big-number' | 'stat-row' | 'pillars-3' | 'bento' | 'index-list' | 'timeline' | 'comparison' | 'quote' | 'people-grid' | 'image-grid' | 'divider' | 'closing' | 'text-image' | 'text-two-col'
  export interface SlideCtx { slideIndex: number; slideCount: number; brandName: string; logoUrl?: string; previousLayout?: LayoutId; imageSide?: 'left' | 'right' }
  export type LayoutFn = (c: SlideContent, t: DeckTokens, ctx: SlideCtx) => string
  // content.ts
  export function normalizeContent(args: Record<string, unknown>): SlideContent
  export function wordCount(s: string): number
  // document.ts
  export function slideDocument(t: DeckTokens, inner: string, opts?: { background?: string; color?: string }): string
  // primitives.ts
  export function esc(s: string): string
  export function hebrewLabel(slideType: string): string
  export function eyebrow(slideType: string, slideIndex: number, t: DeckTokens, onDark?: boolean): string
  export function rule(t: DeckTokens, weight: 2 | 3 | 4 | 6, width?: string, color?: string): string
  export function img(src: string, o: { width: string; height: string; radius?: number | '50%'; clip?: string; ring?: string; position?: string; extra?: string }): string
  export function fakeShadow(t: DeckTokens, o: { width: string; height: string; radius: number; offset?: number; color?: string }): string
  export function card(inner: string, t: DeckTokens, o?: { width?: string; height?: string; fill?: boolean; shadow?: boolean; padding?: number; extra?: string }): string
  export function pill(text: string, t: DeckTokens): string
  export function numeral(text: string, t: DeckTokens, size: number, color?: string): string
  export function statBlock(s: Stat, t: DeckTokens, size: 'hero' | 'row' | 'mini'): string
  export function scrimLayer(t: DeckTokens, direction?: 'to left' | 'to right' | 'to top'): string
  export const GRID: { margin: 120; top: 96; col: 118; gutter: 24; span: (n: number) => number }
  // fixtures.ts
  export const SEACRET_TOKENS: DeckTokens
  export const FIXTURE_IMG: string[]          // 4 https URLs
  export const FIXTURES: Record<LayoutId, SlideContent>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/slide-layouts/foundation.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeContent, wordCount } from './content'
import { slideDocument } from './document'
import { eyebrow, hebrewLabel, img, card, statBlock, esc } from './primitives'
import { SEACRET_TOKENS as T } from '../fixtures'
import { lintCanvaSafe } from '../canva-safe'
import { renumberEyebrows } from '@/lib/qa/deck-structure'

describe('normalizeContent', () => {
  it('folds aliases and trims', () => {
    const c = normalizeContent({ slideType: 'metrics', title: ' יעד ', bulletPoints: ['א', '', 'ב'], keyNumber: '₪150K', keyNumberLabel: 'תקציב', imageUrl: ' https://x/a.jpg ' })
    expect(c.title).toBe('יעד')
    expect(c.bullets).toEqual(['א', 'ב'])
    expect(c.stats).toEqual([{ value: '₪150K', label: 'תקציב' }])
    expect(c.imageUrl).toBe('https://x/a.jpg')
    expect(c.imageUrls).toEqual([])
  })
  it('turns bullets into steps on timeline slides', () => {
    const c = normalizeContent({ slideType: 'timeline', title: 'x', bulletPoints: ['שלב א', 'שלב ב'] })
    expect(c.steps.map((s) => s.title)).toEqual(['שלב א', 'שלב ב'])
    expect(c.bullets).toEqual([])
  })
  it('drops malformed structured fields instead of throwing', () => {
    const c = normalizeContent({ slideType: 'x', title: 'x', people: 'nope', quote: { text: '' }, cards: [{ title: '' }, { title: 'ok', body: 'b' }] })
    expect(c.people).toEqual([])
    expect(c.quote).toBeUndefined()
    expect(c.cards).toEqual([{ title: 'ok', body: 'b' }])
  })
  it('counts Hebrew words', () => { expect(wordCount('שלוש מילים כאן')).toBe(3) })
})

describe('primitives', () => {
  it('maps slide types to Hebrew labels, including numbered pillars', () => {
    expect(hebrewLabel('pillar-2')).toBe('עמוד תווך')
    expect(hebrewLabel('influencers')).toBe('משפיענים')
    expect(hebrewLabel('weird-beat')).toBe('weird-beat')
  })
  it('renders an eyebrow the renumbering pass can read and rewrite', () => {
    const html = slideDocument(T, eyebrow('goals', 2, T))
    expect(html).toMatch(/<div class="eyebrow"[^>]*>יעדים \/\/ 03<\/div>/)
    const { htmlSlides, renumbered } = renumberEyebrows([html], ['goals'])
    expect(renumbered).toBe(1)
    expect(htmlSlides[0]).toContain('יעדים // 01')
  })
  it('puts the radius on the img, never on a wrapper', () => {
    const html = slideDocument(T, img('https://x/a.jpg', { width: '220px', height: '220px', radius: '50%', ring: `6px solid ${T.paper}` }))
    expect(html).toMatch(/<img[^>]*border-radius:50%/)
    expect(lintCanvaSafe(html)).toEqual([])
  })
  it('builds a lint-clean card with a fake shadow', () => {
    const html = slideDocument(T, card('<p style="font-size:28px">x</p>', T, { width: '544px', height: '320px', shadow: true }))
    expect(lintCanvaSafe(html)).toEqual([])
    expect(html).not.toMatch(/box-shadow/)
  })
  it('renders stat blocks with at most three sizes and LTR digits', () => {
    const html = slideDocument(T, statBlock({ value: '42%', label: 'המרה', context: 'יעד שהצבנו' }, T, 'hero'))
    expect(html).toMatch(/dir="ltr"[^>]*>42%</)
    expect(lintCanvaSafe(html)).toEqual([])
  })
  it('escapes text', () => { expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;') })
})

describe('slideDocument', () => {
  it('is an RTL Hebrew document with the deck fonts', () => {
    const html = slideDocument(T, '<h1>x</h1>')
    expect(html).toMatch(/^<!DOCTYPE html><html lang="he" dir="rtl">/)
    expect(html).toContain(`https://fonts.googleapis.com/css2?${T.fonts.fontsQuery}&display=swap`)
    expect(html).toContain('<div class="slide"')
    expect(lintCanvaSafe(html)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/slide-layouts/foundation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `types.ts`**

Paste the `types.ts` block from the Interfaces section above verbatim (with `import type { DeckTokens } from '../brand-tokens'` at the top).

- [ ] **Step 4: Write `content.ts`**

```ts
// src/lib/design/slide-layouts/content.ts
import type { Card, Comparison, Person, Quote, SlideContent, Stat, Step } from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const objs = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter((o) => o && typeof o === 'object') as Array<Record<string, unknown>> : [])

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0
}

/** The agent's raw generate_slide_html args → one validated content object. Never throws. */
export function normalizeContent(args: Record<string, unknown>): SlideContent {
  const slideType = str(args.slideType) || 'content'
  const cards: Card[] = objs(args.cards).map((o) => ({ title: str(o.title), body: str(o.body) })).filter((c) => c.title).slice(0, 5)
  const stats: Stat[] = objs(args.stats).map((o) => ({ value: str(o.value), label: str(o.label), ...(str(o.context) ? { context: str(o.context) } : {}) })).filter((s) => s.value)
  if (str(args.keyNumber) && !stats.some((s) => s.value === str(args.keyNumber))) stats.unshift({ value: str(args.keyNumber), label: str(args.keyNumberLabel) })
  const people: Person[] = objs(args.people).map((o) => ({
    name: str(o.name), handle: str(o.handle) || undefined, imageUrl: str(o.imageUrl) || undefined,
    metric: str(o.metric) || undefined, metricLabel: str(o.metricLabel) || undefined, tags: strs(o.tags).slice(0, 3),
  })).filter((p) => p.name).slice(0, 4)
  let steps: Step[] = objs(args.steps).map((o) => ({ label: str(o.label) || undefined, title: str(o.title), body: str(o.body) || undefined })).filter((s) => s.title).slice(0, 6)
  let bullets = strs(args.bulletPoints ?? args.bullets).slice(0, 7)
  if (!steps.length && slideType.startsWith('timeline') && bullets.length) { steps = bullets.map((b) => ({ title: b })); bullets = [] }
  const q = args.quote as Record<string, unknown> | undefined
  const quote: Quote | undefined = q && str(q.text) ? { text: str(q.text), attribution: str(q.attribution), role: str(q.role) || undefined } : undefined
  const cmp = args.comparison as Record<string, unknown> | undefined
  const columns = cmp ? strs(cmp.columns) : []
  const rows = cmp ? objs(cmp.rows).map((r) => ({ attribute: str(r.attribute), cells: strs(r.cells) })).filter((r) => r.attribute) : []
  const comparison: Comparison | undefined = columns.length >= 2 && rows.length ? { columns: columns.slice(0, 4), rows: rows.slice(0, 6), highlightColumn: typeof cmp?.highlightColumn === 'number' ? cmp.highlightColumn : undefined } : undefined
  const imageUrl = str(args.imageUrl)
  return {
    slideType, title: str(args.title), subtitle: str(args.subtitle), body: str(args.bodyText ?? args.body),
    bullets, cards, stats: stats.slice(0, 4), people, steps, quote, comparison,
    imageUrl, imageUrls: strs(args.imageUrls).filter((u) => u !== imageUrl).slice(0, 5),
  }
}
```

- [ ] **Step 5: Write `document.ts`**

```ts
// src/lib/design/slide-layouts/document.ts
import type { DeckTokens } from '../brand-tokens'

/** The one <html> wrapper every layout returns. Only class selectors here — html-import scopes them per page. */
export function slideDocument(t: DeckTokens, inner: string, opts: { background?: string; color?: string } = {}): string {
  const bg = opts.background ?? t.paper
  const color = opts.color ?? t.ink
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?${t.fonts.fontsQuery}&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;direction:rtl;background:${bg};color:${color};font-family:${t.fonts.body};}
h1,h2,h3{font-family:${t.fonts.display};font-weight:700;text-wrap:balance;word-break:break-word;}
p,li{word-break:break-word;}
</style></head><body><div class="slide">${inner}</div></body></html>`
}
```

- [ ] **Step 6: Write `primitives.ts`**

```ts
// src/lib/design/slide-layouts/primitives.ts
/**
 * The Canva-safe vocabulary. Every visual device a layout may use lives here,
 * so the lint's guarantees hold by construction: radius/clip on the <img>,
 * depth from an offset rectangle, lines ≥ 2px, Anton/Plex Mono only on digits.
 */
import type { DeckTokens } from '../brand-tokens'
import type { Stat } from './types'

export const GRID = { margin: 120, top: 96, col: 118, gutter: 24, span: (n: number) => n * 118 + (n - 1) * 24 } as const

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const HEBREW_LABELS: Record<string, string> = {
  cover: 'פתיחה', brief: 'הבריף', goals: 'יעדים', audience: 'קהל היעד', insight: 'תובנה', strategy: 'אסטרטגיה',
  pillar: 'עמוד תווך', bigidea: 'הרעיון הגדול', creative: 'קריאייטיב', influencers: 'משפיענים', competitive: 'תחרות',
  deliverables: 'תוצרים', timeline: 'לוח זמנים', metrics: 'מדדים', results: 'תוצאות', closing: 'סיום', content: 'תוכן',
}

export function hebrewLabel(slideType: string): string {
  const base = slideType.toLowerCase().replace(/[-_\s]*\d+$/, '')
  return HEBREW_LABELS[base] ?? slideType
}

/** `<div class="eyebrow">LABEL // NN</div>` — plain text inside, on purpose: renumberEyebrows and slide-repair parse it. */
export function eyebrow(slideType: string, slideIndex: number, t: DeckTokens, onDark = false): string {
  const nn = String(slideIndex + 1).padStart(2, '0')
  const color = onDark ? '#ffffff' : t.accentText
  const bg = onDark ? 'rgba(255,255,255,0.16)' : t.accentTint
  return `<div class="eyebrow" style="position:absolute;top:${GRID.top}px;right:${GRID.margin}px;display:inline-block;height:40px;line-height:40px;padding:0 18px;border-radius:9999px;background:${bg};color:${color};font-family:${t.fonts.body};font-size:22px;font-weight:700;letter-spacing:0.06em;white-space:nowrap;">${esc(hebrewLabel(slideType))} // ${nn}</div>`
}

export function rule(t: DeckTokens, weight: 2 | 3 | 4 | 6, width = '100%', color = t.rule): string {
  return `<div style="width:${width};height:${weight}px;background:${color};"></div>`
}

export function img(src: string, o: { width: string; height: string; radius?: number | '50%'; clip?: string; ring?: string; position?: string; extra?: string }): string {
  const radius = o.radius === undefined ? '' : `border-radius:${typeof o.radius === 'number' ? `${o.radius}px` : o.radius};`
  return `<img src="${esc(src)}" style="display:block;width:${o.width};height:${o.height};object-fit:cover;object-position:${o.position ?? 'center'};${radius}${o.clip ? `clip-path:${o.clip};` : ''}${o.ring ? `border:${o.ring};` : ''}${o.extra ?? ''}">`
}

/** A solid rectangle behind a card/image — the only depth device that survives import. Position it with `extra`. */
export function fakeShadow(t: DeckTokens, o: { width: string; height: string; radius: number; offset?: number; color?: string }): string {
  const off = o.offset ?? 16
  return `<div style="position:absolute;top:${off}px;left:-${off}px;width:${o.width};height:${o.height};border-radius:${o.radius}px;background:${o.color ?? t.accentTint};"></div>`
}

export function card(inner: string, t: DeckTokens, o: { width?: string; height?: string; fill?: boolean; shadow?: boolean; padding?: number; extra?: string } = {}): string {
  const w = o.width ?? '100%'
  const h = o.height ?? 'auto'
  const face = o.fill ? `background:${t.surface};` : `border:2px solid ${t.rule};background:${t.paper};`
  const body = `<div style="position:relative;width:${w};height:${h};padding:${o.padding ?? 44}px;border-radius:${t.radius}px;${face}${o.extra ?? ''}">${inner}</div>`
  if (!o.shadow) return body
  return `<div style="position:relative;width:${w};height:${h};">${fakeShadow(t, { width: w, height: h, radius: t.radius })}${body}</div>`
}

export function pill(text: string, t: DeckTokens): string {
  return `<span style="display:inline-block;height:36px;line-height:36px;padding:0 16px;border-radius:9999px;background:${t.accentTint};color:${t.accentText};font-size:22px;font-weight:700;margin-left:8px;">${esc(text)}</span>`
}

/** Digits / Latin only — the numeral font has no Hebrew glyphs. */
export function numeral(text: string, t: DeckTokens, size: number, color = t.accentText): string {
  return `<div dir="ltr" style="font-family:${t.fonts.numeral};font-size:${size}px;font-weight:900;line-height:0.95;color:${color};font-variant-numeric:tabular-nums;">${esc(text)}</div>`
}

// Label sizes are shared with body/caption sizes on purpose: a stat-row slide (title 64 + body 28 + stats) must stay within four distinct font sizes.
const STAT_SIZES = { hero: [280, 28, 22], row: [128, 28, 22], mini: [88, 22, 22] } as const

export function statBlock(s: Stat, t: DeckTokens, size: 'hero' | 'row' | 'mini'): string {
  const [num, label, ctx] = STAT_SIZES[size]
  return `<div style="text-align:right;">
${numeral(s.value, t, num)}
<div style="font-size:${label}px;font-weight:500;margin-top:16px;color:${t.ink};">${esc(s.label)}</div>
${s.context ? `<div style="font-size:${ctx}px;margin-top:8px;color:${t.muted};max-width:${GRID.span(5)}px;">${esc(s.context)}</div>` : ''}
</div>`
}

export function scrimLayer(t: DeckTokens, direction: 'to left' | 'to right' | 'to top' = 'to left'): string {
  return `<div style="position:absolute;inset:0;background:${t.scrim.replace('to left', direction)};"></div>`
}
```

- [ ] **Step 7: Write `fixtures.ts`**

```ts
// src/lib/design/fixtures.ts
/** Shared test material: SEACRET tokens + one content object per layout. Real Hebrew copy, real-shaped URLs. */
import { buildTokens, type DeckTokens } from './brand-tokens'
import type { LayoutId, SlideContent } from './slide-layouts/types'

export const SEACRET_TOKENS: DeckTokens = buildTokens({
  brandName: 'SEACRET SPA', briefText: 'מותג ספא וקוסמטיקה מים המלח',
  candidates: [{ hex: '#604830', weight: 2, source: 'image' }], logoAchromatic: true, siteColors: ['#666666'],
})
const S = 'https://fhgggqnaplshwbrzgima.supabase.co/storage/v1/object/public/assets/brand/seacret'
export const FIXTURE_IMG = [`${S}/mud.jpg`, `${S}/products.jpg`, `${S}/salt.jpg`, `${S}/spa.jpg`]

const c = (p: Partial<SlideContent> & { slideType: string; title: string }): SlideContent => ({
  subtitle: '', body: '', bullets: [], cards: [], stats: [], people: [], steps: [], imageUrl: '', imageUrls: [], ...p,
})
const BODY = 'המותג נבנה על חוש המישוש: הלקוחה קונה אחרי שהמוצר נגע בעור שלה. אונליין אין מגע, ולכן המותג מאבד בדיוק את מה שהפך אותו למשכנע בדוכן.'
const LONG = `${BODY} הפתרון הוא להעביר את תחושת המגע לתוכן: מרקמים בקלוז-אפ, טקסים יומיים, ותוצאה על העור שרואים בעיניים. ${BODY}`

export const FIXTURES: Record<LayoutId, SlideContent> = {
  'cover-cinematic': c({ slideType: 'cover', title: 'המגע של ים המלח, עכשיו במסך', subtitle: 'אסטרטגיית חורף בדיגיטל', imageUrl: FIXTURE_IMG[0] }),
  'cover-split': c({ slideType: 'cover', title: 'המגע של ים המלח, עכשיו במסך', subtitle: 'אסטרטגיית חורף בדיגיטל' }),
  statement: c({ slideType: 'bigIdea', title: 'המסך לא יודע לגעת בעור' }),
  'big-number': c({ slideType: 'metrics', title: 'יעד ההמרה', stats: [{ value: '2.5%', label: 'המרה במסחר הישיר', context: 'יעד שהצבנו עם הלקוח' }], imageUrl: FIXTURE_IMG[1] }),
  'stat-row': c({ slideType: 'goals', title: 'שלושה יעדים, שנה אחת', body: 'להפוך את SEACRET ממותג של דוכנים למותג דיגיטלי, בלי לאבד את המגע.', stats: [{ value: '×2', label: 'תנועה אורגנית', context: 'תוך 12 חודשים' }, { value: '2.5%', label: 'המרה', context: 'במסחר הישיר' }, { value: '75%', label: 'צפייה מלאה', context: 'רף לריטרגטינג' }] }),
  'pillars-3': c({ slideType: 'strategy', title: 'שלושה עמודי תווך', cards: [{ title: 'מקור', body: 'הבוץ, המלח והמינרלים, מצולמים במקום שבו הם נוצרים.' }, { title: 'טקס', body: 'שגרת טיפוח יומית של חמש דקות, בפורמט קצר ומתמשך.' }, { title: 'תוצאה', body: 'העור אחרי שבוע, בלי פילטר, אצל נשים אמיתיות.' }] }),
  bento: c({ slideType: 'deliverables', title: 'מה נמסור ברבעון הראשון', cards: [{ title: 'סרטוני מרקם', body: '12 סרטוני קלוז-אפ' }, { title: 'טקסים', body: '8 סדרות קצרות' }, { title: 'משפיענים', body: '6 שיתופי פעולה' }, { title: 'עמודי נחיתה', body: '3 עמודים' }], imageUrl: FIXTURE_IMG[2] }),
  'index-list': c({ slideType: 'brief', title: 'מה נכסה היום', bullets: ['הבריף והתובנה', 'קהל היעד', 'האסטרטגיה', 'הקריאייטיב', 'משפיענים', 'לוח זמנים ומדדים'] }),
  timeline: c({ slideType: 'timeline', title: 'שלושה חודשים ראשונים', steps: [{ label: 'ינואר', title: 'הקמה', body: 'צילומים, נכסים, עמודי נחיתה' }, { label: 'פברואר', title: 'השקה', body: 'קמפיין מרקמים בטיקטוק' }, { label: 'מרץ', title: 'הרחבה', body: 'משפיענים וריטרגטינג' }, { label: 'אפריל', title: 'מדידה', body: 'סבב אופטימיזציה ראשון' }] }),
  comparison: c({ slideType: 'competitive', title: 'איפה אנחנו מול השוק', comparison: { columns: ['SEACRET', 'AHAVA', 'מותג פרייבט לייבל'], rows: [{ attribute: 'מקור החומר', cells: ['ים המלח, ישיר', 'ים המלח', 'לא ידוע'] }, { attribute: 'מגע לפני רכישה', cells: ['דוכנים', 'חנויות', 'אין'] }, { attribute: 'תוכן מרקם', cells: ['בבנייה', 'חלקי', 'אין'] }], highlightColumn: 0 } }),
  quote: c({ slideType: 'insight', title: 'קול הלקוחה', quote: { text: 'קניתי כי הרגשתי את זה על היד. באינטרנט אני לא יודעת מה אני מקבלת.', attribution: 'לקוחה, דוכן קניון עזריאלי', role: 'ראיון עומק' } }),
  'people-grid': c({ slideType: 'influencers', title: 'שלוש יוצרות שנוגעות בעור', people: [{ name: 'נועה לוי', handle: '@noa.skin', imageUrl: FIXTURE_IMG[3], metric: '184K', metricLabel: 'עוקבים', tags: ['טיפוח', 'טיקטוק'] }, { name: 'מאיה כהן', handle: '@maya.glow', imageUrl: FIXTURE_IMG[3], metric: '92K', metricLabel: 'עוקבים', tags: ['ביוטי'] }, { name: 'שירה בן דוד', handle: '@shira.bd', imageUrl: FIXTURE_IMG[3], metric: '61K', metricLabel: 'עוקבים', tags: ['אמהות', 'לייפסטייל'] }] }),
  'image-grid': c({ slideType: 'creative', title: 'עולם הוויזואל', imageUrls: [FIXTURE_IMG[0], FIXTURE_IMG[1], FIXTURE_IMG[2]] }),
  divider: c({ slideType: 'strategy', title: 'האסטרטגיה' }),
  closing: c({ slideType: 'closing', title: 'נתחיל מהמגע', subtitle: 'ליידרס × SEACRET SPA', imageUrl: FIXTURE_IMG[0] }),
  'text-image': c({ slideType: 'insight', title: 'המסך לא יודע לגעת בעור', body: BODY, imageUrl: FIXTURE_IMG[1] }),
  'text-two-col': c({ slideType: 'brief', title: 'מה הבריף מבקש', body: LONG }),
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/design/slide-layouts/foundation.test.ts`
Expected: PASS (12 tests). Then `npx tsc --noEmit` — clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/design/slide-layouts src/lib/design/fixtures.ts
git commit -m "feat(design): layout foundation — content shapes, document wrapper, Canva-safe primitives"
```

---
### Task 6: Layouts — cover, closing, divider, statement (+ registry and the shared layouts test)

**Files:**
- Create: `src/lib/design/slide-layouts/layouts-cover.ts`, `src/lib/design/slide-layouts/registry.ts`
- Test: `src/lib/design/slide-layouts/layouts.test.ts` (grows automatically as Tasks 7–8 register more layouts)

**Interfaces:**
- Consumes: Task 5 primitives, `slideDocument`, `FIXTURES`, `SEACRET_TOKENS`, `lintCanvaSafe`.
- Produces: `coverCinematic`, `coverSplit`, `closing`, `divider`, `statement` (all `LayoutFn`); `registry.ts` exporting `LAYOUTS: Partial<Record<LayoutId, LayoutFn>>` (becomes complete in Task 8) and `LINT_TYPE(id: LayoutId, c: SlideContent): string` (returns `'divider'` for the divider layout, otherwise `c.slideType`, so the eyebrow rule knows a divider carries none).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/slide-layouts/layouts.test.ts
import { describe, it, expect } from 'vitest'
import { LAYOUTS, LINT_TYPE } from './registry'
import { FIXTURES, SEACRET_TOKENS as T } from '../fixtures'
import { lintCanvaSafe, EYEBROW_FREE_TYPES } from '../canva-safe'
import { esc } from './primitives'
import type { LayoutId } from './types'

const ctx = { slideIndex: 4, slideCount: 18, brandName: 'SEACRET SPA', logoUrl: 'https://x/logo.png' }
const entries = Object.entries(LAYOUTS) as Array<[LayoutId, NonNullable<(typeof LAYOUTS)[LayoutId]>]>

describe.each(entries)('layout %s', (id, render) => {
  const c = FIXTURES[id]
  const html = render(c, T, ctx)

  it('is a complete RTL document that passes the Canva-safe lint', () => {
    expect(html).toMatch(/^<!DOCTYPE html><html lang="he" dir="rtl">/)
    expect(lintCanvaSafe(html, { slideType: LINT_TYPE(id, c) })).toEqual([])
  })
  it('shows the title and keeps every content image', () => {
    expect(html).toContain(esc(c.title))
    for (const u of [c.imageUrl, ...c.imageUrls, ...c.people.map((p) => p.imageUrl ?? '')].filter(Boolean)) expect(html).toContain(esc(u))
  })
  it('carries an eyebrow exactly when the slide type calls for one', () => {
    const has = html.includes('class="eyebrow"')
    expect(has).toBe(!EYEBROW_FREE_TYPES.includes(LINT_TYPE(id, c)))
  })
  it('never lets the model text break out of the markup', () => {
    const evil = { ...c, title: '<script>x</script>"' }
    expect(render(evil, T, ctx)).not.toContain('<script>')
  })
})

describe('registry', () => {
  it('registers every layout id exactly once', () => {
    const ids: LayoutId[] = ['cover-cinematic', 'cover-split', 'statement', 'big-number', 'stat-row', 'pillars-3', 'bento', 'index-list', 'timeline', 'comparison', 'quote', 'people-grid', 'image-grid', 'divider', 'closing', 'text-image', 'text-two-col']
    // Loosened until Task 8 completes the registry: every registered id must be a known id.
    for (const k of Object.keys(LAYOUTS)) expect(ids).toContain(k)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 3: Write `layouts-cover.ts`**

```ts
// src/lib/design/slide-layouts/layouts-cover.ts
/** Full-color beats: cover (two variants), closing, section divider, statement. No eyebrow except on statement. */
import type { LayoutFn } from './types'
import { slideDocument } from './document'
import { GRID, esc, eyebrow, img, rule, scrimLayer } from './primitives'

const HEBREW = /[\u0590-\u05FF]/
const W8 = GRID.span(8)   // 1112
const W10 = GRID.span(10) // 1396

const logoCorner = (logoUrl: string | undefined, light: boolean) =>
  logoUrl ? `<div style="position:absolute;left:${GRID.margin}px;bottom:${GRID.top}px;${light ? '' : 'opacity:0.9;'}">${img(logoUrl, { width: 'auto', height: '64px' })}</div>` : ''

export const coverCinematic: LayoutFn = (c, t, ctx) => {
  const size = c.title.length > 26 ? 96 : 120
  return slideDocument(t, `
${img(c.imageUrl, { width: '1920px', height: '1080px', extra: 'position:absolute;inset:0;' })}
${scrimLayer(t, 'to left')}
<div style="position:absolute;right:${GRID.margin}px;bottom:140px;width:${W8}px;color:#ffffff;">
  ${rule(t, 6, '160px', t.accent)}
  <h1 style="font-size:${size}px;line-height:1.04;margin-top:36px;color:#ffffff;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:30px;line-height:1.4;margin-top:28px;color:rgba(255,255,255,0.85);">${esc(c.subtitle)}</p>` : ''}
  <p style="font-size:22px;margin-top:40px;color:rgba(255,255,255,0.7);letter-spacing:0.06em;">${esc(ctx.brandName)} · LEADERS</p>
</div>
${logoCorner(ctx.logoUrl, true)}`, { color: '#ffffff' })
}

export const coverSplit: LayoutFn = (c, t, ctx) => {
  const size = c.title.length > 26 ? 88 : 104
  return slideDocument(t, `
<div style="position:absolute;top:0;bottom:0;left:0;width:${GRID.span(6) + GRID.margin}px;background:${t.accent};"></div>
<div dir="ltr" style="position:absolute;left:${GRID.margin}px;bottom:${GRID.top}px;font-family:${HEBREW.test(ctx.brandName) ? t.fonts.display : t.fonts.numeral};font-size:104px;font-weight:900;color:rgba(255,255,255,0.18);line-height:1;">${esc(ctx.brandName.toUpperCase())}</div>
<div style="position:absolute;right:${GRID.margin}px;top:360px;width:${GRID.span(5)}px;">
  ${rule(t, 6, '160px', t.accent)}
  <h1 style="font-size:${size}px;line-height:1.06;margin-top:36px;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:30px;line-height:1.4;margin-top:28px;color:${t.muted};">${esc(c.subtitle)}</p>` : ''}
  <p style="font-size:22px;margin-top:40px;color:${t.muted};letter-spacing:0.06em;">${esc(ctx.brandName)} · LEADERS</p>
</div>`)
}

export const closing: LayoutFn = (c, t, ctx) => {
  const dark = t.archetype === 'cinematic-dark'
  const panelBg = c.imageUrl ? 'transparent' : dark ? t.surface : t.ink
  // No overflow:hidden on the panel — that would be the wrapper-clips-img pattern Canva drops. The img carries the radius.
  const inner = c.imageUrl
    ? `${img(c.imageUrl, { width: '1824px', height: '984px', radius: 40, extra: 'position:absolute;inset:0;' })}<div style="position:absolute;inset:0;border-radius:40px;background:${t.scrim};"></div>`
    : ''
  return slideDocument(t, `
<div style="position:absolute;inset:48px;border-radius:40px;background:${panelBg};">${inner}</div>
<div style="position:absolute;right:${GRID.margin + 48}px;bottom:${GRID.top + 48}px;width:${W8}px;color:#ffffff;">
  ${rule(t, 6, '200px', t.accent)}
  <h1 style="font-size:88px;line-height:1.06;margin-top:36px;color:#ffffff;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:26px;line-height:1.5;margin-top:24px;color:rgba(255,255,255,0.85);">${esc(c.subtitle)}</p>` : ''}
  ${c.body ? `<p style="font-size:26px;line-height:1.5;margin-top:16px;color:rgba(255,255,255,0.7);">${esc(c.body)}</p>` : ''}
  <p style="font-size:22px;margin-top:40px;color:rgba(255,255,255,0.7);letter-spacing:0.06em;">${esc(ctx.brandName)} · LEADERS</p>
</div>
${logoCorner(ctx.logoUrl, false)}`, { color: '#ffffff' })
}

// Section divider: inverted colors and a watermark numeral — a beat, not a slide.
export const divider: LayoutFn = (c, t, ctx) => {
  const nn = String(ctx.slideIndex + 1).padStart(2, '0')
  return slideDocument(t, `
<div dir="ltr" style="position:absolute;left:${GRID.margin}px;bottom:-40px;font-family:${t.fonts.numeral};font-size:320px;font-weight:900;line-height:1;color:rgba(255,255,255,0.12);">${nn}</div>
<div style="position:absolute;right:${GRID.margin}px;top:440px;width:${W8}px;">
  ${rule(t, 6, '160px', t.accent)}
  <h1 style="font-size:96px;line-height:1.06;margin-top:36px;color:${t.paper};">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:30px;line-height:1.4;margin-top:24px;color:${t.paper};opacity:0.8;">${esc(c.subtitle)}</p>` : ''}
</div>`, { background: t.ink, color: t.paper })
}

// One sentence, nothing else. Carries an eyebrow (it is a content beat).
export const statement: LayoutFn = (c, t, ctx) => {
  const size = c.title.length > 40 ? 104 : 128
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
<div style="position:absolute;right:${GRID.margin}px;top:50%;transform:translateY(-50%);width:${W10}px;">
  ${rule(t, 6, '160px', t.accent)}
  <h1 style="font-size:${size}px;line-height:1.08;margin-top:40px;">${esc(c.title)}</h1>
  ${c.subtitle || c.body ? `<p style="font-size:30px;line-height:1.5;margin-top:32px;color:${t.muted};max-width:${GRID.span(7)}px;">${esc(c.subtitle || c.body)}</p>` : ''}
</div>`)
}
```

- [ ] **Step 4: Write `registry.ts`**

```ts
// src/lib/design/slide-layouts/registry.ts
import type { LayoutFn, LayoutId, SlideContent } from './types'
import { closing, coverCinematic, coverSplit, divider, statement } from './layouts-cover'

/** Every layout by id. Tasks 7 and 8 add the content and structured groups. */
export const LAYOUTS: Partial<Record<LayoutId, LayoutFn>> = {
  'cover-cinematic': coverCinematic,
  'cover-split': coverSplit,
  closing,
  divider,
  statement,
}

/** The slide type the lint should judge: a divider never carries an eyebrow whatever beat it opens. */
export function LINT_TYPE(id: LayoutId, c: SlideContent): string {
  return id === 'divider' ? 'divider' : c.slideType
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: PASS (5 layouts × 4 tests + 1). If `cover-cinematic` fails the lint with `too-many-sizes`, count the sizes: 120/96, 30, 22 — the base CSS must add none.

- [ ] **Step 6: Commit**

```bash
git add src/lib/design/slide-layouts
git commit -m "feat(design): cover, closing, divider and statement layouts"
```

---
### Task 7: Layouts — big number, stat row, pillars, bento, index list, text+image, two columns

**Files:**
- Create: `src/lib/design/slide-layouts/layouts-content.ts`
- Modify: `src/lib/design/slide-layouts/registry.ts` (register the seven)
- Test: `src/lib/design/slide-layouts/layouts.test.ts` (unchanged — it iterates the registry)

**Interfaces:**
- Consumes: Task 5 primitives; `ctx.imageSide` (`'left'` default) decides which side the accent image sits on in `textImage`.
- Produces: `bigNumber`, `statRow`, `pillars3`, `bento`, `indexList`, `textImage`, `textTwoCol` (all `LayoutFn`).

- [ ] **Step 1: Register the seven in `registry.ts` (test goes red)**

```ts
import { bento, bigNumber, indexList, pillars3, statRow, textImage, textTwoCol } from './layouts-content'
// inside LAYOUTS:
  'big-number': bigNumber, 'stat-row': statRow, 'pillars-3': pillars3, bento, 'index-list': indexList, 'text-image': textImage, 'text-two-col': textTwoCol,
```

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: FAIL — cannot resolve `./layouts-content`.

- [ ] **Step 2: Write `layouts-content.ts`**

```ts
// src/lib/design/slide-layouts/layouts-content.ts
/** The workhorse content beats. Every slide: eyebrow top-right, title block, one idea. */
import type { LayoutFn, SlideContent } from './types'
import type { DeckTokens } from '../brand-tokens'
import { slideDocument } from './document'
import { GRID, card, esc, eyebrow, img, numeral, rule, statBlock } from './primitives'

const TOP = 200                       // first content line, below the eyebrow
const CONTENT_W = GRID.span(12)       // 1680

function heading(c: SlideContent, t: DeckTokens, width = GRID.span(7)): string {
  const size = c.title.length > 34 ? 56 : 64
  return `<div style="position:absolute;right:${GRID.margin}px;top:${TOP}px;width:${width}px;">
  <h1 style="font-size:${size}px;line-height:1.1;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:28px;line-height:1.5;margin-top:20px;color:${t.muted};">${esc(c.subtitle)}</p>` : ''}
</div>`
}

function bulletList(bullets: string[], t: DeckTokens): string {
  if (!bullets.length) return ''
  return `<ul style="list-style:none;margin-top:28px;">${bullets.map((b) => `
  <li style="position:relative;padding-right:32px;margin-bottom:16px;font-size:28px;line-height:1.5;"><span style="position:absolute;right:0;top:16px;width:12px;height:12px;background:${t.accent};"></span>${esc(b)}</li>`).join('')}</ul>`
}

/** Split a paragraph into two columns at the sentence boundary nearest the middle. */
export function splitColumns(body: string): [string, string] {
  const sentences = body.split(/(?<=[.!?׃])\s+/).filter(Boolean)
  if (sentences.length < 2) return [body, '']
  let best = 1, bestDiff = Infinity
  for (let i = 1; i < sentences.length; i++) {
    const diff = Math.abs(sentences.slice(0, i).join(' ').length - sentences.slice(i).join(' ').length)
    if (diff < bestDiff) { best = i; bestDiff = diff }
  }
  return [sentences.slice(0, best).join(' '), sentences.slice(best).join(' ')]
}

export const bigNumber: LayoutFn = (c, t, ctx) => {
  const stat = c.stats[0]
  const image = c.imageUrl
    ? `<div style="position:absolute;left:${GRID.margin}px;top:220px;">${img(c.imageUrl, { width: `${GRID.span(4)}px`, height: '640px', radius: t.radius })}</div>`
    : ''
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t)}
${image}
<div style="position:absolute;right:${GRID.margin}px;bottom:${GRID.top + 40}px;width:${GRID.span(7)}px;">
  ${statBlock(stat, t, 'hero')}
  ${c.body ? `<p style="font-size:28px;line-height:1.5;margin-top:32px;color:${t.muted};max-width:${GRID.span(5)}px;">${esc(c.body)}</p>` : ''}
</div>`)
}

export const statRow: LayoutFn = (c, t, ctx) => {
  const stats = c.stats.slice(0, 4)
  const cellW = stats.length === 4 ? GRID.span(3) : GRID.span(4)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t)}
${c.body ? `<p style="position:absolute;right:${GRID.margin}px;top:${TOP + 110}px;width:${GRID.span(7)}px;font-size:28px;line-height:1.5;color:${t.muted};">${esc(c.body)}</p>` : ''}
<div style="position:absolute;right:${GRID.margin}px;top:560px;display:flex;gap:${GRID.gutter}px;">
${stats.map((s) => `  <div style="width:${cellW}px;padding-top:24px;">${rule(t, 3, '100%', t.accent)}<div style="margin-top:28px;">${statBlock(s, t, 'row')}</div></div>`).join('\n')}
</div>`)
}

export const pillars3: LayoutFn = (c, t, ctx) => {
  const cards = c.cards.slice(0, 3)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t, CONTENT_W)}
<div style="position:absolute;right:${GRID.margin}px;top:400px;display:flex;gap:${GRID.gutter}px;">
${cards.map((k, i) => card(`
  ${numeral(String(i + 1).padStart(2, '0'), t, 40)}
  <h3 style="font-size:40px;line-height:1.15;margin-top:20px;">${esc(k.title)}</h3>
  <div style="margin:20px 0;">${rule(t, 3, '64px', t.accent)}</div>
  <p style="font-size:28px;line-height:1.45;color:${t.muted};">${esc(k.body)}</p>`, t, { width: `${GRID.span(4)}px`, height: '520px', padding: 48 })).join('\n')}
</div>`)
}

export const bento: LayoutFn = (c, t, ctx) => {
  const small = (k: { title: string; body: string }, w: number, h: number) => card(`
  <h3 style="font-size:36px;line-height:1.15;">${esc(k.title)}</h3>
  <p style="font-size:28px;line-height:1.45;margin-top:16px;color:${t.muted};">${esc(k.body)}</p>`, t, { width: `${w}px`, height: `${h}px`, fill: true, padding: 40 })
  const cards = c.cards.length ? c.cards : [{ title: c.title, body: c.body }]
  // With an image: the image is the wide cell, cards[0] beside it, cards[1..3] below.
  // Without: cards[0] is the wide cell, cards[1] beside it, cards[2..4] below.
  const wide = c.imageUrl
    ? img(c.imageUrl, { width: `${GRID.span(8)}px`, height: '340px', radius: t.radius })
    : small(cards[0], GRID.span(8), 340)
  const beside = c.imageUrl ? cards.slice(0, 1) : cards.slice(1, 2)
  const below = c.imageUrl ? cards.slice(1, 4) : cards.slice(2, 5)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t, CONTENT_W)}
<div style="position:absolute;right:${GRID.margin}px;top:344px;width:${CONTENT_W}px;display:flex;flex-direction:column;gap:${GRID.gutter}px;">
  <div style="display:flex;gap:${GRID.gutter}px;">${wide}${beside.map((k) => small(k, GRID.span(4), 340)).join('')}</div>
  <div style="display:flex;gap:${GRID.gutter}px;">${below.map((k) => small(k, GRID.span(4), 276)).join('')}</div>
</div>`)
}

export const indexList: LayoutFn = (c, t, ctx) => {
  const items = c.bullets.slice(0, 7)
  const rowH = items.length > 6 ? 88 : 96
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t, GRID.span(5))}
<div style="position:absolute;right:${GRID.margin}px;top:320px;width:${GRID.span(9)}px;">
${items.map((b, i) => `  <div style="display:flex;align-items:center;gap:${GRID.gutter}px;height:${rowH}px;border-bottom:2px solid ${t.rule};">
    <div style="width:${GRID.col}px;flex:0 0 auto;">${numeral(String(i + 1).padStart(2, '0'), t, 64)}</div>
    <div style="font-size:36px;font-weight:500;line-height:1.2;">${esc(b)}</div>
  </div>`).join('\n')}
</div>`)
}

export const textImage: LayoutFn = (c, t, ctx) => {
  const side = ctx.imageSide ?? 'left'
  const imgW = GRID.span(4)
  const image = c.imageUrl ? `<div style="position:absolute;${side}:${GRID.margin}px;top:160px;">${img(c.imageUrl, { width: `${imgW}px`, height: '760px', radius: t.radius })}</div>` : ''
  const textPos = side === 'left' ? `right:${GRID.margin}px;` : `left:${GRID.margin}px;`
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${image}
<div style="position:absolute;${textPos}top:${TOP}px;width:${GRID.span(7)}px;">
  <h1 style="font-size:64px;line-height:1.1;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:28px;line-height:1.5;margin-top:20px;color:${t.muted};">${esc(c.subtitle)}</p>` : ''}
  ${c.body ? `<p style="font-size:28px;line-height:1.5;margin-top:32px;max-width:${GRID.span(6)}px;">${esc(c.body)}</p>` : ''}
  ${bulletList(c.bullets.slice(0, 4), t)}
</div>`)
}

export const textTwoCol: LayoutFn = (c, t, ctx) => {
  const [a, b] = splitColumns(c.body)
  const colW = GRID.span(5)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t, CONTENT_W)}
<div style="position:absolute;right:${GRID.margin}px;top:420px;display:flex;gap:${GRID.col + GRID.gutter * 2}px;">
  <div style="width:${colW}px;"><p style="font-size:28px;line-height:1.55;">${esc(a)}</p></div>
  <div style="width:${colW}px;">${b ? `<p style="font-size:28px;line-height:1.55;">${esc(b)}</p>` : ''}${bulletList(c.bullets.slice(0, 4), t)}</div>
</div>`)
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: PASS (12 layouts × 4 + 1). Common failures and the fix: `too-many-sizes` on `stat-row` means a stat label is not 28 — Task 5's `STAT_SIZES.row` must be `[128, 28, 22]`; `hairline` means a `border-bottom:1px` slipped in — all rules are 2px.

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/design/slide-layouts
git commit -m "feat(design): content layouts — big number, stat row, pillars, bento, index, text+image, two columns"
```

---
### Task 8: Layouts — timeline, comparison, quote, people grid, image grid

**Files:**
- Create: `src/lib/design/slide-layouts/layouts-structured.ts`
- Modify: `src/lib/design/slide-layouts/registry.ts` (register the five; `LAYOUTS` becomes `Record<LayoutId, LayoutFn>`)
- Test: `src/lib/design/slide-layouts/layouts.test.ts` — tighten the registry test to `expect(Object.keys(LAYOUTS).sort()).toEqual([...ids].sort())`

**Interfaces:**
- Produces: `timeline`, `comparison`, `quote`, `peopleGrid`, `imageGrid` (all `LayoutFn`). `comparison` and `quote` assume the caller selected them only when `c.comparison` / `c.quote` exist (Task 9 guarantees it).

- [ ] **Step 1: Register the five and tighten the registry test (test goes red)**

```ts
import { comparison, imageGrid, peopleGrid, quote, timeline } from './layouts-structured'
// inside LAYOUTS, now typed Record<LayoutId, LayoutFn>:
  timeline, comparison, quote, 'people-grid': peopleGrid, 'image-grid': imageGrid,
```

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: FAIL — cannot resolve `./layouts-structured`.

- [ ] **Step 2: Write `layouts-structured.ts`**

```ts
// src/lib/design/slide-layouts/layouts-structured.ts
/** Beats with their own data shape: steps, comparison table, quote, people, image set. */
import type { LayoutFn, SlideContent } from './types'
import type { DeckTokens } from '../brand-tokens'
import { slideDocument } from './document'
import { GRID, card, esc, eyebrow, img, numeral, pill, rule } from './primitives'

const TOP = 200
const CONTENT_W = GRID.span(12)

function heading(c: SlideContent, t: DeckTokens): string {
  return `<div style="position:absolute;right:${GRID.margin}px;top:${TOP}px;width:${CONTENT_W}px;">
  <h1 style="font-size:${c.title.length > 34 ? 56 : 64}px;line-height:1.1;">${esc(c.title)}</h1>
  ${c.subtitle ? `<p style="font-size:28px;line-height:1.5;margin-top:20px;color:${t.muted};max-width:${GRID.span(7)}px;">${esc(c.subtitle)}</p>` : ''}
</div>`
}

export const timeline: LayoutFn = (c, t, ctx) => {
  const steps = c.steps.slice(0, 6)
  const w = Math.floor((CONTENT_W - GRID.gutter * (steps.length - 1)) / steps.length)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t)}
<div style="position:absolute;right:${GRID.margin}px;top:560px;width:${CONTENT_W}px;">
  <div style="position:absolute;right:0;left:0;top:62px;height:4px;background:${t.rule};"></div>
  <div style="display:flex;gap:${GRID.gutter}px;position:relative;">
${steps.map((s) => `    <div style="width:${w}px;">
      <div style="height:40px;font-size:22px;font-weight:700;letter-spacing:0.04em;color:${t.accentText};">${esc(s.label ?? '')}</div>
      <div style="width:28px;height:28px;border-radius:50%;background:${t.accent};border:6px solid ${t.paper};margin-top:8px;"></div>
      <h3 style="font-size:30px;line-height:1.2;margin-top:28px;">${esc(s.title)}</h3>
      ${s.body ? `<p style="font-size:22px;line-height:1.45;margin-top:12px;color:${t.muted};max-width:260px;">${esc(s.body)}</p>` : ''}
    </div>`).join('\n')}
  </div>
</div>`)
}

export const comparison: LayoutFn = (c, t, ctx) => {
  const cmp = c.comparison ?? { columns: [], rows: [] }
  const cols = cmp.columns.slice(0, 4)
  const hl = cmp.highlightColumn
  const cell = (txt: string, i: number, header: boolean, bold = header) =>
    `<div style="display:flex;align-items:center;height:${header ? 96 : 80}px;padding:0 24px;font-size:${header ? 32 : 28}px;font-weight:${bold ? 700 : 400};border-bottom:2px solid ${t.rule};${hl === i ? `background:${t.surface};` : ''}${header && hl === i ? `border-top:3px solid ${t.accent};` : ''}">${esc(txt)}</div>`
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t)}
<div style="position:absolute;right:${GRID.margin}px;top:344px;width:${CONTENT_W}px;display:grid;grid-template-columns:${GRID.span(4)}px repeat(${cols.length},1fr);">
  ${cell('', -1, true)}${cols.map((h, i) => cell(h, i, true)).join('')}
  ${cmp.rows.slice(0, 6).map((r) => cell(r.attribute, -1, false, true) + cols.map((_, i) => cell(r.cells[i] ?? '—', i, false)).join('')).join('')}
</div>`)
}

export const quote: LayoutFn = (c, t, ctx) => {
  const q = c.quote ?? { text: c.body || c.title, attribution: '' }
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
<div style="position:absolute;right:${GRID.margin}px;top:160px;font-size:24px;font-weight:700;color:${t.muted};">${esc(c.title)}</div>
<div style="position:absolute;left:${GRID.margin}px;top:${TOP}px;font-family:${t.fonts.display};font-size:240px;line-height:0.6;color:${t.accent};">„</div>
<div style="position:absolute;right:${GRID.margin}px;top:400px;width:${GRID.span(10)}px;">
  <h1 style="font-size:${q.text.length > 120 ? 48 : 60}px;font-weight:500;line-height:1.3;">${esc(q.text)}</h1>
  <div style="margin:40px 0 24px;">${rule(t, 3, '64px', t.accent)}</div>
  <div style="font-size:24px;font-weight:700;">${esc(q.attribution)}</div>
  ${q.role ? `<div style="font-size:22px;margin-top:6px;color:${t.muted};">${esc(q.role)}</div>` : ''}
</div>`)
}

export const peopleGrid: LayoutFn = (c, t, ctx) => {
  const people = c.people.slice(0, 4)
  const four = people.length === 4
  const w = four ? GRID.span(3) : GRID.span(4)
  const photo = four ? 180 : 220
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
${heading(c, t)}
<div style="position:absolute;right:${GRID.margin}px;top:344px;display:flex;gap:${GRID.gutter}px;">
${people.map((p) => card(`
  ${p.imageUrl ? img(p.imageUrl, { width: `${photo}px`, height: `${photo}px`, radius: '50%', ring: `6px solid ${t.surface}`, position: 'center 20%' }) : `<div style="width:${photo}px;height:${photo}px;border-radius:50%;background:${t.surface};"></div>`}
  <h3 style="font-size:32px;line-height:1.15;margin-top:24px;">${esc(p.name)}</h3>
  ${p.handle ? `<div dir="ltr" style="font-size:22px;color:${t.muted};margin-top:6px;text-align:right;">${esc(p.handle)}</div>` : ''}
  ${p.metric ? `<div style="margin-top:24px;">${numeral(p.metric, t, 64)}</div><div style="font-size:22px;color:${t.muted};margin-top:6px;">${esc(p.metricLabel ?? '')}</div>` : ''}
  ${p.tags?.length ? `<div style="margin-top:20px;">${p.tags.map((tag) => pill(tag, t)).join('')}</div>` : ''}`, t, { width: `${w}px`, height: '640px', padding: 40 })).join('\n')}
</div>`)
}

export const imageGrid: LayoutFn = (c, t, ctx) => {
  const urls = [c.imageUrl, ...c.imageUrls].filter(Boolean).slice(0, 3)
  const w = urls.length === 2 ? GRID.span(6) : GRID.span(4)
  return slideDocument(t, `
${eyebrow(c.slideType, ctx.slideIndex, t)}
<div style="position:absolute;right:${GRID.margin}px;top:160px;width:${CONTENT_W}px;"><h1 style="font-size:40px;line-height:1.2;">${esc(c.title)}</h1></div>
<div style="position:absolute;right:${GRID.margin}px;top:280px;display:flex;gap:${GRID.gutter}px;">
${urls.map((u) => img(u, { width: `${w}px`, height: '640px', radius: t.radius })).join('')}
</div>
${c.body ? `<p style="position:absolute;right:${GRID.margin}px;top:952px;font-size:22px;color:${t.muted};">${esc(c.body)}</p>` : ''}`)
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/design/slide-layouts/layouts.test.ts`
Expected: PASS (17 layouts × 4 + 1). Every layout stays within four sizes even with a subtitle (28) present: secondary text is 28 everywhere, index numerals and people metrics share the title's 64. `people-grid`: title 64, subtitle 28, name 32, handle/label/pill/eyebrow 22, metric 64.

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/design/slide-layouts
git commit -m "feat(design): timeline, comparison, quote, people and image-grid layouts"
```

---

### Task 9: Layout selection and `renderSlide`

**Files:**
- Create: `src/lib/design/slide-layouts/index.ts`
- Test: `src/lib/design/slide-layouts/select.test.ts`

**Interfaces:**
- Consumes: `LAYOUTS`, `LINT_TYPE` (registry), `normalizeContent`, `wordCount` (content), `lintCanvaSafe`, `hebrewLabel`.
- Produces:
  ```ts
  export function selectLayout(c: SlideContent, ctx: SlideCtx): LayoutId
  export function imageSideFor(slideType: string): 'left' | 'right'
  export interface RenderResult { html: string; layout: LayoutId; violations: Violation[] }
  export function renderSlide(args: Record<string, unknown>, tokens: DeckTokens, ctx: SlideCtx, registry?: Record<LayoutId, LayoutFn>): RenderResult
  export type { SlideCtx, LayoutId } from './types'
  ```
  `renderSlide` never throws: a layout that throws falls back to `text-image`, and if that throws too, to a `statement` of the title. Violations are returned, not thrown.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/design/slide-layouts/select.test.ts
import { describe, it, expect } from 'vitest'
import { selectLayout, renderSlide, imageSideFor } from './index'
import { LAYOUTS } from './registry'
import { normalizeContent } from './content'
import { FIXTURES, SEACRET_TOKENS as T } from '../fixtures'
import type { LayoutId } from './types'

const ctx = { slideIndex: 3, slideCount: 18, brandName: 'SEACRET SPA' }
const pick = (args: Record<string, unknown>, prev?: LayoutId) => selectLayout(normalizeContent(args), { ...ctx, previousLayout: prev })
const IMG = 'https://x/a.jpg'

describe('selectLayout — the spec table', () => {
  const cases: Array<[string, Record<string, unknown>, LayoutId]> = [
    ['cover with image', { slideType: 'cover', title: 'x', imageUrl: IMG }, 'cover-cinematic'],
    ['cover without image', { slideType: 'cover', title: 'x' }, 'cover-split'],
    ['closing', { slideType: 'closing', title: 'x', imageUrl: IMG }, 'closing'],
    ['comparison', { slideType: 'competitive', title: 'x', comparison: { columns: ['a', 'b'], rows: [{ attribute: 'r', cells: ['1', '2'] }] } }, 'comparison'],
    ['quote', { slideType: 'insight', title: 'x', quote: { text: 'q', attribution: 'a' } }, 'quote'],
    ['people', { slideType: 'influencers', title: 'x', people: [{ name: 'n' }] }, 'people-grid'],
    ['steps', { slideType: 'strategy', title: 'x', steps: [{ title: 'a' }, { title: 'b' }] }, 'timeline'],
    ['timeline bullets', { slideType: 'timeline', title: 'x', bulletPoints: ['a', 'b', 'c'] }, 'timeline'],
    ['one stat', { slideType: 'metrics', title: 'x', keyNumber: '42%', keyNumberLabel: 'l' }, 'big-number'],
    ['three stats', { slideType: 'metrics', title: 'x', stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }, { value: '3', label: 'c' }] }, 'stat-row'],
    ['three cards', { slideType: 'strategy', title: 'x', cards: [{ title: 'a', body: '' }, { title: 'b', body: '' }, { title: 'c', body: '' }] }, 'pillars-3'],
    ['four cards', { slideType: 'deliverables', title: 'x', cards: [1, 2, 3, 4].map((i) => ({ title: `c${i}`, body: '' })) }, 'bento'],
    ['two cards + image', { slideType: 'creative', title: 'x', imageUrl: IMG, cards: [{ title: 'a', body: '' }, { title: 'b', body: '' }] }, 'bento'],
    ['image set, little text', { slideType: 'creative', title: 'x', imageUrls: [IMG, `${IMG}2`], bodyText: 'קצר' }, 'image-grid'],
    ['statement beat', { slideType: 'bigIdea', title: 'x', bodyText: 'משפט אחד' }, 'statement'],
    ['insight with long body is not a statement', { slideType: 'insight', title: 'x', imageUrl: IMG, bodyText: Array(45).fill('מילה').join(' ') }, 'text-image'],
    ['title only elsewhere', { slideType: 'strategy', title: 'x' }, 'divider'],
    ['agenda bullets', { slideType: 'brief', title: 'x', bulletPoints: ['a', 'b'] }, 'index-list'],
    ['many bullets no image', { slideType: 'goals', title: 'x', bulletPoints: ['a', 'b', 'c', 'd'] }, 'index-list'],
    ['image + body', { slideType: 'goals', title: 'x', imageUrl: IMG, bodyText: 'קצת טקסט' }, 'text-image'],
    ['long body, no image', { slideType: 'brief', title: 'x', bodyText: Array(70).fill('מילה').join(' ') }, 'text-two-col'],
    ['short body, no image', { slideType: 'goals', title: 'x', bodyText: 'קצת טקסט' }, 'text-image'],
  ]
  it.each(cases)('%s', (_n, args, expected) => { expect(pick(args)).toBe(expected) })
})

describe('selectLayout — rhythm', () => {
  it('never repeats a full-color beat', () => {
    expect(pick({ slideType: 'strategy', title: 'x' }, 'divider')).toBe('text-image')
    expect(pick({ slideType: 'bigIdea', title: 'x' }, 'statement')).toBe('text-image')
  })
  it('alternates pillars and bento when cards repeat', () => {
    const three = { slideType: 'strategy', title: 'x', cards: [{ title: 'a', body: '' }, { title: 'b', body: '' }, { title: 'c', body: '' }] }
    expect(pick(three, 'pillars-3')).toBe('bento')
  })
  it('lets text-image repeat, because it is the workhorse', () => {
    expect(pick({ slideType: 'goals', title: 'x', imageUrl: IMG, bodyText: 'y' }, 'text-image')).toBe('text-image')
  })
  it('flips the image side per section, deterministically', () => {
    expect(imageSideFor('brief')).toBe(imageSideFor('brief'))
    expect(imageSideFor('brief')).not.toBe(imageSideFor('goals'))
    expect(imageSideFor('pillar-2')).toBe(imageSideFor('pillar-1'))
  })
})

describe('renderSlide', () => {
  it('renders every fixture lint-clean through the public entry point', () => {
    for (const [id, c] of Object.entries(FIXTURES)) {
      const r = renderSlide({ ...c, bulletPoints: c.bullets, bodyText: c.body }, T, { ...ctx, slideCount: 18 })
      expect(r.violations, id).toEqual([])
      expect(r.html).toContain('<div class="slide"')
    }
  })
  it('falls back to text-image when a layout throws, and never throws itself', () => {
    const broken = { ...LAYOUTS, 'stat-row': () => { throw new Error('boom') } }
    const r = renderSlide({ slideType: 'metrics', title: 'x', stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }] }, T, ctx, broken)
    expect(r.layout).toBe('text-image')
    expect(r.html).toContain('<div class="slide"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/design/slide-layouts/select.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write `index.ts`**

```ts
// src/lib/design/slide-layouts/index.ts
/**
 * Public entry point of the renderer: content shape → layout → HTML.
 * The model never chooses a layout; the content it emitted does.
 */
import type { DeckTokens } from '../brand-tokens'
import { lintCanvaSafe, type Violation } from '../canva-safe'
import { normalizeContent, wordCount } from './content'
import { LAYOUTS, LINT_TYPE } from './registry'
import type { LayoutFn, LayoutId, SlideContent, SlideCtx } from './types'

export type { SlideCtx, LayoutId, SlideContent } from './types'

const STATEMENT_TYPES = ['bigidea', 'insight']
const AGENDA_TYPES = ['brief', 'deliverables']
const FULL_COLOR: LayoutId[] = ['divider', 'statement']
const ALTERNATE: Partial<Record<LayoutId, LayoutId>> = { 'pillars-3': 'bento', bento: 'pillars-3' }
const SECTION_ORDER = ['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'pillar', 'bigidea', 'creative', 'influencers', 'competitive', 'deliverables', 'timeline', 'metrics', 'results', 'closing']

const base = (slideType: string) => slideType.toLowerCase().replace(/[-_\s]*\d+$/, '')

/** Image side alternates by section (not by slide), so a section reads as one composition. */
export function imageSideFor(slideType: string): 'left' | 'right' {
  const i = SECTION_ORDER.indexOf(base(slideType))
  const idx = i >= 0 ? i : base(slideType).length
  return idx % 2 === 0 ? 'left' : 'right'
}

function firstChoice(c: SlideContent): LayoutId {
  const type = base(c.slideType)
  const images = [c.imageUrl, ...c.imageUrls].filter(Boolean).length
  const textOnly = !c.subtitle && !c.body && !c.bullets.length && !c.cards.length && !c.stats.length && !c.imageUrl
  if (type === 'cover') return c.imageUrl ? 'cover-cinematic' : 'cover-split'
  if (type === 'closing') return 'closing'
  if (c.comparison) return 'comparison'
  if (c.quote) return 'quote'
  if (c.people.length) return 'people-grid'
  if (c.steps.length >= 2) return 'timeline'
  if (c.stats.length === 1) return 'big-number'
  if (c.stats.length >= 2) return 'stat-row'
  if (c.cards.length === 3) return 'pillars-3'
  if (c.cards.length >= 4 || (c.cards.length === 2 && c.imageUrl)) return 'bento'
  if (images >= 2 && wordCount(c.body) <= 20 && !c.bullets.length && !c.cards.length) return 'image-grid'
  if (STATEMENT_TYPES.includes(type) && !c.bullets.length && !c.cards.length && wordCount(c.body) <= 40 && !c.imageUrl) return 'statement'
  if (textOnly) return 'divider'
  if ((c.bullets.length >= 4 && !c.imageUrl) || (AGENDA_TYPES.includes(type) && c.bullets.length)) return 'index-list'
  if (c.imageUrl) return 'text-image'
  if (wordCount(c.body) >= 60) return 'text-two-col'
  return 'text-image'
}

export function selectLayout(c: SlideContent, ctx: SlideCtx): LayoutId {
  const choice = firstChoice(c)
  if (ctx.previousLayout !== choice) return choice
  if (FULL_COLOR.includes(choice)) return 'text-image'
  return ALTERNATE[choice] ?? choice
}

export interface RenderResult { html: string; layout: LayoutId; violations: Violation[] }

export function renderSlide(args: Record<string, unknown>, tokens: DeckTokens, ctx: SlideCtx, registry: Record<LayoutId, LayoutFn> = LAYOUTS): RenderResult {
  const c = normalizeContent(args)
  const fullCtx: SlideCtx = { ...ctx, imageSide: ctx.imageSide ?? imageSideFor(c.slideType) }
  const attempt = (id: LayoutId): RenderResult | null => {
    try {
      const html = registry[id](c, tokens, fullCtx)
      return { html, layout: id, violations: lintCanvaSafe(html, { slideType: LINT_TYPE(id, c) }) }
    } catch (e) {
      console.warn(`[renderSlide] layout ${id} threw on slide ${ctx.slideIndex}:`, e instanceof Error ? e.message : e)
      return null
    }
  }
  const chosen = selectLayout(c, fullCtx)
  return attempt(chosen) ?? attempt('text-image') ?? attempt('statement') ?? {
    html: `<!DOCTYPE html><html lang="he" dir="rtl"><body><div class="slide"><h1>${c.title}</h1></div></body></html>`,
    layout: 'statement',
    violations: [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/design/slide-layouts/select.test.ts`
Expected: PASS (22 table cases + 4 rhythm + 2 render). If `insight with long body` picks `statement`, the `!c.imageUrl` guard is missing.

- [ ] **Step 5: Full suite, type-check, commit**

Run: `npm test` then `npx tsc --noEmit`
Expected: all green (94 existing + new).

```bash
git add src/lib/design/slide-layouts
git commit -m "feat(design): content-shape layout selection, rhythm rules and renderSlide"
```

---
### Task 10: Agent contract — content shapes in, no colors out

**Files:**
- Create: `src/lib/gemini/slide-tool.ts` (the `generate_slide_html` declaration + image-URL collector, extracted so it can be unit-tested without loading the agent's SDK imports)
- Modify: `src/lib/gemini/presentation-agent.ts` — the tools array that contains `name: 'generate_slide_html'` (search for it; the declaration spans from that line to the closing `},` after `required: ['slideType', 'title', 'designColors']`), `AgentInput`, the persona pick (`const persona = pickPersona(input.brandName)`), the two `renderAgentSlide(` call sites, the provenance gate in the `generate_slide_html` handler.
- Test: `src/lib/gemini/slide-tool.test.ts`

**Interfaces:**
- Consumes: `renderSlide`, `SlideCtx`, `LayoutId` (Task 9); `DeckTokens` (Task 3); `isAllowedImageUrl(url, allowed)` already exported by `presentation-agent.ts`.
- Produces:
  ```ts
  // slide-tool.ts
  export function slideToolDeclaration(opts: { designColors: boolean }): FunctionDeclaration   // @google/genai type, same shape the array already uses
  export function collectImageUrls(args: Record<string, unknown>): string[]   // imageUrl + imageUrls[] + people[].imageUrl, trimmed, deduped
  // presentation-agent.ts
  export interface AgentInput { /* existing */ tokens?: DeckTokens }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gemini/slide-tool.test.ts
import { describe, it, expect } from 'vitest'
import { slideToolDeclaration, collectImageUrls } from './slide-tool'

describe('slideToolDeclaration', () => {
  it('v2: content shapes only, no designColors', () => {
    const d = slideToolDeclaration({ designColors: false })
    const props = Object.keys(d.parameters!.properties!)
    expect(props).not.toContain('designColors')
    for (const k of ['stats', 'people', 'steps', 'quote', 'comparison', 'imageUrls', 'cards', 'bulletPoints', 'keyNumber', 'imageUrl']) expect(props).toContain(k)
    expect(d.parameters!.required).toEqual(['slideType', 'title'])
    expect(d.description).toMatch(/צבעים|פריסה/)
  })
  it('v1: keeps designColors required for the old renderer', () => {
    const d = slideToolDeclaration({ designColors: true })
    expect(Object.keys(d.parameters!.properties!)).toContain('designColors')
    expect(d.parameters!.required).toContain('designColors')
  })
})

describe('collectImageUrls', () => {
  it('gathers every image the slide would show', () => {
    expect(collectImageUrls({ imageUrl: ' https://a/1.jpg ', imageUrls: ['https://a/2.jpg', 'https://a/1.jpg'], people: [{ name: 'x', imageUrl: 'https://a/3.jpg' }, { name: 'y' }] }))
      .toEqual(['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'])
    expect(collectImageUrls({ title: 'x' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gemini/slide-tool.test.ts`
Expected: FAIL — cannot resolve `./slide-tool`.

- [ ] **Step 3: Write `slide-tool.ts`**

```ts
// src/lib/gemini/slide-tool.ts
/**
 * The generate_slide_html contract. v2 (tokens present) removes designColors —
 * the renderer owns colors, fonts and layout — and adds structured content
 * shapes the layout library keys on. v1 keeps the old shape until it is deleted.
 */
import type { FunctionDeclaration } from '@google/genai'

const s = (description?: string) => ({ type: 'string' as const, ...(description ? { description } : {}) })
const arr = (items: unknown, description?: string) => ({ type: 'array' as const, items, ...(description ? { description } : {}) })
const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: 'object' as const, properties, ...(required ? { required } : {}) })

export function slideToolDeclaration(opts: { designColors: boolean }): FunctionDeclaration {
  const properties: Record<string, unknown> = {
    slideType: s(
      "Slide beat, lowercase-kebab. First slide 'cover', last 'closing'. " +
        'Suggested beats: cover, brief, goals, audience, insight, strategy, pillar-1, pillar-2, pillar-3, bigIdea, creative, deliverables, influencers, competitive, timeline, metrics, closing. ' +
        'Emit as many slides as the story needs (typically 14-22).',
    ),
    title: s('Hebrew title, max 8 words'),
    subtitle: s('Hebrew subtitle, max 12 words'),
    bodyText: s('Hebrew body, max 40 words'),
    bulletPoints: arr(s(), 'Max 7 bullets, 8 words each'),
    cards: arr(obj({ title: s(), body: s() }, ['title', 'body']), 'Max 5 cards. 3 → pillars, 4-5 → bento'),
    stats: arr(obj({ value: s('e.g. "2.5%", "×2", "₪150K"'), label: s('Hebrew'), context: s('Hebrew, optional') }, ['value', 'label']), 'Max 4. One stat → hero number, 2-4 → stat row'),
    keyNumber: s('Alias for a single stat value'),
    keyNumberLabel: s(),
    people: arr(obj({ name: s(), handle: s(), imageUrl: s('Profile photo URL from search_influencers only'), metric: s('e.g. "184K"'), metricLabel: s('Hebrew'), tags: arr(s()) }, ['name']), 'Influencer cards, max 4. Real names/handles from search_influencers only'),
    steps: arr(obj({ label: s('date/phase, optional'), title: s(), body: s() }, ['title']), 'Timeline / process, 2-6 steps'),
    quote: obj({ text: s(), attribution: s(), role: s() }, ['text', 'attribution']),
    comparison: obj({ columns: arr(s()), rows: arr(obj({ attribute: s(), cells: arr(s()) }, ['attribute', 'cells'])), highlightColumn: { type: 'number' } }, ['columns', 'rows']),
    imageUrl: s('Main image URL (ייחודי לכל שקף) — only URLs returned by generate_brand_image / the offered pool'),
    imageUrls: arr(s(), 'Extra images for a grid (max 3 total), same provenance rule'),
    emotionalTone: s(),
  }
  const required = ['slideType', 'title']
  if (opts.designColors) {
    properties.designColors = obj({ primary: s(), secondary: s(), accent: s(), background: s(), text: s() }, ['primary', 'background', 'text'])
    required.push('designColors')
  }
  return {
    name: 'generate_slide_html',
    description:
      'יוצר שקף בודד מתוכן מובנה. אתה מספק תוכן בלבד: title, bodyText, bullets, cards, stats, people, steps, quote, comparison, imageUrl/imageUrls. ' +
      (opts.designColors ? 'designColors חובה. ' : 'צבעים, פונטים ופריסה נקבעים על ידי המערכת מהמותג — אל תנסה לעצב. ') +
      'ערכים אמיתיים בלבד — אין @@/TBD/placeholder/שם או handle חלקי. ' +
      'imageUrl של מוצר = המוצר האמיתי של הלקוח. שקף תוכן חייב לפחות רכיב תוכן אחד. ' +
      'צורת התוכן קובעת את הפריסה: סטט אחד = מספר ענק, 3 כרטיסים = עמודי תווך, people = רשת משפיענים, steps = ציר זמן.',
    parameters: obj(properties, required),
  } as unknown as FunctionDeclaration
}

/** Every image URL a slide would show — the provenance gate must see all of them. */
export function collectImageUrls(args: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (v: unknown) => { if (typeof v === 'string' && v.trim() && !out.includes(v.trim())) out.push(v.trim()) }
  push(args.imageUrl)
  if (Array.isArray(args.imageUrls)) args.imageUrls.forEach(push)
  if (Array.isArray(args.people)) args.people.forEach((p) => push((p as Record<string, unknown>)?.imageUrl))
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gemini/slide-tool.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `presentation-agent.ts`**

1. Imports: add `import { slideToolDeclaration, collectImageUrls } from './slide-tool'`, `import { renderSlide, type LayoutId } from '@/lib/design/slide-layouts'`, `import type { DeckTokens } from '@/lib/design/brand-tokens'`.
2. `AgentInput`: add
   ```ts
   /** v2 renderer: deck tokens derived from brand signals. Absent → the v1 persona renderer. */
   tokens?: DeckTokens
   ```
3. Replace the whole `generate_slide_html` object literal in the tools array with `slideToolDeclaration({ designColors: !input.tokens })`. The array is a module-level const, so turn it into a function: rename the const to `function buildAgentTools(input: AgentInput) { return [ ...the same elements..., slideToolDeclaration({ designColors: !input.tokens }), ... ] }` and, where the config passes `functionDeclarations`, call `buildAgentTools(input)` once at the top of the run and reuse it.
4. After `const persona = pickPersona(input.brandName)` add:
   ```ts
   let previousLayout: LayoutId | undefined = input.resumeFrom?.previousLayout as LayoutId | undefined
   const renderAny = (args: Record<string, unknown>, slideIndex: number): string => {
     if (!input.tokens) return renderAgentSlide(args, { persona, slideIndex, brandName: input.brandName })
     const r = renderSlide(args, input.tokens, { slideIndex, slideCount: Math.max(slideTypes.length, 16), brandName: input.brandName, logoUrl: input.clientLogoUrl, previousLayout })
     previousLayout = r.layout
     if (r.violations.length) console.warn(`[PresentationAgent][${requestId}] [canva-safe] slide ${slideIndex + 1} ${r.layout}: ${r.violations.map((v) => `${v.rule} (${v.detail})`).join('; ')}`)
     return r.html
   }
   ```
   and add `previousLayout?: string` to `AgentCheckpoint`; include `previousLayout` wherever a checkpoint object is built (search `imageUse: Array.from(imageUse` — both the periodic and the deadline checkpoint builders).
5. Both call sites: `const html = renderAgentSlide(args, { persona, slideIndex, brandName: input.brandName })` → `const html = renderAny(args, slideIndex)`; the repair-path call (`renderAgentSlide(args, { persona, slideIndex: idx >= 0 ? idx : slides.length, ... })`) → `renderAny(args, idx >= 0 ? idx : slides.length)`.
6. Provenance gate: where the handler validates `imgUrl` with `isAllowedImageUrl`, validate every URL from `collectImageUrls(args)` with the same check and the same rejection `result` (message unchanged, plus `offending: url`). The narrative-image and variety gates keep using `imgUrl` (the main image) only.
7. Log line after the persona log: `console.log(`[PresentationAgent][${requestId}] 🎨 Renderer: ${input.tokens ? `v2 ${input.tokens.archetype}` : `v1 ${persona}`}`)`.

- [ ] **Step 6: Type-check, full suite, commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean and green. Nothing in prod changes yet: no caller passes `tokens`, so `designColors` stays required and `renderAgentSlide` still runs.

```bash
git add src/lib/gemini/slide-tool.ts src/lib/gemini/slide-tool.test.ts src/lib/gemini/presentation-agent.ts
git commit -m "feat(agent): structured content shapes; renderer v2 path behind AgentInput.tokens"
```

---

### Task 11: generate-full — derive tokens once, switch renderers, seed the design system

**Files:**
- Create: `src/lib/design/renderer-flag.ts`
- Modify: `src/lib/design/brand-tokens.ts` (add `designSystemFromTokens`), `src/app/api/generate-full/route.ts` (after the brand-asset acquisition block, before `const agentInput: AgentInput = {`), `src/lib/gemini/presentation-agent.ts` (the `if (!designSystem)` default block)
- Test: `src/lib/design/renderer-flag.test.ts`, one case added to `src/lib/design/brand-tokens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // renderer-flag.ts
  export type RendererId = 'v1' | 'v2'
  export function pickRenderer(docOverride: unknown, envValue: string | undefined): RendererId   // doc wins, then env, else 'v1'
  // brand-tokens.ts
  export function designSystemFromTokens(t: DeckTokens): { colors: Record<string, string>; fonts: { heading: string; body: string } }
  ```
- Document data written: `_deckTokens: DeckTokens`, read: `_renderer?: 'v1' | 'v2'`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/design/renderer-flag.test.ts
import { describe, it, expect } from 'vitest'
import { pickRenderer } from './renderer-flag'

describe('pickRenderer', () => {
  it('defaults to v1', () => { expect(pickRenderer(undefined, undefined)).toBe('v1') })
  it('reads the env flag', () => { expect(pickRenderer(undefined, 'v2')).toBe('v2'); expect(pickRenderer(undefined, 'v2\n')).toBe('v2') })
  it('lets the document override the env in both directions', () => {
    expect(pickRenderer('v2', undefined)).toBe('v2')
    expect(pickRenderer('v1', 'v2')).toBe('v1')
    expect(pickRenderer('nonsense', 'v2')).toBe('v2')
  })
})
```

```ts
// append to src/lib/design/brand-tokens.test.ts
import { designSystemFromTokens } from './brand-tokens'
describe('designSystemFromTokens', () => {
  it('hands the image generator and exporters the same palette the slides use', () => {
    const t = buildTokens(seacret)
    const ds = designSystemFromTokens(t)
    expect(ds.colors).toMatchObject({ primary: t.accent, accent: t.accent, background: t.paper, text: t.ink, cardBg: t.surface, muted: t.muted })
    expect(ds.fonts.heading).toBe('Frank Ruhl Libre')
    expect(ds.fonts.body).toBe('Heebo')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/design/renderer-flag.test.ts src/lib/design/brand-tokens.test.ts`
Expected: FAIL — `./renderer-flag` missing; `designSystemFromTokens` not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/design/renderer-flag.ts
export type RendererId = 'v1' | 'v2'
const VALID: RendererId[] = ['v1', 'v2']
const norm = (v: unknown): RendererId | null => (typeof v === 'string' && VALID.includes(v.trim() as RendererId) ? (v.trim() as RendererId) : null)
/** Per-document override beats the env flag (so one demo can be produced both ways); default v1 until acceptance. */
export function pickRenderer(docOverride: unknown, envValue: string | undefined): RendererId {
  return norm(docOverride) ?? norm(envValue) ?? 'v1'
}
```

```ts
// add to src/lib/design/brand-tokens.ts
const family = (stack: string) => stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
/** The subset of PremiumDesignSystem that scene-generator's paletteHint and the exporters read. */
export function designSystemFromTokens(t: DeckTokens): { colors: Record<string, string>; fonts: { heading: string; body: string } } {
  return {
    colors: { primary: t.accent, secondary: t.accentDark, accent: t.accent, background: t.paper, text: t.ink, cardBg: t.surface, cardBorder: t.rule, muted: t.muted, highlight: t.accentText, gradientStart: t.paper, gradientEnd: t.surface, auroraA: t.accentTint, auroraB: t.surface, auroraC: t.paper },
    fonts: { heading: family(t.fonts.display), body: family(t.fonts.body) },
  }
}
```

In `src/app/api/generate-full/route.ts`, after the brand-asset acquisition block and before `const agentInput: AgentInput = {`:

```ts
    // ── Renderer selection + deck tokens (v2) ──
    // Tokens are derived ONCE per deck from real brand signals and persisted,
    // so a resumed run needs no network and regenerates the same look.
    const { pickRenderer } = await import('@/lib/design/renderer-flag')
    const renderer = pickRenderer(data._renderer, process.env.DECK_RENDERER)
    let tokens = data._deckTokens as DeckTokens | undefined
    if (renderer === 'v2' && (!tokens || fresh)) {
      const { deriveDeckTokens } = await import('@/lib/design/brand-signals')
      tokens = await deriveDeckTokens({
        brandName,
        briefText: [(data._briefText as string) || (data.brandBrief as string) || '', (data._kickoffText as string) || ''].join('\n'),
        brandAssets,
        scraped: data._scraped as { colorPalette?: string[] } | undefined,
      })
      await supabase.from('documents').update({ data: { ...data, _deckTokens: tokens }, updated_at: new Date().toISOString() }).eq('id', documentId)
      data._deckTokens = tokens
      console.log(`[${requestId}] 🎨 Deck tokens (${tokens.archetype}):\n  ${tokens.provenance.join('\n  ')}`)
    }
    console.log(`[${requestId}] 🎨 Renderer: ${renderer}`)
```

and in `agentInput`: `tokens: renderer === 'v2' ? tokens : undefined,` (add `import type { DeckTokens } from '@/lib/design/brand-tokens'` at the top). Every later `supabase.from('documents').update({ data: { ...data, ... } })` in this route spreads `data`, so `_deckTokens` survives the checkpoint/complete writes.

In `presentation-agent.ts`, the `if (!designSystem) { designSystem = { colors: {...}, ... } }` default block becomes:

```ts
  if (!designSystem) {
    const seeded = input.tokens ? designSystemFromTokens(input.tokens) : null
    designSystem = {
      colors: seeded?.colors ?? { primary: '#E94560', secondary: '#1A1A2E', accent: '#E94560', background: '#0C0C10', text: '#F5F5F7', cardBg: 'rgba(255,255,255,0.05)', muted: 'rgba(245,245,247,0.5)' },
      typography: { headingSize: 64, bodySize: 28 },
      effects: { borderRadius: 'soft', borderRadiusValue: input.tokens?.radius ?? 16, shadowStyle: 'none', decorativeStyle: 'minimal' },
      fonts: seeded?.fonts ?? { heading: 'Heebo', body: 'Heebo' },
      direction: 'rtl',
    } as PremiumDesignSystem
  }
```
(import `designSystemFromTokens` from `@/lib/design/brand-tokens`). Additionally, when `input.tokens` is set, override whatever the model returned: right after that block add `if (input.tokens) designSystem = { ...designSystem, ...designSystemFromTokens(input.tokens) } as PremiumDesignSystem` so the audit and every consumer see the token palette.

- [ ] **Step 4: Run tests, type-check, commit**

Run: `npx vitest run src/lib/design && npx tsc --noEmit && npm test`
Expected: green.

```bash
git add src/lib/design/renderer-flag.ts src/lib/design/renderer-flag.test.ts src/lib/design/brand-tokens.ts src/lib/design/brand-tokens.test.ts src/app/api/generate-full/route.ts src/lib/gemini/presentation-agent.ts
git commit -m "feat(deck): derive and persist deck tokens; DECK_RENDERER / _renderer switch (default v1)"
```

---
### Task 12: The measured gate — layout gallery to Canva, plus the html-import case

**Files:**
- Create: `scripts/render-layout-gallery.ts`
- Modify: `src/lib/canva/html-import.test.ts` (add one `describe`)

**Interfaces:**
- Consumes: `LAYOUTS` (registry), `FIXTURES`, `SEACRET_TOKENS`, `buildTokens` (Task 3), `buildCanvaImportHtml` from `@/lib/canva/html-import`, `uploadAndSignedUrl` from `@/lib/render/storage`, `importDesignFromUrl` / `waitForUrlImport` from `@/lib/canva/client`, `lintCanvaSafe`.
- Produces: a Canva design with 17 pages (one per layout) and a local HTML copy for side-by-side comparison. Nothing in `src/` changes.

- [ ] **Step 1: Add the v2 deck case to `html-import.test.ts`**

```ts
import { renderSlide } from '@/lib/design/slide-layouts'
import { FIXTURES, SEACRET_TOKENS } from '@/lib/design/fixtures'

describe('buildCanvaImportHtml — v2 renderer output', () => {
  it('imports a v2 deck as one page per slide with scoped styles and one font link', () => {
    const ids = ['cover-cinematic', 'text-image', 'stat-row'] as const
    const htmlSlides = ids.map((id, i) => renderSlide({ ...FIXTURES[id], bulletPoints: FIXTURES[id].bullets, bodyText: FIXTURES[id].body }, SEACRET_TOKENS, { slideIndex: i, slideCount: 3, brandName: 'SEACRET SPA' }).html)
    const out = buildCanvaImportHtml({ htmlSlides, slideTypes: ids.map((id) => FIXTURES[id].slideType), brandName: 'SEACRET SPA' })
    expect(out.pages).toBe(3)
    expect(out.fontLinks).toBe(1)
    expect((out.html.match(/data-document-role="page"/g) || []).length).toBe(3)
    expect(out.html).toMatch(/#p2 \.slide\{/)
    expect(out.html).not.toMatch(/<script/)
  })
})
```

Run: `npx vitest run src/lib/canva/html-import.test.ts`
Expected: PASS (12 tests). If `fontLinks` is 3, the hoisting dedupes by exact href — every v2 slide of one deck shares `fonts.fontsQuery`, so this points at a stray query difference.

- [ ] **Step 2: Write the gallery script**

```ts
// scripts/render-layout-gallery.ts
/**
 * The "measure first" gate: render every layout with real tokens, import to
 * Canva as one design, print the edit URL, and keep a local HTML copy so the
 * pages can be compared side by side (Chrome vs Canva thumbnails).
 *
 * Usage (from repo root):
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/render-layout-gallery.ts [--archetype editorial-luxury|cinematic-dark|bold-flat|soft-warm] [--no-canva]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { LAYOUTS } from '@/lib/design/slide-layouts/registry'
import { renderSlide } from '@/lib/design/slide-layouts'
import { FIXTURES, SEACRET_TOKENS } from '@/lib/design/fixtures'
import { buildTokens, type Archetype, type DeckTokens } from '@/lib/design/brand-tokens'
import { buildCanvaImportHtml } from '@/lib/canva/html-import'
import type { LayoutId } from '@/lib/design/slide-layouts/types'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const BRIEF_FOR: Record<Archetype, string> = { 'editorial-luxury': 'ספא', 'cinematic-dark': 'אופנה', 'bold-flat': 'fintech', 'soft-warm': 'ילדים' }
const ACCENT_FOR: Record<Archetype, string> = { 'editorial-luxury': '#604830', 'cinematic-dark': '#c9a227', 'bold-flat': '#2b5cff', 'soft-warm': '#e07a5f' }

async function main() {
  const archetype = (arg('--archetype') as Archetype | undefined) ?? 'editorial-luxury'
  const tokens: DeckTokens = archetype === 'editorial-luxury' ? SEACRET_TOKENS : buildTokens({
    brandName: 'SEACRET SPA', briefText: BRIEF_FOR[archetype], candidates: [{ hex: ACCENT_FOR[archetype], weight: 3, source: 'declared' }], logoAchromatic: true, siteColors: [],
  })
  const ids = Object.keys(LAYOUTS) as LayoutId[]
  const htmlSlides: string[] = []
  const slideTypes: string[] = []
  ids.forEach((id, i) => {
    const c = FIXTURES[id]
    // Force the layout under test: the selector would pick by shape, the gallery wants every layout once.
    const html = LAYOUTS[id](c, tokens, { slideIndex: i, slideCount: ids.length, brandName: 'SEACRET SPA' })
    const check = renderSlide({ ...c, bulletPoints: c.bullets, bodyText: c.body }, tokens, { slideIndex: i, slideCount: ids.length, brandName: 'SEACRET SPA' })
    if (check.violations.length) console.warn(`[gallery] ${id}: ${check.violations.map((v) => v.rule).join(', ')}`)
    htmlSlides.push(html)
    slideTypes.push(id)
  })
  const { html, pages } = buildCanvaImportHtml({ htmlSlides, slideTypes, brandName: `Layout gallery — ${archetype}` })
  const outDir = `${process.env.SCRATCH_DIR || '/tmp'}/layout-gallery`
  mkdirSync(outDir, { recursive: true })
  const local = `${outDir}/${archetype}-${Date.now()}.html`
  writeFileSync(local, html)
  console.log(`[gallery] ${pages} pages, ${archetype}, local copy: ${local}`)
  console.log(`[gallery] tokens:\n  ${tokens.provenance.join('\n  ')}`)
  if (process.argv.includes('--no-canva')) return

  const { uploadAndSignedUrl } = await import('@/lib/render/storage')
  const { importDesignFromUrl, waitForUrlImport } = await import('@/lib/canva/client')
  const { signedUrl } = await uploadAndSignedUrl({ path: `spikes/layout-gallery/${archetype}-${Date.now()}.html`, body: Buffer.from(html), contentType: 'text/html' })
  const { jobId } = await importDesignFromUrl({ title: `Layout gallery — ${archetype}`, url: signedUrl, mimeType: 'text/html' })
  const result = await waitForUrlImport(jobId)
  console.log(`[gallery] Canva design ${result.designId}\n  edit: ${result.editUrl}\n  view: ${result.viewUrl}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run it locally without Canva, then with**

```bash
set -a; source .env.local; set +a
export SCRATCH_DIR=/private/tmp/claude-501/-Users-idosegev-Downloads-TriRoars-Leaders-leaders-platform/8698d651-09c9-4681-9aba-dfddcba9db2c/scratchpad
npx tsx scripts/render-layout-gallery.ts --no-canva        # expect: "17 pages", zero [gallery] warnings
open "$SCRATCH_DIR"/layout-gallery/editorial-luxury-*.html  # eyeball in Chrome: 17 sections, RTL, fonts loaded
npx tsx scripts/render-layout-gallery.ts                    # expect: a Canva edit URL
npx tsx scripts/render-layout-gallery.ts --archetype cinematic-dark
```

If `tsx` cannot resolve `@/…`, add `--tsconfig tsconfig.json` (tsx reads `paths` from it).

- [ ] **Step 4: Acceptance review (manual, the gate the user chose)**

Read both designs back page by page (Canva MCP `read-design` with `thumbnails` for pages 1–17, or open the edit URL) and compare against the local HTML in Chrome. Record the result as a table in `docs/superpowers/plans/2026-09-07-layout-gallery-acceptance.md`: one row per layout — `renders | text editable | differences`. Pass criteria: every page present in order; every text run editable; no difference beyond the known matrix (fonts, gradients, radius on img, clip-path, grid, rotate, borders ≥2px, translucent fills, offset-rect shadow). Any other difference → fix the primitive or ban the effect in `canva-safe.ts`, re-run this task. Do not proceed to Task 13's flip until both archetypes pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-layout-gallery.ts src/lib/canva/html-import.test.ts docs/superpowers/plans/2026-09-07-layout-gallery-acceptance.md
git commit -m "test(deck): layout gallery to Canva — the measured gate for the v2 renderer"
```

---

### Task 13: Documentation and rollout

**Files:**
- Modify: `CLAUDE.md` (start-here section), `docs/superpowers/specs/2026-09-07-brand-adaptive-slide-renderer-design.md` (status line)

- [ ] **Step 1: CLAUDE.md — add under "Current state"**

```markdown
- **Renderer v2 (brand-adaptive, Canva-safe) is built behind `DECK_RENDERER`** (`v1` default; per-document override `data._renderer`). Tokens live at `documents.data._deckTokens` with a `provenance[]` explaining every choice; `_deckTokens` is derived once and reused on resume (`fresh:true` re-derives). Layout is chosen from the content shape (`src/lib/design/slide-layouts/index.ts`), never by the model; `lintCanvaSafe` warns in logs as `[canva-safe]`. Gallery: `npx tsx scripts/render-layout-gallery.ts` (see the script header). Design spec: `docs/superpowers/specs/2026-09-07-brand-adaptive-slide-renderer-design.md`.
```

and under "If something's off, check in this order" add item 5: `documents.data._deckTokens.provenance` — explains why a deck got its palette/archetype; `_renderer` / `DECK_RENDERER` say which renderer produced it.

- [ ] **Step 2: Produce the SEACRET demo both ways (manual)**

```bash
node scripts/seed-demo-kickoff.mjs                       # → {formId, salesforceRef}; fire kickoff-deck/run as in CLAUDE.md → deck A (v1)
# then, on the deck document created for the form, set the override and regenerate:
# PATCH documents/<deckId> data: { ..., "_renderer": "v2", "_htmlPresentation": null, "_generationCheckpoint": null }
# publish generate-full with a FRESH dedup id ({"documentId": "<deckId>", "useBlueprint": true, "fresh": true, "autoFinalize": true})
```
Compare deck A and deck B in Canva (`_canva.mode` must be `html-import` on both). The content gate, image gates and critique loop are shared, so the only difference is the renderer.

- [ ] **Step 3: Flip prod (manual, after the user approves the comparison)**

```bash
printf %s v2 | vercel env add DECK_RENDERER production      # printf, never echo — trailing newline breaks values
vercel --prod --yes
```
Update the spec's status line to "implemented; v2 default since <date>". After two clean unattended prod decks, open a follow-up task to delete `src/lib/gemini/slide-personas.ts`, `pickPersona`, the `designColors: true` branch of `slideToolDeclaration`, and `renderAgentSlide` calls.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-07-brand-adaptive-slide-renderer-design.md
git commit -m "docs(deck): renderer v2 flag, tokens provenance, gallery workflow"
```

---

## Self-review — spec coverage

| Spec section | Task |
|---|---|
| C1 token engine: chain, merge, category default, archetype rules, tinted neutrals, contrast guarantees, provenance | 3, 4 |
| C1 persistence at `_deckTokens`, resume reuse, `fresh` re-derive, `designSystem` seeded from tokens | 11 |
| C2 layouts (17), selection table, rhythm rules, image side per section, shared primitives, type scale | 5, 6, 7, 8, 9 |
| C3 Canva-safe lint: banned effects, wrapper-clips-img, fonts, Latin-only fonts, size count, eyebrow count; tests fail / prod warns / gallery reports | 2, 9, 10, 12 |
| C4 agent contract: `designColors` removed (v2), shapes added, provenance over every image URL, existing gates untouched | 10 |
| C5 integration: `DECK_RENDERER` + `_renderer`, no change to critique/repair/renumber/html-import | 11, 12 (html-import test) |
| Error handling: best-effort signals, layout fallback chain, warnings not failures | 4, 9, 10 |
| Testing incl. acceptance gallery | every task; 12 |
| Rollout | 13 |

Deliberately not in this plan (spec "out of scope"): deleting v1 (`slide-personas.ts`) — a follow-up after two clean prod decks; VLM visual critique; Canva autofill; PPTX fallback changes.
