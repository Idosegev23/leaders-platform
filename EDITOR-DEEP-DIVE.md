# Leaders AI — Editor Deep Dive

**Status**: 2026-04-15. Route: `/edit/[id]`. Source of truth: the Gamma-model prototype (structured JSON + CSS-arsenal renderer). Old HTML/AST editors deprecated as of this session.

---

## 1. What the editor is

A browser-based, Hebrew-RTL, 1920×1080 presentation editor. Source of truth = `_structuredPresentation` JSON on the Supabase document row. Rendering = client-side React that emits a full HTML document per slide into a sandboxed iframe. Editing = a mix of form-controls (React sidebar), in-iframe drag/resize, and contenteditable text.

```
document.data._structuredPresentation: {
  brandName: string
  designSystem: { colors, fonts, creativeDirection? }
  slides: StructuredSlide[]
}
```

Every slide is one of 8 layout archetypes (hero-cover, full-bleed-image-text, split-image-text, centered-insight, three-pillars-grid, numbered-stats, influencer-grid, closing-cta). Each archetype has typed slots (title, eyebrowLabel, bullets, pillars, stats, etc.). The renderer maps `{ layout, slots }` → HTML string with the full Leaders CSS arsenal (aurora glows, stripes, corners, title shadows, img-bleed, etc.).

---

## 2. File map

| File | Lines | Role |
|---|---|---|
| `src/app/edit/[id]/page.tsx` | ~1540 | The editor page — load doc, render, all handlers, all sub-components |
| `src/lib/gemini/layout-prototypes/types.ts` | ~140 | `StructuredPresentation`, `StructuredSlide`, `FreeElement`, slot types |
| `src/lib/gemini/layout-prototypes/renderer.tsx` | ~560 | Renders each slide to an HTML string + injects REPARENT_SCRIPT + EDITOR_SCRIPT |
| `src/lib/gemini/layout-prototypes/generate.ts` | ~330 | Gemini structured-JSON generator + post-processing (backfill profile pics) |
| `src/app/api/gamma-prototype/route.ts` | ~125 | POST `/api/gamma-prototype` — pulls doc data, calls generate, returns presentation + htmlSlides |
| `src/app/api/gamma-prototype/regenerate-slide/route.ts` | ~80 | Regenerate one slide with Gemini |
| `src/app/api/gamma-prototype/rewrite/route.ts` | ~50 | Single-field AI rewrite (shorter / dramatic / formal) |
| `src/app/api/gamma-prototype/chat/route.ts` | ~95 | Cross-deck AI edits |
| `src/app/api/gamma-prototype/pdf/route.ts` | ~75 | Screenshot PDF via Playwright |
| `src/app/api/gamma-prototype/upload/route.ts` | ~40 | Upload image/video to Supabase Storage (`documents/gamma-media/{userId}/...`) |
| `src/components/share/ShareDialog.tsx` | — | Reused as-is for sharing |
| `src/components/presentation/HtmlSlideshow.tsx` | ~195 | View-only slideshow for `/s/[token]` — respects `ViewerConfig` |
| `src/app/s/[token]/page.tsx` | ~90 | Public share viewer — now detects `_structuredPresentation` and renders via HtmlSlideshow |

---

## 3. Data model (complete)

### `StructuredSlide`

```ts
{
  slideType: string              // 'cover', 'brand-intro', 'insight', etc. (free-form tag)
  layout: LayoutId               // one of 8
  slots: SlideLayout['slots']    // typed per layout (see below)
  slideNumber?: number
  elementStyles?: Record<string, string>  // per-role CSS string overrides (drag/resize)
  freeElements?: FreeElement[]            // user-added text/image/video/shape
  hiddenRoles?: string[]                  // data-role names soft-deleted
  bg?: { color?: string; image?: string } // per-slide background override
}
```

### `FreeElement`

