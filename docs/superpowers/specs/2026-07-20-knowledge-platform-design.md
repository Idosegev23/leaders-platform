# Knowledge Platform — Live Drive + Canva Sync with Grounded Retrieval

**Status: DRAFT — not yet approved.** Written 2026-07-20. Technical decisions verified by a 22-agent research workflow in which 8 claims were refuted and corrected under adversarial verification; the corrected forms are what appear below.

## Problem

Leaders' institutional knowledge lives in two places the platform cannot read: a Google Shared Drive (47,663 files) and a Canva Teams account (thousands of designs). Employees answer questions like *"כמה סיכמנו עם דניאל עמית, מה המחיר שלה"* by hunting through folders. We want a widget that answers from that corpus.

Two hard requirements from the owner:
1. **Live sync** — a file added to Drive or Canva must land in the database automatically.
2. **Verifiable freshness** — it must be possible to confirm the index is actually current.

Access is uniform: every Leaders employee may see everything. No per-user ACL layer.

## What already exists (verified, not assumed)

| Asset | State |
|---|---|
| `drive_files` | 47,663 rows, **all** mapped to `client_id` (425 clients in `clients`) |
| `content_preview` | **0 rows populated** — metadata-only index, no text anywhere |
| Last Drive sync | **2026-01-25** — six months stale |
| Drive push notifications | Built and working: `src/lib/google-drive/watch.ts`, renewal cron |
| Drive webhook handler | `src/app/api/drive/webhook/route.ts` — consumes all changes, **acts on only one folder**, discards the rest |
| Canva OAuth | Built: `src/lib/canva/oauth.ts` (PKCE, rotating refresh). **Token expired 2026-07-05; `account_email` is NULL** |
| `src/lib/gemini/embeddings.ts` | Dead code — nothing imports it |
| pgvector | Extension available (0.8.0), **not installed** |
| Test framework | None |

**The ingestion code that built `drive_files` is not in this repo.** It lives in `leadrsagents` (`src/services/drive-scanner.ts`, 631 lines) — a separate app sharing the same Supabase project. That app has **no cron configured** and its last commit is 2026-02-08, which is exactly why the index froze in January. It is dormant, not a live peer.

**Decision:** ingestion moves into `leaders-platform`. Port `classifyFileType`, `extractTags`, and the client-mapping logic from the scanner; leave the rest. `generateAliases` there is a hardcoded five-brand table and does not address people at all — treat person entities as greenfield.

## Non-goals

- Per-user access control. Everyone sees everything (owner decision, 2026-07-20).
- Canva presenter notes — unavailable via Connect REST (see §2.2).
- An audit log of Drive edits — `changes.list` coalesces to final state and cannot produce one.

---

## 1. Live sync

### 1.1 Drive — genuinely live

Extend the existing webhook. Before the current `נסגר` filter, upsert **every** change into the mirror; leave the closed-briefs logic untouched.

