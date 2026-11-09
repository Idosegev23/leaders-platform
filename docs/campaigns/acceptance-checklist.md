# Brieflow: acceptance checklist

Status as of 2026-10-26 on branch `feat/campaigns-mvp`. "Test" refers to files under `src/lib/campaigns/`.

## Required tests (brief §20)

| # | Requirement | Where it is tested | Result |
|---|---|---|---|
| 1 | Open campaign linked to a brief | `test/flow.int.test.ts` › opens a campaign linked to a brief | pass |
| 2 | Add creator; no double assignment | flow › adding the same creator twice… (+ duplicate creator by phone/handle refused) | pass |
| 3 | Same creator in two campaigns, different fees/deliverables | flow › the same creator can be in two campaigns… | pass |
| 4 | Client A cannot read/change client B's campaign | `test/security.int.test.ts` › client separation | pass |
| 5 | Creator cannot reach another creator's deliverable via URL/request | security › creator A cannot reach creator B's deliverable…; browser smoke (URL tamper) | pass |
| 6 | Agent limited to represented creators | security › an agent sees only creators they are authorized to represent | pass |
| 7 | Cost and internal notes never sent to the client portal | security › client views contain no fee, budget or internal notes; browser smoke (page text) | pass |
| 8 | Shortlist approval applies to the right list version | flow › …frozen list version (late candidate not covered, stale version refused) | pass |
| 9 | Content approval applies to the current version only | flow › …approvals bound to the current version | pass |
| 10 | New version needs re-approval and keeps history | flow › creator submits v3 while client reviews v2… | pass |
| 11 | Changes requested without a comment is refused | flow (shortlist + content) | pass |
| 12 | Double click / repeated automation creates no duplicates | flow (idempotent decisions); operations › reminder fires once…; flow › worker sends nothing twice | pass |
| 13 | Reminder cancelled when the deliverable is submitted | `test/operations.int.test.ts` › a reminder is not sent once the deliverable was submitted | pass |
| 14 | Deadline change leaves no stale reminder | operations › changing the deadline leaves no stale reminder active | pass |
| 15 | Cancelling the campaign stops future jobs | operations › cancelling the campaign stops future jobs, messages and tasks | pass |
| 16 | Provider failure → retry and correct status | operations › provider failure is retried…; timeout becomes "uncertain" | pass |
| 17 | Not "submitted" if the upload failed | operations › uploads (pending, partial, wrong type, oversize, client upload) | pass |
| 18 | Unauthorized user gets no signed URL | security › signed URLs | pass |
| 19 | Expired / revoked / reused token gives no access | security › invitation tokens (4 cases); browser smoke (reuse) | pass |
| 20 | Commitment and its replacing expense not double counted | `domain/domain.test.ts` › budget; operations › budget | pass |
| 21 | Missing metric distinct from zero | domain › missing metric…; flow › report row (reach left empty) | pass |
| 22 | Metric formulas handle zero denominator and cancelled items | domain › denominator zero…, cancelled… | pass |
| 23 | Deadline change does not erase lateness | domain › recorded breach stays late; operations › moving a deadline that already passed…; DB triggers | pass |
| 24 | Hebrew CSV correct, dangerous input defused | domain › CSV; flow › CSV export; browser smoke (BOM + content type) | pass |
| 25 | Closing with exceptions follows policy | operations › closing with open items needs an authorized person… | pass |
| 26 | Full flow open → select → participate → submit → fix → approve → report → verify → report | flow › full pilot flow (6 steps) | pass |

Also tested: DB grants (anon/authenticated denied on every cm_ table, RLS on all), append-only audit and
decisions, immutable content versions, lost-update protection, job crash → dead queue, orphan file cleanup,
rights-expiry alert, re-acceptance after term changes, staff limits, every list query with each filter, DST
conversion on both 2026 transition days, and the influencer-contracts auth regression
(`src/app/api/quotes/[id]/influencer-contracts/route.test.ts`).

## Commands and results (2026-10-26)

| Command | Result |
|---|---|
| `npm test` (all Vitest unit tests, incl. pre-existing) | 15 files, 154 tests passed |
| `npm run test:campaigns` (local Postgres) | 3 files, 42 tests passed |
| `npm run typecheck` | 0 errors |
| ESLint with `next/core-web-vitals` on all new/changed code | 0 problems (the repo itself has no ESLint config, see status) |
| `npm run build` | success (needs `SUPABASE_SERVICE_ROLE_KEY` set to any value because an existing route is prerendered at build time) |
| `scripts/campaigns/browser-smoke.ts` (real Chrome, headless) | 10/10 steps pass |
| Migrations on an empty DB (shim + all 27 files) and re-applying the campaigns migration | pass |

## Browser check (real Chrome, desktop 1366×900 and mobile 390×844)

| Path | Desktop | Mobile |
|---|---|---|
| Manager: list, all 8 campaign tabs, deliverable, internal approval click, print view, CSV | yes | list checked (no horizontal overflow) |
| Client: enter via link, home, content decision | — | yes (no horizontal overflow; no prices on page) |
| Creator: enter via link, home, upload file, submit version, URL tamper | — | yes |

Not covered by the browser run: screen-reader testing, keyboard-only walkthrough (labels, focus rings and
Escape-to-close are implemented but were not driven by keyboard in the run), Safari/iOS, real Supabase storage,
real Gmail.

## Definition of done (brief §24)

| Item | Status |
|---|---|
| Module implemented in code | done |
| Schema and migrations exist and were tested | done (local only; not applied to any Supabase project) |
| Manager can set up and run a campaign | done |
| Client can approve only what they are allowed to | done |
| Creator and agent can submit/update only their own data | done |
| Versions and approvals stored correctly | done |
| Reminders and tasks without duplicates in the tested cases | done |
| Private, protected files | done (local adapter tested; Supabase adapter written, not exercised) |
| Report and verify publication | done |
| Enter metrics and produce a summary | done |
| Budget with an explained, consistent calculation | done |
| Activity log | done |
| Core and permission tests pass | done |
| Browser check as far as the environment allows | done (see above for what was not covered) |
| Run and deploy instructions another person can follow | done: [deployment-runbook.md](deployment-runbook.md) |
