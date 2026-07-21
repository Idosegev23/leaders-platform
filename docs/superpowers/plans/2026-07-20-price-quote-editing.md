# Price Quote Persistence & Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated price quotes persistent and editable, so an unsigned quote can be revised and re-sent to the client while a signed quote stays frozen.

**Architecture:** A mutable `price_quotes` draft plus an append-only `price_quote_revisions` ledger. Publishing (sending for signature) freezes a revision and kills the prior signing link. Immutability is enforced by database triggers on the signature read-path, not by route code.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase Postgres (migrations via `mcp__supabase__apply_migration` / SQL editor), react-hook-form, Playwright PDF, existing Drive-as-user upload + Gmail send.

**Spec:** [docs/superpowers/specs/2026-07-20-price-quote-editing-design.md](../specs/2026-07-20-price-quote-editing-design.md)

## Testing reality — read before executing

**This repo has no automated test framework** (confirmed: CLAUDE.md "No automated tests"; no vitest/jest config). The standard "write a failing test → run the runner" cycle does not apply. Each task's verification step is therefore one of:

- **TYPECHECK** — `npx tsc --noEmit` must pass.
- **SQL ASSERT** — a `mcp__supabase__execute_sql` query with a stated expected result, run **against a Supabase branch** (`mcp__supabase__create_branch`), never prod, until the final merge.
- **MANUAL QA** — a written click-path, run only against the three approved test contacts (CTO, Noa Sabagi, Yoav Bogin) and **never** Eran Nizri (owner). No Make.com webhook or real client email may fire during testing.

Do not invent a test runner. Do not skip the verification step because "there's no test."

## Global Constraints

- **Migrations are additive and idempotent.** Nothing existing is dropped or altered in place. `create table if not exists`, `add column if not exists`.
- **No RLS write policy for any role**, including `authenticated`. Every write goes through an API route under service-role with a session check. `select` is `to authenticated using (true)` (the hub is deliberately global).
- **Signed is frozen.** A `signature_requests` row whose `payload` contains `quote_data`/`contract_data` is write-once; `status='signed'` is terminal; `signed` is reachable only from `pending`/`opened`.
- **Never two live signing links for one deal.** Publishing a new revision cancels the prior request *before* any Drive/email side effect.
- **Test recipients:** only CTO, Noa Sabagi, Yoav Bogin. Never Eran Nizri. See memory `feedback_approved_test_contacts`, `feedback_exclude_eran_nizri_from_tests`.
- **`printf %s`, never `echo`,** for any `vercel env add` (trailing newline breaks signature/HMAC values).
- **Schema reality (verified 2026-07-20):** `signature_requests` **already has** `parent_signature_request_id uuid` and `deck_document_id uuid`. Reuse `parent_signature_request_id` for the supersede chain; do **not** add `superseded_by_request_id` or re-add `deck_document_id`.

---

## Stage 0 — Safety fixes (independent, reversible, ships alone)

Six live-bug fixes. Each is independent of the rest of the feature and of each other. This stage can merge to prod before Stage 1 exists.

### Task 0.1: Write-once + status-guard triggers on `signature_requests`

**Files:**
- Create: `supabase/migrations/20260721_signature_requests_write_once.sql`

**Interfaces:**
- Produces: DB triggers `signature_requests_write_once_trg`. No app-code interface. Later tasks (Stage 2 publish) rely on the status-transition guard existing.

- [ ] **Step 1: Write the migration**

```sql
-- Enforce: payload with quote_data/contract_data is write-once;
-- signed is terminal; signed only reachable from pending/opened.
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

  if new.status = 'signed' and old.status not in ('pending','opened') then
    raise exception 'signature request % cannot be signed from status %', old.id, old.status;
  end if;

  return new;
end $$;

drop trigger if exists signature_requests_write_once_trg on public.signature_requests;
create trigger signature_requests_write_once_trg
  before update on public.signature_requests
  for each row execute function public.signature_requests_write_once();
```

- [ ] **Step 2: Apply to a branch and assert it blocks a payload mutation**

Create a branch, apply, then run against the branch:

