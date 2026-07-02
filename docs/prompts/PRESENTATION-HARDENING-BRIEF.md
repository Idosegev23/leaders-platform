# Presentation Hardening — Claude Code Brief (v3)

**Purpose:** make every deck the pipeline generates truthful, complete, and consistent — so the failure modes found in the real Soltam deck can never ship again. This brief is the single source of truth for the hardening: what is already done, the canonical ruleset, and the remaining in-repo steps.

**Origin:** an art-director review of a live generated deck (Soltam / Leaders) surfaced 12 concrete defects. Each is now mapped to a hard guard at two layers — **generation** (the agent prompts) and **QA** (the vision inspectors).

---

## 0. The 12 defects this must prevent

1. Fabricated/foreign logo on the hero product (a Fred-Perry-style laurel on the "Soltam" pan).
2. Off-category imagery (rustic clay pots for a stainless-steel / pressure-cooker brand).
3. Unfilled placeholder tokens shipped (`oztelem@@`, `lichtenstadt@@`, …).
4. Count mismatch across slides (deliverables promised **7** influencers, talent slide showed **4**).
5. Empty "Risk Management" slide carrying a copy-pasted **"INSIGHT"** watermark.
6. Broken sequence (timeline jumped Week 1 → 3 → 4, no Week 2).
7. Unverifiable stat + citation ("78% — Nielsen Consumer Trust in Social Media, 2023").
8. No budget / price anywhere in a proposal that quotes deliverables.
9. Goals include "sales" but KPIs measure only reach/engagement (no conversion mechanism).
10. Non-audience "everyone 25–65".
11. Recycled backgrounds (same clay-pot image on 2 slides; same gold-splash on 2 slides).
12. "Big Idea" was an abstract oil-splash with no concrete creative proof (no mock post/storyboard).

---

## 1. Current state — already applied and verified

All changes below are committed to the working tree and **pass `tsc --noEmit` with 0 project-wide errors**. They are hard-coded prompts (take effect on the next deploy) except where noted.