```ts
{
  id: string                           // unique id, also serves as data-role
  kind: 'image' | 'video' | 'text' | 'shape'
  src?: string                         // for image/video
  text?: string                        // for text
  shape?: 'rect' | 'circle' | 'line'
  fill?: string                        // shape fill
  stroke?: string                      // shape stroke
  format?: {                           // for text
    fontSize?: number
    fontWeight?: string
    color?: string
    textAlign?: 'right' | 'center' | 'left'
    fontStyle?: 'normal' | 'italic'
    textDecoration?: string
  }
  style?: string                       // initial CSS (default centered)
}
```

### Slot schemas (per layout)

| Layout | Slot keys |
|---|---|
| `hero-cover` | brandName, title, subtitle?, tagline?, backgroundImage?, eyebrowLabel? |
| `full-bleed-image-text` | image, eyebrowLabel?, title, subtitle?, body? |
| `split-image-text` | image, imageSide ('left'\|'right'), eyebrowLabel?, title, bodyText?, bullets? |
| `centered-insight` | eyebrowLabel?, title, dataPoint?, dataLabel?, source? |
| `three-pillars-grid` | eyebrowLabel?, title, pillars: [{number, title, description}] |
| `numbered-stats` | eyebrowLabel?, title, stats: [{value, label, accent?}] |
| `influencer-grid` | eyebrowLabel?, title, subtitle?, influencers: [{name, handle, followers, engagement, profilePicUrl?, isVerified?}] |
| `closing-cta` | brandName, title, tagline?, backgroundImage? |

---

## 4. Rendering pipeline

For a single slide:

```
renderStructuredSlide(slide, ds, opts)
  1. dispatch by layout → renderX(slots, ds) produces body HTML fragment
  2. decorateDecorations(body) — regex-adds data-role="decor-atm-1"/"decor-stripe-top"/etc
  3. injectFreeElements(body, slide.freeElements) — appends free elements right before </div>
  4. applyElementStyles(body, slide.elementStyles) — regex-injects inline style overrides + data-overridden="1"
  5. applyHidden(body, slide.hiddenRoles) — adds display:none to matching data-role elements
  6. applyBg(body, slide.bg) — injects background-color/image on .slide root
  7. wrap in htmlDoc() with:
     - <style>buildCommonCss(ds)</style>           — CSS arsenal
     - optional grid overlay <div>                 — 40px × 40px grid when opts.grid
     - <script>window.__gammaSnap = 40 or 0</script>
     - REPARENT_SCRIPT                             — lifts [data-overridden] to .slide
     - EDITOR_SCRIPT (when opts.editor)            — adds drag/resize/inline-edit
```

The iframe receives the result via `srcDoc`. It's sandboxed (`allow-same-origin` on share page, no sandbox attr in editor).

### REPARENT_SCRIPT
Runs on DOMContentLoaded. Walks `[data-overridden="1"]` and moves each into `.slide` directly. This is necessary because many data-role elements are inside positioned wrappers (e.g. the title inside a `position:absolute` block inside hero-cover); moving them to `.slide` makes `position:absolute; left/top` resolve against the full 1920×1080 canvas.

### EDITOR_SCRIPT
Runs on DOMContentLoaded. Adds:
- **Hover outline** on `[data-role]` elements (dashed red).
- **Click-select** with red solid outline + handle overlays.
- **Pointerdown drag** (reparent on first drag if needed).
- **Resize handle** on bottom-right corner.
- **Delete handle** (× on top) for `free-*` roles.
- **Double-click** toggles `contentEditable` (green outline while editing).
- **Arrow-key nudge** (1px, Shift=10px, snap=40px).
- **postMessage** to parent for: `gamma-selected`, `gamma-edit` (commit styleString), `gamma-text` (commit text), `gamma-delete-free`.

