# Leaders AI — Editor Architecture Consultation Document

## TL;DR

We're building an AI-first presentation maker. A single Gemini agent generates an entire 11-slide pitch deck from a brief. The generation quality is acceptable. **The editing experience is the weakest link.** We need a first-class editor — Figma-level direct manipulation, element-level editing, AI-assisted rewrites, and PDF export that preserves the visual design.

We're torn between two architectural paths and need outside perspective before committing to months of editor work.

---

## Current state

### What we have

| Path | Status | Use |
|---|---|---|
| **HTML-Native** (v6) | Primary — all new decks | Gemini generates raw HTML per slide. Rich CSS (glassmorphism, aurora gradients, text-stroke watermarks, backdrop-filter). Each slide is a self-contained `<!DOCTYPE html>` document at 1920×1080. |
| **AST** (legacy) | Fallback — some older decks | JSON tree of `SlideElement[]` (text/image/shape). Rendered via React. Full element-level editing exists but only on the AST side. |

### Pipeline

```
Brief PDF → Research Agent (Gemini) → Wizard (9 steps, human-in-loop)
  → Slide Designer (Gemini 3.1 Pro + CSS arsenal prompt) → 11 HTML slides
  → Stored in Supabase as htmlSlides: string[]
```

### Editor today (the problem)

**HTML-Native editor** (`HtmlSlideEditor.tsx`, 253 lines):
- iframe showing the HTML
- Buttons: "Redesign with AI", "Download PDF", "Share", "Presentation mode"
- **Zero direct manipulation**: can't drag elements, can't resize, can't add/remove, can't edit text inline
- Sidebar shows slide thumbnails, clicking navigates — can't reorder, add, or delete slides
- "Redesign" = regenerate entire slide via AI with optional instruction

**AST editor** (`SlideEditor.tsx`, 508 lines):
- Figma-like: drag, resize, multi-select, alignment tools
- Add element: text/shape/image/video buttons in toolbar
- Properties panel for selected element
- Undo/redo, copy/paste/duplicate, grid/snap, zoom
- **But**: only works on decks that have `_presentation.slides[]` (AST format). New decks from the HTML-Native pipeline don't have this.

### The gap

Users want:
1. **Move elements** inside slides — drag and drop with handles
2. **Add new elements** — text boxes, images, shapes
3. **Delete elements** — click element, press Delete
4. **Resize/expand fields** — when text doesn't fit, grow the container
5. **Inline text editing** — double-click text to type, change font/size/color
6. **AI rewrite per element** — "make this shorter", "more dramatic"

The AST editor has most of this. The HTML editor has none of it. New decks go through HTML, so users get the limited editor.

---

## The two architectural paths

### Path A: Extend AST editor to cover HTML decks

After Gemini generates HTML, parse it into AST structure. Every HTML `<div style="...">` becomes a `SlideElement`. Editing happens on AST. On save/export, AST → HTML or AST → PDF.

**Pros:**
- Reuse 508-line AST editor — all the Figma-like features already work
- Single editing model — no mode split
- Undo/redo, multi-select, alignment tools all work

**Cons:**
- **HTML parsing is hard**. Gemini produces nested divs with inline styles, `position:absolute`, `transform`, custom gradients, `backdrop-filter`. Serializing to AST means flattening to bounding boxes + styles — we lose the semantic structure Gemini created.
- **Round-trip loss**: AST → HTML won't produce the same HTML. The CSS arsenal (aurora gradients, watermarks, 5-layer model) would need to be re-implemented in the AST renderer. We'd lose the visual quality that makes the deck feel premium.
- The AST type system would need to grow substantially to represent rich CSS effects.

### Path B: Build a first-class HTML editor on top of the iframe

Keep HTML as the source of truth. Build editing UI that manipulates the DOM inside the iframe directly.

**Pros:**
- **No loss of visual fidelity**. What Gemini generates is what the user edits is what exports to PDF.
- Native browser rendering — blur, gradients, shadows all work as-is.
- No serialization round-trip.

**Cons:**
- **Iframe cross-frame editing is tricky**. Selection boxes, handles, drag — all need to account for the iframe boundary. Z-index of overlays vs iframe content.
- **Undo/redo needs a DOM snapshot system** — keep HTML string history, not an in-memory tree.
- Harder to enforce design system constraints (colors, spacing) when editing is free-form.
- Multi-select across elements inside an iframe is non-trivial.

### Path C: Third option — Konva canvas

We have `KonvaSlideEditor.tsx` (258 lines) for a canvas-based approach. Slides render on a canvas, elements are Konva shapes/text. Full programmatic control.

**Pros:**
- Full control over every pixel, transform, handle
- Easy drag/resize/rotate with Konva.Transformer
- Serializable JSON state

**Cons:**
- **Canvas can't render HTML/CSS**. No backdrop-filter, no aurora gradients, no text-stroke, no custom CSS shadows.
- The entire visual arsenal we built for HTML would need to be reimplemented in canvas primitives — which means losing the premium feel.
- Font rendering on canvas is its own pain (especially RTL Hebrew).

---

## Key open questions

### 1. What IS the source of truth?

- **HTML string** — what Gemini produces today. High fidelity, hard to edit.
- **AST (JSON tree of elements)** — easy to edit, but can't represent rich CSS without becoming an HTML subset.
- **Both — store HTML, reconstruct AST on edit, serialize back**. Complex, lossy.

**Gemini outputs HTML. PDF needs HTML (for screenshot). The user edits in... what?**

### 2. How do we handle "add element"?

If the user clicks "+ Text", where does the new element go?
- In AST: `slide.elements.push({ type: 'text', x, y, ... })`. Obvious.
- In HTML: do we inject a `<div>` into the existing HTML string? At what position in the DOM? Under what parent? Inline styles or classes?

