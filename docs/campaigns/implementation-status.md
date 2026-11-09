# Brieflow: implementation status

Branch `feat/campaigns-mvp` (git worktree at `Mega_bot/brieflow`), not committed, not pushed.
Nothing was deployed and no production database or external system was written to.

## Done

| Area | Notes |
|---|---|
| Schema | `supabase/migrations/20261026_campaigns_mvp.sql`: 26 `cm_` tables, triggers, constraints, indexes, RLS + revokes. Additive and idempotent. |
| Campaigns | list (search, filters, pagination, counts, budget exposure), create from a brief with reviewed prefill, edit, status machine, close check, close with exceptions, members |
| Clients and briefs | search the existing `clients`; controlled local client creation; link `document_links` briefs |
| Creator pool | search and filters, manual creation, duplicate detection (email, normalized phone, handle, external id), creator card with scoped history, agents with representation links, Besti id as a manual reference |
| Participation | add (no duplicates), terms with versioning and re-approval flags, invite (link shown once, optional email), offline response recorded as such, activate, complete, cancel, withdraw |
| Shortlists | versioned snapshot, per-item internal decision, send to client, client decision in the portal, supersede |
| Content | private direct uploads with verification, versions, per-version comments (video timestamp, internal or shared), internal then client approval bound to the version, changes requested |
| Deadlines | Israel time input, history, immutable originals, recorded breaches |
| Publication | report (creator or staff), verification with evidence and actual time, reject back to creator |
| Metrics | manual entry with source, period, capture time, evidence; missing ≠ zero |
| Tasks | automated (12 automations) and manual; my tasks; overdue filter; campaign timeline |
| Jobs and messages | durable outbox, dedupe keys, relevance re-check, backoff, dead queue, uncertain state, manager retry or dismiss, cron route |
| Budget | lines in place, fee sync, totals, overrun, VAT flag |
| Shipments | manual tracking; address hidden from the client |
| Rights | expiry date, notes, contract link or signature request id, 30-day alert |
| Reports | live internal report, CSV, print view, client snapshots published by a manager |
| Portal | enter, request login link, client home and decisions, creator/agent home, accept/decline, deliverable work, reports |
| Security | central policy, scoped queries, same-origin check on mutations, rate limits (redeem, login link, uploads, all portal endpoints), audit log, no raw tokens stored, portal headers (no-referrer, no framing, no-store) |
| Existing-code fixes | `/api/quotes/[id]/influencer-contracts` now requires a signed-in employee (GET leaked signing tokens), with a regression test; AuthGuard no longer shows the Google re-auth modal for portal 401s; `/campaigns` added to the middleware's protected paths |
| Feature flag | `CAMPAIGNS_MODULE_ENABLED`; off → 404s; nothing else in the Hub changes |
| Dev tooling | local DB reset with a Supabase shim, seed, browser smoke test |

## Not built (decided out of scope or deferred)

| Item | Why / what instead |
|---|---|
| CSV import of creators | Optional in the brief; manual creation works. Next candidate. |
| WhatsApp messages | Besti's WhatsApp is a separate product and its sender is not exposed as a service; the shared Green API number needs explicit go-ahead per send. Email + in-app tasks are the MVP path. |
| Live Salesforce / Besti / IMAI sync | Manual references only, labelled as not synced. |
| AI helpers (brief extraction, summaries) | Optional; the brief prefill is deterministic field mapping, reviewed before saving. |
| PDF export | The print view saves as PDF from the browser. The Hub's Gotenberg/Playwright pipeline was not wired in. |
| Contractual SLA (business calendars) | Out of scope by the brief; the module tracks deadlines and lateness only. |
| Multi-campaign portal sessions | One session = one grant = one campaign. A person invited to two campaigns uses two links. |
| Profitability | No reliable revenue source; deliberately not shown. |

## Product name and the road to a product for other agencies

The product is **Brieflow** (by Leaders). The name lives in `src/lib/campaigns/brand.ts`; user-facing text names
the product and refers to the agency as "the team" (never "Leaders"), so other agencies' clients and creators
do not see Leaders' name. Code identifiers (`cm_` tables, `/campaigns` and `/portal` routes, `CAMPAIGNS_*` env
vars) are internal and were deliberately not renamed.

What the rename does NOT do yet: the MVP runs inside the Leaders Hub with one agency's data. Selling it to
other agencies needs an `organization_id` on every `cm_` table and in every policy query (tenant isolation),
per-agency branding and sender addresses, agency sign-up and user management outside the Hub's Google login,
and most likely its own deployment and repository. The current data model and the central policy layer were
built so that this is an additive change, but it is not built.

## Known issues / limits

- **The repo has no ESLint config.** `npm run lint` opens Next's setup prompt (pre-existing). New code was linted with `next/core-web-vitals` from a temporary config.
- **`npm run build` needs `SUPABASE_SERVICE_ROLE_KEY` present** (any value) because the existing `/api/admin/config/history` route is prerendered at build time (pre-existing; Vercel has the variable).
- **Pre-existing migration naming bug:** three files sort before the files that create their tables (`research_hub_align`, `research_hub_notify_email`, `price_quotes_backfill`). The local runner applies them in dependency order; production already has them.
- The `20260423_lead_auto_clickup_trigger.sql` migration needs `pg_net` and is skipped locally (unrelated).
- A portal "not found" page renders with HTTP 200 in dev (streamed layout); no data is shown.
- The Supabase storage adapter and the Gmail transport are written against the existing APIs but were not exercised (no writes to real systems were allowed).
- `/quotes/[id]/influencer-contracts` (the page) is not in the middleware's protected list (pre-existing); its API is now protected.
- Contract PDFs are uploaded to Drive as "anyone with the link" by existing code (out of scope).

## Next steps

1. Review the branch; decide on committing / PR.
2. Create a staging Supabase project or branch, apply the migration there, create the private bucket, and run the smoke steps in [deployment-runbook.md](deployment-runbook.md).
3. Grant module roles to the pilot team.
4. CSV import for the 10–20 Adidas creators if typing them in is too slow.

## Continuity

- Local DB: Postgres 14 cluster on port 54329 (`initdb` in the session scratchpad; recreate per the runbook).
- Dev server: `npx next dev -p 3100` with `.env.local` as in the runbook.
- Everything needed to resume is in this folder plus `scripts/campaigns/`.