```sql
-- pick any existing row that has quote_data
select id from signature_requests where payload ? 'quote_data' limit 1;
-- attempt an illegal payload mutation — MUST raise
update signature_requests set payload = payload || '{"x":1}'::jsonb
  where id = '<that-id>';
```

Expected: `ERROR: signature_requests.payload is write-once`.

- [ ] **Step 3: Assert a legal status bump still works**

```sql
-- opened -> signed on a NON-quote row must still succeed (no payload change)
-- use a disposable branch row; expected: UPDATE 1
```

Expected: the `pending`/`opened` → `signed` path succeeds; a `cancelled` → `signed` attempt raises.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260721_signature_requests_write_once.sql
git commit -m "feat(quotes): write-once + status-guard triggers on signature_requests"
```

### Task 0.2: Salesforce webhook `authorize()` fail-closed

**Files:**
- Modify: `src/app/api/webhooks/salesforce/quote/route.ts:37-45`

**Interfaces:**
- Consumes nothing new. Produces the corrected `authorize(request): boolean`.

- [ ] **Step 1: Read the current function**

Current (`route.ts:37`): `const secret = process.env.SALESFORCE_WEBHOOK_SECRET; if (!secret) return true` — fails **open** when the secret is unset, so an unconfigured deploy accepts any caller.

- [ ] **Step 2: Change fail-open to fail-closed**

```ts
function authorize(request: Request): boolean {
  const secret = process.env.SALESFORCE_WEBHOOK_SECRET
  if (!secret) return false   // fail CLOSED: unconfigured = reject, not accept
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(auth.slice(7).trim()), Buffer.from(secret))
  } catch {
    return false
  }
}
```

- [ ] **Step 3: TYPECHECK**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Confirm the env var is set in all Vercel environments** (else this route now 401s in prod — intended, but must be deliberate)

Run: `vercel env ls | grep SALESFORCE_WEBHOOK_SECRET`
If absent, set it with `printf %s` before merging, or accept that the route is closed until it is.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/salesforce/quote/route.ts
git commit -m "fix(quotes): salesforce webhook authorize() fails closed when secret unset"
```

### Task 0.3: `resolveServices` tolerates missing/empty `services`

**Files:**
- Modify: `src/templates/price-quote/price-quote-template.ts:47`

**Interfaces:**
- Produces: `resolveServices(data)` returning the canned constant when `data.services` is absent, and the editable list only when it is a non-empty array.

- [ ] **Step 1: Change the guard**

Current line 47: `if (data.services && data.services.length > 0) {`
Change to:

```ts
function resolveServices(data: PriceQuoteData): QuoteService[] {
  if (Array.isArray(data.services) && data.services.length > 0) {
    return data.services
  }
  // fall through to the canned constant (unchanged below)
```

Rationale (verified): all 3 legacy snapshots have **no** `services` key, so `data.services` is `undefined` and they must keep hitting the fallback; only a deliberate `services: []` should render empty. `Array.isArray` makes the intent explicit and null-safe.

- [ ] **Step 2: TYPECHECK**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: MANUAL QA** — render a quote with `services` undefined and confirm the canned "ניהול שוטף" list appears; render with `services: [{...selected}]` and confirm the editable list appears.

- [ ] **Step 4: Commit**

```bash
git add src/templates/price-quote/price-quote-template.ts
git commit -m "fix(quotes): resolveServices null-safe via Array.isArray"
```

### Task 0.4: Block send when the signature page is disabled

**Files:**
- Modify: `src/app/api/quotes/request-signature/route.ts` (validation block, after body parse ~line 55)

**Interfaces:**
- Consumes: `body.quote_data` (already parsed).
- Produces: a 422 when `quote_data.enabledPages?.[4] === false` (page 4 holds the only signature block, so sending it is unsignable).

- [ ] **Step 1: Add the preflight guard after the existing required-field check**

```ts
// Page 4 carries the ONLY signature block. Sending a quote with page 4
// disabled produces a document the client cannot sign.
const qd = body.quote_data as { enabledPages?: Record<number, boolean> } | null
if (qd?.enabledPages && qd.enabledPages[4] === false) {
  return NextResponse.json(
    { error: 'לא ניתן לשלוח לחתימה: עמוד החתימה (עמוד 4) מבוטל בהצעה.' },
    { status: 422 },
  )
}
```

