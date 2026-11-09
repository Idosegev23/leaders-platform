# Brieflow (by Leaders): discovery

Date: 2026-10-26. Branch `feat/campaigns-mvp` (git worktree of `leaders-platform`, based on `main` = `28ed8b3`).
The user's uncommitted changes on `main` (`src/lib/gmail/management.ts`, two deleted logos) were left untouched.

## Where the module lives

`leaders-platform` (the Hub) is the host. It already has the internal Google OAuth login with the `contacts`
whitelist, the `clients` table, briefs (`document_links`), influencer contracts (`signature_requests`),
Gmail sending, QStash and Vercel cron. No campaigns module exists anywhere in the Hub, so the module is new
code, not a gap-fill of an existing one.

## What exists (verified by reading code and the live schema)

| Area | What exists | Verified how |
|---|---|---|
| Stack | Next.js 14.2 App Router, TS strict, Tailwind, Supabase (auth, Postgres, storage), Vitest 2, npm | `package.json`, `vitest.config.ts` |
| Internal auth | Supabase Google OAuth; `/api/auth/callback` gates on `contacts`; `users.role` = `admin` \| `user`; `getAuthenticatedUser()` in `src/lib/auth/api-auth.ts` | code |
| Data access style | Server routes use the service-role Supabase client and check the user in the route. RLS mostly not used. | code |
| Clients | `public.clients` (424 rows: `name`, `name_hebrew`, `aliases`, `drive_folder_id`, `metadata`), created outside the Hub migrations (by ldrsAgent's Drive indexer). `client_folders` is a separate per-kickoff folder table. | live PostgREST OpenAPI (schema only, no rows read) |
| Briefs | `document_links` (client-brief rubric, `metadata.salesforce_ref`), `smart_briefs`, `forms`/`inner_meeting_forms` | migrations + schema |
| Contracts | `signature_requests` rows with `payload.source = 'influencer-contract'`, created by `POST /api/quotes/[id]/influencer-contracts` | code |
| Salesforce | Inbound webhooks (`/api/webhooks/salesforce/*`, bearer secret, fail-closed) and outbound brief/quote pushes. Project id = `price_quotes.salesforce_project_id`, `document_links.metadata.salesforce_ref`. | code only, **not exercised** |
| IMAI | `src/lib/imai/client.ts`, `/api/imai` (influencer search for decks) | code only, **not exercised** |
| Email | `sendGmailViaServiceAccount` (domain-wide delegation, needs `GOOGLE_SERVICE_ACCOUNT_KEY` + a sender mailbox) and per-user OAuth `sendGmailEmail` | code; returns Gmail message id |
| Jobs | QStash (deck pipeline), Vercel cron (3 routes; `CRON_SECRET` unset in prod per CLAUDE.md) | code + CLAUDE.md |
| Storage | Supabase bucket `assets` (public-ish, used for decks) | code |
| Tests | 13 Vitest unit files, no DB tests, no CI | `find` |
| Migrations | 26 files in `supabase/migrations/`, applied by hand in the SQL editor | files + CLAUDE.md |

## Other repositories

| Repo | Available | Finding | Used? |
|---|---|---|---|
| influencersBot (Besti) | local clone, branch `integration/gaps-2026-09-14` | **Separate Supabase project.** Creators = `accounts`; agents = `users.managed_account_ids[]`; RLS disabled on most tables, isolation in API code; WhatsApp Cloud API webhook. No service API meant for other apps. | No runtime link. Creators/agents carry a manual `external_references` row (`system='besti'`). |
| ldrsAgent | GitHub | Agent framework; shares the Hub DB (tables `executions`, `metrics`, `logs`, `webhooks`, ...) | Not used. Reason for the `cm_` table prefix. |
| ldrsCrm | GitHub | Dashboard shell, last change 2025-12 | Not used, not a source of truth |
| leadersBrief, internalMettingLeaders | already ported into the Hub | n/a | via `document_links` |
| pptmaker | local | Origin of the Hub fork | Not used |
| LeadersGantt | GitHub | Static AI-adoption plan (CSV + chart), 2025-09 | Not used (not a campaign gantt) |
| influencer-checklist | GitHub | 8-step Besti account onboarding (scan IG, transcripts, coupons) | Not used: it is about onboarding a scanned account, not campaign operations |
| Leaders-Clients-Performance-Dashboard | local + GitHub | Media/sales dashboard | Not needed for the MVP |

## Security findings in code the module touches

1. **`/api/quotes/[id]/influencer-contracts` had no user check** (verified). `GET` returned every contract's
   signing token and sign URL to anyone who knows a quote id; `POST` generated contracts and uploaded PDFs with the
   service role. Fixed on this branch with a regression test. Participations link to these contracts.
2. Contract PDFs are uploaded to Drive as "anyone with the link can read". Out of scope; documented.
3. `CRON_SECRET` unset in prod means the existing cron routes are public. The new campaigns cron refuses to run
   without a secret in production.
4. Besti: hard-coded admin password fallback and RLS disabled (from its own status doc). Out of scope; not touched.

## Ownership of data

| Data | Source of truth | In the MVP |
|---|---|---|
| Client (account) | Salesforce, mirrored in Hub `clients` | `cm_campaigns.client_id` → `clients.id`. A missing client can be created locally by a manager, flagged `metadata.created_by='campaigns'`. Salesforce ids are stored as references, never pushed. |
| Commercial project | Salesforce | `external_project_reference` (text, entered by hand) |
| Brief, decks, quotes | Hub (`document_links`, `documents`) | linked by id; the campaign stores the link, not a copy |
| Creator account, agent, Besti deal | Besti | Hub keeps its own operational creator card; link via `cm_external_references` |
| Campaign operations (participation, deliverables, approvals, dates, publications, metrics, tasks) | **this module** | owned here |
| Accounting payment status | the accounting system | manual field, labelled "manual record" in the UI |

## Assumptions (changeable)

- Amounts are entered **before VAT** by default; each campaign has an explicit `amounts_include_vat` flag shown in the UI.
- One currency per campaign, default ILS. No conversion.
- Client representatives do not see creator fees, internal notes, budget or margins. They see names, handles, planned deliverables, client-visible notes, content and approved reports.
- Creator invitation links are single-use and open a 7-day session; a creator can ask for a fresh login link sent to the address on the invitation.
- Any signed-in internal user can see the module only if granted a campaigns role (`admin` / `manager` / `staff`), or if they are a Hub admin.

## Connections not verified

Salesforce, IMAI, Besti, Gmail sending and Supabase Storage were **not exercised** against live systems from this
branch, by design (no writes to production during development). The module runs fully with local adapters
(local Postgres, filesystem storage, a dev message transport that marks messages "not sent").
