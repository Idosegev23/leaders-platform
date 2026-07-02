# Deck Blueprint Gate ("הפיצוח") — Design Spec

Approved by user 2026-07-02. Two-phase deck generation with an editable strategic blueprint the user reviews and corrects BEFORE slides are built. Dedicated screen `/blueprint/[id]`; approval gate.

## Problem
After the wizard is approved, "צור מצגת" is a black box — the presentation agent researches, plans, and renders 14–22 slides in one shot. The user can't see or correct the strategic thinking (the "פיצוח": insight, strategy, per-slide plan) before the deck is locked. They want full visibility and control over *what the deck will say and focus on* before it's built.

## Solution: two-phase generation

### Phase A — produce the blueprint (`POST /api/generate-blueprint`)
`generateDeckBlueprint()` (new, `src/lib/gemini/deck-blueprint.ts`): one Gemini `gemini-3.1-pro-preview` JSON call that consumes the brief + `_brandResearch` + wizard `_stepData` and emits a structured `DeckBlueprint`. Uses the v2 narrative principles (insight = spine, through-line, dynamic 14–22 slide plan). Saved to `document.data._deckBlueprint`. Fast (~1–2 min, no per-slide HTML).

### Phase B — review & edit (`/blueprint/[id]`)
New page renders the blueprint in editable cards (reusing the strategy-pillar / card-editor patterns from `step-strategy.tsx`). User edits every field, and adds/removes/reorders slides in the plan. Debounced auto-save via `PATCH /api/documents/[id]` → `_deckBlueprint`. "אשר ובנה מצגת" button → Phase C.

### Phase C — render from the approved blueprint
`POST /api/generate-full` accepts `useBlueprint: true`. `runPresentationAgent` receives the approved `DeckBlueprint` as a **binding mandate** (like `wizardContract`): the `slidePlan` becomes the mandated slide sequence — the agent renders each slide to the plan's `whatItShows`/`focus`/`title`, does NOT re-plan. Deck reflects the user's edits 1:1.

## Data model — `DeckBlueprint` (`src/lib/gemini/deck-blueprint.ts`)
```ts
interface BlueprintSlide {
  slideType: string          // lowercase-kebab beat (cover, insight, pillar-1, creative, …)
  title: string              // proposed Hebrew title
  purpose: string            // why this slide exists in the story (the through-line role)
  whatItShows: string        // content plan — what the slide presents
  focus: string              // the one thing it focuses on (one dramatic choice)
}
interface DeckBlueprint {
  theCrack: string           // הפיצוח — the strategic breakthrough, 1–2 sentences
  keyInsight: string         // the spine
  strategy: { headline: string; pillars: Array<{ title: string; description: string }> }
  audienceFocus: string      // who + what we emphasize
  slidePlan: BlueprintSlide[]// the slide-by-slide plan (14–22)
  generatedAt: string
  approved?: boolean         // set true when the user confirms
}
```

## Flow wiring
- Wizard "create deck" action → route to `/blueprint/[id]` (was: straight to generation). If `_deckBlueprint` absent, the page calls `/api/generate-blueprint` on mount (with a loading state); if present, shows it for editing.
- `/blueprint/[id]` "אשר ובנה מצגת" → sets `approved:true`, saves, then POSTs `/api/generate-full {documentId, useBlueprint:true}` and routes to the existing generation/progress view.
- Legacy: `/api/generate-full` without `useBlueprint` keeps the old one-shot behavior (back-compat).

## Components
1. **`src/lib/gemini/deck-blueprint.ts`** — `DeckBlueprint` types + `generateDeckBlueprint(input): Promise<DeckBlueprint>` (JSON-mode Gemini, parseGeminiJson-hardened) + `blueprintToMandate(bp): string` (Hebrew binding prompt block for phase C).
2. **`src/app/api/generate-blueprint/route.ts`** — `POST {documentId}` → loads doc, builds input, calls `generateDeckBlueprint`, saves `_deckBlueprint`, returns it. Auth: platform-shared (any Leaders user), same pattern as generate-full.
3. **`src/app/blueprint/[id]/page.tsx`** + edit components — renders/edits the blueprint; auto-save; approve→build. RTL Hebrew, matches wizard styling.
4. **`presentation-agent.ts`** — `AgentInput.deckBlueprint?`; when present, inject `blueprintToMandate()` into the system prompt and drive slide generation from `slidePlan` (skip the planning latitude). `/api/generate-full` passes it through when `useBlueprint`.
5. **middleware** — `/blueprint` added to the protected+matcher set (same as `/generate`).

## Error handling
- Blueprint generation failure → the page shows an error + "נסה שוב" and a "דלג ובנה ישירות" fallback (old one-shot path). Never blocks the user from getting a deck.
- Malformed model JSON → `parseGeminiJson` (already hardened, incl. the array-open fix).
- Missing `_brandResearch` → blueprint still generates from brief + wizard data.

## Testing
- `npx tsc --noEmit` + `npm run build` gate.
- Gemini host blocked locally → `generateDeckBlueprint` model call is injectable; shape test with a canned response validates parse + `blueprintToMandate`. Live E2E on prod.

## Rollout
Phase 1: types + `generateDeckBlueprint` + `/api/generate-blueprint` (+shape test). Phase 2: `/blueprint/[id]` UI + edit/auto-save. Phase 3: wizard routing + phase-C mandate wiring + middleware. Phase 4: prod E2E.
