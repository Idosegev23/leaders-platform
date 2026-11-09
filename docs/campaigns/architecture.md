# Brieflow: architecture

## Shape

One module inside the Hub (Next.js 14 App Router). No new services.

```
src/lib/campaigns/
  domain/          pure rules, no I/O: state-machines, money, budget, report-metrics, csv, time (Asia/Jerusalem)
  auth/policy.ts   every access decision (internal levels, portal scopes)
  services/        business operations, one transaction each: campaigns, clients, creators, participations,
                   shortlists, deliverables (versions, approvals, publications, metrics), assets, tasks,
                   budget, shipments, grants, reporting, overview, portal, admin, recipients
  jobs/            queue.ts (outbox primitives), automation.ts (scheduling + handlers), worker.ts (cron worker)
  portal/access.ts invitation tokens and sessions for clients / creators / agents
  storage/         provider interface, Supabase private bucket, local dev adapter
  messaging/       transport interface, Gmail (existing service-account sender), dev transport
  db.ts, http.ts, runtime.ts, validation.ts, errors.ts, audit.ts, rate-limit.ts
src/app/campaigns/**      internal screens (server components + client components for actions)
src/app/portal/**         external portal (client, creator, agent)
src/app/api/campaigns/**  internal REST API (thin adapters over services)
src/app/api/portal/**     portal REST API
src/app/api/cron/campaigns  worker (Vercel cron, every 5 min)
supabase/migrations/20261026_campaigns_mvp.sql
```

Module boundaries map to the requested ones: campaigns, creators, participation, deliverables,
approvals (inside deliverables + shortlists), tasks, communications (jobs + messaging), budget,
reporting, integrations (external references, Gmail, storage adapters).

## Key decisions

| Decision | Why |
|---|---|
| Tables prefixed `cm_` | The Hub DB is shared with ldrsAgent, which already has generic names (`metrics`, `logs`, `webhooks`). |
| Server access through `pg` (`CAMPAIGNS_DATABASE_URL`) instead of supabase-js | Operations span several rows and need one transaction and row locks (`for update`). PostgREST cannot do that without moving rules into SQL functions. Only one new dependency (`pg`). |
| RLS enabled with no policies, privileges revoked from `anon` / `authenticated` | The browser can never read or write a cm_ table, even with the public anon key. Verified by tests that switch to those roles. |
| Authorization in one place (`auth/policy.ts`) | Every service resolves the target record through a scoped query. Ids from the browser are lookup keys only. Out-of-scope records answer "not found" (no id probing). |
| Business rules in one place (`domain/state-machines.ts` + services) | Screens and routes never change status directly. |
| Optimistic concurrency (`version` columns + `expected_version`) | Lost updates return VERSION_CONFLICT with a "refresh" action. |
| Outbox in Postgres (`cm_jobs`, `cm_notifications`) | The business change and its follow-up (task, reminder, message) commit in one transaction. No `setTimeout` in the web server. |
| Portal access by invitation, not accounts | Clients and creators have no Hub login. See below. |
| Existing clients table (`clients`, 424 rows) reused | No second client master. Missing clients can be created locally and are flagged `metadata.created_by='campaigns'`. |

## Roles and access

| Role | Where | Can |
|---|---|---|
| Module admin (`cm_staff_roles.role='admin'` or Hub `users.role='admin'`) | internal | everything, incl. module roles |
| Campaign manager | internal | open campaigns; manage campaigns she owns or is a manager member of |
| Staff | internal | view and operate (tasks, shipments, comments, start review) on campaigns they are members of; no approvals, invitations, money or closing |
| Client representative | portal grant `kind=client` | one campaign of their own client: approved candidates (snapshot only), released content, decisions, published reports. Never fees, budget, internal notes |
| Creator | portal grant `kind=creator` | their own participation in one campaign: terms incl. own fee, deliverables, uploads, publication, metrics |
| Agent | portal grant `kind=agent` | participations in one campaign where they are the agent AND hold an active representation link |

Client data is built with explicit column lists (`clientShortlists`, `getDeliverable` client branch,
`portalHome`); internal rows are never sent and then hidden.

## Portal access (invitations)

- Token: 256-bit random, base64url. Stored as sha256 only.
- Single-use: redemption is one atomic `update … where used_at is null … returning`.
- Lifetimes: manager-issued invite link 14 days; link inside a system email 72 hours; link requested from `/portal/login` uses the same email path.
- Delivery: the token travels in the URL **fragment** (`/portal/enter#t=…`). It never reaches server logs or the `Referer` header. It is read once, removed from the address bar, and exchanged by an explicit POST. Email link scanners that prefetch GETs cannot consume it.
- Session: random secret in an httpOnly, SameSite=Lax cookie (Secure in production); sha256 stored; 7-day cap, never beyond the grant expiry. Every request re-checks session and grant status/expiry, so revoking a grant ends access immediately.
- Identity: possession of the link sent to the recipient. The UI and audit say so. This is not strong identity verification and not a legal signature.

## State machines

Defined in `domain/state-machines.ts`; tested in `domain.test.ts`.

- Campaign: draft → planning → recruiting → active → reporting → closed (+ cancelled with reason; reporting ↔ active).
- Selection: proposed → internal_review → client_review → approved (+ changes_requested, rejected, withdrawn).
- Participation: not_invited → invited → accepted/declined → active → completed (+ cancelled with reason).
- Deliverable: awaiting_submission → submitted → internal_review → changes_requested | client_review → changes_requested | approved → publication_reported → publication_verified (+ cancelled with reason).

Rules enforced in services (each has a test):

