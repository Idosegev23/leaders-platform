# Brieflow: implementation status

Branch `feat/campaigns-mvp` (git worktree at `Mega_bot/brieflow`), pushed to origin, **not merged**.
Nothing was deployed and no production database or external system was written to.

## Done

| Area | Notes |
|---|---|
| Schema | `supabase/migrations/20261026_campaigns_mvp.sql`: 37 `cm_` tables, triggers, constraints, indexes, composite tenant FKs, RLS + revokes. Additive and idempotent. It was revised in place for multi-tenancy, which is safe because it was never applied to any Supabase project. |
| Organizations (multi-tenant) | `cm_organizations`, memberships with roles, org switcher, org settings (name, sender name), member invitations, role changes, disable; platform admins create / suspend organizations; optional self signup |
| Staff sign-in | email-link login independent of the Hub, sessions, invitation acceptance, Hub Google bridge for existing accounts, dev login for local work |
| Campaigns | list (search, filters, pagination, counts, budget exposure), create from a brief with reviewed prefill (Hub org only), edit, status machine, close check, close with exceptions, members |
| Clients | per-organization clients; copy from the Hub `clients` table for the Leaders org |
| Creator pool | search and filters (incl. agency), manual creation, duplicate detection (email, normalized phone, handle, external id), creator card with scoped history, Besti id as a manual reference |
| Talent agencies | agencies, agents inside an agency, creator ↔ agent assignments, agency / agent / creator invitations; agency dashboard across all campaigns |
| CSV import of creators | Hebrew or English headers, `,` `;` or tab, preview with per-row duplicates and errors, commit with per-row savepoints, optional creation of missing agencies |
| Participation | add (no duplicates), terms with versioning and re-approval flags, invite via creator / agent / agency (link shown once, optional email), offline response recorded as such, activate, complete, cancel, withdraw |
| Shortlists | versioned snapshot, per-item internal decision, send to client, client decision in the portal, supersede |
| Content | private direct uploads with verification, versions, per-version comments (video timestamp, internal or shared), internal then client approval bound to the version, changes requested |
| Deadlines | Israel time input, history, immutable originals, recorded breaches |
| Publication | report (creator or staff), verification with evidence and actual time, reject back to creator |
| Metrics | manual entry with source, period, capture time, evidence; missing ≠ zero |
| Tasks | automated (12 automations) and manual; my tasks; overdue filter; campaign timeline |
| Jobs and messages | durable outbox, dedupe keys, relevance re-check, backoff, dead queue, uncertain state, manager retry or dismiss, cron route; sender name per organization |
| Budget | lines in place, fee sync, totals, overrun, VAT flag |
| Shipments | manual tracking; address hidden from the client |
| Rights | expiry date, notes, contract link or signature request id, 30-day alert |
| Reports | live internal report, CSV, print view, client snapshots published by a manager |
| Portal | enter, request login link, client home with a campaign switcher, creator / agent / agency home with campaign filter and per-creator overview, accept/decline, deliverable work, reports |
| Security | central org-scoped policy, DB-level tenant FKs, same-origin check on mutations, rate limits, audit log with organization, no raw tokens stored, portal headers (no-referrer, no framing, no-store) |
| Existing-code fixes | `/api/quotes/[id]/influencer-contracts` now requires a signed-in employee (GET leaked signing tokens), with a regression test; AuthGuard no longer shows the Google re-auth modal for portal 401s |
| Feature flag | `CAMPAIGNS_MODULE_ENABLED`; off → 404s; nothing else in the Hub changes |
| Dev tooling | local DB reset with a Supabase shim, seed with two organizations, browser smoke test |

## Not built (decided out of scope or deferred)

| Item | Why / what instead |
|---|---|
| WhatsApp messages | The shared Green API number needs an explicit go-ahead per send. Email + in-app tasks are the path. |
| Live Salesforce / Besti / IMAI sync | Manual references only, labelled as not synced. |
| AI helpers (brief extraction, summaries) | Optional; the brief prefill is deterministic field mapping, reviewed before saving. |
| PDF export | The print view saves as PDF from the browser. |
| Contractual SLA (business calendars) | Out of scope by the brief; the module tracks deadlines and lateness only. |
| Profitability | No reliable revenue source; deliberately not shown. |
| Billing / plans for other agencies | No payments or plan limits. Organizations are created by a platform admin or self signup. |
| Per-organization branding (logo, colours) and sender domain | Sender **name** is per organization; the sending mailbox is one (`CAMPAIGNS_EMAIL_FROM`). |
| Separate deployment / repository | Brieflow runs inside the Hub app. Splitting it out is a packaging step, not a data-model change. |

## Product name

The product is **Brieflow** (by Leaders). The name lives in `src/lib/campaigns/brand.ts`. User-facing text
names the product and the organization (from `cm_organizations.name`), never "Leaders" hard-coded. Code
identifiers (`cm_` tables, `/campaigns` and `/portal` routes, `CAMPAIGNS_*` env vars) are internal and were
deliberately not renamed.

## Known issues / limits

- **The repo has no ESLint config.** `npm run lint` opens Next's setup prompt (pre-existing). New code was linted with `next/core-web-vitals` from a temporary config.
- **`npm run build` needs `SUPABASE_SERVICE_ROLE_KEY` present** (any value) because the existing `/api/admin/config/history` route is prerendered at build time (pre-existing; Vercel has the variable).
- **Pre-existing migration naming bug:** three files sort before the files that create their tables (`research_hub_align`, `research_hub_notify_email`, `price_quotes_backfill`). The local runner applies them in dependency order; production already has them.
- The `20260423_lead_auto_clickup_trigger.sql` migration needs `pg_net` and is skipped locally (unrelated).
- A portal "not found" page renders with HTTP 200 in dev (streamed layout); no data is shown.
- The Supabase storage adapter and the Gmail transport are written against the existing APIs but were not exercised (no writes to real systems were allowed).
- Email-link login depends on email delivery; with `CAMPAIGNS_EMAIL_TRANSPORT=dev` nothing is delivered, so outside localhost staff need the Hub bridge or a working Gmail transport.
- `/campaigns` was removed from the Hub middleware's protected paths, because the module now authenticates on its own (other agencies have no Hub session). Every `/campaigns` page and API still requires a Brieflow session.
- Full-page screenshots of RTL pages in headless Chrome can look shifted; measured `scrollWidth` equals the viewport, so this is a screenshot artifact, not a layout bug.

## Next steps

1. Review the branch; open a PR when ready (not merged).
2. Create a staging Supabase project or branch, apply the migration, create the private bucket, and run the smoke steps in [deployment-runbook.md](deployment-runbook.md).
3. Bootstrap: a platform admin creates the Leaders organization (with `hub_integration`), then invites the pilot team.
4. Decide on Gmail sending for login links, or keep the Hub bridge for Leaders staff only at first.

## Continuity

- Local DB: Postgres 14 cluster at `brieflow/.local-pg`, port 54329 (gitignored; recreate per the runbook).
- Dev server: `npx next dev -p 3100` with `.env.local` as in the runbook.
- Fresh portal links after seeding: `demo-links.local.txt` (gitignored).
