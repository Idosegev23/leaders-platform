# Brand-Adaptive Slide Renderer — Design Spec

Date: 2026-09-07. Status: draft for review (not yet approved, not yet committed to an implementation plan).
Scope: replace `src/lib/gemini/slide-personas.ts` (the local renderer that turns the agent's structured slide arguments into slide HTML) with a deterministic, brand-adaptive, Canva-safe renderer. The agent, the critique loop, the export path and the pipeline hops stay as they are.

## Problem

The decks the pipeline now produces pass the content gate but look generic. Three causes, all in the renderer layer:

1. **Colors come from the model, per slide.** `generate_slide_html` requires a `designColors` object, so every slide's palette is whatever Gemini typed that turn. Nothing ties it to the client's real brand signals (`_brandAssets`, `_scraped`), and drift between slides is built in.
2. **The visual system is a hash.** `pickPersona(brandName)` picks one of four looks from a string hash. SEACRET SPA gets `cinematic-dark` because of its letters, not because of its brand.
3. **The CSS vocabulary is the wrong one for Canva.** The current cards use `box-shadow`, `1px` borders and circular avatars via a clipped wrapper. Measured on 2026-09-07 (probe `DAHUfoIodjo`, 16 pages; sampler `DAHUfgBVkXw`, 8 pages): Canva's HTML import drops all three. The premium effects we ship are exactly the ones that vanish.

## Verified anchors

**Canva HTML import (measured).** Survives: linear/radial gradients, `border-radius` on divs and directly on `<img>`, gradient text, `clip-path` on `<img>`, CSS grid, inline SVG, Google fonts incl. Frank Ruhl Libre, `text-wrap:balance`, `transform:rotate`, borders ≥2px, semi-transparent fills, `object-fit:cover` (the circle crop on the sampler was a true circle from a 16:9 source), an offset solid rectangle as a fake shadow, pill-shaped eyebrows. Dropped: `box-shadow` (soft and hard), `backdrop-filter`, `1px` lines, `text-shadow`, inset highlights, `border-radius` on a wrapper clipping an `<img>`. Unverified, therefore banned until probed: `filter`, `mix-blend-mode`.

**Fonts.** Of `ALLOWED_HEBREW_FONTS`, Anton and IBM Plex Mono carry no Hebrew glyphs. They are legal only for digits, units, Latin brand names and index numerals.

**Brand signals available before the agent runs** (all already on `documents.data` after the acquire step in `generate-full`): `_brandAssets.logo.url`, `_brandAssets.productImages[].url`, `_brandAssets.sceneImages[].url`, `_scraped.colorPalette` / `primaryColor` (from `extractColorsFromHTML`), `_scraped.heroImages`, the brand name, the brief text. Measured on SEACRET: the scraped palette is all grays (the site's CSS is monochrome and `isBoringColor` only drops near-white/near-black), the logo is a single `#181818`, and the hero photos yield warm tans (`#604830`, `#786048`). No single signal is reliable; a chain is.

**Research** (`scratchpad/research-premium-slide-components.md`, 27 fetched sources): a 12-column 1920×1080 grid (120px side margins, 24px gutters), 17 layout archetypes that fit our slide types, a Hebrew-first type scale, and 13 checkable premium-vs-slop rules. Hebrew has no capitals, so eyebrows get weight, a pill, accent color and 0.04–0.08em tracking instead of uppercase; italics are never used for emphasis.

## Decisions

- **The model never writes CSS or picks colors.** It emits content shapes; the renderer owns every pixel. `designColors` leaves the tool schema.
- **Brand selects the archetype, deterministically.** Four archetypes remain (`editorial-luxury`, `cinematic-dark`, `bold-flat`, `soft-warm`) but the choice is a function of brand signals with the name hash only as a tie-break. Same inputs → same deck.
- **Canva-safe is a hard vocabulary, enforced by a lint**, not a guideline.
- **Everything stays editable in Canva.** No effect that would require rasterizing text. Depth comes from typography, grid, flat color, clip-path, rotation and the offset-rectangle shadow.
- **Measure before switching.** A gallery deck of every layout with SEACRET tokens is imported to Canva and compared against a local render before the new renderer becomes the default.

## Components

### C1. Brand token engine — `src/lib/design/brand-tokens.ts`

`deriveDeckTokens(input): Promise<DeckTokens>` where `input = { brandName, briefText, brandAssets?, scraped? }`.

Candidate colors, in order of trust, each tagged with its source:
1. Scraper "declared" colors: `theme-color`, `msapplication-TileColor`, `--primary/--brand/--accent` vars (weight 3).
2. Logo pixels via `sharp` (already a dependency, already used server-side in `image-compositor.ts`): resize to 48px, ignore alpha < 128, quantize to 24 levels, keep colors with saturation ≥ 0.25 and luminance in 0.12–0.92 (weight 2). An achromatic logo (SEACRET) contributes nothing and is recorded as such.
3. Product/scene/hero images, max 3, 5s fetch timeout each, same extraction (weight 1).
4. The rest of the scraped palette, chromatic only (weight 1).

Selection: `accent` = highest total weight among chromatic candidates after merging near-duplicates (ΔE-lite: RGB distance < 40). If no chromatic candidate exists anywhere, `accent` comes from a category default table keyed by brief keywords (spa/beauty → warm gold, tech → cobalt, food → terracotta, kids → coral, finance → deep green), with the name hash picking among two defaults per category.

Archetype: `mood` is `dark` when a declared brand color has luminance < 0.25, or when the most frequent color in `_scraped.colorPalette` (mid-grays included) has luminance < 0.25; otherwise `light`; `category` from brief keywords (spa, beauty, luxury, jewelry, hotel, wine → editorial; tech, fintech, gaming, sports, energy → bold; food, kids, family, health → soft; fashion, automotive, nightlife, music → cinematic). Rules: editorial+light → `editorial-luxury`; cinematic or dark → `cinematic-dark`; bold with accent saturation ≥ 0.5 → `bold-flat`; soft → `soft-warm`; anything unresolved → hash tie-break between `editorial-luxury` and `cinematic-dark`.

Derived tokens (the brand's hue tints the neutrals so the deck is not a generic template):
- `paper` (light archetypes: `mix('#ffffff', accent, 0.04)`; dark: `mix('#0b0f14', accent, 0.08)`), `ink` (the inverse), `muted = mix(ink, paper, 0.45)`, `surface` (tint of accent at 6–10% over paper), `rule = ink at 12%` and `ruleStrong = ink at 100%`, `accentText` (accent pushed with `ensureContrast` until ≥ 3:1 on paper for large text, ≥ 4.5:1 when used at body size), `accentTint` (accent at 12%), `accentDark` (`mix(accent, '#000', 0.35)`), `scrim` (ink-based gradient stops for hero images).
- Fonts: `display`, `body`, `numeral` and `fontsQuery`. Editorial: Frank Ruhl Libre / Heebo / Heebo 900 digits. Cinematic: Heebo 800 / Heebo / Anton digits. Bold: Rubik 800 / Rubik / Anton digits. Soft: Heebo 700 / Assistant / Heebo 900 digits. Anton and Plex Mono never receive Hebrew.
- `radius` (one of 24/28/32, fixed per deck), `archetype`, and `provenance[]` (one line per token: which signal set it), for debugging and for the gallery caption.

Persistence: computed once per deck in `generate-full` before the agent starts, stored at `data._deckTokens`, reused across checkpoint resumes; recomputed only on `fresh:true`. Also written into `designSystem.colors`/`fonts` so `scene-generator`'s `paletteHint` and the other `designSystem` consumers see the same palette the slides use.

Never throws: any failure in a signal source skips that source; a total failure yields the category default. Guarantees hold regardless: body text ≥ 4.5:1 on its surface, display text ≥ 3:1, accent used as text ≥ 3:1.

### C2. Layout library — `src/lib/design/slide-layouts/`

`SlideContent` is the C4 argument object after alias folding (`keyNumber` → `stats`, bullets → `steps` on timeline slides). One file per layout, each a pure function `(content: SlideContent, tokens: DeckTokens, ctx: SlideCtx) => string` returning a complete slide document with the existing `.slide` 1920×1080 wrapper, plus `index.ts` with `selectLayout(content, ctx)` and `renderSlide(...)`. `SlideCtx = { slideIndex, slideCount, brandName, logoUrl?, previousLayout? }`.

Layouts (numbers refer to the research catalog) and the content shape that selects them:

| Layout id | Catalog | Selected when |
|---|---|---|
| `cover-cinematic` | A1 | `slideType === 'cover'` and an image exists |
| `cover-split` | A2 | `cover` without an image (logo + type only) |
| `statement` | A3 | `bigIdea`/`insight` with a title, no body over 40 words, no stats/cards/bullets |
| `big-number` | A4 | exactly one stat |
| `stat-row` | A5 | 2–4 stats |
| `pillars-3` | A9 | exactly 3 cards |
| `bento` | A8 | 4–5 cards, or 2 cards plus an image |
| `index-list` | A10 | ≥ 4 bullets and no image, or `slideType` in {brief, deliverables} with bullets |
| `timeline` | A12 | `steps` present (or `slideType === 'timeline'` with bullets, which become steps) |
| `comparison` | A14 | `comparison` present |
| `quote` | A16 | `quote` present |
| `people-grid` | A17 | `people` present (influencers) |
| `image-grid` | A19 | ≥ 2 `imageUrls`, body ≤ 20 words, no bullets/cards/stats |
| `divider` | A22 | title only, no image, not cover/closing |
| `closing` | A23 | `slideType === 'closing'` |
| `text-image` | A24 | default for any content slide with an image |
| `text-two-col` | A11 | default without an image, body ≥ 60 words |

Rhythm rules in `selectLayout`: never the same layout twice in a row except `text-image` (which flips its image side per section, not per slide); a `statement` or `divider` is not followed by another full-color slide; the cover and closing are the only two slides allowed a full-bleed image scrim.

Shared primitives — `src/lib/design/slide-layouts/primitives.ts`: `eyebrow(label, nn, tokens)` (pill, `<div class="eyebrow">LABEL // NN</div>` kept as plain text inside so `renumberEyebrows` and the repair guard keep working; labels come from a slideType→Hebrew map with the raw type as fallback), `statBlock`, `card` (border or fill, never both), `fakeShadow(offsetPx)`, `rule(weight)`, `img(src, {radius|clip, ring})` (radius and clip always on the `<img>`), `scrim(direction)`, `pill`, `indexNumeral`.

Type scale (fixed): display 120–144, title 72–84, card title 36–44, body 28–30 at 1.5, caption 22, eyebrow 22, big number 240–300, stat-row number 128. At most 4 distinct font sizes per slide: two content sizes (e.g. title + body, or number + label) plus the eyebrow and one caption/context size; title ≤ 2 lines; body measure ≤ 828px; no tracking below 0 on Hebrew; `text-wrap:balance` on titles.

### C3. Canva-safe vocabulary + lint — `src/lib/design/canva-safe.ts`

`lintCanvaSafe(html): Violation[]`. Flags: `box-shadow`, `backdrop-filter`, `text-shadow`, `filter:`, `mix-blend-mode`, any border/outline/height/width of `1px` used as a line, `overflow:hidden` together with `border-radius` on an element that contains an `<img>`, fonts outside the allowed list, Anton/Plex Mono applied to a run containing Hebrew letters. Also computes the premium checks that are checkable from markup: distinct `font-size` values per slide (≤ 4 incl. eyebrow/caption), eyebrow present exactly once on content slides and absent on cover/divider/closing, line weights only 2px/3px/4px/6px.

Used three ways: in tests on every layout × fixture (fails the build), in the renderer at generation time (logs `[canva-safe]` warnings with slide index, never throws), and by the gallery script.

### C4. Agent contract — `src/lib/gemini/presentation-agent.ts`

`generate_slide_html` schema: remove `designColors` (from `properties` and `required`; if the model still sends it, it is deleted, as today). Add optional content shapes: `stats: [{ value, label, context? }]` (up to 4; `keyNumber`/`keyNumberLabel` remain as aliases and are folded into `stats`), `people: [{ name, handle?, imageUrl?, metric?, metricLabel?, tags?[] }]`, `steps: [{ label?, title, body? }]`, `quote: { text, attribution, role? }`, `comparison: { columns: string[], rows: [{ attribute, cells: string[] }], highlightColumn? }`, `imageUrls: string[]`. The Hebrew description is rewritten to describe content shapes and to say explicitly that colors, fonts and layout are not the model's job. `renderAgentSlide(args, {persona, slideIndex, brandName})` calls at lines ~1037 and ~1216 become `renderSlide(content, tokens, ctx)`; `pickPersona` is deleted.

Existing gates are untouched: provenance (image URLs must be ours), narrative-image (story slides carry an image), image-variety (a URL on ≤ 2 slides), the periodic drift anchor, checkpoint/resume. `people[].imageUrl` and `imageUrls[]` go through the same provenance check as `imageUrl`.

### C5. Integration

`generate-full`: after the acquire block and before `runPresentationAgent`, `tokens = data._deckTokens ?? await deriveDeckTokens(...)`, persisted; passed via `AgentInput.tokens`. `deck-critique` and `slide-repair` need no change: repair keeps `<img>` srcs, restores the eyebrow, and its prompt already says to keep classes and colors. `html-import.ts` needs no change: every layout's CSS is under `.slide`/class selectors that `scopeCss` already rewrites. `renumberEyebrows` needs no change because the eyebrow stays `LABEL // NN` plain text.

Renderer switch: `process.env.DECK_RENDERER` (`v1` default until acceptance, then `v2`) with a per-document override `data._renderer` so the SEACRET demo can be produced both ways from the same kickoff.

## Data flow

kickoff → `kickoff-deck/run` (unchanged) → `generate-full`: acquire brand → **derive tokens (C1), persist `_deckTokens`** → agent loop: model emits content shapes (C4) → `renderSlide` (C2) picks a layout, renders with tokens, `lintCanvaSafe` warns (C3) → gates → `_htmlPresentation.htmlSlides` → `deck-critique` rounds (unchanged) → `deck-finalize` → `buildCanvaImportHtml` → Canva.

## Error handling

- Token derivation is best-effort per source and total-fallback by category; it logs provenance so a wrong palette is diagnosable from the document alone.
- A layout renderer that throws falls back to `text-image`/`text-two-col` for that slide and logs; a slide is never lost to a rendering bug.
- Lint violations in production are warnings, never failures — a dropped effect degrades one slide, a thrown error would kill a 20-minute run.
- Fonts load from Google Fonts as today; if a family fails to load in Canva the fallback stack is the sibling Hebrew sans, never a system font.

## Testing

- `brand-tokens.test.ts`: determinism (same input twice → deep-equal), the chain (declared color beats logo beats images; achromatic logo fixture modelled on SEACRET contributes nothing; no chromatic signal → category default), contrast guarantees on all four archetypes with hostile accents (neon yellow on paper, navy on ink), resume reuse (`_deckTokens` present → no network).
- `slide-layouts.test.ts`: the selection table above as a case list; the rhythm rules; every layout × a Hebrew fixture passes `lintCanvaSafe` with zero violations; eyebrow format `LABEL // NN` and its absence on cover/divider/closing; `<img>` count and srcs preserved from content (so the repair guard's assumptions hold); snapshot per layout.
- `canva-safe.test.ts`: each banned property is caught, each allowed effect passes, the wrapper-clipping-img case is caught while radius-on-img passes.
- Existing suites stay green: `html-import.test.ts` gains one v2 deck; `deck-structure`, `slide-repair`, `content-critic`, provenance and hero-image tests unchanged.
- **Acceptance (the "measure first" gate):** `scripts/render-layout-gallery.mjs` renders all 17 layouts with SEACRET tokens and real deck e3bb872b content, uploads, imports to Canva, and the thumbnails are compared page by page against a local Chromium render. Any visible difference beyond the known matrix is fixed or the effect is banned before the default flips.

## Rollout

1. Land C1–C5 behind `DECK_RENDERER=v1` (default). Tests green, `tsc` clean.
2. Gallery deck to Canva; review with the user in Canva (edit link), fix, repeat until the matrix holds.
3. Produce the SEACRET demo twice from the same kickoff (`_renderer` override), compare side by side.
4. Flip `DECK_RENDERER=v2` in prod. After two clean unattended decks, delete `slide-personas.ts` and the v1 branch in `generate-full`.

## Out of scope

Model-authored CSS (never again), animation, the VLM visual critic and wizard contract on the unmerged `feat/art-director-engine` branch, new content-critic checks, Canva brand-template autofill, changes to the critique/repair/renumber loop, and any change to the PPTX fallback path.
