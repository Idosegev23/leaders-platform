# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`leaders-platform` is the unified internal platform for Leaders — **one Next.js app, one DB, one Google OAuth** — replacing a constellation of small apps (`innerMeeting`, `costumerbrief`/`leadersBrief`, `docs-hub`, `chatbrief`, `qoute1`) that each had their own auth and database.

This repo was forked from `pptmaker` because pptmaker is the largest component (AI presentation pipeline — Gemini agents, Playwright PDF, PPTX export, storage) and the other apps are small enough to merge into it.

The five rubrics on the dashboard:

| Slug | Name | Source app (legacy) | Status |
|------|------|---------------------|--------|
| `client-brief` | בריף לקוח | `costumerbrief` (aka leadersBrief) — 6-step client form | to migrate |
| `inner-meeting` | פגישת התנעה | `innerMeeting` — collaborative internal kick-off form | to migrate |
| `price-quote` | הצעת מחיר | pptmaker `/price-quote` | in place |
| `creative-presentation` | מצגת קריאייטיבית | pptmaker `/create-proposal` → `/deck` | in place (rename) |
| `summary-presentation` | מצגת סיכום | — | `coming_soon` placeholder |

## Current phase

**Phase 0** — fork + schema migration prepared, nothing wired to the unified dashboard yet. pptmaker's existing flows (`/dashboard`, `/price-quote`, `/create-proposal`, etc.) still work as they did.

Upcoming phases (see the planning conversation for details):
1. Dashboard shell + Google OAuth whitelist via `contacts`
2. Migrate `inner-meeting` (the hard one — has Supabase Realtime + Presence)
3. Migrate `client-brief`
4. Wire `/quote` + `/deck` into dashboard cards
5. `summary-presentation` placeholder
6. History + reminders (Vercel Cron: unopened briefs > 3d, stale drafts > 7d, deadlines in 48h)
7. Cleanup — delete the legacy apps

## Commands

```bash
npm run dev         # Next dev (port 3000 by default)
npm run build
npm start
npm run lint
node scripts/seed-contacts.mjs    # one-shot: seed `contacts` from scripts/contacts.csv (needs SUPABASE_SERVICE_ROLE_KEY)
```

No automated tests. There's a large `scripts/` dir of one-off QA / benchmarking scripts (`critic-*`, `test-*`) left from pptmaker — most of them are model experiments, not CI.

## Database

**Supabase project:** `fhgggqnaplshwbrzgima.supabase.co` (pptmaker's original). The other project (`rdhlmqzunnuhmsclhimq`, formerly used by `innerMeeting` + `docs-hub` + the now-deleted `chatbrief`) is being retired. All new tables go on this project.

### Schema origin
- **From pptmaker (already in DB):** `documents` (type: `quote` | `deck`), `users`, `admin_config`, `admin_config_history`, `brief_links`, `user_google_tokens`, plus the `assets` storage bucket.
- **Added by [supabase/migrations/20260419_init_hub_schema.sql](supabase/migrations/20260419_init_hub_schema.sql):** `contacts`, `client_folders`, `forms`, `inner_meeting_forms`, `form_participants`, `form_activity_logs`, `document_types`, `document_links`.

The migration must be run manually in the Supabase SQL Editor — there is no automated migration runner in the repo.

### Two `brief`-related paths
- `brief_links` (already existed in pptmaker's DB, from the costumerbrief/leadersBrief app) — the legacy brief-sending flow.
- `document_links` (new, from the migration) — the unified link-tracking table for all five rubrics.

During Phase 3, the client-brief flow is ported from `brief_links` to `document_links` (one history source, not two). Until then both tables exist.

## Auth

Google OAuth via Supabase Auth, plus a whitelist layer: after login, the user's email must exist in the `contacts` table, otherwise `signOut()` is called and they're redirected to `/login?error=not_authorized`. The middleware handles session refresh; the whitelist check happens at the React layer (`hooks/useAuth` or equivalent when migrated from innerMeeting).

**Supabase Redirect URLs** must include `http://localhost:3000/auth/callback` (dev) and the production origin's callback.

## Architecture

Next.js 14 App Router, TypeScript strict, Supabase (auth + postgres + realtime + storage), Tailwind, react-hook-form + Zod, framer-motion. Heavy pipeline dependencies: `@google/genai`, `@anthropic-ai/sdk`, Playwright (for PDF), `pptxgenjs` (for PPTX).

Path alias: `@/*` → `./src/*`. UI is Hebrew, RTL.

## Non-obvious things to know

- **Two `brief`-related tables coexist.** Don't conflate them — `brief_links` is legacy, `document_links` is the new unified tracker.
- **Migration schema is idempotent** (all `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`) so it's safe to re-run.
- **The `contacts` table is load-bearing for auth.** An empty `contacts` table = nobody can log in. Run `seed-contacts.mjs` after the schema migration.
- **pptmaker had its own `users` table.** It's orthogonal to `contacts` — `users` stores pptmaker-app state (admin roles, doc ownership), while `contacts` is the Leaders employee directory. Don't merge them; they serve different purposes.
- **`.env.local` must include `SUPABASE_SERVICE_ROLE_KEY`** for the seed script (service role bypasses RLS). The anon key is not enough.
- **Realtime publication** — `inner_meeting_forms` and `forms` must be in the `supabase_realtime` publication (the migration does this) for the collaborative editing experience to work when inner-meeting is ported.
