# Price Quote Persistence and Editing

**Status: DRAFT — policy approved by owner 2026-07-20, implementation not yet approved.** Designed via a 20-agent workflow: three independent designs, each judged on four lenses, winner synthesized with grafts from the runners-up.

## Problem

`/price-quote` generates a PDF and hands it to the browser. It **persists nothing** — no id, no quote number, no history. Closing the tab destroys the quote. There is no "my quotes" screen and no way to reopen one.

The owner's requirement, stated 2026-07-20:

> הצעות המחיר משתנות רק אם הוא לא חתם… נגיד אני שולח הצעת מחיר וללקוח יש השגות, אז שיהיה אפשר לשנות וזה ישלח לו מעודכן.

Signed is final. Unsigned is editable, and editing must be able to reach the client as an updated version.

## The live hazard this sits on top of

The only place `PriceQuoteData` is stored today is `signature_requests.payload.quote_data` (8 of 11 rows). That is **not an archive**: `POST /api/signatures/[token]/sign` regenerates the signed PDF *from that snapshot at signing time*. Mutating the JSON retroactively changes what the client signs — not what they saw, but what is produced the moment they click "sign".

Any persistence design that writes near that payload without freezing it makes the problem worse, not better.

## Non-goals

- Version diff UI, restore-to-previous, full revision drawer. Not requested; deferred.
- Salesforce write-back. Deferred to a later stage; correctness does not depend on it.
- Recovering quotes that were only ever downloaded as PDF. They exist nowhere and will not be reconstructed from PDFs.

---

## 1. The decision: dedicated tables, not `documents`

The judges ranked a cheaper design **first** — reuse `documents` under a new type, 3 days versus 11. It is rejected, and the reason is the owner's own requirement.

`documents` is the pipeline's scratchpad. ~15 routes do read-modify-write on `data`; `PATCH` merges only at the top level, so deleting one budget line can replace the entire pricing table; and `/api/shares` → `/s/[token]` is an **unauthenticated** route that checks ownership but **not type**, so a salesperson could produce a public link to client pricing.

Verified directly against the database:

```
policyname                      cmd      roles
"Anyone can update documents"   UPDATE   {anon}    ← no USING, no WITH CHECK
"Anyone can insert documents"   INSERT   {anon}
"Anyone can view documents"     SELECT   {anon}
```

"Signed is sacred" cannot be guaranteed in a table that anyone holding the public anon key can update. This is not an abstract security preference — it is the stated requirement resting on something that does not hold.

**Decision: `price_quotes` (mutable draft) + `price_quote_revisions` (append-only, frozen).** One sentence: *the draft is always editable and never binding; a revision is never editable and always binding. Sending for signature publishes a revision.*

## 2. Policy, in the language of the people using it

1. **A quote sent and awaiting signature can be edited freely.** Editing does not touch the link already sent. The header shows, continuously: *"גרסה 3 נשלחה · יש שינויים שלא נשלחו"*.
2. **To reach the client, press "שליחה מחדש לחתימה".** Then, and only then: **the old link dies**, a new link is issued with a fresh 30-day window, and the client gets an email.
3. **Never two live signature links for one deal.** This is the behaviour that does not exist today — see §6.
4. **A signed quote is frozen.** Not in the database, not in Drive. The draft may still be edited and published as a new revision, behind two confirmations; if signed influencer contracts depend on it, they are listed by name first.
5. **Validity is never extended.** An expired link is expired. A new version means a new window.
6. From ship day, every quote autosaves whether or not it is ever sent.

**The accepted cost:** correcting a typo in a client's name also kills the link and sends a second email. That price is paid deliberately — the moment a "quiet republish" path exists, the two-live-links failure returns. A "cancel the old link but don't email" route is possible; it is open question #4.

---

## 3. Data model

`supabase/migrations/20260721_price_quotes_draft_published.sql` — additive and idempotent; nothing existing is dropped or altered in place.