- [ ] **Step 2: TYPECHECK**

Run: `npx tsc --noEmit`
Expected: no new errors. If `enabledPages` is not on the type, widen locally as shown (do not change the shared type in this task).

- [ ] **Step 3: MANUAL QA** — attempt to send a quote with page 4 toggled off; expect a 422 and the Hebrew message, no signature request created.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quotes/request-signature/route.ts
git commit -m "fix(quotes): reject send-for-signature when page 4 disabled (422)"
```

### Task 0.5: Fix the dead quote link in the activity feed

**Files:**
- Modify: the `documentsToEvents` href construction in the feed builder (grep `href = isQuote ? \`/price-quote?id=` — file: `src/lib/**/fetchFeed*` / `src/app/**/fetchFeed*`; confirm exact path with `grep -rn "price-quote?id="`).

**Interfaces:**
- Produces: an href that resolves. Until Stage 1 lands the loader, the quote generator ignores `?id=`, so this link is dead. Point it at the generator without the dead param for now; Stage 3 repoints it at `/price-quotes/[id]`.

- [ ] **Step 1: Locate the exact line**

Run: `grep -rn "price-quote?id=" src`

- [ ] **Step 2: Change the href**

```ts
// Was: const href = isQuote ? `/price-quote?id=${r.id}` : `/edit/${r.id}`
// The generator ignores ?id=. Until the loader exists (Stage 1), don't
// advertise a link that goes nowhere. Repointed at /price-quotes/[id] in Stage 3.
const href = isQuote ? `/price-quote` : `/edit/${r.id}`
```

- [ ] **Step 3: TYPECHECK**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(quotes): remove dead ?id= link from activity feed"
```

### Task 0.6: Close the supersede→sign race in the sign route

**Files:**
- Modify: `src/app/api/signatures/[token]/sign/route.ts` (the status guard ~line 81-85)

**Interfaces:**
- Consumes: the DB trigger from Task 0.1 (defense in depth). This task adds the same check at the app layer so the user gets a clean Hebrew error rather than a 500 from the trigger.

- [ ] **Step 1: Read the current guard**

Lines 81-85 reject `status==='signed'` (409) and `cancelled`/expired (410). They do **not** reject a request that was superseded but still carries a signable status via a stale token.

- [ ] **Step 2: Add an explicit cancelled/superseded guard before regeneration**

```ts
if (req.status === 'signed') {
  return NextResponse.json({ error: 'המסמך כבר נחתם' }, { status: 409 })
}
if (req.status === 'cancelled' || new Date(req.expires_at).getTime() < Date.now()) {
  return NextResponse.json({ error: 'בקשת החתימה פגה תוקף' }, { status: 410 })
}
// Only pending/opened may proceed to signing. Anything else (e.g. superseded
// by a newer revision) is rejected here AND by the DB trigger from Task 0.1.
if (req.status !== 'pending' && req.status !== 'opened') {
  return NextResponse.json(
    { error: 'בקשת החתימה עודכנה — התקבל קישור חדש. אנא השתמש/י בקישור העדכני.' },
    { status: 410 },
  )
}
```

- [ ] **Step 3: TYPECHECK**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: MANUAL QA** — on a branch, set a test request's status to `cancelled`, hit the sign route, expect 410 with the Hebrew message (not a 500).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/signatures/[token]/sign/route.ts
git commit -m "fix(quotes): sign route rejects non-pending/opened requests (410)"
```

**Stage 0 gate:** all six committed, `npx tsc --noEmit` clean, triggers verified on a branch. This stage is mergeable to prod on its own.

---

## Stage 1 — Persistence & editing

### Task 1.1: Core migration — `price_quotes` + `price_quote_revisions`

**Files:**
- Create: `supabase/migrations/20260721_price_quotes_draft_published.sql`

**Interfaces:**
- Produces: tables `price_quotes`, `price_quote_revisions`; `next_quote_number()`; immutability + optimistic-lock triggers; RLS select-only. Columns exactly as spec §3. **Add to `signature_requests` only** `quote_revision_id uuid`, `cancelled_at timestamptz`, `cancel_reason text` (reuse existing `parent_signature_request_id` for the chain; `deck_document_id` already exists).