### Parent-side listener
The page listens on `window` for those messages and patches the React state:
- `gamma-edit` → sets `elementStyles[role] = styleString`
- `gamma-text` → if role starts with `free-` → update the FreeElement's text; else look up `ROLE_TO_SLOT_KEY[role]` and patch `slots[key]`
- `gamma-delete-free` → remove from `freeElements`
- `gamma-selected` → updates local selectedRole state (drives the Properties panel)

---

## 5. Layout & UX (what the user sees)

```
┌─ Header (56px, dark) ───────────────────────────────────────────────────────┐
│  ←  {BrandName}   • saving status                           [toolbar clusters]│
│                                                                              │
│  Clusters (lucide icons, tooltip on hover):                                  │
│  [Undo/Redo] | [Grid/Snap/Duplicate] | [Chat/Sparkles/Refresh] |             │
│  [Present/Download] [Share (solid blue + text)]                              │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ Thumbs ─┬─ Elements ─┬─ Canvas ──────────────────────────┬─ Properties ────┐
│  140px   │  240px      │ flex-1                             │ 340px           │
│          │             │                                    │                 │
│ [thumb 1]│ Tabs:       │ [←] [→] [🗑]  slide 3/14 · layout  │ (contextual —   │
│ [thumb 2]│  רכיבים     │                 [−] 67% [+] [Fit]  │  see §6 below)  │
│ [thumb 3]│  פריסות     │                                    │                 │
│   ...    │             │ [Text format bar (if text sel)]    │ Layers panel at │
│          │ Grid of     │                                    │ bottom (content │
│ [+ שקף]  │ element     │  ┌─────────────────────────┐       │ / free / decor) │
│          │ cards:      │  │   ScaledCanvas          │       │                 │
│          │ Text / Img  │  │   (iframe @ zoom)       │       │                 │
│          │ Video/Shape │  │   dragging lives here   │       │                 │
│          │             │  └─────────────────────────┘       │                 │
│          │ (layouts    │                                    │                 │
│          │  tab: list  │                                    │                 │
│          │  of 8)      │                                    │                 │
└──────────┴─────────────┴────────────────────────────────────┴─────────────────┘
```

**Modals** (overlay when triggered): `ShareDialog`, `PresentationMode` (fullscreen slideshow), `MediaPicker` (upload/URL/AI-generate), `AIChatPanel` (fixed bottom-left, 360px).

---

## 6. Contextual Properties panel — what it shows per selection

| Selected thing | Panel shows |
|---|---|
| Nothing | Slide settings: background picker (palette + color input + reset), "Reset all overrides on this slide" button, **SlotEditor** (auto-form from slots object — strings, long strings → textarea, URLs with image/pic keys → image preview, booleans → checkbox, arrays of strings → tag list, arrays of objects → per-field editor, per string-field AI rewrite buttons: shorter / dramatic / formal) |
| Free text element | Content textarea (plus floating TextFormatToolbar above canvas: B/I/U, size input, alignment, color palette) |
| Free image/video | URL input + preview thumbnail |
| Free shape | Fill color picker (primary-transparent default), stroke color picker |
| Slot/decor role | Hint ("drag to move, dbl-click to edit") |

Below the contextual properties is the **Layers panel**: three groups (תוכן / אלמנטים חופשיים / קישוטים), each row = hide toggle (◉/◌), reset-position (↺) if overridden, select on click. This is how you reach elements that can't be clicked in the canvas (like fullscreen `.atm-1` which has `pointer-events: none`).

---

## 7. Keyboard & shortcuts

| Keys | Action |
|---|---|
| Arrow keys (with element selected) | Nudge 1px |
| Shift + Arrow | Nudge 10px (or 40px when snap on) |
| ⌘/Ctrl + Z | Undo |
| ⌘/Ctrl + Shift + Z | Redo |
| ⌘/Ctrl + D | Duplicate slide |
| ⌘/Ctrl + C (element selected) | Copy free element to clipboard (in-memory) |
| ⌘/Ctrl + V | Paste clipboard onto current slide |
| Delete (free element selected) | Delete |
| Escape (while inline-editing) | Commit and exit edit |
| Double-click on text | Enter inline edit mode |