```sql
create sequence if not exists public.price_quote_number_seq start 1001;

create or replace function public.next_quote_number() returns text
language sql volatile as $$
  select 'Q-' || to_char(now(), 'YYYY') || '-'
       || lpad(nextval('public.price_quote_number_seq')::text, 4, '0');
$$;

create table if not exists public.price_quotes (
  id                    uuid primary key default gen_random_uuid(),
  quote_number          text not null unique default public.next_quote_number(),
  owner_email           text not null,
  owner_user_id         uuid references auth.users(id) on delete set null,
  title                 text not null default 'הצעת מחיר',
  client_name           text not null default '',
  campaign_name         text not null default '',

  draft_data            jsonb   not null default '{}'::jsonb,
  draft_version         integer not null default 1,      -- optimistic lock
  draft_updated_at      timestamptz not null default now(),
  draft_updated_by      text,

  current_revision_id   uuid,
  published_count       integer not null default 0,

  -- external identity that page.tsx currently discards on every render
  origin                text not null default 'price-quote'
                          check (origin in ('price-quote','salesforce-quote')),
  salesforce_project_id text,
  lead_id               uuid,
  brief_link_token      text,
  clickup_list_id       text,
  deck_document_id      uuid references public.documents(id) on delete set null,

  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.price_quote_revisions (
  id                        uuid primary key default gen_random_uuid(),
  quote_id                  uuid not null references public.price_quotes(id) on delete restrict,
  revision_number           integer not null,
  data                      jsonb not null,   -- FROZEN PriceQuoteData
  template_version          text  not null,   -- the JSON is frozen; the renderer is not
  legacy_backfill           boolean not null default false,
  published_by_email        text not null,
  published_at              timestamptz not null default now(),

  -- artifacts: NULL at commit, filled in one by one as each side effect lands
  signature_request_id      uuid references public.signature_requests(id) on delete set null,
  signature_token           uuid,
  pdf_drive_file_id         text,
  pdf_drive_view_link       text,

  supersedes_revision_id    uuid references public.price_quote_revisions(id),
  superseded_by_revision_id uuid references public.price_quote_revisions(id),
  superseded_at             timestamptz,
  superseded_a_signed_rev   boolean not null default false,
  sf_event_sent             text,
  sf_event_sent_at          timestamptz,

  unique (quote_id, revision_number)
);
```

`template_version` is not decoration. The JSON is frozen but the renderer is not — any template change silently alters the PDF of a document already in flight.

**Immutability is enforced in the database, not in a route.** A trigger on `price_quote_revisions` rejects `DELETE` outright and rejects any change to `data`, `template_version`, `quote_id`, `revision_number`, `published_at` or `published_by_email`. Artifact columns are permitted exactly one `NULL → value` transition — without that allowance, publish is not resumable after a partial failure.

**RLS:** `select` to `authenticated` on both tables (the hub is deliberately global). **No insert/update/delete policy for any role, including `authenticated`.** Every write goes through the API under service-role with a session check. This also closes "the owner can rewrite `salesforce_project_id` through PostgREST".

## 4. The enforcement that actually matters

The immutability trigger above protects `price_quote_revisions.data` — but `sign/route.ts` reads `signature_requests.payload.quote_data`. Guarding the wrong table is the single most likely way to ship this feature and still have the original hazard.

```sql
create or replace function public.signature_requests_write_once()
returns trigger language plpgsql as $$
begin
  if (old.payload ? 'quote_data' or old.payload ? 'contract_data')
     and new.payload is distinct from old.payload then
    raise exception 'signature_requests.payload is write-once (request %)', old.id;
  end if;

  if old.status = 'signed' and new.status is distinct from old.status then
    raise exception 'signature request % is signed and terminal', old.id;
  end if;

  -- closes the supersede -> sign race: cancel lands mid-Playwright-render,
  -- the signature arrives anyway, and the client signs a cancelled version
  if new.status = 'signed' and old.status not in ('pending','opened') then
    raise exception 'signature request % cannot be signed from status %', old.id, old.status;
  end if;

  if old.quote_revision_id is not null
     and new.quote_revision_id is distinct from old.quote_revision_id then
    raise exception 'signature request % is already bound to a revision', old.id;
  end if;
  return new;
end $$;
```

