# Leaders AI — Presentation Visual Pipeline (Deep)

**Question answered**: what code controls how the presentation looks, from brief upload to published share — with every file, function, line range, and key snippet.

**Last updated**: 2026-04-15

---

## 0. TL;DR — the two files that control 90% of "how it looks"

| File | What it controls |
|---|---|
| [`src/lib/gemini/layout-prototypes/generate.ts`](src/lib/gemini/layout-prototypes/generate.ts) | **Content**: which slides, in what order, what text, what references, what sources |
| [`src/lib/gemini/layout-prototypes/renderer.tsx`](src/lib/gemini/layout-prototypes/renderer.tsx) | **Visuals**: CSS arsenal (colors, gradients, glows, shadows, typography) + HTML per layout |

Everything else is plumbing around these two.

---

## 1. Data flow — a single slide from brief to pixel

```
[Brief PDF]                                              [Image in browser]
     │                                                          ▲
     ▼                                                          │
[extractFromBrief]        [runResearchAgent]        [renderStructuredSlide]
  proposal-agent.ts  →    research-agent.ts    →     renderer.tsx
     │                          │                           ▲
     ▼                          ▼                           │
[_extractedData]         [_brandColors +              [iframe.srcDoc]
  in document.data        _stepData +                  in edit page
                          _influencerStrategy]              ▲
                              │                             │
                              ▼                             │
                       [generateStructuredPresentation]     │
                         generate.ts (Gemini 3 Pro)         │
                              │                             │
                              ▼                             │
                       [_structuredPresentation]            │
                         in document.data                   │
                              │                             │
                              └─────────────────────────────┘
```

---

## 2. The **generation prompt** — what text + structure get produced

**File**: [`src/lib/gemini/layout-prototypes/generate.ts`](src/lib/gemini/layout-prototypes/generate.ts)

### 2.1. System prompt (the brain)

