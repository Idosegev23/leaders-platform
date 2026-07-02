# Art-Director Engine Upgrade — Design Spec

Approved by user 2026-07-02 ("שדרוג כירורגי"; Gemini 3.1 Pro stays as the Hebrew copywriter; hybrid product imagery; ≤10min/deck; verification failures flag-in-editor, never block).

## Problem
Decks look "template-y" (~80%). Root causes found by code audit + verified research:
1. **Wizard data collected but not binding** — presentation-agent treats `wizardData` as optional context and regenerates content procedurally (strategyPillars, keyInsight, keyMessages, brandStory, toneOfManner, visualDirection, referenceImages all collected, largely unsurfaced).
2. **Logo chain lands on favicon** — `generate-visual-assets` falls back scraped favicon → Clearbit. **Clearbit Logo API is dead (DNS gone since Dec 2025, verified 2026-07-02)** so the chain silently degrades. No verification that a "logo" is actually the brand's logo.
3. **No product imagery** — slide images are generic AI scenes/scraped heroes; user requires the brand's actual products in imagery.
4. **No self-verification** — nothing checks legibility, overlap, image relevance, or wizard coverage.

## Verified research anchors (deep-research, 3-vote adversarial each)
- Gemini 3 Pro Image (Nano Banana Pro): up to 14 reference images (6 hi-fi objects) — brand-faithful scenes from real product photos. Confirm exact model id from live docs at implementation.
- Hebrew NOT in Gemini image-gen best-performance list → images stay text-free; Hebrew renders in the HTML layer.
- Fallback image-gen: fal.ai FLUX.2 [pro] edit (9 refs, `@fal-ai/client`), optional.
- Verification: frontier VLMs (93–95% brand-ID). Two-phase (VLM identify → LLM judge match) lifts recall 65%→92%. Binary/pairwise checks only; never absolute 1–10 scores; A/B order swap; few-shot exemplars help. JSON-schema validity ≠ value correctness (15–25pp gap) → content-level assertions required.
- Logo chain 2026: Brandfetch CDN `https://cdn.brandfetch.io/{domain}?c={BRANDFETCH_CLIENT_ID}` primary; Logo.dev fallback; Clearbit excluded.
- Art-director rules: no citable web source survived verification → codify from local design expertise; contrast floors enforced in code.

## Components (all on branch `feat/art-director-engine`)

### C0. Shared foundations — `src/lib/brand/types.ts`, `src/lib/brand/vlm-verify.ts`
`BrandAssets` document shape (stored on `documents.data._brandAssets`): verified logo {url,source,status,reasoning}, productImages[{url,status,reasoning}], sceneImages[]. `vlmVerify()` = two-phase Gemini-vision helper with binary verdicts, used by C1/C2/C3/C5. Uses existing `ai-provider.ts` fallback conventions; Gemini vision primary.

### C1. Logo resolver v2 — `src/lib/brand/logo-resolver.ts`
Chain: scraped site logo → Brandfetch CDN → Logo.dev → OG image. Favicon is never auto-accepted (candidate of last resort, always flagged). Every accepted candidate passes vlmVerify ("what brand is this logo? real logo or favicon/placeholder?" → judge vs brand/domain). Missing env keys degrade gracefully (skip that source). Replaces the Clearbit references in `generate-visual-assets`.

### C2. Product images — `src/lib/brand/product-images.ts`
From existing Apify scrape output + OG/product pages, collect candidates → vlmVerify binary "does this actually show the brand's product?" → up to 6 verified refs into `_brandAssets.productImages`. Wizard `referenceImages` (creative/deliverables steps) join the candidate pool with priority.

### C3. Scene generator — `src/lib/brand/scene-generator.ts`
Nano Banana Pro with product refs + art-direction prompt (English, text-free instruction, palette/visualDNA aware) → upload to Supabase `assets` → post-gen vlmVerify product fidelity → one retry → fallback to best real product photo. Used for hero-cover/full-bleed/split imagery.

### C4. Wizard contract — `src/lib/gemini/wizard-contract.ts`
`buildWizardContract(wizardData)` → per-slide-type binding requirements (verbatim-preserving: strategyPillars, keyInsight+source, keyMessages, activity concept, budget/CPE/CPM/reach, influencers, targetDescription…). Injected into presentation-agent prompt as MANDATORY ("loyalty to wizard: embellish language, never replace facts/structure"). `checkWizardCoverage(slides, contract)` → per-field fuzzy presence check → targeted single-slide repair pass → residual misses flagged via `slide.meta.validation`.

### C5. Design rules + slide critic — `src/lib/design/art-director-rules.ts`, `src/lib/qa/slide-critic.ts`
Codified rules injected into designSystem + slide-designer prompts: type scale, contrast floors (body ≥4.5:1, display ≥3:1 — asserted in code with auto-correction, reusing luminance math), 60-30-10 color roles, Hebrew display/body font pairings, one-dramatic-choice-per-slide, 15-slide narrative rhythm, whitespace minimums, image treatment recipes. Slide critic: render slides → PNG (existing Playwright path) → Gemini vision binary checklist (legibility, overlap/overflow, empty zones, image relevance, RTL alignment) with few-shot exemplars → targeted auto-fix (elementStyles/color/image swap) → one re-check → residual flags to editor.

### C6. Integration
`generate-visual-assets` uses C1+C2 (+C3 scene pre-generation); `generate-full` receives the wizard contract + design rules and runs C4 coverage + C5 critic within the 10-minute budget (stages parallelized); editor surfaces `meta.validation` flags (existing hooks). New envs: `BRANDFETCH_CLIENT_ID` (required for Brandfetch source), `LOGODEV_TOKEN` (optional), `FAL_KEY` (optional). Admin-config model knobs follow the existing `config/defaults.ts` pattern.

## Error handling
Every verification failure flags and continues (user decision). Every new external source degrades gracefully to the previous behavior. Budget guard aborts QA loop (not generation) at the 10-minute ceiling.

## Testing
- `npx tsc --noEmit` + `npm run build` gate every phase.
- `scripts/verify-brand-assets.mts` — run C1/C2 against real brands (KUNI domain, others) from local env (Brandfetch/Logo.dev reachable locally).
- **Gemini API host is blocked from the dev sandbox** (all calls 403) — VLM/image-gen paths get code review + mock-shape tests locally; live E2E happens on prod (KUNI regeneration) after deploy.

## Rollout
Phase A: C0+C1+C4 (fixes live favicon bug + biggest fidelity win) → Phase B: C2+C3 → Phase C: C5 → Phase D: C6 wiring + prod E2E on KUNI.