- [ ] **Step 1: Write the migration** — copy the full DDL from spec §3, then the `signature_requests` alter reduced to the three genuinely-missing columns:

```sql
alter table public.signature_requests
  add column if not exists quote_revision_id uuid references public.price_quote_revisions(id),
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancel_reason      text;
create index if not exists sig_req_revision_idx on public.signature_requests (quote_revision_id);
```

Include the `price_quote_revisions_immutable()` trigger (rejects DELETE and any change to frozen columns; permits one `NULL→value` per artifact column) and `price_quotes_bump()` (optimistic lock: `draft_version` must increase when `draft_data` changes) exactly as spec §3.

- [ ] **Step 2: Apply to a fresh branch**

Use `mcp__supabase__create_branch`, then `mcp__supabase__apply_migration`.

- [ ] **Step 3: SQL ASSERT — tables and guards exist**

```sql
select count(*) from information_schema.tables
  where table_name in ('price_quotes','price_quote_revisions');   -- expect 2
-- immutability holds:
insert into price_quotes (owner_email) values ('test@ldrsgroup.com') returning id;  -- note id
-- (insert a revision for that quote, then) attempt to mutate its data -> MUST raise
```

Expected: 2 tables; mutating a published revision's `data` raises `published revision % is immutable`.

- [ ] **Step 4: SQL ASSERT — optimistic lock**

```sql
-- same draft_version with changed data must raise
update price_quotes set draft_data = '{"a":1}'::jsonb where id = '<id>';  -- draft_version unchanged -> raise
```

Expected: `draft_version must increase`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721_price_quotes_draft_published.sql
git commit -m "feat(quotes): price_quotes + append-only revisions schema"
```

### Task 1.2: Backfill from `signature_requests`

**Files:**
- Append to: `supabase/migrations/20260721_price_quotes_draft_published.sql` (backfill block, spec §6)

**Interfaces:**
- Produces: one `price_quotes` + one `price_quote_revisions` (revision_number=1, `legacy_backfill=true`) per `signature_requests` row with `payload->'quote_data'`. **No automatic merging.** The 3 rows without a snapshot are excluded.

- [ ] **Step 1: Add the backfill block** — copy spec §6 verbatim (temp table `pq_backfill`, the two inserts, the `signature_requests.quote_revision_id` update). Keep the duplicate-detection query **commented out**.

- [ ] **Step 2: Apply to the branch, SQL ASSERT counts**

```sql
select count(*) from price_quotes;            -- expect 8 (rows with quote_data)
select count(*) from price_quote_revisions;   -- expect 8
select count(*) from signature_requests where quote_revision_id is not null;  -- expect 8
```

- [ ] **Step 3: SQL ASSERT — the two לפמ rows are NOT merged**

```sql
select count(*) from price_quotes pq
  join price_quote_revisions r on r.quote_id = pq.id
  join signature_requests s on s.quote_revision_id = r.id
  where s.recipient_email = 'hadar@lapam.gov.il';   -- expect 2 distinct quotes
```

Expected: 2 — proving no merge. (Owner decision on which to cancel is tracked separately; the migration does not touch them.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260721_price_quotes_draft_published.sql
git commit -m "feat(quotes): backfill price_quotes from signature_requests (no merge)"
```

### Task 1.3: Types — three optional fields

**Files:**
- Modify: `src/types/price-quote.ts` (the `PriceQuoteData` interface)

**Interfaces:**
- Produces: `PriceQuoteData.quoteNumber?`, `.revisionNumber?`, `.quoteId?` — all optional, so every existing snapshot stays valid.

- [ ] **Step 1: Add the fields to `PriceQuoteData`**

```ts
export interface PriceQuoteData {
  // ...existing fields...
  /** Set once persisted. Printed on page 1 as e.g. "Q-2026-0042 · גרסה 3". */
  quoteNumber?: string
  revisionNumber?: number
  quoteId?: string
}
```

- [ ] **Step 2: TYPECHECK** — `npx tsc --noEmit`, expect no errors (all optional).