Lines ~76–160. Sets:
- **7-stage framework**: on brand → goals → audience → insight → strategy → creative → deliverables
- **Mandatory sections**: cover / brand-intro / goals / audience / insight (with source) / strategy-headline / creative-concept / kpi / closing
- **Optional sections** that get added when the brief supports them: brand-context, audience-personas (one per persona), strategy-pillars, strategy-deep (one per lever), creative-execution, content-pillars, influencers, deliverables, timeline, budget
- **Slide-count guidance**: thin brief → 10-12, medium → 13-16, rich → 16-22
- **Quality rules**: insight must have real source, creative must cite a real world campaign with year
- **Default design system**: dark premium (#0C0C10 bg, #F5F5F7 text, Heebo font)

```ts
const SYSTEM_PROMPT = `את/ה איש/אשת פרסום, שיווק, קריאייטיב ואסטרטגיה בכיר/ה ...

## שלד חובה — 9 סעיפים קבועים:
1. cover (hero-cover)
2. brand-intro (full-bleed-image-text)
3. goals (three-pillars-grid או numbered-stats)
4. audience (split-image-text)
5. insight (centered-insight) — dataPoint + dataLabel + **source חובה**
6. strategy-headline (full-bleed-image-text)
7. creative-concept (full-bleed-image-text) — **+ רפרנס-עולם חובה**
8. kpi (numbered-stats)
9. closing (closing-cta)

## DesignSystem — חובה:
- colors.background — כהה
- colors.primary / accent — מתוך זהות המותג (אם יש)
- fonts.heading / body — שניהם 'Heebo'
...
```

### 2.2. Example JSON embedded in the prompt

Lines ~195–215. Gives Gemini a verbatim template so it knows exactly which slot keys exist per layout:

```ts
"slides": [
  { "slideType": "cover", "layout": "hero-cover", "slots": {...} },
  { "slideType": "brief", "layout": "full-bleed-image-text", "slots": {...} },
  { "slideType": "audience", "layout": "split-image-text", "slots": {...} },
  { "slideType": "insight", "layout": "centered-insight", "slots": {
    "eyebrowLabel": "INSIGHT // 04",
    "title": "...",
    "dataPoint": "73%",
    "dataLabel": "...",
    "source": "Nielsen Trust in Advertising 2023"
  }},
  ...
  { "slideType": "influencers", "layout": "influencer-grid", "slots": {
    "influencers": [{
      "name": "...", "handle": "...", "followers": "250K",
      "engagement": "3.5%", "profilePicUrl": "https://...", "isVerified": true
    }]
  }}
]
```

### 2.3. `generateStructuredPresentation()` — the actual call

Lines ~225–265:

```ts
export async function generateStructuredPresentation(input): Promise<StructuredPresentation> {
  const userPrompt = buildUserPrompt(input)

  const result = await callAI({
    model: 'gemini-3-pro-preview',
    prompt: userPrompt,
    callerId: 'gamma-proto',
    maxOutputTokens: 32000,
    geminiConfig: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  })

  const parsed = parseGeminiJson<StructuredPresentation>(result.text)
  const normalized = normalizePresentation(parsed, input)
  backfillInfluencerPics(normalized, input)
  return normalized
}
```

### 2.4. Post-processing

- `normalizePresentation()` (lines ~275–310): fills missing DS colors with fallbacks, filters invalid layouts, numbers slides.
- `backfillInfluencerPics()` (lines ~315–345): matches influencers in slot output to input influencers by handle/name and injects `profilePicUrl` + `isVerified` that Gemini dropped.

### 2.5. Input to generate — where each field comes from

**File**: [`src/app/api/gamma-prototype/route.ts`](src/app/api/gamma-prototype/route.ts) lines ~35–95.

```ts
const brandName = data.brandName || data.brand || 'Brand'
const brief = [briefText, businessOverview, campaignObjective, targetAudience, keyMessage].filter(Boolean).join('\n\n')
const research = Object.entries(data._brandResearch).map(...).join('\n\n')
const influencers = (data._influencerStrategy.influencers).slice(0, 8).map((inf) => ({
  name, handle, followers, engagement, profilePicUrl: inf.picture, isVerified: inf.is_verified
}))
const images = { cover, brand, audience, activity } = data._generatedImages
const brandColors = data._brandColors
```

---

## 3. The **types** — what shape "visual" can have

**File**: [`src/lib/gemini/layout-prototypes/types.ts`](src/lib/gemini/layout-prototypes/types.ts)

### 3.1. Layouts enumeration

```ts
export type LayoutId =
  | 'hero-cover'
  | 'full-bleed-image-text'
  | 'split-image-text'
  | 'centered-insight'
  | 'three-pillars-grid'
  | 'numbered-stats'
  | 'influencer-grid'
  | 'closing-cta'
```

### 3.2. DesignSystem — top of the palette

```ts
export interface DesignSystem {
  colors: {
    primary: string     // main accent — headlines, stripes, CTAs
    secondary: string   // supporting
    accent: string      // second accent — glows, stats highlight
    background: string  // canvas
    text: string        // body text
    muted: string       // eyebrow, slide numbers
    cardBg: string      // semi-transparent cards
  }
  fonts: {
    heading: string     // default 'Heebo'
    body: string
  }
  creativeDirection?: {
    visualMetaphor?: string
    oneRule?: string
  }
}
```

### 3.3. Slot schemas — 8 layouts, 8 shapes

```ts
// Cover
HeroCoverSlots { brandName, title, subtitle?, tagline?, backgroundImage?, eyebrowLabel? }

// Full-bleed image with text overlay
FullBleedImageTextSlots { image, eyebrowLabel?, title, subtitle?, body? }

// 60/40 split
SplitImageTextSlots { image, imageSide: 'left'|'right', eyebrowLabel?, title, bodyText?, bullets? }

// Centered insight with stat
CenteredInsightSlots { eyebrowLabel?, title, dataPoint?, dataLabel?, source? }

// 3 pillars
ThreePillarsGridSlots { eyebrowLabel?, title, pillars: [{ number, title, description }] }

// Numbered stats
NumberedStatsSlots { eyebrowLabel?, title, stats: [{ value, label, accent? }] }

// Influencer grid
InfluencerGridSlots { eyebrowLabel?, title, subtitle?, influencers: [{ name, handle, followers, engagement, profilePicUrl?, isVerified? }] }

// Closing
ClosingCTASlots { brandName, title, tagline?, backgroundImage? }
```

### 3.4. Slide-level user overrides

```ts
export interface StructuredSlide {
  slideType: string
  layout: LayoutId
  slots: SlideLayout['slots']
  slideNumber?: number
  elementStyles?: Record<string, string>   // drag/resize overrides per data-role
  freeElements?: FreeElement[]             // user-added text/images/shapes/video
  hiddenRoles?: string[]                   // soft-deleted decorations
  bg?: { color?: string; image?: string }  // per-slide bg override
  meta?: { validation?: { source?, reference?, image? } }
}

export interface FreeElement {
  id: string                               // unique within slide, also serves as data-role
  kind: 'image' | 'video' | 'text' | 'shape'
  src?: string
  text?: string
  shape?: 'rect' | 'circle' | 'line'
  fill?: string
  stroke?: string
  format?: {
    fontSize?: number
    fontWeight?: string
    color?: string
    textAlign?: 'right' | 'center' | 'left'
    fontStyle?: 'normal' | 'italic'
    textDecoration?: string
  }
  style?: string
}
```

---

## 4. The **CSS arsenal** — the soul of the premium look

**File**: [`src/lib/gemini/layout-prototypes/renderer.tsx`](src/lib/gemini/layout-prototypes/renderer.tsx)

### 4.1. `buildCommonCss(ds)` — lines ~26–85

Every slide gets this stylesheet injected. It's the Leaders "DNA".

```css
/* Reset */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Canvas */
.slide {
  width: 1920px; height: 1080px;
  position: relative; overflow: hidden;
  font-family: 'Heebo', sans-serif; direction: rtl;
  background: ${c.background};
  color: ${c.text};
}

/* Layer 1 — atmospheric glow (radial gradients, primary + accent) */
.atm-1 {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    radial-gradient(ellipse 120% 80% at 15% 50%, ${c.primary}22, transparent 60%),
    radial-gradient(ellipse 80% 120% at 85% 30%, ${c.accent}18, transparent 55%);
}

/* Layer 2 — accent stripes (top + bottom, 3px gradient lines) */
.stripe-top { ...linear-gradient(90deg, ${c.primary}, ${c.accent}, transparent)... }
.stripe-bottom { ... }

/* Layer 2 — corner accents (2px L-shape borders) */
.corner-tl { border-top + border-left: 2px solid ${c.primary}; }
.corner-br { border-bottom + border-right: 2px solid ${c.primary}; }

/* Layer 4 — eyebrow label + slide number watermark */
.eyebrow { top: 60px; left: 80px; 14px/300/letter-spacing:8px/uppercase/${c.muted} }
.slide-num { bottom: 50px; right: 80px; ... }

/* Multi-layer title shadow — the depth trick */
.title-shadow {
  text-shadow:
    0 4px 30px rgba(0,0,0,0.6),         /* deep shadow */
    0 0 80px ${c.accent}33,              /* soft accent glow */
    0 0 160px ${c.primary}1a;            /* wider primary bloom */
}

/* Full-bleed image + smooth gradient overlay (PDF-safe) */
.img-bleed { position: absolute; inset: 0; z-index: 0; object-fit: cover; width: 100%; height: 100%; }
.img-overlay {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg,
    rgba(0,0,0,0.85) 0%,
    rgba(0,0,0,0.4) 50%,
    rgba(0,0,0,0.2) 100%);
}
```

### 4.2. The 8 render functions — each is a tiny CSS-in-JS component

Each function returns an HTML fragment for one layout. The slots + design-system colors flow in as template-string interpolations.

**`renderHeroCover`** (lines ~100–145) — background image → atm-1 → stripe-top → eyebrow → big title (font-size 120-180px, weight 900, title-shadow) → subtitle → brand footer. Title auto-sizes based on length.

```tsx
<h1 data-role="title" class="title-shadow"
    style="font-size:${(slots.title).length > 25 ? '120px' : '180px'};
           font-weight:900; line-height:0.9; letter-spacing:-5px;
           color:${c.text}; margin-bottom:24px; max-width:1200px;">
  ${esc(slots.title)}
