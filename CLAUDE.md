# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ If you're resuming this project — start here

Everything below this section is reference. This section is **what to do right now**.

### Current state (as of 2026-09-07, `main` = `4227dc9`, deployed to prod)

- **The auto deck pipeline (kickoff → deck → Canva) works end to end** and produced its first *verified* `passed=True` on 2026-09-06 (document `192039b3`, run `mtq892fg`: round 1 found 2 issues, removed 1 duplicate slide, rewrote 1 → round 2 found 0 → Canva `DAHUc70tffE`; the critique chain took ~4 min).
- Chain: `/api/inner-meeting/complete` → QStash → `pipeline/kickoff-deck/run` (assemble brief+kickoff, `_stepData`, blueprint) → `generate-full` (checkpoint/resume across invocations) → `pipeline/deck-critique` (**one round per QStash hop**, MAX 4) → `pipeline/deck-finalize` → Canva link on `inner_meeting_forms.canva_*`.
- Quality gates in the path: image-provenance gate (no foreign/stock URLs), deterministic structure normalization + eyebrow renumbering (`src/lib/qa/deck-structure.ts`), content critic = **two pinned critiques intersected** (`src/lib/qa/content-critic.ts`), in-context slide repair (`src/lib/qa/slide-repair.ts`), structural-duplicate removal (1 per round, never cover/closing, floor 12, refused when >40% of the deck failed), best-verified-round restore (ties → later state), narrative-image gate (every story slide must carry an image — 2 rejections, then accept; a resumed run once emitted 20 text-only slides), critique cap 6 rounds. Eyebrows: renumbered after every reorder/removal/repair round, `NN // LABEL` normalized to `LABEL // NN`, blanks filled from same-type siblings; repairs restore an eyebrow they blank or drop. When diagnosing eyebrows, strip tags first — `<span dir="rtl">…</span>` inside the div fooled a quick regex into reporting an empty eyebrow (the slide-14 claim in commit 4227dc9 is wrong for that reason).
- **Export = the critiqued deck, by construction (23663fb).** `exportDeckToCanva` builds one HTML file from the CURRENT `_htmlPresentation.htmlSlides` (`src/lib/canva/html-import.ts`, one `data-document-role="page"` per slide) and url-imports it → `_canva.mode = 'html-import'`. Before this, Canva got a PPTX derived once from the agent's raw `_agentSlides` and reused forever — every design shipped the first draft (22 pages, cover on page 8) while the gate reported a pass on the repaired 21. The structured/PPTX cascade is fallback only; if `_canva.mode` is `measured-pptx`/`native-pptx`, the fallback fired and the design may be stale.
- **The run always completes (verified 2026-09-07).** generate-full checkpoints at its deadline, on a model error after progress, and every 5 slides; a partial run persists `_generationCheckpoint` and republishes itself; resume is the DEFAULT when a checkpoint exists (`fresh:true` discards it); the publish has `retries:1`; cap 8 parts. Proven with the test hook `checkpointAfterMs` (internal callers; kickoff-deck/run forwards it): QStash shows two distinct generate-full deliveries, the second created the second the first returned. First fully unattended cold deck to PASS: `e3bb872b` → Canva `DAHUd93gzH0`, 20 slides, imagery on all 11 narrative slides, ~23 min fire→Canva.
- Why it was dead 2026-07-07 → 2026-09-06: every QStash publish passed a `deduplicationId` containing `:`, which QStash rejects; all three call sites swallowed the throw. Dashes only.

### If something's off, check in this order

1. **QStash events** — `GET https://qstash.upstash.io/v2/events` with `QSTASH_TOKEN`. Every hop (generate-full, deck-critique ×N, deck-finalize) shows there with state + status. A hop that never appears was never published.
2. **`documents.data._contentCritique`** — `rounds[].findings` carry per-slide failed checks, quoted issues and rewrite directives; `removed` lists dropped slides; `passed` is only ever true when `reviewed` is true; `restoredBest` says the final deck is an earlier verified round.
3. **`documents.data._generationCheckpoint`** present → a generation is mid-resume (or a resume never fired).
4. **`documents.data._canva.mode`** — must be `html-import`. Anything else means the PPTX fallback ran and Canva may be showing a stale draft.