- [ ] **Step 3: Commit**

```bash
git add src/types/price-quote.ts
git commit -m "feat(quotes): optional quoteNumber/revisionNumber/quoteId on PriceQuoteData"
```

### Task 1.4: CRUD routes — create, list, get, autosave, archive

**Files:**
- Create: `src/app/api/price-quotes/route.ts` (POST create, GET list)
- Create: `src/app/api/price-quotes/[id]/route.ts` (GET editor payload, PATCH autosave, DELETE archive)
- Create: `src/lib/price-quotes/service.ts` (service-role Supabase client + row mappers)

**Interfaces:**
- Consumes: `getUser()` session (via `@/lib/supabase/server`), service-role client.
- Produces:
  - `POST /api/price-quotes` `{title?, draft_data}` → `{id, quote_number, draft_version}`
  - `GET /api/price-quotes?q=&owner=&state=` → `{items: QuoteListRow[], legacy: LegacyRow[]}`
  - `GET /api/price-quotes/[id]` → `{quote, draft_data, draft_version, current_revision, is_dirty}`
  - `PATCH /api/price-quotes/[id]` `{data, expected_draft_version}` → 200 `{draft_version}` | **409** `{draft_version, draft_updated_by, draft_updated_at}`
  - `DELETE /api/price-quotes/[id]` → 200 | **409** if a revision has a live `pending`/`opened` request

- [ ] **Step 1: Write `service.ts`** — a `serviceClient()` (service-role, no session persist), plus `mapQuoteRow` / `mapRevisionRow`. All writes here; routes only orchestrate and check session.

- [ ] **Step 2: Write `POST` + `GET` in `route.ts`** — POST requires a session, inserts a `price_quotes` row with `owner_email = user.email`, returns id/number/version. GET lists with the `?q/owner/state` filters and returns `legacy[]` (the 3 snapshot-less rows) separately with `read_only:true`.

- [ ] **Step 3: Write `[id]/route.ts`** — GET returns the editor payload with `is_dirty` computed in SQL (`draft_data IS DISTINCT FROM current_revision.data`). PATCH does the conditional update:

```ts
const { data, error } = await svc
  .from('price_quotes')
  .update({ draft_data: body.data, draft_version: body.expected_draft_version + 1,
            draft_updated_by: user.email })
  .eq('id', params.id)
  .eq('draft_version', body.expected_draft_version)   // optimistic lock
  .select('draft_version, draft_updated_by, draft_updated_at')
  .maybeSingle()
if (!data) {
  const { data: cur } = await svc.from('price_quotes')
    .select('draft_version, draft_updated_by, draft_updated_at').eq('id', params.id).single()
  return NextResponse.json(cur, { status: 409 })   // lost the race
}
```

DELETE sets `archived_at` after checking no revision has a live request; 409 otherwise.

- [ ] **Step 4: TYPECHECK** — `npx tsc --noEmit`, expect clean.

- [ ] **Step 5: MANUAL QA on a branch** — POST creates a row (verify via SQL); PATCH with the right version bumps; PATCH with a stale version returns 409 with the winner's identity; DELETE on a quote with a live request returns 409.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/price-quotes src/lib/price-quotes
git commit -m "feat(quotes): price_quotes CRUD routes with optimistic-lock autosave"
```

### Task 1.5: Preview route replaces the `?data=` GET

**Files:**
- Create: `src/app/api/price-quote/preview/route.ts`
- Modify: the editor's preview call site (replaces the `GET /api/price-quote?data=` iframe src)

**Interfaces:**
- Produces: `POST /api/price-quote/preview` `{data: PriceQuoteData, page?: 1..4}` → `text/html` (one page). Client wraps the response in a `blob:` URL for the iframe.

- [ ] **Step 1: Write the POST route** — session-checked, reuses `generateAllQuotePages(data, origin)[page-1]`, returns `text/html; charset=utf-8`. No DB read, so no IDOR surface and no `?data=<json>` URL-length ceiling.

- [ ] **Step 2: Change the editor** to `fetch('/api/price-quote/preview', {method:'POST', body: JSON.stringify({data, page})})` → `URL.createObjectURL(await res.blob())` as the iframe `src`; revoke the prior blob URL on change.

- [ ] **Step 3: TYPECHECK + MANUAL QA** — preview renders per page; no uuid appears in any URL.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/price-quote/preview src/app/price-quote
git commit -m "feat(quotes): POST /preview via blob URL, removes ?data= IDOR + URL cap"
```

