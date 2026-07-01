# Presentation Engine Re-Architecture — Design Spec

**Date:** 2026-06-30
**Status:** Draft — pending user review
**Owner:** Leaders platform (creative deck / "מצגת קריאייטיבית")

---

## תקציר בעברית (TL;DR)

הבעיה: מנוע יצירת המצגות גורם ל-AI "לצייר" כל שקופית כדף HTML חופשי. זה יפה, אבל (1) ההורדות (PDF/PPTX) נכשלות, ו-(2) ה-PowerPoint שיוצא הוא תמונות שאי אפשר לערוך.

מה עושים — שלושה דברים, בלי לאבד שום יצירתיות:

1. **משנים את מה שה-AI פולט:** במקום HTML שנזרק, הוא פולט **מסמך מובנה חופשי** (כל אלמנט בכל מקום, כל סגנון — בדיוק כמו היום, רק כנתונים). את זה כבר בניתם שלוש פעמים בקוד; נאחד ונשלים.
2. **מחליפים את מכונת הרינדור:** מ-`@sparticuz/chromium` שקורס בתוך השרת ל-**Gotenberg** (שירות בדוק שאלפי חברות משתמשות בו).
3. **משנים את ההורדה:** הקובץ נשמר בענן והמשתמש מקבל לינק (signed URL) — לא דוחפים קובץ כבד דרך השרת.

התוצאה: כל הורדה עובדת; PDF תמיד מושלם בעברית; PowerPoint עריך-ככל-שאפשר אוטומטית (מה ש-PowerPoint יודע → ניתן לעריכה, אפקטים פראיים → תמונה נאמנה); היצירתיות לא נפגעת.

---

## 1. Context & problem

The "creative deck" product (`/create-proposal` → research → wizard → generate → edit → preview → download) currently generates each slide as a **standalone free-form HTML document** produced by Gemini. Strengths: maximum visual freedom, purpose-built for Hebrew RTL + per-brand branding. Weaknesses, confirmed by code audit:

1. **Downloads fail.** PPTX is returned as a raw buffer from a serverless function (`src/app/api/export-pptx/route.ts:119`) — anything over Vercel's ~4.5MB response cap fails (often silently, 413). PDF rendering runs `@sparticuz/chromium` inside serverless (`src/lib/playwright/pdf.ts:16`) with no error handling — cold-start / binary issues → 500. Supabase upload errors are swallowed (`src/app/api/pdf/route.ts:283`) → client gets a URL to a non-existent file → 404. Client errors are generic ("שגיאה ביצירת ה-PDF").
2. **PPTX is not editable.** `src/lib/export/pptx-generator.ts` renders HTML→PNG and embeds the image. The PowerPoint is a picture; not a word can be edited.
3. **Monoliths + fragility.** `src/lib/gemini/slide-designer.ts` (2,309 lines), `src/templates/quote/premium-proposal-template.tsx` (2,782 lines). Heavy, slow (90–180s/batch), error-swallowing throughout.
4. **Three half-built structured systems, none in production.** `src/types/presentation.ts` (absolute-positioned AST), `src/lib/slide-engine/*` (semantic tokens → layout-resolver), `src/lib/gemini/layout-prototypes/*` (`StructuredPresentation` archetype+slots, editor-ready, with a React renderer). The team has repeatedly reached for a structured representation but never finished/wired one.

## 2. Goals / non-goals

**Goals**
- Re-architecture aimed at the **highest achievable quality** (explicit user direction).
- Output **both**: pixel-perfect **PDF** (view-only client deliverable) **and** an **editable PPTX** (team/client can edit).
- **Preserve full creative freedom** — the AI must still break out of known templates. Creativity is never sacrificed (explicit user direction: "creativity always").
- **Eliminate the download-failure class** entirely.
- Cover the **whole flow**, not just the generation core: editing, single-slide regen, images, research-report PDF.
- **Build on existing code**, not greenfield. Consolidate the three structured systems into one.

**Non-goals**
- Replacing the AI engine with an external service (Gamma/Presenton) — rejected: weak Hebrew RTL + brand control, data-privacy.
- 100% visual parity between PDF and PPTX (physically impossible — see §4.3).
- Touching the research/wizard *content* logic — it works; we only connect its output to the new IR.