### Live-test safety — prod env facts (verified 2026-09-06)

- `NEXT_PUBLIC_DEV_MODE` is **absent** in prod → the `contacts` whitelist is enforced (130 seeded). The April migration/seed steps are long done.
- `NOTIFICATIONS_TEST_MODE=false` → completing a kickoff emails real management. Flip to `true` (+ redeploy) before live kickoff tests. Never include Eran.
- `QUOTE_NOTIFICATION_EMAILS` unset → signed-quote mail CCs `roei@` and does **not** honour test mode.
- `CRON_SECRET` unset → the three cron routes are publicly callable.
- Salesforce inbound needs `Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>`; their `projectquote` answers `{"received":true}` and processes async — a 200 is receipt, not success.

### Demo / test workflow

```bash
node scripts/seed-demo-kickoff.mjs        # full SEACRET SPA demo kickoff + brief → prints {formId, salesforceRef}
# then: POST /api/pipeline/kickoff-deck/run  -H "x-internal-secret: $LEADS_TRIGGER_SECRET"  -d '{"formId":..,"salesforceRef":..}'
# critique only:  publish {"documentId":..,"round":1} to /api/pipeline/deck-critique via QStash with a FRESH dedup id
node scripts/bench-flash-models.mjs       # re-run before bumping the flash model (picked gemini-3.7-flash; 3.8 is slower)
```

### Cleanup candidates (NOT done — needs an explicit go-ahead)

- Demo rows from 2026-09-06/07: forms `2d64722d`, `94982cab`, `bcf51f4c`, `2a9a64db`, `d4b8d2b0` (+ their `document_links` with `salesforce_ref` `DEMO-*`); deck docs `2ff2af2c`, `80f9657c`, `be568a07`, `192039b3`, `52cbb60a`, `e3bb872b`; many "SEACRET SPA" Canva designs incl. the HTML-import spike `DAHUdvVw20s`; storage `assets/spikes/html-import/*`.
- **Four local-only branches never pushed to origin** — at risk: `feat/art-director-engine`, `feat/auto-deck-to-canva`, `feat/canva-autofill`, `feat/template-hub`.
- **Phase 7 — legacy apps** (user approved "later"; every `rm -rf` needs a fresh "go ahead" in the current session): `/Users/idosegev/Downloads/TriRoars/Leaders/chatbrief`, `…/qoute1` (and `…/qoute` — a stale HTML/JS preview, no DB), `…/innerMeeting` (verify the port works first), `…/costumerbrief` (verify the port works first), `…/docs-hub` (absorbed into the dashboard + `/send/[slug]`). **Do not delete `pptmaker`** — it holds the original code this app was forked from; only once leaders-platform is stable in prod and the user confirms.
- Supabase MCP is wired in [.mcp.json](.mcp.json) (project `fhgggqnaplshwbrzgima`); authenticate once via `claude /mcp` in a regular terminal for direct SQL tools. Until then, REST with `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` works — that is what today's checks used.

---

## What this repo is

`leaders-platform` is the unified internal platform for Leaders — **one Next.js app, one DB, one Google OAuth** — replacing a constellation of small apps (`innerMeeting`, `costumerbrief`/`leadersBrief`, `docs-hub`, `chatbrief`, `qoute1`) that each had their own auth and database.

Forked from `pptmaker` because pptmaker is the largest component (AI presentation pipeline — Gemini agents, Playwright PDF, PPTX export, storage) and the other apps are small enough to merge into it.

The five rubrics on the dashboard:

| Slug | Name | Route | Flow | Status |
|------|------|-------|------|--------|
| `client-brief` | בריף לקוח | `/send/client-brief` → `/forms/client-brief?token=…` | send_link | wired |
| `inner-meeting` | פגישת התנעה | `/inner-meeting` | direct_form (collaborative) | wired |
| `price-quote` | הצעת מחיר | `/price-quote` | direct_form | inherited from pptmaker |
| `creative-presentation` | מצגת קריאייטיבית | `/create-proposal` | direct_form | inherited from pptmaker |
| `summary-presentation` | מצגת סיכום | `/summary` | coming_soon | placeholder |

## Phases status

- **Phase 0 — Setup** ✓ fork + migration written + env vars pushed.
- **Phase 1 — Dashboard + auth whitelist** ✓ `/dashboard` rewritten with 5 rubrics + `contacts` whitelist in the auth callback.
- **Phase 2 — Inner-meeting port** ✓ Realtime/Presence form mounted at `/inner-meeting`.
- **Phase 3 — Client-brief port** ✓ 6-step form at `/forms/client-brief`, send-link flow at `/send/[slug]`, unified link tracking via `document_links`.
- **Phase 4 — Quote + deck** ✓ Dashboard cards link directly to the existing pptmaker flows.
- **Phase 5 — Summary placeholder** ✓ `/summary` shows "בבנייה".
- **Phase 6 — Reminders** ✓ `/api/cron/reminders` (daily 08:00 UTC via `vercel.json`); POSTs consolidated reminder batch to `REMINDERS_WEBHOOK_URL` (Make.com) for actual email delivery.
- **Phase 7 — Cleanup** pending: delete legacy apps (`innerMeeting`, `costumerbrief`, `chatbrief`, `qoute1`, `docs-hub`).

## Manual setup still required (historical — items 1–4 were completed by 2026-09; see start-here)

Code alone isn't enough — these live-system tweaks must be done once:

1. **Run the SQL migration** in [supabase/migrations/20260419_init_hub_schema.sql](supabase/migrations/20260419_init_hub_schema.sql) on the Supabase SQL Editor.
2. **Seed contacts** via `node scripts/seed-contacts.mjs` (needs `SUPABASE_SERVICE_ROLE_KEY` locally).
3. **Google Cloud Console** → Authorized redirect URI: `https://fhgggqnaplshwbrzgima.supabase.co/auth/v1/callback`.
4. **Supabase → Auth → URL Configuration** → add `{origin}/api/auth/callback` for both dev and prod origins.
5. **Vercel env**: set `REMINDERS_WEBHOOK_URL` to the Make.com scenario URL that sends reminder emails. (Also `ADMIN_EMAILS` optional for auto-promoting admins; `CRON_SECRET` optional to gate the cron route.)
6. **`NEXT_PUBLIC_DEV_MODE`** — currently `true` in all environments. Flip to `false` in prod before real launch (`vercel env rm NEXT_PUBLIC_DEV_MODE production` then `echo false | vercel env add NEXT_PUBLIC_DEV_MODE production`).

## Commands

```bash
npm run dev         # Next dev (port 3000 by default)
npm run build
npm start
npm run lint
node scripts/seed-contacts.mjs    # seed `contacts` from scripts/contacts.csv
```

No automated tests. There's a large `scripts/` dir of one-off QA / benchmarking scripts (`critic-*`, `test-*`) inherited from pptmaker — those are model experiments, not CI.

## Database

**Supabase project:** `fhgggqnaplshwbrzgima.supabase.co`. The second project (`rdhlmqzunnuhmsclhimq`, formerly used by `innerMeeting` + `docs-hub` + `chatbrief`) is retired — all new tables live on the first.

### Tables
- **Inherited from pptmaker:** `documents` (type: `quote` | `deck`), `users`, `admin_config`, `admin_config_history`, `brief_links` (legacy), `user_google_tokens`, plus the `assets` storage bucket.
- **Added by the migration:** `contacts` (Leaders employee whitelist), `client_folders`, `forms`, `inner_meeting_forms`, `form_participants`, `form_activity_logs`, `document_types`, `document_links`.

Idempotent migration — safe to re-run.

