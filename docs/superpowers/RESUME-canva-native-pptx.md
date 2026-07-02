# RESUME — Deck → Editable Canva (native PPTX)

> Read this first if you're resuming. Last updated: 2026-07-01 (late session). Untracked working-tree file (visible on any branch).

## ⚡ WHERE WE ARE (one line)
**The native PPTX renderer is BUILT, WIRED, and VERIFIED end-to-end against real Canva** — committed as `049121b` on `feat/canva-native-pptx`. Remaining: user decision to merge → main (auto-deploys prod) + a click-through of the 🎨 Canva button on prod.

```bash
git checkout feat/canva-native-pptx   # tip 049121b. main == origin/main == prod (5437997), clean.
```

## ✅ DONE (committed `049121b`, build + tsc clean, NOT yet deployed)
1. **`src/lib/export/structured-pptx.ts`** — `structuredPresentationToPptx(pres)` (+`…Detailed` returning warnings). Maps all 8 layouts to native pptxgenjs elements. Key facts baked in:
   - 1920×1080px → 13.333″×7.5″, 144px/inch, font pt = px/2. RTL via `rtlMode` + `lang:'he-IL'`, `pptx.rtlMode=true`.
   - RTL grid/flex ordering: first pillar/stat/influencer card is **rightmost** (matches `direction:rtl`).
   - Honors `elementStyles` (left/top/width/height/font-size/color/text-align px overrides), `freeElements` (text/image/shape; video skipped w/ warning), `hiddenRoles`, `bg` per-slide override.
   - **Images prefetched + recompressed via sharp** (dynamic import, graceful fallback): ≤1920px, JPEG q82 unless *actually* transparent (`stats().isOpaque` — Gemini PNGs carry fake alpha; KUNI deck went 41MB→960KB). SVG skipped (Canva PPTX importers choke); Leaders wordmark rendered as text instead.
   - **Contrast guard `pickDisplayPrimary`**: HTML renderer relies on glow for `primary` legibility; when contrast(primary, background) < 1.8 falls back accent→secondary→text (KUNI: `#1C1C1C`→`#C28E6E`).
2. **`src/app/api/canva/import/route.ts`** — structured decks now export native PPTX (upload w/ pptx mime → Canva url-import). Screenshot-PDF path kept as fallback (pptx failure, html-only/cached decks). Response now includes `mode: 'native-pptx'|'screenshot-pdf'` + `export_warnings`.
3. **QA scripts** (committed, reusable):
   - `npx tsx scripts/verify-canva-pptx.mts` — fixture covering all 8 layouts + real KUNI deck → generates pptx, unzips, xmllint, checks Hebrew content/media/rtl runs. Add `RUN_E2E=1` for real storage-upload + Canva url-import.
   - `npx tsx scripts/export-canva-design-pngs.mts <designId>` — exports a Canva design to PNGs via the platform token (visual verification of what Canva actually parsed).
4. **E2E VERIFIED on real Canva** (from this machine; `.env.local` has Canva+Supabase creds; `canva_tokens` row live):
   - Imported KUNI deck twice → designs `DAHOLIQRkbM` (pre-fixes) and `DAHOLPInNAE` (final), **15/15 editable pages each**, pages re-exported as PNGs and visually inspected — layouts/RTL/colors/images all correct.
   - **Cleanup for the user**: both designs are titled "בדיקה — KUNI native PPTX" in the connected Canva account; Canva's API can't delete designs — remove manually if unwanted.

## 🔴 NEXT STEPS
1. **User decision**: merge `feat/canva-native-pptx` → `main` (auto-deploys Vercel prod).
2. After deploy: open `/edit/88f5cab6-53d7-423e-b092-a3146e6ae3fc` (KUNI), click **🎨 Canva** in the toolbar, confirm the design opens editable. Response `mode` should be `native-pptx`.
3. Optional polish (known, accepted for v1): no gradient overlays (flat 45% black rect), no glow/text-shadow, split-image slide with empty `image:""` in source data shows an empty dark band (faithful to source), text-height estimates are heuristic (long titles may need a nudge in Canva — that's the point of editable).

## Test targets & notes
- KUNI deck: `88f5cab6-53d7-423e-b092-a3146e6ae3fc` (15 slides, has `_structuredPresentation`).
- `_structuredPresentation` only exists after a deck is opened once in `/edit`.
- Demo deck to DELETE when done: prod `documents` id `dec0dec0-0000-4000-8000-000000000001` ("מותג דמו").
- `NOTIFICATIONS_TEST_MODE=true` in prod routes all notification emails to cto@; flip to false for real management emails.
- Test safety: never email real people / never `eran@` — see [[feedback_exclude_eran_nizri_from_tests]], [[feedback_approved_test_contacts]].
- `colagte` on :3000 is the user's other project — DO NOT touch.