---

## 8. AI surfaces in the editor

1. **Generate full deck** — called automatically if `_structuredPresentation` is missing on load. Also Refresh icon in header.
2. **Regenerate this slide (Sparkles icon)** — prompt for optional instruction, Gemini returns a new StructuredSlide (may change layout). Wipes free elements / overrides.
3. **AI rewrite per field** (in SlotEditor) — 3 buttons: shorter / dramatic / formal. Runs on the selected string slot. Backend: Gemini Flash.
4. **Cross-deck chat (Message icon)** — bottom-left panel. Quick prompts + free text ("קצר הכל", "טון דרמטי", "תרגם לאנגלית", "פלטה חמה"). Gemini returns a modified StructuredPresentation; server preserves user overrides (elementStyles, freeElements, hiddenRoles, bg).
5. **MediaPicker → AI tab** — generates an image from a Hebrew/English prompt via `/api/image` (Gemini 3 Pro Image), returns URL, adds as free element.

---

## 9. Persistence

- **Auto-save**: debounced 1.5s after every state change → PATCH `/api/documents/:id` with `_structuredPresentation`.
- **Undo history**: debounced snapshots of previous state (400ms idle), max 50 past + 50 future, in-memory only.
- No DB version history.
- No cross-device collaboration.

---

## 10. Share flow

- Header Share button → `<ShareDialog>` (existing component) → POST `/api/shares` → creates row in `presentation_shares` with `share_token` (12 chars nanoid), `viewer_config` JSONB.
- Shareable URL: `/s/{token}`.
- Public viewer (`/s/[token]/page.tsx`):
  - Detects `_structuredPresentation` first → renders each slide via `renderStructuredSlide` (no editor script), feeds into `HtmlSlideshow`.
  - `HtmlSlideshow` respects `ViewerConfig`: autoplay + P to pause, transitions (fade/slide/zoom), showProgress/showNav/showBranding, CTA (overlay on last slide + button in nav bar; types: approve/meeting/link/whatsapp).
- View count + last_viewed_at updated on each public fetch.

---

## 11. Known problems / rough edges (honest)

### UX
- **RTL everywhere looks a little off**: the canvas is RTL, but the toolbar order isn't always intuitive for a Hebrew speaker — some icons feel flipped. Just fixed the most egregious (icon-before-text using `flex-direction: row-reverse`) but there's probably more.
- **No onboarding / empty state**: when the deck loads with `_structuredPresentation` absent, we silently kick off generation. Users see a plain "טוען / מייצר…" line for ~30-60s without context.
- **The "Layouts" tab switches the layout but throws away content**: when you click a different layout, we do `{ ...slide, layout, elementStyles: {}, freeElements: [], hiddenRoles: [] }` — slots may not match the new layout's schema, so fields silently disappear. Should warn or migrate.
- **Element cards are static**: no drag-from-panel to canvas. You click and we insert at default position (760,440). Canva gives instant drag-drop with insertion preview.
- **No multi-select**: can't select 2+ elements, can't group.
- **No alignment tools**: no "align center", "align to slide", "distribute horizontally".
- **No rotate handle**: every element is axis-aligned.
- **Grid is visual only**: shows 40×40 grid, but snapping only happens during drag (not during resize to grid intersections, not for nudge).
- **Zoom is not scroll-anchored**: zooming centers on top-left, not on cursor or center of viewport.
- **No ruler / coordinates display**: user has no idea where (0,0) is or what size their element is mid-drag.
- **Properties panel "nothing selected" state dumps the entire slots form as a vertical list** — overwhelming for slides with many fields (influencer-grid has influencers[] with 6+ objects, each with 5+ fields).