## 3. The core decision — one rich, free-form IR ("creativity always")

The fear "structured = boring templates" conflates two opposite things:

- **Rigid slot-templates** (8 fixed layouts, AI fills holes) → everything looks the same. **Rejected.**
- **A rich free-form document model** — the AI places *any element, anywhere, in any style*, exactly as today, but stored as **structured data** instead of a throwaway HTML string. **Zero creativity lost.** This is what `src/types/presentation.ts` already models (absolute x/y/w/h elements; text/image/shape/video/mockup/compare/logo-strip/map; gradients, masks, blend-modes, text-stroke, 3D, animations).

**Decision:** the **canonical IR is the rich absolute-positioned AST** (extend `src/types/presentation.ts`). The other two systems are folded in:
- `layout-prototypes` **archetypes become "smart starting points"** — generators that emit AST the AI can then freely override (plus its `meta.validation` fake-detection and `freeElements`/`elementStyles` editor affordances migrate into the AST).
- `slide-engine` semantic tokens become an **optional generation strategy** whose resolver emits AST.

One IR. Multiple generation strategies feed it. Two renderers consume it.

## 4. Architecture

### 4.1 Generation: AI → IR (async job)
- AI (`callAI`, Gemini-primary → Claude-fallback, `responseSchema` structured output — already supported) emits the **AST** for the deck, with full free-form freedom. Archetypes seed good starting layouts; the few-shot bank (`src/lib/slide-engine/few-shot-bank.ts`) and existing validation passes (`vision-inspector.ts`, `lite-validation.ts`) raise quality.
- **Zod validation + retry** on malformed AI output.
- **Version-stamp** each slide with the design-system/IR version used (fixes the "no version tracking → unsafe re-render" gap).
- Persist IR on the document (replaces raw `_htmlPresentation.htmlSlides[]` for new docs).

### 4.2 Renderer 1 — PDF (always pixel-perfect)
- AST → HTML → **Gotenberg** (Chromium) → PDF. Build on the **existing AST→HTML path** (`presentationToHtmlSlides`, already used as the PDF fallback in `src/app/api/pdf/route.ts`); borrow rendering technique (CSS arsenal, RTL, decorations) from `layout-prototypes/renderer.tsx`.
- Hebrew RTL + Heebo fonts **bundled in the Gotenberg container** (full control vs serverless).
- Always upload to Supabase Storage → return **signed URL**.

### 4.3 Renderer 2 — PPTX (editable, graceful degradation)
- AST → **pptxgenjs** native objects, mapped per element:
  - `text` → native **text box** (editable). If it uses PPTX-inexpressible effects (`textStroke`, `gradientFill`, `mixBlendMode`, fancy `textShadow`) → that element rasterizes to a transparent PNG fallback.
  - `image` → native **picture**. `shape` (rect/circle/line, fill, basic border/radius) → native **shape**. `backdropFilter`/`mask`/blend → image fallback.
  - `video`/`mockup`/`compare`/`logo-strip`/`map` → image/placeholder (PowerPoint has no native equivalent).
  - background solid/gradient/image → native.
- **The rule (automatic, per element):** PPTX-expressible → native editable object; browser-only magic → faithful image. The user never picks a mode; degradation is per-element and automatic. This is the one unavoidable physics constraint (PowerPoint's object model < a browser's) and applies to every tool on earth.
- Optional later: **pptx-automizer** with per-archetype brand master `.pptx` templates for maximum brand fidelity on editable slides.

### 4.4 Async orchestration + reliable downloads
- Reuse **`@upstash/workflow`** — already proven in `research-hub` (`src/app/api/research-hub/workflow/route.ts`). New `deck_jobs` + `deck_job_events` tables mirror `research_jobs`.
- Jobs: `generate` (AI→IR) and `render` (IR→PDF+PPTX→storage→signed URLs). Browser never holds a long request; QStash retries transient failures.
- **Iron rule:** every output goes to Supabase Storage and returns a **signed URL**. No direct-buffer returns, no 4.5MB cap, no synchronous timeout. Status/progress/specific-error surfaced via `deck_job_events` (replaces console-only logs and generic client errors).