### Unified vs. legacy link tracking
- `brief_links` — legacy, from costumerbrief/leadersBrief. Not read by this app.
- `document_links` — the unified tracker. Every rubric with a `send_link` flow lands here. The dashboard's "recent activity" merges `documents` (pptmaker's records) + `document_links`.

## Auth

Google OAuth via Supabase Auth. Three-layer check:

1. **OAuth handshake** — `/api/auth/callback` exchanges the code for a session.
2. **`contacts` whitelist** — callback looks up the session email in `contacts`. Not present → `signOut()` + redirect to `/login?error=not_authorized`. Bypassed when `NEXT_PUBLIC_DEV_MODE=true`.
3. **Admin role** — if the email is in `ADMIN_EMAILS` (env var), the user's `users.role` is upgraded to `admin` after callback.

Middleware (`src/lib/supabase/middleware.ts`) protects `/dashboard`, `/send`, `/inner-meeting`, `/summary`, and all pptmaker routes (`/create-proposal`, `/price-quote`, `/wizard`, etc.). `/forms/*` is **public** so clients can fill briefs without a Leaders account.

## Architecture notes

Next.js 14 App Router, TypeScript strict, Supabase (auth + postgres + realtime + storage), Tailwind, react-hook-form + Zod, framer-motion. Heavy pipeline deps: `@google/genai`, `@anthropic-ai/sdk`, `puppeteer-core` + `@sparticuz/chromium` (for PDF), `pptxgenjs` (for PPTX).

Path alias `@/*` → `./src/*`. UI is Hebrew, RTL.

### Module organisation
- `src/app/inner-meeting/` — the port of the kick-off flow.
- `src/app/forms/client-brief/` — the public client-facing 6-step brief.
- `src/app/send/[slug]/` — authed employee creates + shares a link for `send_link` rubrics.
- `src/app/api/links/` + `src/app/api/links/[token]/` — CRUD for `document_links`. Public GET on `[token]` bumps status to `opened`.
- `src/app/api/cron/reminders/` — daily cron; POSTs consolidated reminder batch to `REMINDERS_WEBHOOK_URL`.
- `src/lib/inner-meeting/`, `src/lib/client-brief/` — per-module services + types.
- `src/hooks/inner-meeting/` — Realtime, Presence, forms-list, and contact-mapping hooks.
- `src/components/inner-meeting/`, `src/components/client-brief/` — per-module React.

## Non-obvious things

- **The `contacts` table is load-bearing for auth.** Empty `contacts` = nobody can log in (unless `NEXT_PUBLIC_DEV_MODE=true`). Seed it first.
- **`users` vs `contacts`.** `users` = pptmaker's own per-account state (admin roles, doc ownership). `contacts` = the Leaders employee directory used for whitelisting + participant selection in inner-meeting. They are not the same, do not merge.
- **Realtime publication** — `inner_meeting_forms` and `forms` must be in the `supabase_realtime` publication for collaborative editing (the migration does this).
- **Webhook sanitization** — `completeForm` in `src/lib/inner-meeting/formService.ts` replaces `"` with `'` in free-text fields; the downstream Make.com scenario breaks on embedded double quotes. Preserve that behaviour.
- **`ClientFolderSelector` intentionally ignores `client_briefs`.** In legacy innerMeeting it filtered to folders that *had a brief but no meeting yet*. Here the `client_briefs` table is not used (chatbrief was retired) so the selector just filters out folders that already have an inner-meeting. If you reintroduce client_briefs, restore the filter.
- **Reminders cron needs a real webhook.** `REMINDERS_WEBHOOK_URL` is a placeholder; until you set it, the cron silently no-ops on the webhook call and still returns the reminders payload (useful for manual inspection at `/api/cron/reminders`).
- **`dashboard/page.tsx` hard-codes the 5 rubrics.** The `document_types` table is the source of truth for the API side (link tracking + target URLs for `/send/[slug]`), not the dashboard UI. If you add a rubric: update both places.