### 3. Resize behavior

A text box that says "The insight" is 400px wide. User adds 200 more words. Should:
- The box grow vertically? (CSS: `height: auto`, but then it might overlap other elements)
- The box grow horizontally? (unlikely, messes up layout)
- Font auto-shrink?
- The user just sees overflow?

Gemini originally used `-webkit-line-clamp: 3` with `overflow: hidden`. So the extra text would just be cut. Is this acceptable?

### 4. Collaboration / versioning

Do we need:
- Multi-user realtime editing (Figma-style)?
- Version history (each edit creates a version)?
- Auto-save every N seconds?

Current state: auto-save on every change (debounced 5s). No multi-user. No version history beyond DB row updates.

### 5. Slide-level operations

- Add slide → what content/layout? Blank? Duplicate of current? AI-generated?
- Delete slide → trivially easy, but what about the "flow" (cover → brief → goals → ...)? Should we warn?
- Reorder slides → drag thumbnails in sidebar.

Current HTML editor: none of this. AST editor: all of this.

### 6. How do we preserve "brand consistency" during editing?

When the user picks a color for text, should they be limited to the design system palette (primary/secondary/accent/bg/text)? Or can they pick anything?

If they type new text, should the font be auto-selected from the design system? Heebo weights only?

### 7. The "AI rewrite" interaction model

- Select element → click "AI rewrite" → prompt modal?
- Select element → side panel with suggestions appears automatically?
- Chat-style: "make this more dramatic" as free text?
- Pre-defined actions: "shorter" / "more formal" / "different angle"?

### 8. Mobile / responsive

Editor only works on desktop. Is mobile editing needed at all? Or is viewing enough?

### 9. How important is pixel precision?

A user wants the title 4px to the left. Do they:
- Drag it (pixel-imprecise but fast)?
- Type coordinates in a side panel?
- Use keyboard arrows (1px per tap, 10px with shift)?
- Use alignment shortcuts (center horizontal, align to top of another element)?

### 10. Export formats

Today: PDF (screenshot) via Supabase CDN. Also attempted: PPTX via `dom-to-pptx` (fragile).

- PPTX — do users actually need editable PowerPoint files, or is PDF enough for pitch?
- Google Slides export?
- Keynote?
- Video (MP4 of the slideshow)?

---

## Constraints we can't change

1. **Hebrew RTL** everywhere
2. **Next.js 14 App Router** on Vercel (serverless, 600s max function, 4.5MB response)
3. **Supabase** for storage + Postgres + auth (Google OAuth only)
4. **Gemini 3.1 Pro** as primary LLM — no Claude/OpenAI dependency
5. **Puppeteer-core + @sparticuz/chromium** for PDF rendering
6. **1920×1080 slides, fixed aspect ratio** (pitch decks, not responsive)
7. **Existing decks in the DB** — can't break backward compatibility

---

## What we're optimizing for

In priority order:
1. **Output visual quality** — the deck must look premium. This is the product.
2. **Speed of editing** — user changes one word, sees result in <1 second.
3. **Learnability** — a marketer (not a designer) should get it in 5 minutes.
4. **Robustness** — never lose user's work.
5. **Codebase maintainability** — we have finite hours. Simple > clever.

---

## Specific questions for the reviewer

1. **Given the constraints, which path (A/B/C) is most likely to succeed within 2-4 weeks of focused work?**

2. **Is there a proven open-source editor we should adopt rather than build?** We considered:
   - Tiptap (rich text, but not layout editing)
   - Lexical (Meta's editor — text-focused)
   - Plate (rich text, similar limitations)
   - Craft.js (layout editor, but React-heavy integration)
   - GrapesJS (web page builder — closest to our need, but feels heavy)
   
   None of these feel like an obvious fit for "edit a Gemini-generated presentation slide". Are we missing something?

3. **Is the HTML-first approach fundamentally wrong?** Should we instead have Gemini output structured JSON (with a richer schema that covers gradients, blur, etc.) and render it ourselves? That gives us full control at the cost of prompt complexity.

4. **How do tools like Tome, Gamma, Beautiful.ai handle this?** They clearly output presentations that look rich and are editable. Do they compromise on visual effects? Do they have a proprietary renderer?

5. **What's the minimum viable editor** for our users (B2B agencies creating influencer marketing proposals)? We might be over-engineering. Users might just need: edit text, swap image, change a color, regenerate a slide.

6. **PDF export strategy**: we chose screenshot PDF via Supabase CDN (pixel-perfect, 10-40MB, no selectable text). Is this a mistake? Should we invest in layered PDF quality (Gotenberg, Prince, or a custom renderer)?

7. **Data model**: should a slide be `{ html: string }` or `{ elements: Element[], designSystem: DS }`? The answer probably dictates everything else.

---

## Appendix: file references

- `src/app/edit/[id]/page.tsx` (1393 lines) — the edit page routing between two editors
- `src/components/presentation/HtmlSlideEditor.tsx` (253) — current HTML "editor" (mostly viewer)
- `src/components/presentation/SlideEditor.tsx` (508) — AST editor with Figma-like features
- `src/components/presentation/KonvaSlideEditor.tsx` (258) — canvas experiment
- `src/components/presentation/EditorToolbar.tsx` (383) — AST editor toolbar
- `src/lib/gemini/slide-designer.ts` — the HTML generation prompt ("CSS arsenal")
- `src/lib/playwright/pdf.ts` — PDF rendering (screenshot + page.pdf paths)

---

*Document created 2026-04-14 for external architecture review. Looking for: direction on which path to invest in, known pitfalls we should avoid, and whether there's a tool we should adopt instead of building.*
