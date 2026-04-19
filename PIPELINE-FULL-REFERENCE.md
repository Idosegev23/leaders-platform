# Presentation System — Architecture Research & Roadmap

## Date: April 9, 2026
## Source: DeepPresenter paper + Model Benchmarks 2026 + User Feedback (Liran)

---

## Core Insight: The Missing Render → Inspect → Fix Loop

Current: GPT writes HTML "blind" → safety CSS → hope for the best.
Needed: GPT writes → Playwright renders → Vision model inspects → Fix defects → Save.

"Environment-grounded reflection" (DeepPresenter) — the single biggest quality improvement possible.

---

## Model Selection (2026 SOTA)

| Task | Current | Recommended | Why |
|------|---------|-------------|-----|
| Insight generation | GPT-5.4 | **Claude Opus 4.6** | Best creative writing, less generic |
| Strategy writing | GPT-5.4 | **Claude Opus 4.6** | Narrative coherence |
| Planner (SlidePlan) | GPT-5.4 | **Claude Opus 4.6** | Better Hebrew |
| Design System | Gemini Pro | **Gemini 3 Pro** | Best for design agents |
| HTML Generation | GPT-5.4 | **Claude Sonnet 4.6** | 5x cheaper, great code |
| Vision Reflection | — | **Opus 4.6 vision** | Defect detection |
| Copywriting | — | **GPT-5.4** | Brand voice |

---

## 5-Week Roadmap

### Week 1 — Quick Wins (max impact / min effort)
- [ ] dom-to-pptx for PPTX export (client-side, no backend change)
- [ ] Anthropic prompt caching on system prompts (70% cost saving)
- [ ] Promise.all on batches (40% speed improvement, 5-line change)
- [ ] Planner + Insight → Claude Opus 4.6 (quality leap)

### Week 2 — Streaming UI
- [ ] Vercel AI SDK 6 streamObject + useObject
- [ ] Slides appear live in UI during generation
- [ ] Cache design system per brand fingerprint
- [ ] Resume-on-refresh

### Week 3 — Reflection Loop (DeepPresenter pattern)
- [ ] Post-render: Playwright screenshot → Vision model inspection
- [ ] Structured defect detection (text overflow, missing images, low contrast)
- [ ] Auto-revision if defects found
- [ ] Fixes "text bleeds", "broken CSS in PDF", "images not used"

### Week 4 — Canvas Editor (react-konva)
- [ ] Migrate from iframe to Konva scene graph
- [ ] Transformer: resize, rotate, snap-to-grid, alignment guides
- [ ] Undo/Redo (immer + stack)
- [ ] Properties panel (font, color, size, position)
- [ ] PDF via stage.toDataURL() — 20x faster, no Playwright

### Week 5 — Content Quality Deep Work
- [ ] Insight: Contrarian Hypothesis → Tension Finder → Crystallization (3-stage chain with Opus)
- [ ] Strategy pillars ↔ Deliverables JSON linkage
- [ ] Anti-pattern bank in system prompt
- [ ] Wizard 10→7 steps (merge quantities+media, creative+deliverables)

---

## Key Architecture: Reflection Loop

```
Slide HTML generated
    ↓
Playwright.screenshot() [headless, 1920×1080]
    ↓
Vision Model (Opus 4.6 or Gemini 3 Pro):
  Structured defect report:
  {
    textOverflow: boolean,
    titleClipped: boolean,
    imageUsed: boolean,
    contrastOk: boolean,
    layoutBalanced: boolean,
    issues: string[]
  }
    ↓
If defects → targeted revision prompt → regenerate ONLY that slide
If clean → save to DB
```

**Why structured booleans, not "rate 1-10":**
Models are much better at detecting specific defects than judging general aesthetics.

---

## Key Architecture: Streaming

```
Client (useObject hook from AI SDK 6)
    ↓ SSE stream
Server (streamObject)
    ↓ per-slide partial JSON
LLM (Claude Sonnet 4.6)
    ↓ schema-validated slide
Client renders immediately in UI
```

**Speed impact:** 3-5 minutes → 45-75 seconds (slides render as they're generated).

---

## Key Architecture: Multi-Model Content Pipeline

```
Wizard Data
    ↓
[Claude Opus 4.6] Insight Generator:
  1. Contrarian Hypothesis (what doesn't the audience know about themselves?)
  2. Tension Finder (what behavioral tension exists?)
  3. Insight Crystallization (one razor-sharp sentence)
    ↓
[Self-Critique Pass] Check against anti-pattern bank
    ↓
[Claude Opus 4.6] Strategy Builder:
  headline + 3 concrete pillars → each linked to deliverables
    ↓
[GPT-5.4] Marketing Copy Polish (campaign names, taglines)
    ↓
[Gemini 3 Pro] Design System (colors, typography, creative direction)
    ↓
[Claude Sonnet 4.6] HTML Slides × N (streaming, parallel)
    ↓
[Opus 4.6 vision] Reflection Loop (screenshot → inspect → fix)
    ↓
Final Presentation
```

---

## Tools & Libraries

| Tool | Purpose | Effort | Impact |
|------|---------|--------|--------|
| `dom-to-pptx` | HTML → editable PPTX with embedded fonts | 2 days | HIGH — #1 user request |
| `react-konva` | Canvas-based editor (replaces iframe) | 2 weeks | HIGH — unlocks real editing |
| `Polotno SDK` | Alternative: full design editor on Konva | 1 week | HIGH — more opinionated |
| Vercel AI SDK 6 | Streaming + agent abstraction | 3 days | HIGH — UX transformation |
| Anthropic prompt caching | 70% cost reduction on repeated prompts | 1 day | HIGH — saves money |
| `jsPDF` + canvas | Client-side PDF generation | 2 days | MEDIUM — removes Playwright dependency |

---

## Current vs Target Metrics

| Metric | Current | Target (Week 5) |
|--------|---------|-----------------|
| Generation time | 3-5 minutes | < 75 seconds |
| Quality score | 87-92/100 | 95+/100 |
| Text overflow rate | ~15% of slides | < 2% |
| Image usage rate | ~60% | > 95% |
| PDF generation | 30-90 seconds | 2-3 seconds (client-side) |
| PPTX export | ❌ | ✅ editable with fonts |
| Editor features | 3 (edit text, drag, regenerate) | 12+ (full design editor) |
| Insight quality | "generic" (Liran feedback) | "punching" — data-backed |
| Strategy quality | "in the air" (Liran) | concrete pillars → deliverables |
| Cost per presentation | ~$2-3 | ~$0.50-1.00 (with caching) |