</h1>
```

**`renderFullBleedImageText`** (lines ~145–175) — img-bleed → img-overlay → atm-1 → content block at bottom with 72-96px title, body text 22px.

**`renderSplitImageText`** (lines ~180–225) — 60/40 grid: image on one side, content on the other. bullets with right-side border accent.

**`renderCenteredInsight`** (lines ~230–260) — dataPoint huge (240-300px, primary glow), title medium, source as small eyebrow-like text at bottom.

```tsx
<div data-role="data-point"
     style="font-size:${size}px; font-weight:900; color:${c.primary};
            letter-spacing:-8px; line-height:0.9; text-shadow:0 0 120px ${c.primary}55;">
  ${esc(slots.dataPoint)}
</div>
```

**`renderThreePillarsGrid`** (lines ~265–305) — 3 equal columns. Each pillar has number (primary color, 120px, weight 900), title, description.

**`renderNumberedStats`** (lines ~260–290 later) — grid of stats, each value at 120px weight 900 with primary-glow shadow.

**`renderInfluencerGrid`** (lines ~310–345) — grid of up-to-6 cards. Each card has profile pic (96px circle, primary border), name, @handle, followers + engagement, verified checkmark.

**`renderClosingCTA`** (lines ~350–375) — full-bleed-style with large title, brand tagline "Leaders × {brand}".

### 4.3. Post-processing passes (all in `renderer.tsx`)

```
renderStructuredSlide(slide, ds, opts)
  1. dispatch → renderX(slots, ds) → body HTML
  2. decorateDecorations(body)        ← adds data-role to atm-1/stripe/corner/slide-num/img-bleed/img-overlay
  3. injectFreeElements(body, free)   ← adds user-added text/images/shapes/videos before </div>
  4. applyElementStyles(body, styles) ← regex-injects inline CSS overrides + data-overridden="1"
  5. applyHidden(body, hidden)        ← adds display:none to selected data-role
  6. applyBg(body, bg)                ← inline bg-color/image on .slide
  7. wrap in htmlDoc():
     - <style>buildCommonCss(ds)</style>
     - gridOverlay if opts.grid       ← 40×40 grid lines
     - REPARENT_SCRIPT                ← always on — lifts overridden elements to .slide
     - EDITOR_SCRIPT if opts.editor   ← drag/resize/smart-guides/inline-edit/paste-plain/image-swap