### 4.5 Whole-flow coverage
- **Edit** (`/edit/[id]`): edits mutate the **IR**, not HTML strings (`elementStyles`/`freeElements` already support drag/resize).
- **Single-slide regen** (`/api/regenerate-slide`): AI regenerates that slide's **IR**; user instruction **sanitized** (closes current prompt-injection risk).
- **Images**: FAL.ai (`/api/image`) + scraped brand assets (`/api/scrape`) referenced by IR image elements (URLs in the `assets` bucket).
- **Research-report PDF**: also rendered via Gotenberg (replaces its bespoke Puppeteer path).

## 5. Migration & backward compatibility
- Old docs (`_htmlPresentation.htmlSlides[]` raw HTML) keep a **legacy HTML→Gotenberg→PDF** path so existing decks still export PDF; their PPTX stays image-based. **No existing data breaks.**
- New generations use the IR → both outputs.
- No attempt to parse old arbitrary HTML back into IR (unreliable); old decks remain legacy.

## 6. Consolidation / cleanup (after IR is canonical)
- Retire the duplicate structured systems: fold `layout-prototypes` renderer into the AST renderer; keep `slide-engine` only as an optional generation strategy (or retire).
- Retire the raw-HTML generation path in `slide-designer.ts` and the image-based `pptx-generator.ts`.
- Outcome: **one IR, one renderer pair, modular files** replacing the 2,300- and 2,782-line monoliths.

## 7. Phasing
1. **Reliable rendering + downloads (infra).** Stand up Gotenberg + `@upstash/workflow` `render` job + signed-URL downloads. Wire *current* HTML slides → Gotenberg → PDF, and current PPTX → storage+signed URL. **Fixes download failures immediately, with no engine change.**
2. **Canonical IR (AST).** Lock/extend the schema, Zod validation, version-stamp; complete AST→HTML renderer for PDF.
3. **AI generates IR.** `generate` job; AI outputs free-form AST (archetypes as starting points + few-shot + validation); persist on document.
4. **PPTX renderer with graceful degradation.** AST→pptxgenjs native objects + per-element image fallback.
5. **Wire edit/regen to IR + consolidate/cleanup** the legacy structured systems and raw-HTML path.

## 8. Risks & mitigations
- **PPTX fidelity for "wild" slides** → images. *Accepted & communicated; automatic per-element; true of all tools.*
- **AST→HTML renderer completeness** (all element types must render for PDF). *Mitigation: start from `renderer.tsx`; cover element types incrementally with visual checks.*
- **Gotenberg ops** (a service to run; ≥1GB RAM; LibreOffice module is single-instance-locked). *Mitigation: we primarily use the Chromium HTML→PDF path, which scales; LibreOffice not on the critical path.*
- **AI quality on free-form AST.** *Mitigation: archetype starting points, few-shot bank, existing validation passes (vision-inspector/lite-validation), Zod schema + retry.*
- **Rejected: LibreOffice PPTX→PDF single-source** — not lossless, font substitution, unverified Hebrew RTL fidelity; would jeopardize "perfect PDF in Hebrew."

## 9. Technology verdict (researched)
- **Rendering:** adopt **Gotenberg** (MIT, Docker, Chromium+LibreOffice+PDF engines, production-trusted) — replaces fragile serverless Chromium.
- **Editable PPTX:** **pptxgenjs** (already a dep) for from-scratch native objects; **pptx-automizer** optional for template-based brand fidelity.
- **AI engine:** keep in-house (Gemini→Claude via `callAI`) — external tools (Gamma/Presenton) regress Hebrew RTL + brand control + privacy.

## 10. Open questions
- Exact `deck_jobs` schema fields (mirror `research_jobs`; finalize in plan).
- Where Gotenberg runs (Railway/Render/Fly/self-host) and image build (Heebo fonts) — infra decision in the plan.
- Whether to keep `slide-engine` as a generation strategy or retire it — decide during consolidation (Phase 5).