**BLOCKER — fix first.** [`client.ts:45`](../../../src/lib/google-drive/client.ts#L45) requests `drive.file`, which grants access only to files the app itself created. `changes.list` accepts it without error and simply returns a near-empty feed. The mirror would build empty with no failure signal.

- Change the scope to `https://www.googleapis.com/auth/drive`.
- `drive.readonly` is **not** a lighter alternative — Google classifies `drive`, `drive.readonly`, `drive.metadata` and `drive.metadata.readonly` all as Restricted. No non-restricted scope can enumerate a Shared Drive.
- No Google verification is required: a service-account JWT grant never renders a consent screen.
- **Separate prerequisite the scope change does not fix:** the service account must be a member of the **Shared Drive itself**, not merely of folders inside it.

**Change semantics.** A change entry is a *state notification*, not an event. Create / modify / move / rename are byte-identical in shape. One `UPSERT ... ON CONFLICT (file_id)` handles all of them; there is no verb to switch on.

- `removed: true` means "removed from this list" — deletion **or loss of access**. Soft-delete only (`removed_at`); never `DELETE`. Hard-deleting on this signal is a primary source of silent divergence.
- `changeType: 'drive'` entries carry no `file` object. The new writer must guard for this independently — the existing guard lives inside `isChangeIntoClosedBriefs` and will not protect a new code path.
- The writer must tolerate `removed: true` for a `fileId` it has never seen. Tombstone or no-op; never throw.

**Request shape.** Replace the `fields` string in `fetchChangesSince` ([`watch.ts:182`](../../../src/lib/google-drive/watch.ts#L182)) with:

```
nextPageToken, newStartPageToken, changes(changeType, time, removed, fileId, driveId,
  file(id, name, mimeType, parents, driveId, trashed, explicitlyTrashed, createdTime,
       modifiedTime, version, size, md5Checksum, webViewLink, iconLink,
       shortcutDetails(targetId, targetMimeType), owners(emailAddress),
       lastModifyingUser(emailAddress), capabilities(canEdit)))
```

Add `pageSize: 1000`. It is currently unset and defaults to **100** — a 10× request amplification on any burst.

**Dirty-check.** Guard the upsert with `version`, stored as **`bigint`** and compared with strict `<`:

```sql
INSERT ... ON CONFLICT (file_id) DO UPDATE SET ...
WHERE drive_files.version < EXCLUDED.version
```

`version` is `string (int64)` on the wire. On a `text` column `<` compares lexicographically — `'9' > '10'` — silently inverting the ordering the guard exists to enforce. Cast at ingest. Do not use `modifiedTime`: it is writable and sync tools set it backwards. Do not use `md5Checksum`/`headRevisionId`: null for native Docs. `version` is **not returned by default** — it must be named in `fields`.

Caveat: `version` bumps on permission and metadata churn invisible to users. Gate expensive downstream work (re-extract, re-embed) on a content signal, not on `version` alone.

**`folder_path` — derive, never denormalize.** Store `parent_id` only; keep a `drive_folders` adjacency table; derive paths with `WITH RECURSIVE` (a view first, `ltree` if materialization is ever needed).

The decisive reason: **a folder rename emits exactly one change entry, for the folder itself.** Descendants' `name` and `parents` are untouched, so a denormalized path on 50k rows is invalidated with no per-file signal to repair it. (A folder *move* is the opposite — Google documents recursive permission propagation, and ACL changes do enter the change log, so a move can emit entries across a large fraction of the subtree. Do not state that Drive never notifies about descendants; that is false for moves.)

Budget a `files.get` fallback: a change naming a `parents[0]` never seen before forces a lookup. Items whose ancestors are unreadable yield no derivable path at all.

**`parents` is a scalar.** Multi-parenting was removed 2020-09-30 and migrated to shortcuts. Use `parent_id TEXT`, read `parents[0]`, defend against an empty array. Mirror `application/vnd.google-apps.shortcut` as a distinct concept — treating shortcuts as ordinary files double-counts content and corrupts per-client rollups.

**Concurrency.** Harden `advanceChannelToken` ([`watch.ts:245`](../../../src/lib/google-drive/watch.ts#L245)) with an atomic conditional update or a `pg_try_advisory_lock` keyed on channel id. The existing comment ("off-by-one never affects correctness") holds for `notification_count` but **not** for `page_token`: two overlapping invocations can write back an older token, regressing the cursor. Harmless today; unbounded reprocessing once every change does a write.

**Page-token recovery.** Drive page tokens **do not expire** — the reference states this three times. A token error surfaces as **400** (`badRequest`/`invalidPageToken`), not 404. Because they never expire, a token error is far more often a client bug: token persisted as an integer, or `driveId`/`spaces`/`supportsAllDrives` changed between calls. Check those first. If a genuine full resync is needed, call `changes.getStartPageToken` and persist it **before** running the `files.list` backfill — `files.list` is not snapshot-consistent, so token-first converts a loss window into at-least-once replay the idempotent upsert absorbs. This ordering is Drive-specific; Gmail, Calendar and Graph prescribe the reverse.

**Gate the tombstone sweep.** "Mark rows not seen during backfill as removed" will mass-delete a healthy mirror if triggered by a client-side token bug. Require full backfill completion, scope it to exactly the feed's corpus, soft-delete only, and apply a sanity threshold.

### 1.2 Canva — hourly, and that is the ceiling

There is **no webhook for design creation or editing**. The 11 notification types are all sharing/comment/approval events. Polling is the only mechanism. The owner accepted hourly latency (2026-07-20).

```
GET https://api.canva.com/rest/v1/designs?sort_by=modified_descending&ownership=any&limit=100
```

- `created_at`/`updated_at` are **Unix seconds (int)**, not ISO strings.
- `continuation` decodes to an **offset**, not a snapshot cursor — it re-runs the sorted query. Designs edited mid-walk can duplicate or be skipped. **Upsert by design id; never append.**
- `query` and `sort_by` are **mutually exclusive**. Incremental sync must be a full sweep with no search term. Adding a filter term later silently destroys the ordering the cursor depends on.
- `limit` max is 100.

Loop: cursor = `max(updated_at)` from last success → page `modified_descending` → break when a page's **last** item is older than `cursor - 3600` → upsert by id, persisting the design's own `updated_at`, never wall-clock. At hourly cadence this terminates in 1–2 requests.

**BLOCKER — coverage.** There is no team-wide enumeration; zero `/v1/teams` paths exist. `ownership=any` means "owned by **and shared with** the authenticated user." Coverage is silently partial with no error. **Canva Teams does not change this** — the Connect API is per-user by design in every plan; Enterprise adds private *integrations* (who may install), not broader data access. The fix is organizational: connect as an account that is a team member, and ensure content lives in team-shared folders.

**BLOCKER — the current connection is dead.** `canva_tokens` holds one row with `access_token_expires_at = 2026-07-05` and `account_email = NULL`. The token expired 15 days ago and nobody knows which account it belongs to. Reconnect via `/api/canva/oauth/start`, and **capture `account_email` this time** — `persistTokens` already accepts it; the callback does not pass it.

**Scopes.** Set `CANVA_SCOPES` to:
```
design:content:write design:meta:read design:content:read folder:read brandtemplate:meta:read
```
Scopes do not imply each other, and changing them **requires a fresh authorize round-trip** — an existing refresh token will not gain them. Use `printf %s` (not `echo`) when adding to Vercel — `echo`'s trailing newline silently corrupts the value.

**Folders/templates.** No recursive listing exists. Walk `GET /v1/folders/{id}/items` from `root`, recursing manually. `item_types` defaults to `design,folder,image` — `brand_template` must be requested explicitly. Brand templates default to `sort_by=relevance`, unlike folder items; pass `modified_descending` explicitly for deterministic ordering.

### 1.3 Freshness is a screen, not a hope

`sync_state` table + a health view. Per source: last successful sync, row counts, failure counts, current lag. This is the direct answer to requirement (2) — "everything is up to date" becomes something the owner **looks at**.

Three guards behind it:
- Keep returning 200 from the Drive webhook (retry storms are worse), but record `last_successful_sync_at` and **alert when it goes stale**. Today a transient error leaves the cursor unadvanced *and* Drive never retries — the feed only recovers if an unrelated notification happens to arrive.
- Poll on a cron even when webhooks look healthy. Channels expire at ≤7 days; a failed renewal during a deploy freeze stops notifications with no error anywhere.
- Run a scheduled full `files.list` reconcile (weekly). The changes feed alone is **not** complete: an ACL change reaches only the owner and directly-impacted users, so a syncing SA not on the ACL misses those entries entirely.

---

## 2. Text extraction

~7,000 text-bearing files of 47,663 (Docs 509, Sheets 539, DOCX 1,253, PDF 3,624, PPTX 614, XLSX 456). The rest are 25k images and 4.2k videos.

The owner asked for "everything, the perfect knowledge base." Documents ship first because the stated use case (*prices, agreements, proposals*) is entirely document-borne; image captioning is a later pass on the same pipeline and answers none of those questions.

**Extraction runs in a QStash queue, never in the webhook.** The webhook must answer in seconds or Drive retries and floods. This also gives the two-tier behaviour the owner asked for: the file is in the DB **immediately** as a metadata row; text follows seconds later.

| Format | Decision |
|---|---|
| PDF | Keep `pdf-parse` v2.4.5 + existing Gemini Vision fallback. **Do not** add `tesseract.js` or `officeparser` — the latter pulls 129 MB against Vercel's 250 MB limit to buy OCR the Vision fallback already provides. |
| PPTX | Write ~50 lines on `fflate` + `fast-xml-parser`. **Reject every npm reader.** |
| XLSX | `exceljs@4.4.0`. **Never `npm install xlsx`** — the registry copy is frozen at 0.18.5 with two unfixed CVEs; fixed builds are not obtainable from npm. |
| Google Sheets | Sheets API, not a Drive `.xlsx` export. |
| Google Docs | Change the export mime to `text/markdown`. |

### 2.1 The PDF Hebrew bug (exists today)

Reversed Hebrew defeats every check in `isGarbled()` — all characters are legitimate Hebrew, there are no replacement characters, and the Hebrew count is positive. It sails through the `textLength > 100 && !isGarbled()` gate at `pdf-parser.ts:39` and returns garbage that **never reaches the Vision fallback**.

```ts
const REV = ['לש','תא','םע','לע'], FWD = ['של','את','עם','על'];
// if sum(REV occurrences) > sum(FWD occurrences) → treat as garbled
```

PDF only; DOCX/PPTX/XLSX store logical order in XML.

### 2.2 Why every npm PPTX reader is rejected

`node-pptx-parser@1.0.1` never reads `<p:sldIdLst>` — it orders slides by `presentation.xml.rels` file order, which differed from true order in **9 of 12 real decks tested** (a 15-slide deck came back `7,12,2,6,11,1,15,…`). It walks only top-level `spTree["p:sp"]`, dropping grouped-shape and table text — one measured slide had 38 text nodes present and 2 recovered. `pptx-text-parser` depends on a git-protocol `sax` fork abandoned in 2022.

Algorithm: unzip → read `ppt/presentation.xml` `<p:sldIdLst>` in document order → resolve each `r:id` through `presentation.xml.rels` (**never sort filenames — `slide10.xml` sorts before `slide2.xml`**) → per slide, a **descendant** sweep of all `<a:t>` nodes (catches groups and tables) → notes via `slides/_rels/slideN.xml.rels`.

Known gap: SmartArt lives in `ppt/diagrams/dataN.xml` and charts in `ppt/charts/chartN.xml`. One measured deck had a slide with **zero** `<a:t>` nodes whose entire content was in `diagrams/data8.xml`. Follow slide rels to those parts if coverage measurement (§6, item 4) shows it matters.

### 2.3 Spreadsheets → LLM format

Never flatten a sheet to a text blob. Emit one `## <sheet name>` heading plus a Markdown pipe table per sheet; for sparse/wide sheets emit `Sheet!B7 | <row label> | <column label> | <value>` per cell.

Tab-joining loses row/column association the moment a row has an empty cell — consecutive tabs collapse ambiguously and the model misaligns a number to the wrong column. Two Hebrew rules: **keep physical column order as stored** (reversing to match RTL rendering corrupts the mapping), and forward-fill merged-cell anchors into every spanned cell.

For Google Sheets use `spreadsheets.get` (`fields=sheets.properties.title`) then `values.batchGet` with unbounded ranges, `valueRenderOption: 'UNFORMATTED_VALUE'`, `dateTimeRenderOption: 'FORMATTED_STRING'`. `UNFORMATTED_VALUE` is load-bearing — the default returns display strings with currency symbols and RTL marks embedded in what should be a number. Do **not** size ranges from `gridProperties`: it reports *allocated* grid (a new sheet reports 1000×26 holding 3 rows). **No scope change needed** — `drive.readonly`, already requested, authorizes both calls.

### 2.4 Google Docs — a two-line change

`google-docs-parser.ts:57` → `mimeType: 'text/markdown'`, **and** line 63's `hasTables` heuristic → `/^\|.*\|$/m.test(text)`. Verified A/B on a real doc: markdown yields headings, bold, lists and true pipe tables; `text/plain` yields **no heading markers at all** and emits table content as one tab-prefixed line per cell with no row boundary — row structure unrecoverable. `text/plain` also injects inline comment anchors and appends full comment threads with reviewer emails. Change only line 57 and the tab heuristic becomes permanently false.

### 2.5 Vercel wiring

Route all new formats through the existing Supabase-storage indirection in `parse-document/route.ts`, never direct multipart. The 4.5 MB request/response cap applies at Vercel's edge **before any code runs**, contradicting `MAX_FILE_SIZE = 20MB` and `bodySizeLimit: '20mb'` — those are reachable only via the storage path. `vercel.json` currently sets `maxDuration: 120` while `route.ts` exports `600`; **vercel.json wins**. Raise to `memory: 2048, maxDuration: 300`.

Response side matters too — a 200-slide PPTX can exceed 4.5 MB of extracted text and 413 on the way out. Cap or write to storage.

Dispatcher: match on **filename extension as well as MIME** (Supabase and browsers frequently return `application/octet-stream` for Office files). Keep the new formats away from the Gemini Files path — Gemini cannot ingest raw PPTX/XLSX.

### 2.6 Dependency swap that pays for it

Replace `googleapis` (114 MB) with `@googleapis/drive` + `@googleapis/docs` + `@googleapis/sheets` (~4 MB). Mechanical import change; the ~110 MB saved more than covers exceljs (22 MB) and the PPTX pair (2.9 MB). `node_modules` currently measures 899 MB.

---

## 3. Entity resolution — the core risk

A search for `עמית` in the real data returns six different people (בנימין, בן דוד, פרקש, פיליפ, עוזר, לוי) plus a client named `וט מגן - עמית`. A naive system asked for "X's price" returns a different person's contract, confidently. That is the worst possible failure: correct-looking, undetectable.

All numbers below were **measured live** on `fhgggqnaplshwbrzgima` (PG 17.6, pg_trgm 1.6).

### 3.1 It is an architecture problem, not a threshold problem

`word_similarity('עמית', 'וט מגן - עמית')` = **1.000** — tied with any genuine person match. No threshold separates them, because the disambiguating information is entity **type**, which lives outside the string.

```sql
CREATE TABLE entities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('person','client','brand','campaign')),
  display_name text NOT NULL,
  name_norm    text GENERATED ALWAYS AS (he_norm(display_name)) STORED,
  name_skel    text GENERATED ALWAYS AS (he_skeleton(display_name)) STORED
);
CREATE INDEX ON entities USING gin (name_norm gin_trgm_ops);
CREATE INDEX ON entities (entity_type, name_skel);
```

A person query searches an index that structurally cannot contain client rows. Second guard: when a client name *contains* a person token, model it as `entity_links(person_id, client_id, role)` — `וט מגן - עמית` means "the וט מגן account, handled by עמית," which is a decisive disambiguation signal **as an edge** and a corruption **as a name**.

### 3.2 pg_trgm is a recall stage, never a decider

Raise `pg_trgm.similarity_threshold` to **0.45**. At the default 0.3 you get the worst of both ends:

| Pair | similarity | At 0.3 |
|---|---|---|
| `דוד` / `דויד` (ktiv variant) | 0.286 | excluded — real variant lost |
| `שלום` / `שָׁלוֹם` (niqqud) | 0.083 | catastrophically excluded |
| `אברהם` / `אבי` (nickname) | 0.25 | excluded |
| `Amit Levi` / `עמית לוי` | **0.000** | cross-script is exactly zero |
| `מיכל` / `מיכאל` (**different people**) | 0.375 | **included** — false positive |

Two free wins: punctuation is stripped (`עמית בן דוד` vs `עמית בן-דוד` = 1.0) and trigram similarity is a set comparison, so name-order inversion is free (`בן דוד עמית` = 1.0).

### 3.3 Normalization — one canonical pair

`unaccent` is useless here and should not be installed: its model is *precomposed codepoint → base letter*, but Hebrew niqqud are **combining marks** (U+0591–U+05C7) on an unmodified base. There is no precomposed `שׁ` to map.

```sql
CREATE OR REPLACE FUNCTION he_norm(txt text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(txt,'')), '[֑-ׇ]', '', 'g'),
      'ךםןףץ״׳"''`־–—.,()[]/\|',
      'כמנפצ                    '),
    '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION he_skeleton(txt text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(regexp_replace(he_norm(txt),'[וי]','','g'),'\s+',' ','g'))
$$;

CREATE OR REPLACE FUNCTION rag_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT regexp_replace(regexp_replace(
           he_norm(t),
           '(\d)[,\s](?=\d{3}\M)', '\1', 'g'),   -- thousands separators
           '(?<=\w)-(?=\w)', '', 'g')            -- intra-token hyphens
$$;
```

`he_skeleton` merges דוד/דויד→`דד`, יוסף/יסף→`ספ`, שלום/שָׁלוֹם→`שלמ`, and correctly does **not** merge מיכאל→`מכאל` with מיכל→`מכל`, killing the 0.375 false positive above.

Three traps, all measured:
- **Never** add a doubled-letter collapse `(.)\1+ → \1`: it turns דוד into `ד`.
- Short tokens over-merge — לוי and לו both → `ל`. Gate skeleton equality on skeleton ≥3 chars **and** source token ≥3 chars; below that require exact `he_norm` equality.
- Punctuation must map **to a space, not to nothing**: stripping the hyphen in `בן-דויד` gives `בנדד`, which fails to match `בן דוד`→`בנ דד`.

Compare skeletons **per-token as a set**, not as a string — free word-order invariance and free tolerance for a missing middle name.

**Prefix letters.** Strip a leading ו/ה/ב/כ/ל/מ/ש **only** when the remainder is ≥3 chars and matches a registry name; emit as an extra alias row, never overwrite. `similarity('עמית','ועמית')` = 0.375 — above 0.3, below 0.45, i.e. the unreliable band. Unconditional stripping is dangerous because real names begin with those letters (מיכל, לאה, שרה, ברק, הדר, כרמל). The registry gate is safe because the candidate set is closed: 130 contacts, 425 clients.

**FTS config:** `to_tsvector('simple', he_norm(txt))`, never `'english'`. Normalize **before** tsvector, in both the index expression and the query — `to_tsvector('simple','שָׁלוֹם')` keeps niqqud *inside* the lexeme, so the pointed form is a different token and never matches.

### 3.4 Nicknames and transliteration are data, not code

`similarity('Amit Levi','עמית לוי')` = **exactly 0** — trigram sets are disjoint across scripts and no threshold helps. Hebrew hypocoristics are morphologically irregular (אברהם→אבי, יוסף→יוסי, רבקה→ריקי, מרדכי→מוטי); no string algorithm recovers them.

```sql
CREATE TABLE person_aliases (
  person_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  alias_norm  text GENERATED ALWAYS AS (he_norm(alias)) STORED,
  alias_skel  text GENERATED ALWAYS AS (he_skeleton(alias)) STORED,
  script      text NOT NULL CHECK (script IN ('he','latin')),
  kind        text NOT NULL CHECK (kind IN ('canonical','nickname','translit','maiden','typo','initials')),
  source      text NOT NULL,   -- seed | llm_proposed | human_confirmed
  PRIMARY KEY (person_id, alias)
);
```

Seed with one LLM pass over the corpus plus human confirmation. `llm_proposed` must be promoted to `human_confirmed` before an alias may drive a high-confidence answer. Precedent exists in `clients.aliases`. This is the highest value-per-effort item in the document.

### 3.5 Pipeline split — rules decide, the LLM reads

1. **Mention detection — LLM.** Hebrew has no capitalization cue, prefixes glue on, and many names are common nouns (שיר, אור, ניר, גל, עדן, רן). Rules do this badly.
2. **Candidate generation — rules, deterministic.** `he_norm` + `he_skeleton` + alias lookup + trigram recall, filtered to `entity_type='person'`.
3. **Evidence scoring — hybrid.** Structured signals by rules; unstructured ("the one who runs the Osem account") by an LLM constrained to score a **pre-enumerated closed candidate set**.
4. **Decision and abstention — rules.** Deterministic thresholds, auditable, adjustable without re-prompting.

The LLM's errors are contained to a closed set, so the worst case is "picked the wrong one of six real people," never "invented a person."

**Signals, weighted by evidence strength:**

| Tier | Weight | Signals |
|---|---|---|
| A — decisive | ~0.9 | surname/initial in query; email; client co-mentioned **and** exactly one `entity_links` edge |
| B — strong | ~0.6 | `drive_files.folder_path`, `client_id`, `tags`; `case_studies.brand_name`; date proximity; `documents.user_id` |
| C — prior only | ~0.2 | recency, named earlier in conversation, asker's team |

**Tier C alone must never resolve a person.**

**Design rule that makes context usable at all:** compute context evidence over the **retrieved chunks**, not the query. Retrieve broadly, then score each candidate by how much retrieved evidence is consistent with them. Resolve-then-retrieve fails because the signals do not exist until after retrieval.

### 3.6 Confidence must be margin-based

```
S_i = 0.40·name_match + 0.35·context + 0.15·activity_prior + 0.10·role_plausibility
P   = softmax(S / 0.15)
margin = S_top − S_second        (1.0 if single candidate)
confidence = P_top · min(1, margin / 0.15)
```

An absolute score reports *high* confidence on the most ambiguous possible query — six עמיתs all matching at 1.0. The margin factor is load-bearing: six identical matches ⇒ margin ≈ 0 ⇒ confidence ≈ 0 ⇒ the system asks instead of guessing.

Bands: **≥0.85** answer inline with the name · **0.60–0.85** lead with the assumption plus one-click switch · **<0.60** render the picker, do not answer.

**Raise the bar to ≥0.90 for money** — price, contract, rate — with no best-guess fallback, enforced **in code, not in a prompt**.

Never surface LLM self-reported confidence; it is poorly calibrated across all tested models and RLHF amplifies verbal overconfidence. Log `name_match`, `context_score`, `margin`, `chosen_person_id`, `runner_up_id`, `confidence`, `corrected` to `resolution_log`. The weights above **will** need tuning against ~50 labelled real queries.

**UI:** show WHO and WHY, never a bare percentage. Always render the same disambiguator column (client + last activity) so users learn to scan one column. RTL detail: mixed Hebrew-Latin strings (an email beside a Hebrew name) need `<bdi>` or `unicode-bidi: isolate`, or rendering scrambles — precisely on the disambiguation list.

---

## 4. Retrieval

Target ~50k files / ~100k chunks, contracts and invoices, Hebrew plus exact numbers.

### 4.1 Index — HNSW, not IVFFlat

```sql
SET maintenance_work_mem = '...';   -- ~half of instance RAM
CREATE INDEX doc_chunks_embedding_hnsw
  ON doc_chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200)
  WHERE embed_version = 1;
```

IVFFlat needs representative data at build time and decays as the corpus drifts — exactly what incremental ingest does. HNSW has no training step. **Do not copy colagte's `ivfflat WITH (lists=100)` + "re-tune via REINDEX" pattern**; that comment describes a maintenance treadmill.

`ef_construction=200` vs the default 64 is the change that matters — the default permanently caps index quality. Query-time `hnsw.ef_search = 100..160`, and it must be ≥ your `LIMIT`.

`halfvec_cosine_ops` **requires a `halfvec` column**. Either declare `halfvec(768)` or use an expression index — in which case the query must carry the identical cast *and* the `embed_version` predicate, or the partial index is silently unused.

Store `halfvec(768)`: 1,544 vs 3,080 bytes/row. 100k rows ≈ 154 MB, index ~180–250 MB — fits in RAM, the single biggest determinant of query latency.

**Refuted claim, recorded so it is not reintroduced:** there is no L2-normalization bug to fix before indexing. pgvector's cosine divides by **both** operands' norms at query time, so pre-normalizing cannot change `<=>` results at all. Normalization is the enabler for an *operator swap* to `halfvec_ip_ops`, not a correctness fix. Also: the `vector` type supports 16,000 dims; the 2,000 ceiling is an **index** limit.

**Embedding model: `gemini-embedding-001` at 768 dims.** GA and stable, versus `gemini-embedding-2-preview` currently referenced in the dead `embeddings.ts`. This project has already been burned once by `text-embedding-004` being retired mid-work; a 100k-chunk index is not the place to bet on a preview model. Zero migration cost — nothing imports the existing file.

### 4.2 Filter + vector in one query

**Denormalize `client_id`, `entity_id`, `file_type`, `doc_date` onto every chunk row.** Never JOIN to `files` and filter there — across a JOIN the planner post-filters HNSW output or abandons the index. (This does not conflict with §1.1: chunks carry denormalized *filter* columns; folder *path* is still derived. Path is what a rename invalidates; `client_id` is not.)

Enable iterative scans (pgvector 0.8.0, default off): `hnsw.iterative_scan = 'relaxed_order'`, `ef_search = 120`, `max_scan_tuples = 40000`. Without this, filtering applies *after* the index scan — at default `ef_search=40`, a condition matching 10% of rows yields **4 rows on average** for a `LIMIT 20`.

Below ~8,000 surviving rows, route to exact brute force via a `MATERIALIZED` CTE. Project **`id, embedding` only** and join back for `content` after the LIMIT — 8,000 halfvec rows is 12.35 MB against a default `work_mem` of 4 MB, so selecting `content` guarantees a spill to temp files. Raise `work_mem` in the function. Add `ALTER FUNCTION ... SET plan_cache_mode = 'force_custom_plan'` — required for the `(p_x IS NULL OR col = p_x)` idiom, and it also makes the partial-index predicate provable.

### 4.3 Lexical arm — mandatory, and the naive version is broken

`to_tsvector('simple', ...)` shreds exactly the tokens these queries are made of:

| Input | Tokens |
|---|---|
| `47,300 ₪` | `'47'`, `'300'` |
| `INV-2024-8871` | `'inv'`, `'-2024'`, `'-8871'` |
| `סה"כ` | `'סה'`, `'כ'` |

A user typing `47,300` matches nothing. Normalize first:

```sql
ALTER TABLE doc_chunks
  ADD COLUMN content_norm text
    GENERATED ALWAYS AS (rag_norm(coalesce(context_header,'') || ' ' || content)) STORED,
  ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,
       rag_norm(coalesce(context_header,'') || ' ' || content))) STORED;
CREATE INDEX doc_chunks_fts  ON doc_chunks USING gin (fts);
CREATE INDEX doc_chunks_trgm ON doc_chunks USING gin (content_norm gin_trgm_ops);
```

The `::regconfig` cast is required — the single-argument form is only STABLE and Postgres rejects it in a generated column. Query side must call the same function: `websearch_to_tsquery('simple'::regconfig, rag_norm(q))`.

Third arm: trigram, weight 0.4, using `<%` (word similarity) not `%`, with `pg_trgm.word_similarity_threshold = 0.45`. It rescues Hebrew prefix morphology neither other arm handles: `יועב בוגין`/`ליועב בוגין` = 0.643, `חשבונית`/`בחשבונית` = 0.545.

### 4.4 Fusion — weighted RRF, arm depth 60, final 20, k=60

Weights vec 1.0 / lex 1.0 / trg 0.4. RRF consumes rank *position* and discards score magnitude, which matters because Postgres has no BM25 and `ts_rank_cd` is a poor ranker: measured here for query `47300`, a document that is *literally just* `47,300` scored 0.10 — identical to a long document where the number appears once — while a repetitive document scored 0.30. RRF only needs the right chunk near the top of the lexical list. **This is why pgroonga/ParadeDB are unnecessary.**

`k` is not the tuning knob people think: tested at 60, 20 and 10, ordering was **identical**; only score gaps changed. Leave it at 60 and tune arm weights.

Arm depth 60 vs final 20 is deliberate — a chunk at vector-rank 45 but lexical-rank 2 is the invoice-number case, and surfaces only if both arms are deep enough. Add a literal-token boost: extract `/[A-Z]{2,}-?\d{3,}/` and 4+ digit numbers in the application; a chunk containing one verbatim gets a fixed bonus. This is the general, data-driven version of colagte's hand-maintained SKU routing table.

Carry `hit_vec`, `hit_lex`, `vec_rank`, `lex_rank` out of the query — they are inputs to §4.7, not diagnostics.

### 4.5 Chunking — five specific failures of fixed-size splitting

1. **Label/value separation** — a boundary between `סה"כ לתשלום:` and `47,300 ₪`. The number chunk does not know what it denotes.
2. **Table shredding** — a mid-table split orphans the header row.
3. **Party detachment** — parties on page 1, payment terms on page 6.
4. **Numeric surface-form fragmentation** — `12,000` / `12000` / `₪12,000` are near-identical to an embedding and *different token sets* to FTS.
5. **Boilerplate domination** — thousands of contracts sharing legal text produce near-duplicates that win top-k for any generic query.

Every one produces a *plausible wrong answer*, not an obvious error. #1 is precisely how a confidently-stated wrong monetary figure ships.

Decision: parse to typed blocks, chunk on **structural boundaries only**. Atomic and never split: one table row, one kv-pair, one numbered clause, one signature block. Target 300–600 tokens, closing at the last boundary before the limit. Repeat table headers atop every table chunk and serialize rows self-describingly (`תיאור: ייעוץ | כמות: 3 | מחיר יחידה: 12,000`), never positional pipes. Overlap by **one structural unit**, not a token window. **Small-to-embed, large-to-return:** embed the tight chunk, store `parent_id`, hand the LLM the parent section.

### 4.6 Contextual headers — highest-leverage single item

```sql
ALTER TABLE doc_chunks
  ADD COLUMN context_header text NOT NULL DEFAULT '',
  ADD COLUMN embed_input text
    GENERATED ALWAYS AS (coalesce(context_header,'') || E'\n' || content) STORED;
```

One cheap LLM call per file stamps a header onto all its chunks:
```
[מסמך: חוזה העסקה | לקוח: Leaders בע"מ | צד ב': נועה סבג | תאריך: 2026-03-01 | סעיף 7 — תמורה]
```

Fixes party detachment and boilerplate domination together: the page-6 clause now embeds as "contract with Noa Sabag … paid 12,000 ₪," and identical boilerplate chunks separate in vector space instead of collapsing. It also makes client and party names searchable tokens on **every** chunk — a large recall win for proper nouns.

Guard: keep headers under ~40 tokens. A long header on a 300-token chunk dominates the embedding and makes all of a file's chunks look alike — the opposite of the goal.

### 4.7 `chunk_amounts` — what makes non-hallucination enforceable

```sql
CREATE TABLE chunk_amounts (
  id         bigserial PRIMARY KEY,
  chunk_id   bigint NOT NULL REFERENCES doc_chunks(id) ON DELETE CASCADE,
  file_id    uuid NOT NULL,
  amount     numeric(18,2) NOT NULL,
  currency   char(3) NOT NULL DEFAULT 'ILS',
  label      text,
  label_norm text GENERATED ALWAYS AS (rag_norm(label)) STORED,
  subject    text,
  kind       text,          -- total | line_item | tax | monthly | unknown
  char_start int NOT NULL, char_end int NOT NULL,
  raw_text   text NOT NULL  -- verbatim: '47,300 ₪'
);
```

Extraction is **deterministic** (regex plus a nearest-preceding-label rule over the structural parse), not LLM-based. Currency markers appear on either side in Hebrew:

```ts
const MONEY = /(?:₪|ש"ח|שקלים|NIS|ILS|\$|USD|€)\s*([\d][\d,.\s]*\d|\d)|([\d][\d,.\s]*\d|\d)\s*(?:₪|ש"ח|שקלים|NIS|ILS)/g;
```

Without this table, "don't hallucinate numbers" is a prompt you hope is followed. With it, it is a join you fail closed on. This is why structure-aware chunking is a **prerequisite**, not an independent choice — the label is the nearest preceding kv-key or column header in the structural parse.

### 4.8 Answer generation — four layers, deterministic first

**L1 — constrained output.** No free prose with inline numbers:
```json
{ "answer":"...", "figures":[{"value":47300,"currency":"ILS","label":"סה\"כ לתשלום",
  "chunk_id":88213,"quote":"סה\"כ לתשלום: 47,300 ₪"}], "confidence":"high|medium|low" }
```

**L2 — deterministic validation gate, no LLM.** Regex every 3+ digit number out of `answer`; normalize; assert each has a `figures[]` entry; assert `quote` is an **exact substring** of the cited chunk; assert the value matches a `chunk_amounts` row for that chunk. Any failure → do not ship; retry once naming the violation; second failure → warm abstention. **A figure not in `chunk_amounts` for a cited chunk cannot be emitted regardless of what the model tried to say.**

**L3 — the model never does arithmetic.** Sums are computed in SQL from `chunk_amounts` and injected as a retrieved fact labelled `מחושב` with addends enumerated. A computed figure has no `chunk_amounts` row and would fail L2 anyway.

**L4 — ambiguity check before answering.** If ≥2 `chunk_amounts` rows match the asked label with different values, **do not pick** — ask, showing both with sources. This is the most common real case (totals before and after מע"מ, differing by 17–18%, both legitimately present) and the layer most likely to be skipped.

Do not reintroduce an LLM-judge validator; it was tried in a comparable production path here and removed for false rejections.

### 4.9 Retrieval confidence

```ts
if (labelMatchCount === 0) return 'abstain';
if (labelMatchCount > 1)   return 'low';
if (hitVec && hitLex && vecRank <= 5 && lexRank <= 5 && literalTokensPresent) return 'high';
if (cosSim < 0.55 && !hitLex) return 'low';
return 'medium';
```

The dominant signal is **cross-arm agreement** — the vector and lexical arms fail in uncorrelated ways, so top-5 in both is far more trustworthy than #1 in either. `labelMatchCount === 0 → abstain` does the most work: it short-circuits before generation, so zero tokens are spent and there is no opportunity to invent.

Keep this separate from §3.6's entity confidence — two functions, two logs, different signals, different gates.

**Telemetry:** `figures_emitted`, `figures_validated`, `validation_failure_reason`, `confidence`, `hit_arms`. **This repo has no automated tests** — `validation_failure_reason` aggregated weekly is the regression detector. A spike in `unsupported_magnitude` after an ingest run means a parser change broke `chunk_amounts`, and you learn it from the log rather than from a client.

### 4.10 Model migration

Version in-table with partial indexes; no blue/green table swap. `embed_version smallint`, a second partial HNSW index for v2, flip the **literal** in the RPC body, verify, drop v1. Model change is the one genuinely forced rebuild and it will happen.

### 4.11 Reranker — not initially

Rerankers improve ordering among already-retrieved candidates; they cannot recover a chunk the arms never returned, which is what a broken tokenizer causes. The stated failure mode is addressed far more directly by §4.3's normalizer and §4.4's literal-token boost. If added later, make it **conditional** on `medium`/`low` confidence so p50 latency is untouched.

**Build this instead:** a labelled eval set of 100–200 real queries with known-correct chunk IDs. Without it you cannot tell whether anything helped, and given no automated tests it is the retrieval path's only regression protection.

---

## 5. Staged delivery

**Stage 1 — sync and freshness.** Drive scope fix; SA added to the Shared Drive; webhook extended to maintain the mirror; `drive_folders` adjacency; backfill closing the six-month gap; Canva reconnect with new scopes and `account_email` captured; hourly Canva poll; `sync_state` and the health screen.

**Stage 2 — extraction, embeddings, widget on one client.** pgvector; `doc_chunks` with `halfvec(768)` and HNSW; extraction workers per format behind QStash; structural chunking; `context_header`; `chunk_amounts`; the three-arm RPC; the widget; entity resolution steps 1–4 below.

**Stage 3 — full corpus and images.** Remaining ~7,000 documents; image captioning as a further pass on the same pipeline.

**Entity-resolution ship order** (steps 1–4 are pure SQL plus small code changes, roughly a day, and address the reported incident):
1. Type separation (`entity_type` filter) — kills the only *silently wrong* failure.
2. `he_norm`/`he_skeleton` generated columns, GIN trgm, backfill contacts and clients.
3. Threshold → 0.45; drop `word_similarity` from person ranking.
4. **Abstention gate on financial queries**, hard-coded before any scoring exists: >1 surviving person candidate + price/contract/rate in the query ⇒ show the picker. Converts a silent wrong answer into a visible question.
5. `person_aliases`, LLM-seeded, human-confirmed.
6. Scoring, confidence, `resolution_log`, then calibrate.

---

## 6. Must be verified by running code

Documentation could not settle these. Three of them can invalidate parts of this design, so they run **before** the code that depends on them, not as a footnote.

**Blocking:**
1. **Canva service-account coverage.** Compare `GET /v1/designs?ownership=any` against what an admin sees in the UI. No team-wide enumeration exists and partial coverage raises no error — the one silent failure with no signature.
2. **Drive: does `changes.list` with `driveId` under `drive.file` return a partial feed or a 404?** Docs are silent. Test before writing a mirror that assumes silent degradation.
3. **HNSW recall at `ef_search = ef_construction = 200`** on the real corpus. Below 0.9 means `ef_construction` must rise, changing build time and the migration plan.

**Shape-affecting:**
4. Does PPTX export preserve speaker notes? One export settles it; if yes, §1.2's "out of scope" changes.
5. Does a folder move actually emit descendant change entries? Move a folder with 200 descendants and count.
6. PPTX text coverage on the real corpus — count slides with zero recovered text (SmartArt/chart-only slides needing `ppt/diagrams/*` traversal).
7. Reversed-Hebrew detector hit rate over the existing PDF corpus. <1% means route to Vision unconditionally; 20% means budget Vision quota.
8. `version` monotonicity across rename, move, permission change and content edit — determines whether re-embedding must be gated on a content signal.
9. Actual extracted-text sizes for the largest real PPTX/XLSX against the 4.5 MB **response** cap.
10. Whether the ≤8k brute-force branch actually beats the HNSW probe at real filter selectivities.
11. `he_skeleton` false-merge rate across all 130 contacts × 425 clients (the ≥3-char guard came from a 24-variant matrix; a full cross-product will surface more).
12. Two consecutive Canva full sweeps, diffing id sets — does the offset-based `continuation` skip rows in practice?
13. `word_similarity_threshold = 0.45` against a real query log.
14. **The real six-עמית case, end to end**, after ship-order steps 1–4 and before building the scoring layer.
15. **The labelled eval set** — everything above is untunable without it.

---

## 7. Open questions for the owner

1. **Which Canva account should the platform connect as?** Coverage is determined by this choice, not by the Teams plan. A dedicated service user added to the team is cleanest; the admin account is fastest.
2. **Is content that lives in employees' personal Canva folders in scope?** It is not reachable, and arguably should not be.
3. **Images (25k) — confirm they are Stage 3.** They answer none of the stated price/agreement questions and are the most expensive pass.

## Related

- Reference implementation for the vector layer: `colagte` (`src/lib/chatbot/rag.ts`, `supabase/migrations/002_vector.sql`) — production-tested, but its IVFFlat choice and hand-maintained keyword routing are both superseded here.
- Dormant ingestion source: `leadrsagents/src/services/drive-scanner.ts`.