```

### 4.4. `EDITOR_SCRIPT` — ~400 lines of in-iframe editor behavior

Runs inside the iframe on DOMContentLoaded. Handles:
- **Hover outline** on `[data-role]` (dashed red, transition 0.1s)
- **Selection** (solid red outline + handles)
- **Drag + resize** with reparent-on-first-drag to escape positioned wrappers
- **Smart guides** — red glow lines appearing when element aligns to slide center/edges or other elements' edges/centers (threshold 6px)
- **Snap** (40px grid when enabled)
- **Double-click → contentEditable** with paste-as-plain-text
- **Arrow-key nudge** (1px / Shift 10px)
- **Image hover "✎ החלף" button** using `elementsFromPoint` (reliably finds images under cursor even when covered)
- **postMessage** to parent on every commit

### 4.5. Free elements rendering (lines ~445–495)

```tsx
function injectFreeElements(body, free) {
  const fragments = free.map(el => {
    const baseStyle = el.style || 'position:absolute; left:760px; top:440px; width:400px; height:200px; z-index:50;'
    if (el.kind === 'image') return `<img data-role="${safeRole}" src="${el.src}" style="${baseStyle}; object-fit:cover; border-radius:8px;" />`
    if (el.kind === 'video') return `<video ... autoplay loop muted playsinline ...></video>`
    if (el.kind === 'shape') { /* rect / circle (border-radius:50%) / line (height:4px) */ }
    return `<div data-role="..." data-editable="text" style="${baseStyle}; ${formatToCss(el.format)}">${el.text}</div>`
  }).join('\n')
  return body.replace(/<\/div>\s*$/, `${fragments}</div>`)
}
```

---

## 5. The **editor page** — runtime composition

**File**: [`src/app/edit/[id]/page.tsx`](src/app/edit/[id]/page.tsx) (~2500 lines)

### 5.1. Render cycle

```tsx
const html = useMemo(() =>
  slide && pres ? renderStructuredSlide(slide, pres.designSystem, { editor: true, grid, snap }) : '',
  [slide, pres, grid, snap]
)