### Task 1.6: Split the editor and wire autosave

**Files:**
- Create: `src/app/price-quote/PriceQuoteEditor.tsx` (the ~1062-line client component, moved)
- Modify: `src/app/price-quote/page.tsx` → thin server wrapper that reads `?id=` and passes `initialData`

**Interfaces:**
- Consumes: `GET /api/price-quotes/[id]` when `?id=` present; `defaultData` otherwise.
- Produces: an editor that hydrates from a saved draft (`useState(initialData ?? defaultData)`), autosaves via `PATCH` with a debounce, and shows the dirty/sent chip.

- [ ] **Step 1: Move the client component** out of `page.tsx` into `PriceQuoteEditor.tsx` unchanged, so `page.tsx` becomes a server component that fetches `initialData` when `?id=` is set.

- [ ] **Step 2: Add the debounced autosave** — on `draft_data` change, `PATCH /api/price-quotes/[id]` (creating the row via POST on the first change if no id yet), holding `draft_version` in state and advancing it on 200; on 409 show a "נטען מחדש — נערך במקום אחר" notice and reload the winner's data.

- [ ] **Step 3: Add the header chip** — `נשלח / לא נשלח / יש שינויים שלא נשלחו`, driven by `is_dirty` and `published_count`.

- [ ] **Step 4: TYPECHECK + MANUAL QA** — type in a field, confirm a row appears in `price_quotes` within ~2s; reload with `?id=` and confirm the draft rehydrates; open the same quote in two tabs and confirm the second save shows the 409 notice.

- [ ] **Step 5: Commit**

```bash
git add src/app/price-quote
git commit -m "feat(quotes): editor hydrates from saved draft + debounced autosave"
```

**Stage 1 gate:** a quote survives a tab close and reopens by id; autosave and the 409 path work on a branch; `tsc` clean.

---

## Stage 2 — Publish & supersede

### Task 2.1: The `/publish` route

**Files:**
- Create: `src/app/api/price-quotes/[id]/publish/route.ts`
- Modify: `src/lib/price-quotes/service.ts` (add `freezeRevision`, `cancelPriorRequest`)

**Interfaces:**
- Consumes: the draft, the sender's `X-Google-Access-Token` (Drive), the current template version.
- Produces: `POST /api/price-quotes/[id]/publish` → freezes revision N+1 and returns `{revision_number, signature_token}`. Executes the **exact ordered** side-effect chain from spec §5.

- [ ] **Step 1: Implement the ordered chain** — (1) 422 if `enabledPages[4]===false`; (2) **cancel the prior request first**, conditional on its status being `pending`/`opened`, setting `cancelled_at`/`cancel_reason` and chaining via `parent_signature_request_id`; (3) insert revision N+1 with `template_version` (read from a build constant / git sha); (4) render the PDF **from the frozen revision's `data`, not the request body**; (5) upload to Drive as `${title} — גרסה ${n}.pdf` via `uploadBufferToDriveAsUser`; (6) create the `signature_requests` row bound to `quote_revision_id`; (7) email the client via existing `buildSignatureRequestEmail` + `sendGmailEmail`; (8) record `sf_event_sent`. Fill revision artifact columns (`signature_request_id`, `pdf_drive_file_id`, ...) as each step lands — the immutability trigger permits one `NULL→value` each.

- [ ] **Step 2: TYPECHECK** — `npx tsc --noEmit`.