### Editor behavior bugs I suspect
- **Reparent-on-drag is lossy**: when we move the element to `.slide`, we set its inline `width` to the measured rect. But if the original used `max-width: 1200px` + auto-width, the element post-reparent is fixed-width. Resizing works but the original "fluid" sizing is gone forever.
- **Inline text edit can break HTML**: contenteditable on an `<h1>` allows pasting styled content; we save innerText but rich paste could leave orphan spans in the DOM until the iframe reloads.
- **postMessage + setState race**: if the user drags fast and the React state update triggers an iframe srcDoc change, the in-progress drag can get lost (rare but possible).
- **Fonts don't preload before handles position**: we call `positionHandles()` at 200ms and 800ms, but if fonts load later the handles are mispositioned.
- **Snap during nudge is disabled**: the arrow-key nudge ignores `__gammaSnap` for single-step moves (only uses snap for Shift+arrow).

### Content generation gaps
- **No skeleton enforcement after the prompt**: Gemini is told to include 9 mandatory sections but we don't verify. If it skips one, we just get a deck without it.
- **Images for slots are URLs from research** (`_generatedImages` + `_influencerStrategy.picture`). The model decides which image goes where, sometimes gets it wrong (brand image on an audience slide). No UI to reassign.
- **Sources for insight**: we require them in the prompt but don't validate. Model sometimes invents a plausible-sounding source (e.g. "Nielsen 2023") that doesn't exist.
- **Creative references**: same. "Dove Real Beauty 2004" is real, but model can hallucinate campaigns.

### Performance
- **Every state change re-renders the iframe srcDoc** — if you're dragging in the main iframe and typing in a sidebar field simultaneously, the iframe reloads continuously. Handles disappear mid-drag.
- **Thumbnails each run their own iframe** — for 18 slides that's 18 iframes. Memory & initial-load cost is visible on mid-range laptops.
- **No virtualization** of thumbnails.
- **Autosave sends the whole _structuredPresentation** every 1.5s, not a diff. For 18-slide decks with images embedded as long URLs, each save is ~40-80KB.

### Missing features (vs. Canva / Gamma)
- Drag-from-panel-to-canvas
- Multi-select
- Align / distribute / smart guides
- Rotate
- Group / ungroup
- Templates library ("save as template", "start from template")
- Brand-kit tab (logos, colors, fonts, locked)
- Version history (real DB-backed, not just in-memory undo)
- Comments on slides
- Real-time collaboration
- PPTX export (currently only PDF)
- Analytics (we have a `share_analytics` table but not wired to viewer events yet)
- Duplicate free element in-place (⌘D while element selected only duplicates slide)
- Lock element (prevent accidental drag)
- Opacity slider
- Layer re-order (z-index control per element)
- Auto-layout suggestions ("this slide has too much text, split?")
- Color eyedropper

---

## 12. Flow of a new deck (end-to-end, 2026-04-15)

1. User uploads brief → `/create-proposal` (client upload + optional Google Drive brief).
2. `/api/process-proposal` → `extractFromBrief` (Gemini Flash) → extracts `_extractedData` with rich fields (brand, goals, audience, creative direction, brand story, tone, visual direction, key messages, referenced campaigns, mandatories, prohibitions, etc.).
3. User lands on `/research/[id]` → research agent runs (Phase 1: Google search + URL context, Phase 2: function-declarations: search_influencers, enrich_influencer, draft_brand_content, draft_strategy_content, draft_execution_content, suggest_image_prompts).
4. Research agent saves: `_brandResearch`, `_influencerStrategy.influencers` (with real IMAI data: followers, engagement rate, verified, picture, bio), `_brandColors`, `_imagePrompts`, and a nested `_stepData` map.
5. Background image generation kicks off (not blocking).
6. User approves research → `/wizard/[id]` — 9 steps pre-filled from `_stepData` (brief, goals, audience, insight, strategy, creative [with brandStory + tone + visual + keyMessages + suggestedReferences], deliverables, influencers, media_targets).
7. User edits → clicks "Generate" → `/generate/[id]`:
   - Runs staged HTML pipeline (foundation + 3 batches + finalize) as backup/legacy.
   - Then calls `/api/gamma-prototype` → `generateStructuredPresentation` → Gemini Pro with the 14+-slide skeleton, insight source requirement, creative reference requirement. Post-processes to backfill `profilePicUrl` on influencer slots.
   - Saves `_structuredPresentation`. Redirects to `/edit/[id]`.