<iframe srcDoc={html} style={{
  width: 1920, height: 1080,
  transform: `scale(${zoom})`,
  transformOrigin: 'top left',
  ...
}} />
```

Every state change re-computes `html` and re-renders the iframe via `srcDoc`.

### 5.2. Message handling — how user edits get persisted

Lines ~200–260:

```ts
useEffect(() => {
  function onMsg(ev) {
    if (ev.data.type === 'gamma-edit') {                  // drag/resize committed
      next.slides[idx].elementStyles[role] = styleString
    }
    if (ev.data.type === 'gamma-text') {                  // inline text edit
      if (role.startsWith('free-')) {
        update freeElements[id].text
      } else {
        slots[ROLE_TO_SLOT_KEY[role] || role] = text
      }
    }
    if (ev.data.type === 'gamma-delete-free') { remove from freeElements }
    if (ev.data.type === 'gamma-selected')    { setSelectedRole }
    if (ev.data.type === 'gamma-swap-image')  { open MediaPicker in swap mode }
  }
  window.addEventListener('message', onMsg)
  return () => window.removeEventListener('message', onMsg)
}, [pres, idx])
```

### 5.3. Contextual Properties panel

Lines ~1210–1400. Based on `selectedRole`:

| Selected | Shown |
|---|---|
| nothing | Validation panel → BG picker → Reset overrides → SlotEditor (auto-form) |
| free text | Content textarea |
| free image/video | src + preview |
| free shape | Fill + stroke color |
| slot/decor | Hint |

### 5.4. AI surfaces

- `regenerateSlide()` (lines ~310–330) → `/api/gamma-prototype/regenerate-slide`
- `aiRewrite(key, mode)` (lines ~365–380) → `/api/gamma-prototype/rewrite` (shorter/dramatic/formal)
- `AIChatPanel` (lines ~1910–1990) → `/api/gamma-prototype/chat` (cross-deck edits with revert snapshot)
- `validateSlide()` (lines ~530–560) + `validateAllSlides()` (lines ~560–590) → `/api/gamma-prototype/validate` (Google-grounded source verification)
- `MediaPicker` AI tab → `/api/image` with `referenceImageUrl` + `styleContext` (lines ~2240–2330)

### 5.5. Style context builder — lines ~60–80

```ts
function buildStyleContext(pres: StructuredPresentation): string {
  const ds = pres.designSystem
  return [
    `Brand: ${pres.brandName}.`,
    `Color palette — primary ${ds.colors.primary}, ..., background ${ds.colors.background}, ...`,
    ds.creativeDirection?.visualMetaphor && `Visual metaphor: ${ds.creativeDirection.visualMetaphor}.`,
    ds.creativeDirection?.oneRule && `One design rule: ${ds.creativeDirection.oneRule}.`,
    `Typography: ${ds.fonts.heading} / ${ds.fonts.body}.`,
    `Mood: premium, editorial, slightly cinematic. Natural light, subtle film grain, not over-saturated.`,
    `Aspect ratio 16:9.`,
  ].filter(Boolean).join(' ')
}
```

This string gets appended to every AI-generated image's prompt so generated images match the deck style.

---

## 6. **AI image generation** — style-locked img2img

**Files**: [`src/app/api/image/route.ts`](src/app/api/image/route.ts) + [`src/lib/gemini/image.ts`](src/lib/gemini/image.ts)

### 6.1. Route (`/api/image`) — lines ~25–70

```ts
POST /api/image
Body: { prompt, documentId?, referenceImageUrl?, styleContext? }

let finalPrompt = prompt
if (styleContext) finalPrompt += `\n\n[Style context — match this aesthetic closely]:\n${styleContext}`

let referenceImage
if (referenceImageUrl) {
  const refRes = await fetch(referenceImageUrl)
  const buf = Buffer.from(await refRes.arrayBuffer())
  referenceImage = { base64: buf.toString('base64'), mimeType: refRes.headers.get('content-type') }
  finalPrompt += `\n\n[Reference image provided — use its subject/composition as the starting point...]`
}

const result = await generateImage(finalPrompt, {
  aspectRatio: '16:9',
  imageSize: '4K',
  referenceImage,
})
```

### 6.2. `generateImage()` — lines ~35–95

```ts
const contents = referenceImage
  ? [{
      role: 'user',
      parts: [
        { inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } },
        { text: finalPrompt },
      ],
    }]
  : finalPrompt

const response = await ai.models.generateContent({
  model: IMAGE_MODEL,  // gemini-3-pro-image-preview
  contents,
  config: {
    responseModalities: ['image', 'text'],
    imageConfig: { aspectRatio: '16:9', imageSize: '4K' },
  },
})
```

Result: 4K image, base64 → uploaded to Supabase Storage → URL returned.

---

## 7. **PDF export** — screenshot via Playwright

**File**: [`src/app/api/gamma-prototype/pdf/route.ts`](src/app/api/gamma-prototype/pdf/route.ts)

```ts
POST /api/gamma-prototype/pdf
Body: { documentId, presentation? }

