# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ If you're resuming this project — start here

Everything below this section is reference. This section is **what to do right now**.

### Current state (checkpoint as of last commit `69d8898`)
- All code for phases 0–6 is merged to `main` and deployed on Vercel.
- The Vercel project is `idosegev23s-projects/leaders-platform`. GitHub remote is `git@github.com:Idosegev23/leaders-platform.git`.
- Env vars are pushed to all three Vercel environments. `NEXT_PUBLIC_DEV_MODE=true` is still active across all envs (so auth is effectively bypassed until the user flips it).
- Supabase MCP server is wired up in [.mcp.json](.mcp.json) for project ref `fhgggqnaplshwbrzgima`. The user must authenticate it once via `claude /mcp` in a regular terminal (not an IDE session). After that, you have direct SQL/DB tools.

### Immediate open items (in priority order)

1. **Run the SQL migration.** [supabase/migrations/20260419_init_hub_schema.sql](supabase/migrations/20260419_init_hub_schema.sql) has not been applied yet. Without it:
   - `document_links` / `document_types` / `contacts` / `forms` / `inner_meeting_forms` / `form_participants` / `form_activity_logs` / `client_folders` don't exist
   - The dashboard's "recent activity" query returns nothing (it's wrapped in try/catch, so the UI survives)
   - `/inner-meeting` and `/send/client-brief` can't create rows
   - The auth whitelist check against `contacts` returns "not in whitelist" for everyone — but it's bypassed because `NEXT_PUBLIC_DEV_MODE=true`
   - **How to run:** if the Supabase MCP is authenticated, use the `apply_migration` / `execute_sql` tool with the contents of that file. Otherwise direct the user to [the SQL editor](https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new).

2. **Seed the `contacts` table.** After migration, run `node scripts/seed-contacts.mjs`. This requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (it's already there from the pptmaker fork). The CSV source is `scripts/contacts.csv`.

3. **Debug "בריף הלקוח" (client-brief) card — user reports it "not active" (לא פעיל).** Likely causes to investigate in order:
   - `document_types` row for `client-brief` doesn't exist yet (fix: run the migration, seeds the row automatically via `ON CONFLICT DO NOTHING`).
   - The `/send/client-brief` route loads but the `SELECT` on `document_types` returns null because the migration hasn't run — resulting in `notFound()`.
   - The dashboard card is linked correctly (`targetUrl: '/send/client-brief'` in [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx)), so it's not a UI wiring issue — it's almost certainly "DB not ready".
   - Verify by hitting `/send/client-brief` after migration. If it still fails, check `/api/links/route.ts` which queries `document_types.slug = 'client-brief'`.

4. **Supabase Auth URL Configuration — user already completed.** Google Cloud redirect URI already set to `https://fhgggqnaplshwbrzgima.supabase.co/auth/v1/callback` under the `LDRSAGENT` OAuth client.

5. **Remaining manual setup (optional / future):**
   - `REMINDERS_WEBHOOK_URL` → Make.com scenario for cron reminders (the route silently no-ops without it).
   - `CRON_SECRET` → gate `/api/cron/reminders` endpoint.
   - `ADMIN_EMAILS` → auto-promote matching emails to `users.role='admin'`.
   - Flip `NEXT_PUBLIC_DEV_MODE` to `false` in production when ready to enforce the whitelist.

### Handy commands for the next session

```bash
# Verify env on Vercel
vercel env ls

# Type-check (fast)
npx tsc --noEmit

# Local dev
npm run dev

# Seed contacts after the migration has been applied
node scripts/seed-contacts.mjs

# Check git state
git status && git log --oneline -5
```

### Phase 7 (cleanup) is still pending
The user approved deletion of `chatbrief` and `qoute1` "later". The full deletion list:
- `/Users/idosegev/Downloads/TriRoars/Leaders/chatbrief`
- `/Users/idosegev/Downloads/TriRoars/Leaders/qoute1` (also `qoute` — it's a stale HTML/JS preview, no DB)
- `/Users/idosegev/Downloads/TriRoars/Leaders/innerMeeting` (port verified working first)
- `/Users/idosegev/Downloads/TriRoars/Leaders/costumerbrief` (port verified working first)
- `/Users/idosegev/Downloads/TriRoars/Leaders/docs-hub` (functionality absorbed into leaders-platform dashboard + /send/[slug])
- Do not delete `pptmaker` — it still contains the original code leaders-platform was forked from; delete only after leaders-platform is in stable production and the user confirms.

**IMPORTANT:** All destructive deletes need explicit user confirmation. Never `rm -rf` legacy apps without a "go ahead" in the current session.

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

## Manual setup still required

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