- Shortlists are versioned snapshots. Decisions are keyed by (item, list version, stage). A client action on a replaced version returns STALE_TARGET.
- A content decision names a version id. Only the current version accepts decisions. A new version supersedes old approvals by being current; history is kept, and `cm_approval_decisions` is append-only by trigger.
- Client approval requires an internal approval of the same version. Changes requested or rejected require a comment (also a DB check).
- One decision per (target, version, stage) through a unique index. The same decision again is an idempotent no-op; a different one is a CONFLICT.
- Verified publication requires a manager, an evidence file and the actual publication time (also a DB check constraint).
- Material term changes after acceptance (fee, deliverables, rights, an added deliverable) bump `terms_version` and set `creator_reacceptance_required`. Changes to client-visible terms after client approval set `client_reapproval_required`. Acceptance is recorded against a terms version.
- Closing with open items requires the owner or an admin, an explicit "close with exceptions", and a reason. All of it is audited.

## Deadlines and lateness

- Moments are `timestamptz`; business dates are `date`. UI input is Israel wall-clock time, converted with DST handled (`domain/time.ts`, tested on both 2026 transition days).
- `original_*_due_at` is set once and immutable (trigger). Every change goes to `cm_deadline_changes` with a reason.
- `submission_breached_at` / `publication_breached_at` are written when lateness happens: by the overdue job, at a late submission or verification, or when a deadline that already passed is moved. They can never be cleared (trigger). A late item stays late even if its deadline is moved afterwards.
- This is deadline tracking, not a contractual SLA engine (no business calendars or holidays).

## Jobs, reminders and messages

- `enqueueJob` inserts with a `dedupe_key` that embeds the deadline value (e.g. `d:{id}:sub_rem:{dueISO}`). Moving a deadline cancels the old jobs and schedules new keys; moving it back revives the cancelled key. A cron re-run never duplicates.
- The worker claims with `FOR UPDATE SKIP LOCKED`. A handler first re-reads the state and skips if the condition no longer holds (submitted, deadline changed, campaign cancelled). Retries back off exponentially (2^n minutes, capped at 6h) up to `max_attempts`, then become `dead` (the failure queue). A job stuck in `running` for 15 minutes is retried.
- Notifications: `idempotency_key` per (event, recipient). Each message's `relevance` is re-checked right before sending; stale messages are cancelled. Outcomes: `sent` (provider message id stored), `dev_not_sent`, `failed` (retry), `dead`, `uncertain` (timeout; never resent automatically). A manager can retry (with an explicit "may duplicate" confirmation for `uncertain`) or dismiss from the Activity tab.
- Portal recipients get a fresh single-use login link minted at send time. The stored message holds only a path, never a token.
- Cancelling or closing a campaign cancels pending jobs, messages and open tasks in the same transaction.

Automations (all 12 requested):

| # | Trigger | Effect |
|---|---|---|
| 1 | client approves a creator | task "invite creator" (manager) |
| 2 | creator accepts | creator tasks per deliverable, reminder + overdue jobs, fee becomes a commitment |
| 3 | 24h before submission due | reminder to creator/agent |
| 4 | submission due passed | breach recorded, manager task + email, creator email |
| 5 | version submitted | submit/revise tasks closed, reminders cancelled, internal-review task |
| 6 | internal approval | client email + follow-up task |
| 7 | changes requested | creator task + email |
| 8 | client approval | publish task (creator), publication-overdue job |
| 9 | publication due passed, not reported | breach recorded, manager task, creator reminder |
| 10 | publication reported | verification task (manager) |
| 11 | 7 days after verification without metrics | metrics task + creator email |
| 12 | 30 days before rights expiry | manager task + email |

## Budget

One row per cost item; its status moves planned → committed → actual (or cancelled) in place, so it is
counted once, in its current bucket.

```
exposure  = committed + actual
available = approved − exposure            (shown also as "after planned": available − planned)
overrun   = max(0, exposure − approved)
```

Money is `numeric(14,2)` in the DB and bigint minor units in code (`domain/money.ts`); there is no
float arithmetic. One currency per campaign, with no conversion. VAT treatment is a per-campaign flag that is
displayed with every amount. A participation fee has exactly one budget line (unique index), kept in sync.
Changing a fee that was already marked paid is refused. Payment status is a manual record, and no money moves.

## Files

Upload intent (access check, type and size allow-list) → browser PUT to a signed URL (Supabase private
bucket; local adapter in dev) → `complete` verifies existence, exact size and magic bytes → `ready`.
Only `ready` assets can be referenced, and only by the same campaign and participation. A portal user can only
attach their own uploads. Keys are `{campaign}/{uuid}.{ext}` and are never overwritten. Downloads go through
an access check to a 5-minute signed URL. The cron removes pending uploads older than 24h and ready
files never referenced after 7 days. External links are stored as links and never fetched (no SSRF surface).

## Reports

Formulas are in `domain/report-metrics.ts`, with tests:

- Relevant deliverable: not cancelled, with its deadline in [campaign start, min(campaign end, now)].
- On-time submission: first submission ≤ deadline and no recorded breach.
- On-time verified publication: verified, actual time known, ≤ deadline, no breach. Verified without a time counts as missing data, not success.
- Denominator 0 → "לא רלוונטי".
- Metrics: latest observation per metric. A missing metric is no row (blank in CSV, "חסר" in the UI), never zero. Each metric is kept separate; reach is labelled as a per-post sum, not unique reach.
- Approval waiting time comes from the decision timeline.
- CSV: UTF-8 BOM, CRLF, RFC 4180 quoting, and a formula-injection guard on text cells.
- A client sees only snapshots a manager published, built without budget and fees.

## Data ownership

See [discovery.md](discovery.md#ownership-of-data).