- [ ] **Step 3: MANUAL QA on a branch, approved recipients only** — publish a test quote to Yoav Bogin; confirm exactly one live request exists, the prior one is `cancelled`, the PDF in Drive is named `— גרסה 2`, and the old signing link now 410s (Task 0.6).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/price-quotes src/lib/price-quotes
git commit -m "feat(quotes): /publish freezes a revision and supersedes the prior link"
```

### Task 2.2: Quote number + revision on the PDF, and the confirm dialog

**Files:**
- Modify: `src/templates/price-quote/price-quote-template.ts` (page-1 header prints `quoteNumber · גרסה n`)
- Modify: `PriceQuoteEditor.tsx` (confirmation dialog before publish)

**Interfaces:**
- Consumes: `quoteNumber`, `revisionNumber` on `PriceQuoteData` (Task 1.3).
- Produces: a printed identifier on every PDF, and a pre-publish dialog that names what changed (minimal: a Hebrew list of changed top-level fields, not `budgetItems[2].price`).

- [ ] **Step 1: Print the identifier** on page 1 when `quoteNumber` is set.
- [ ] **Step 2: Add the confirm dialog** — lists changed top-level sections in Hebrew and warns "הקישור הקודם יבוטל וישלח מייל חדש".
- [ ] **Step 3: TYPECHECK + MANUAL QA** — two PDFs of the same deal now differ by `גרסה n`; the dialog lists changes.
- [ ] **Step 4: Commit**

```bash
git add src/templates/price-quote src/app/price-quote
git commit -m "feat(quotes): stamp quote number + revision on PDF, add publish confirm dialog"
```

**Stage 2 gate:** publish is atomic-enough (manual runbook against a branch), never leaves two live links, and every PDF is identifiable.

---

## Stage 3 — Minimal list

### Task 3.1: `/price-quotes` list page + repoint the feed link

**Files:**
- Create: `src/app/price-quotes/page.tsx`
- Modify: the feed href from Task 0.5 → `/price-quotes/[id]`

**Interfaces:**
- Consumes: `GET /api/price-quotes`.
- Produces: a searchable list (client name, number, state, updated) linking each row to `/price-quote?id=<id>`; legacy rows shown read-only.

- [ ] **Step 1: Build the list page** — reuse an existing table pattern in the repo; columns: number, client, state chip, updated, owner. `?q=` search box.
- [ ] **Step 2: Repoint the activity-feed href** to `/price-quote?id=${r.id}` now that the loader exists.
- [ ] **Step 3: TYPECHECK + MANUAL QA** — the list shows backfilled quotes; clicking one opens it in the editor.
- [ ] **Step 4: Commit**

```bash
git add src/app/price-quotes src/lib
git commit -m "feat(quotes): my-quotes list page + live feed links"
```

**Stage 3 gate:** a quote can be found and reopened without knowing its id.

---

## Deferred (not in this plan — build only on request)

- Salesforce `quote.revised` / `quote.cancelled` events + pull endpoint (spec §5, open Q#5).
- Field-level diff (`budgetItems[2].price` granularity), full version drawer, restore-to-revision, admin override (spec non-goals).

## Owner decisions this plan does not resolve (from spec §9)

Tracked, not coded here: which of the two live לפמ links to cancel and who notifies (Q1); the two same-`project_id` signed deals (Q2); admin override now vs. later (Q3); quiet-correction route (Q4); price ownership vs. Salesforce (Q5); old-PDF revocation (Q6); yearly number reset (Q7); supervised deletion path (Q8).

---

## Self-review notes

- **Spec coverage:** Stage 0 ↔ spec §8 stage 0 (six fixes: 0.1 trigger, 0.2 authorize, 0.3 resolveServices, 0.4 page-4, 0.5 dead link, 0.6 sign race). Stage 1 ↔ §3/§5/§6/§7. Stage 2 ↔ §5 publish order. Stage 3 ↔ §8 stage 3. Policy §2 enforced by 0.1 + 2.1. Non-goals honored (no diff/restore).
- **Schema correction applied:** `signature_requests` already has `parent_signature_request_id` + `deck_document_id` (verified); migration in 1.1 adds only `quote_revision_id`, `cancelled_at`, `cancel_reason`.
- **Test-framework adaptation:** every verification step is TYPECHECK / SQL ASSERT / MANUAL QA — stated in the header because the repo has no runner.
- **Type consistency:** `PriceQuoteData.{quoteNumber,revisionNumber,quoteId}` defined in 1.3, consumed in 2.2; `resolveServices` signature unchanged; route return shapes match between 1.4 (producer) and 1.6/3.1 (consumers).