const htmlSlides = pres.slides.map(s => renderStructuredSlide(s, pres.designSystem))
// ↑ no { editor: true } — clean HTML without the edit UI

const pdfBuffer = await generateScreenshotPdf(htmlSlides, {
  format: '16:9',
  title: pres.brandName,
  brandName: pres.brandName,
})

// Upload to Supabase → return public URL
```

`generateScreenshotPdf` (in `src/lib/playwright/pdf.ts`) launches Playwright + Chromium, renders each HTML at 1920×1080, screenshots, assembles into a PDF. Pixel-perfect fidelity — all blur/gradients/glows preserved.

---

## 8. **Public sharing** — view-only with viewer config

**Files**: [`src/app/s/[token]/page.tsx`](src/app/s/[token]/page.tsx) + [`src/components/presentation/HtmlSlideshow.tsx`](src/components/presentation/HtmlSlideshow.tsx)

### 8.1. Share page — server component

```tsx
const structuredPres = docData._structuredPresentation
if (isStructured && structuredPres) {
  const htmlSlides = structuredPres.slides.map(s => renderStructuredSlide(s, structuredPres.designSystem))
  // ↑ clean render, no editor script
  return <HtmlSlideshow htmlSlides={htmlSlides} brandName={brandName} viewerConfig={viewerConfig} />
}
```

### 8.2. HtmlSlideshow — the viewer

Respects `ViewerConfig`:
- `mode: 'slideshow' | 'scroll'`
- `transitions: 'none' | 'fade' | 'slide' | 'zoom'` — CSS keyframes
- `autoPlay` + `autoPlayInterval` (ms) + pause with `P` key
- `showProgress` / `showNav` / `showBranding`
- `showCta` → overlay on last slide + button in nav bar
- `ctaConfig.type`: `approve` | `meeting` | `link` | `whatsapp` (opens wa.me)

Iframes are sandboxed (`allow-same-origin`) and have `pointer-events: none` so clicks advance slide.

---

## 9. **Thumbnails** — scaled iframe copies

**Component**: `SlideThumbCompact` in [`src/app/edit/[id]/page.tsx`](src/app/edit/[id]/page.tsx) (lines ~2080–2120)

```tsx
function SlideThumbCompact({ slide, ds, index, active, onClick, onContextMenu, statusColor, validating }) {
  const html = useMemo(() => renderStructuredSlide(slide, ds), [slide, ds])
  // ↑ no editor script, no grid

  return (
    <div onClick={onClick} onContextMenu={onContextMenu}>
      {statusColor && <div style={{ /* colored dot top-right */ }} />}
      <iframe srcDoc={html} style={{
        width: 1920, height: 1080,
        transform: 'scale(0.083)',  // → ~160px wide
        pointerEvents: 'none',
      }} sandbox="allow-same-origin" />
      <div>{index + 1} · {slide.slideType}</div>
    </div>
  )
}
```

Same `renderer.tsx` output. One iframe per slide thumbnail in the bottom strip.

---

## 10. "I want to change X" — surgical map

| Change I want | File | Function / location |
|---|---|---|
| Default dark-premium feel (colors, gradients) | `renderer.tsx` | `buildCommonCss()` lines 26–85 |
| How atmospheric glow looks | `renderer.tsx` | `.atm-1` in `buildCommonCss`, line 38–43 |
| Stripe thickness / gradient | `renderer.tsx` | `.stripe-top` / `.stripe-bottom` lines 45–48 |
| Title shadow intensity | `renderer.tsx` | `.title-shadow` lines 67–72 |
| Image overlay darkness | `renderer.tsx` | `.img-overlay` lines 75–81 |
| Hero-cover internal layout | `renderer.tsx` | `renderHeroCover()` lines 100–145 |
| Insight slide stat size / glow | `renderer.tsx` | `renderCenteredInsight()` + `.title-shadow` |
| Influencer card design | `renderer.tsx` | `renderInfluencerGrid()` lines ~310–345 |
| Add a new layout archetype | `types.ts` + `renderer.tsx` + `generate.ts` | 1. Define slot schema in types. 2. Add renderX function + add to switch in `renderStructuredSlide`. 3. Add example in the prompt |
| Change default design system colors | `generate.ts` → `normalizePresentation()` fallbacks, lines ~285–305 |
| Force specific fonts | `generate.ts` → `normalizePresentation()` + `buildCommonCss()` font-family |
| What text the AI writes | `generate.ts` → `SYSTEM_PROMPT` lines 76–160 |
| How many slides + order | `generate.ts` → mandatory/optional sections block in `SYSTEM_PROMPT` |
| Slide count per brief size | `generate.ts` → "thin/medium/rich" guidance |
| Quality rules (source / reference) | `generate.ts` → כללי איכות + content rules |
| Editor hover / select / drag behavior | `renderer.tsx` → `EDITOR_SCRIPT` (large `<script>` block, ~400 lines) |
| Smart-guide threshold / colors | `renderer.tsx` → `computeSmartGuides()` + `renderGuides()` |
| AI image style (mood) | `edit/[id]/page.tsx` → `buildStyleContext()` |
| PDF appearance | All comes from `renderer.tsx` output — identical to editor minus `EDITOR_SCRIPT` |
| Public viewer transitions / CTA | `HtmlSlideshow.tsx` |
| Thumbnail size | `SlideThumbCompact` in `edit/[id]/page.tsx` → `transform: scale(0.083)` |

---

## 11. Summary diagram

```
           ┌──────────────────────┐
           │  Brief PDF (user)    │
           └──────────┬───────────┘
                      ▼
      ┌──────────────────────────────────┐
      │ proposal-agent.ts                │
      │ extractFromBrief()               │
      │   → _extractedData               │  (brand, goals, audience, creativeDirection, brandStory, tone, ...)
      └──────────┬───────────────────────┘
                 ▼
      ┌──────────────────────────────────┐
      │ research-agent.ts                │
      │ runResearchAgent()               │
      │   Phase 1: Google + URL context  │
      │   Phase 2: draft_brand,          │
      │           draft_strategy,        │
      │           draft_execution,       │
      │           search/enrich_influencer │
      │   → _brandResearch, _brandColors │
      │     _influencerStrategy,         │
      │     _stepData                    │
      └──────────┬───────────────────────┘
                 ▼
           [User reviews in wizard + optionally edits]
                 ▼
      ┌──────────────────────────────────┐
      │ /api/gamma-prototype/route.ts    │
      │ - packs inputs (brief + research │
      │   + influencers + images + colors) │
      └──────────┬───────────────────────┘
                 ▼
      ┌──────────────────────────────────┐
      │ generate.ts                      │
      │ generateStructuredPresentation() │
      │   ├─ SYSTEM_PROMPT (7 stages)    │
      │   ├─ Gemini 3 Pro                │
      │   ├─ normalizePresentation()     │
      │   └─ backfillInfluencerPics()    │
      │   → _structuredPresentation      │
      └──────────┬───────────────────────┘
                 ▼
           [Stored on doc.data]
                 ▼
      ┌──────────────────────────────────┐
      │ /edit/[id]/page.tsx (editor)     │
      │   state: pres, slide, idx, ...   │
      │   useMemo(html) ←────────────┐   │
      │   iframe srcDoc={html}       │   │
      │                              │   │
      │   user edits → postMessage   │   │
      │   → setPres → re-render ─────┘   │
      └──────────┬───────────────────────┘
                 │
            ┌────┴────┬─────────┬──────────┐
            ▼         ▼         ▼          ▼
        PDF         Share   Thumbnails   Live
        route     /s/[token]  (same      editor
                            renderer)    iframes
```

At every branch, the **same `renderStructuredSlide(slide, ds, opts)` function from `renderer.tsx`** is called. The only differences are:
- `opts.editor: true` → adds `EDITOR_SCRIPT` (drag/resize/edit UI)
- `opts.grid: true` / `opts.snap: true` → visual grid + snap behavior
- PDF / share / thumbnails → all pass `opts = {}` for clean output

That's it. **One renderer. One CSS arsenal. Four consumption paths.**

---

*Generated 2026-04-15. For deeper architectural context see `EDITOR-ARCHITECTURE-CONSULTATION.md` and `EDITOR-DEEP-DIVE.md`.*