8. `/edit/[id]` renders the editor (this file's subject).
9. User edits → autosave → shares via ShareDialog → public viewer at `/s/{token}`.

---

## 13. Pain points to prioritize (my suggestions; not yet implemented)

In my rough order of pain ÷ effort:

1. **Onboarding on first load** — big hero placeholder + progress messages instead of "טוען…". 2h.
2. **Slides list right-click menu** — duplicate / delete / move / regenerate. Currently only top-of-canvas bar. 3h.
3. **Right panel collapse** on "nothing selected" — show short summary + a "Open slot editor" button instead of dumping the full form. 4h.
4. **Auto-fit zoom** on slide change. 30min.
5. **Preserve fluid sizing** — instead of setting absolute `width: Xpx` on reparent, preserve `max-width` where possible. 2h + testing.
6. **Snap during nudge** — make arrow keys snap too when snap is on. 30min.
7. **Alignment tools** (align-center-horizontal, center-vertical, align-to-slide-edges). 4h.
8. **Drag-from-panel to canvas** — use pointer events + a preview ghost. 6h.
9. **Multi-select** — shift-click + drag-box-select. Requires bigger refactor of EDITOR_SCRIPT. 8h.
10. **Lock element** — `elementStyles[role]._locked = true` + disable drag. 2h.
11. **Layer z-index control** — per-element slider in Properties. 2h.
12. **Source validation** — when Gemini returns an insight with `source`, run a quick web check (Google Search via grounding) to confirm the source exists. If not, warn in the UI. 1 day.
13. **Thumbnail iframe virtualization** — only render the 5 nearest thumbnails' iframes; rest show a static screenshot or placeholder. 1 day.
14. **PPTX export** — a serious feature. `pptxgenjs` + hand-rolled mapping from StructuredSlide → PowerPoint shapes. 2-3 days.
15. **Real version history** — table `presentation_versions (doc_id, version_id, data jsonb, created_at)`. Snapshot every 5 minutes or every N user actions. Surfaced as "restore to 10:32" list. 2 days.
16. **Analytics wired in** — emit events from HtmlSlideshow to `/api/shares/:id/event`. Dashboard in `/edit/:id` under a "Analytics" tab. 1-2 days.
17. **Comments** — new table, bubble overlay on slides during view, notifications. 2-3 days.
18. **Templates library** — `templates` table, "save as template", "new from template". 2 days.

---

## 14. How to review this

Open the editor on an existing doc (e.g. any doc that went through the wizard + generate). Things to try in priority:

1. Click around the header — does every icon feel logical? Any redundant or missing actions?
2. Drag a title. Does it go where you expect? Try dragging after typing in a sidebar field — any race?
3. Double-click a title to edit. Paste styled content from Word. What happens on blur?
4. Add a free image from the picker, then drag it onto a slot (title area). Observe layering.
5. Try the Layouts tab. Switch a deep slide (insight with source + data) to hero-cover. Content loss expected?
6. Share → open the public link in incognito. Try all viewer configs (autoplay, CTA, branding off).
7. Regenerate a single slide with a Hebrew instruction. Does it respect your drag edits or wipe them? (Currently: wipes.)
8. Cross-deck chat: "קצר את כל הטקסטים". Did it keep your free elements, bg overrides, drag positions? (It should.)
9. Export PDF. Check text rendering at 4K and gradient fidelity.
10. Mobile? (Spoiler: no mobile support. Should we add read-only?)

---

*Generated 2026-04-15 for internal review. This is what the editor is, what it can do, and what it can't. Put notes in the margins.*
