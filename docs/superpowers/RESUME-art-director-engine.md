# RESUME — Art-Director Engine (deck quality upgrade)

> Last updated: 2026-07-02. Untracked working-tree file.

## ⚡ WHERE WE ARE (one line)
**Fully built, review-fixed, gates green, committed as `f426bba` on `feat/art-director-engine` — waiting for the user's go to merge → prod** (user chose "לחכות"). No Brandfetch key yet (user chose to defer; that source is skipped gracefully).

```bash
git checkout feat/art-director-engine   # tip f426bba (spec at 1869921). main == prod (b3f9a66).
```

## What this branch does (spec: docs/superpowers/specs/2026-07-02-art-director-engine-design.md)
1. **Wizard contract** (`src/lib/gemini/wizard-contract.ts`) — wizard fields become BINDING prompt requirements + post-gen fuzzy coverage check + one deadline-bounded repair pass; residual misses → `_wizardCoverage` flags. Reads all 3 document shapes (step-keyed / `_wizardState.stepData` / `_stepData`).
2. **Logo v2** (`src/lib/brand/logo-resolver.ts`) — scrape → Brandfetch CDN (needs `BRANDFETCH_CLIENT_ID`, currently unset → skipped) → Logo.dev (`LOGODEV_TOKEN`, unset → skipped) → og:image; favicon never auto-verified. Clearbit removed (dead since Dec 2025 — that's what caused KUNI's favicon logo).
3. **Product images** (`src/lib/brand/product-images.ts`) — real product photos, VLM-filtered, wizard referenceImages prioritized, → `_brandAssets.productImages`.
4. **Scene generator** (`src/lib/brand/scene-generator.ts`) — Nano Banana Pro lifestyle scenes seeded with ≤6 product reference photos, text-free (Hebrew stays in HTML), fidelity-verified, 1 retry, → `_brandAssets.sceneImages`. Model env `GEMINI_IMAGE_MODEL`.
5. **VLM verify** (`src/lib/brand/vlm-verify.ts`) — shared two-phase (vision identify → LLM judge) with binary verdicts, negation-aware judge, capped streamed downloads (`readBodyCapped`).
6. **Design rules** (`src/lib/design/art-director-rules.ts`) — prompt rulebook + `auditDesignSystem()` code-level contrast/font enforcement, injected in presentation-agent.
7. **Slide critic** (`src/lib/qa/slide-critic.ts`) — rendered-PNG binary checklist QA (deadline-gated render + per-critique races) → `_slideCritique` flags. Auto-fixes NOT applied server-side.
8. **Persist-first routes** — generate-full saves the deck BEFORE the critic runs and re-saves flags after; repair pass has `deadlineTs`; visual-assets stages have 90s/120s budgets. Verification NEVER blocks generation.

## Provenance
Built via multi-agent workflow (run wf_8d835a4a-a88): foundations → 5 parallel modules → integration → build gate + 2 adversarial reviewers. All 11 review findings fixed by hand afterwards (persist-first, deadlines, unchecked-flag filtering, judge negation, `_stepData`, capped reads, insert-before-closing). Gates at commit time: tsc clean, next build clean, 6 test scripts green (`npx tsx scripts/test-*.mts`).

## 🔴 NEXT STEPS (in order)
1. **User go** → merge `feat/art-director-engine` to main (auto-deploys prod).
2. **Live E2E on prod** (Gemini is BLOCKED from the dev sandbox — only prod can test generation): create/regenerate a deck (e.g. KUNI flow: `/api/generate-visual-assets` then `/api/generate-full`), then inspect `_brandAssets` (logo status/source, productImages), `_wizardCoverage`, `_slideCritique` on the document row + look at the deck in `/edit`.
3. **Optional keys** (each just enables a source): `BRANDFETCH_CLIENT_ID` (developers.brandfetch.com → Logo Link, free), `LOGODEV_TOKEN`, `GEMINI_IMAGE_MODEL` (defaults in code), `FAL_KEY` (unused fallback path for now). Push with `printf %s '<val>' | vercel env add NAME production` (NEVER echo — [[feedback_vercel_env_add_no_echo]]).
4. Editor UI for the new flags (`_wizardCoverage`, `_slideCritique`, unverified-logo badge) — deliberately deferred; flags are persisted and API-visible already.

## Local verification commands
```bash
npx tsc --noEmit && npm run build
for t in scripts/test-*.mts; do npx tsx $t; done
npx tsx scripts/verify-brand-assets.mts <domain> <brand> --no-vlm   # HTTP chain only (VLM stubbed)
```