This trigger sits **on the read path of the signature route**. It is the guarantee; everything else is convenience.

## 5. API surface

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/price-quotes` | Create draft. Called on first autosave — the quote is recoverable ~1.5s after the first keystroke. |
| `GET` | `/api/price-quotes` | List. `?q=&owner=&state=draft\|sent\|signed\|archived`. Returns `legacy[]` separately (`read_only:true`). |
| `GET` | `/api/price-quotes/[id]` | Editor payload: draft + `draft_version` + `current_revision` + `is_dirty` (computed in SQL as `draft_data IS DISTINCT FROM revision.data`). |
| `PATCH` | `/api/price-quotes/[id]` | Autosave. `{data, expected_draft_version}`; conditional update; 0 rows → **409** with the winner's identity. |
| `DELETE` | `/api/price-quotes/[id]` | Soft archive. **409** if a revision has a live `pending`/`opened` signature request. |
| `POST` | `/api/price-quotes/[id]/publish` | **The only route that creates a revision.** |
| `POST` | `/api/price-quote/preview` | **New.** Accepts `PriceQuoteData` in the body, returns `text/html` → client turns it into a blob URL for the iframe. |
| `POST` | `/api/price-quote` | **Unchanged.** Stateless render-and-download. |
| — | `/api/quotes/[id]/*` | **Untouched.** `[id]` there remains `signature_requests.id`. |

**Publish order is load-bearing:**
1. Preflight **422** if `enabledPages[4] === false` — the signature block exists only on page 4, so this would send an unsignable document.
2. **Cancel the previous request first, conditional on status.** Doing this after the Drive/email work leaves the old token signable for tens of seconds.
3. Freeze revision N+1 including `template_version`.
4. Render the PDF **from the frozen revision, not from the request body**.
5. Upload to Drive as `${title} — גרסה ${n}.pdf`.
6. Create the signature request bound to `quote_revision_id`.
7. Email the client.
8. Push to Salesforce, recorded in `sf_event_sent`.

Steps 3–8 cross four systems with no transaction. This is the risky part of the feature and gets a manual runbook against a Supabase branch, tested only against the three approved test contacts.

**Why `POST /api/price-quote/preview` and not `?quote=<uuid>`:** the middleware excludes all of `/api` from its matcher and `GET /api/price-quote` performs no session check. A `?quote=<uuid>` parameter would turn any uuid visible in the address bar into a key to a full pricing PDF — an IDOR. The POST-and-blob approach also removes the current `?data=<json>` URL-length ceiling.

**Not `data_sha256`.** Use `jsonb IS DISTINCT FROM` on the database side. `jsonb` is normalized in Postgres; a sha of `JSON.stringify` does not round-trip, so the "unpublished changes" chip would flicker on every reload.

## 6. Backfill — one row is one quote

**No automatic merging, ever.** `project_id` is an opportunity key, not a document key. Two signed rows share `project_id = a00d100000FATuYAAX` with identical terms but **different recipients** (`yael@productive.co.il`, `ido@triroars.co.il`), signed 15 minutes apart. Merging them would fuse two distinct signed agreements.

Each `signature_requests` row carrying `quote_data` becomes one `price_quotes` row plus one `price_quote_revisions` row at `revision_number = 1`, `template_version = 'legacy'`, `legacy_backfill = true`. The draft opens as what was sent — no surprises. The 3 rows without a snapshot are excluded and surface as read-only legacy entries.

A review query is included **commented out**, not run:

```sql
-- select title, recipient_email, count(*), array_agg(id)
-- from public.signature_requests where payload -> 'quote_data' is not null
-- group by 1,2 having count(*) > 1;
```

It currently returns the **two live לפמ requests** — see open question #1.

## 7. TypeScript changes (both backward-compatible, verified against all 8 snapshots)

1. `src/types/price-quote.ts` — three optional fields: `quoteNumber?`, `revisionNumber?`, `quoteId?`. The template prints `Q-2026-0042 · גרסה 3` on page 1. Today two PDFs of the same deal are byte-identical with nothing distinguishing them.
2. `price-quote-template.ts:47` — `if (data.services && data.services.length > 0)` → `if (Array.isArray(data.services))`. Verified: all 3 legacy snapshots have no `services` key at all (`undefined`), so they continue to hit the fallback; only a deliberate `services: []` renders empty.

## 8. Staged delivery — ~9.5 days

| Stage | Contents | Days |
|---|---|---|
| **0 — safety, independent and immediate** | `signature_requests_write_once` trigger; supersede→sign race closed; `Array.isArray` fix; 422 on disabled page 4; `authorize()` fail-closed in the Salesforce webhook; dead link at `fetchFeed.ts:208` | 1 |
| **1 — persistence and editing** | Migration, backfill, editor split, autosave with 409, `POST /api/price-quote/preview` | 4 |
| **2 — publish and supersede** | `/publish` in full order, old-link cancellation, quote numbers on the PDF, confirmation dialog | 3.5 |
| **3 — minimal list** | `/price-quotes` — without it there is no way to find a quote to reopen | 1 |

Stage 0 closes six live bugs, is fully reversible, and depends on nothing else in the feature. It can ship this week independently of any decision about the rest.

Deferred until requested: Salesforce `quote.revised` events and the pull endpoint (~1.5d), field-level diff, version drawer, restore, admin override (~3d).

The original estimate of 11 days was revised to 13 by three independent lenses, then cut to ~9.5 by the owner's scope decision (no version history, no diff, no restore). The three consistently under-estimated areas were: diffing arrays without ids, manual QA of the publish path (real PDF, real Drive, real email — there is no relevant test framework in this repo), and RTL effort.

## 9. Open questions for the owner

1. **Two live signature requests to `hadar@lapam.gov.il`** — 2026-07-08 and 2026-07-12, both `opened`, neither signed. A government client with two active signing links. **Which one is cancelled, and who tells them?** No code will touch these; this is a human decision.
2. **Two signed deals under `a00d100000FATuYAAX`** — separate engagements, or an operational duplicate? Determines whether a manual `UPDATE` follows the migration.
3. **May an employee edit another employee's quote?** Recommendation: global read, writes through the API with an ownership check. That implies an admin override when someone is abroad — add it now via `ADMIN_EMAILS`, or wait for the first complaint?
4. **"Quiet correction" — yes or no?** A cosmetic fix currently costs the client a second email. A "cancel the old link without emailing" route preserves safety and removes the operational cost.
5. **Who owns the price — Salesforce or the hub?** Recommendation: editing a Salesforce-originated quote is allowed but noisy (event + pull endpoint + persistent banner). Blocking it sends the user back to the raw generator, which produces a quote with no `project_id`, and the deal disappears from Salesforce permanently.
6. **Old PDFs in Drive stay publicly readable.** A forwarded link to version 1 keeps working and still looks authentic — now at least stamped `גרסה 1`. Revoking Drive permissions runs through the sender's OAuth and breaks when that employee leaves. Live with "old but marked", or invest in partial revocation?
7. **Numbering:** `Q-2026-0042` runs on a sequence that does not reset, so `Q-2027-0043` follows `Q-2026-0042`. Reset yearly, or drop the year from the format?
8. **Deletion.** The ledger is append-only with no escape hatch — a quote containing mistakenly-entered personal data can never be removed. Is a supervised deletion path (service-role plus log) required, or is non-deletion the requirement?