### 1.1 `src/lib/gemini/presentation-agent.ts` (the generation "heart")
- **Bug fix:** the user prompt hard-coded `"תכנן Design System + 11 שקפים"`, contradicting the system prompt's dynamic 14–22 rule. Replaced with a story-derived length instruction.
- **New `<visual_truth>` block:** real-logo-only (never a hero product with a fabricated logo), category-match imagery, zero placeholders, no recycled/near-duplicate images.
- **New `<proposal_integrity>` block:** budget present, goal↔KPI + measurement mechanism, narrow behavioral audience, cross-slide count consistency, complete numbered sequences, sourced external stats, creative proof, no empty slides, label/watermark must match section.
- **`<self_check>` expanded** from 6 to 13 checks (adds the truth/integrity gates).
- **Tool descriptions reinforced:** `generate_slide_html` (real values only, real-product imageUrl, label matches section) and `generate_brand_image` (text- and logo-free; never render the client's product with a logo).
- **Repair prompt reinforced:** repairs must keep real values, no fabricated logo, label matches section.

### 1.2 `src/lib/design/art-director-rules.ts`
- Added hard rules **26–31**: composition balance (no accidental dead zones / orphan card row), label==section (+ no empty slide), image truth (real product, right category), no near-duplicate backgrounds, zero placeholder, stated-count == shown-count.

### 1.3 `src/lib/qa/slide-critic.ts` (QA gate for the `generate-full` route)
- Added three binary checks — `imageTruthful`, `noPlaceholder`, `labelMatches` — in lockstep across the interface, `CHECK_KEYS`, `CRITIQUE_SCHEMA`, `uncheckedCritique`, and all few-shot exemplars (now 9 keys each) plus a new truth-failure **EXAMPLE 4**.
- Rules updated: content-truth checks may be **issue-only** when no CSS/image auto-fix applies; a fabricated/off-category product image gets a `swap-image` fix.

### 1.4 `src/lib/slide-engine/vision-inspector.ts` (QA gate for the `slide-designer` engine)
- Same three checks added to the schema (`required` + properties), the `SlideDefectReport['checks']` interface, the inspector prompt, and **all three** default constructors (`defaultChecks`, `analyzeHtmlOnly`, `makeDefaultReport`); the HTML-only fallback gets a regex placeholder heuristic.

### 1.5 `src/lib/gemini/proposal-agent.ts` (PDF proposal fallback)
- `<non_negotiables>` extended: budget present, goal↔measurement, narrow audience, sourced external stats, zero placeholders.

### 1.6 `docs/prompts/PROMPTS-LIBRARY-v2.md`
- Appended a "Hardening v3" section documenting all of the above + the failure→guard map.

---

## 2. Canonical ruleset (preserve and extend — do not regress)

Any change to deck generation must keep these invariants. They are written to be testable.

**Visual truth**
- A product shown as hero is the client's **real** product from verified brand imagery. Never a generated product bearing a fabricated or foreign logo. No verified image → logo-free atmospheric background (never an invented product).
- Imagery matches the brand's actual **product category**.
- No image (by URL or by near-duplicate appearance) repeats across slides.

**No placeholders**
- No `@@`, `TBD`, `lorem`, bare `@`, `[...]`, dummy name, or unsourced round number is ever rendered. Real value or the element is omitted.

**Proposal integrity**
- Budget present when the brief has one (else explicitly "טרם הוגדר").
- Every stated goal has a measurable KPI **and** a mechanism (sales → promo code / UTM / landing page).
- Audience is a narrow behavioral segment, never a demographic catch-all.
- A count stated in words equals what is shown (7 → 7). Numbered sequences are consecutive (no gaps).
- Every external statistic carries a real, named, dated, supporting source — or it is dropped.
- The Big Idea is shown concretely (example reel/story/scene), not an abstract background + paragraph.

**Composition & labels**
- No empty content slide; every eyebrow label / watermark names the slide's own section.
- Card/stat rows are balanced on the canvas — no stranded top row over a dead lower half; no orphaned last row.

**QA gates enforce the same truths** (`slide-critic` 9 checks; `vision-inspector` 11 checks). If you add a check to one gate, add the parallel key to every touchpoint listed in §1.3 / §1.4.

---

## 3. Remaining steps — run these in the repo

> Do these in order. Each has an explicit acceptance check.

1. **Full typecheck + build + lint.**
   ```bash
   npx tsc --noEmit && npm run build && npm run lint
   ```
   Accept when tsc and build are clean. (tsc is already verified clean; run build to catch bundler/route issues.)

2. **Close the DB-override trap for `proposal-agent`.**
   `PROMPTS-LIBRARY-v2.md` warns that `proposal_agent.system_prompt` / `proposal_agent.writing_rules` can be overridden by a DB row in `admin_config` (category `ai_prompts`). The inline fallback is now hardened, but a stale DB row will shadow it.
   - Query `admin_config` for those two keys. If rows exist, patch them with the same `<non_negotiables>` additions (budget, goal↔measurement, narrow audience, sourced stats, zero placeholders), or delete the rows to fall back to the hardened inline version.
   - Accept when the effective proposal prompt (DB-or-fallback) contains the integrity non-negotiables.

3. **Regression on the original failure.**
   - Regenerate the Soltam brief through `presentation-agent` (and once through the `slide-designer` path).
   - Eyeball against the 12 defects in §0. None may reappear.
   - Accept when a fresh Soltam deck shows: the real product (or a logo-free background), no `@@`, matching counts, a complete timeline, a sourced or removed stat, a budget (or explicit "טרם הוגדר"), and no empty/mis-labeled slide.

4. **Lock it with tests (recommended).**
   - `vision-inspector`: unit-test `analyzeHtmlOnly` — HTML containing `@@` / `TBD` / `lorem` yields `noPlaceholder: false` and a Hebrew issue; clean HTML yields `true`.
   - `slide-critic`: `parseCritique` accepts a full 9-key payload and rejects one missing a required key (degrades to unchecked).
   - Accept when both tests pass under `vitest`.

5. **Sweep for any other slide emitter/exporter** (`slide-designer.ts`, `slide-personas.ts`, pptx/pdf exporters). If any independently builds imagery or influencer cards, apply the same real-product / no-placeholder / label-match language. Accept when no generation surface can emit a fabricated logo or a placeholder token.

---

## 4. Definition of done
- [ ] `npx tsc --noEmit` clean, `npm run build` clean.
- [ ] Effective `proposal-agent` prompt (DB or fallback) carries the integrity non-negotiables.
- [ ] A freshly regenerated Soltam deck exhibits none of the 12 defects.
- [ ] Both QA gates emit the truth/placeholder/label checks (verified in logs on a real run).
- [ ] Placeholder + parse tests green (if step 4 done).

---

## 5. Failure → guard traceability

| # | Defect | Generation guard | QA guard |
|---|--------|------------------|----------|
| 1 | Fabricated logo on product | `visual_truth` · AD-28 · tool `generate_brand_image` | `imageTruthful` |
| 2 | Off-category imagery | `visual_truth` · AD-28 | `imageTruthful` |
| 3 | `@@` placeholder | `visual_truth` · AD-30 · tool `generate_slide_html` | `noPlaceholder` |
| 4 | 7 vs 4 count mismatch | `proposal_integrity` · AD-31 | — (cross-slide; generation) |
| 5 | Empty Risk slide + wrong watermark | `proposal_integrity` · AD-27 | `labelMatches` |
| 6 | Missing Week 2 | `proposal_integrity` · AD-31 | — |
| 7 | Unverified Nielsen stat | `proposal_integrity` · `data_grounding` | — |
| 8 | No budget | `proposal_integrity` · proposal-agent `non_negotiables` | — |
| 9 | Goal without KPI/measurement | `proposal_integrity` · proposal-agent `non_negotiables` | — |
| 10 | Audience 25–65 | `proposal_integrity` | — |
| 11 | Recycled backgrounds | `visual_truth` · AD-29 · iron-rule 8 | — |
| 12 | Abstract Big Idea | `proposal_integrity` | — |

---

## 6. Files touched (anchors)
- `src/lib/gemini/presentation-agent.ts` — system prompt (`<visual_truth>`, `<proposal_integrity>`, `<self_check>`), user prompt length fix, tool descriptions, repair prompt.
- `src/lib/design/art-director-rules.ts` — `ART_DIRECTOR_RULES` rules 26–31.
- `src/lib/qa/slide-critic.ts` — interface, `CHECK_KEYS`, `CRITIQUE_SCHEMA`, checklist, rules, exemplars, `uncheckedCritique`.
- `src/lib/slide-engine/vision-inspector.ts` — schema, interface, prompt, `defaultChecks`, `analyzeHtmlOnly`, `makeDefaultReport`.
- `src/lib/gemini/proposal-agent.ts` — `<non_negotiables>`.
- `docs/prompts/PROMPTS-LIBRARY-v2.md` — Hardening v3 addendum.
