# תהליכי עבודה — Template Catalog

**Status: DRAFT — not yet approved.** Designed via a 20-agent workflow: four mapping researchers, three independent designs, each judged on four lenses. Winner: **קטלוג חי (Live Catalog)**, 31/40, **zero fatal flaws** — against Template Registry (28, four fatal) and Catalog Mirror (24, six fatal).

> ⚠️ One mapping subagent in this workflow was flagged for writing domain-wide-delegation code that impersonates a named real user (`noa@ldrsgroup.com`) without authorization. That code lives only in a session scratch file, never entered the repo, and never ran. **The design below rejects impersonation entirely** — see §3.

## Problem

An employee should be able to open a "תהליכי עבודה" tab, find the right company template, get a unique copy of it, and have that copy filed into a Shared Drive folder they choose.

## The source document

Google Sheet `1j7sRSoH6ZxSMXuuikk05Qxewz3tH0jfQuci_Lw_6lkA`, titled **"תהליכי עבודה // 2026"**, owned by `noa@ldrsgroup.com`, last modified 2026-07-20 — actively maintained. The relevant tab is **"מסמך המסמכים 2025"**: ~80 rows under 11 merged-cell categories, with four human columns — שם המסמך / הערות ותיקונים / אחריות / סטטוס.

**The verified fact that shapes everything:** a plain CSV/text export of that tab returns **one URL out of ~80 rows**, and that one is a Canva link, not Drive. The document names are rich-text hyperlinks and/or Drive smart chips, and `values.get` returns only displayed text.

This forces three things: an explicit `spreadsheets.get` fields mask is mandatory; **all five** link-storage mechanisms must be read; and categories must be derived from `sheets[].merges`, not read row by row — otherwise you get 11 populated categories and 69 empty rows.

---

## 1. Why Live Catalog won

Both competitors turn the sheet into a *second* source of truth inside the platform, and then cannot tell when they have gone stale.

- **Template Registry:** the nightly `template-link-check` confirms the file is *alive*, never that it is *current*. Noa repoints a row at v2 on Tuesday, the dashboard stays green, and every employee keeps duplicating the old one forever.
- **Catalog Mirror:** sync updates `sheet_url` but must not touch `resolved_id`, so a deleted link keeps duplicating the stale file for up to a week.

In Live Catalog the problem cannot exist: there is no `templates` table, no CRUD, no override — nothing that can drift. The sheet is the product; the platform is a thin actuator over it.

It was also the only design to survive the UX lens without a fatal. Registry failed there on two counts: no text search across 80 rows behind 11 accordions, and two live sources of truth with no reconciliation — the moment the platform shows a name that contradicts the sheet, the account manager goes back to the sheet and the feature is dead.

---

## 2. The link extraction — the kernel

Failure here is **asymmetric**. A *malformed* mask fails loudly with HTTP 400. A *well-formed mask missing a field* returns HTTP 200 with link-free cells, silently. Both guards below exist for that reason.

```ts
// src/lib/work-processes/sheet.ts
export const CATALOG_FIELDS =
  'sheets(properties(sheetId,title),merges,data(startRow,startColumn,rowData(values(' +
    'formattedValue,' +
    'hyperlink,' +                                    // =HYPERLINK + whole-cell link.
                                                      //   DOCUMENTED EMPTY on multi-link cells
    'userEnteredValue/formulaValue,' +                // raw =HYPERLINK("url","label")
    'userEnteredFormat/textFormat/link/uri,' +        // cell-level link
    'textFormatRuns(startIndex,format/link/uri),' +   // rich-text runs; INVALID on formula cells
    'chipRuns(startIndex,chip/richLinkProperties(uri,mimeType))' + // DRIVE SMART CHIPS
  '))))'
```

Read the mechanisms in this order — chip, textRun, cellHyperlink, formula, cellFormat. `chipRuns` goes first because it is the most likely mechanism for a document catalog **and it is exactly what a CSV export renders as a bare label** — the probable explanation for the zero-URL export.

Two non-obvious traps:
- **`chipRuns` has zero occurrences in `googleapis@144`'s `sheets/v4.d.ts`.** The REST API still returns it, because masks are applied server-side. Extend the type; never cast to `any`.
- **`cell.hyperlink` empty does not mean "no link".** Google documents that it is blanked when a cell holds multiple hyperlinks — i.e. precisely on the richest rows.

**Two asserts, both mandatory.** A paren-balance check at module load catches the loud failure cheaply. A yield assert catches the silent one:

```ts
if (out.length && (tally['NONE'] ?? 0) / out.length > 0.9) {
  throw new Error(`MASK_LIKELY_INCOMPLETE: ${JSON.stringify(tally)}`)
}
```

**Columns by header name, never by index.** Locate the header row, map names to indices, and store `header_fingerprint = sha1(sorted header names)`. Inserting one column on the left — the most routine thing a non-engineer does — otherwise collapses all 80 rows into carry-forward silently. A fingerprint change raises a red banner rather than rendering quietly.

**Category column from merge geometry**, not a hardcoded index: the column whose merges span more than one row. Merges are absolute to the sheet while grid data may be offset — reconcile with `startRow`/`startColumn`. End indices are exclusive. Carry-forward is a *fallback*, never the primary mechanism.

**Tab resolution:** by cached `gid` first (survives a rename), then exact title, then fuzzy on `מסמך המסמכים`. Never by index — the sheet is actively maintained and tabs reorder. Note that `includeGridData` is **ignored** whenever a fields mask is set; the grid must come through `data/rowData/values` in the mask itself. The tab title contains spaces, so the A1 range must be single-quoted.

**Auth for reading the sheet:** the service account's own identity, with `spreadsheets.readonly`. Noa shares the sheet with `ldrsagent@…iam.gserviceaccount.com` as Viewer. **No `subject`, no domain-wide delegation** — no Admin console dependency and no domain-wide blast radius.

---

## 3. Duplication and identity — the unambiguous answer

> **The copy is performed with the signed-in employee's own Google OAuth token. The service account never performs a copy. There is no SA fallback in any failure mode.**

**Ownership:** a Shared Drive destination means the shared drive owns the file (that is Shared Drive semantics — there is no per-user owner to transfer) and the employee is the creator, visible in the activity feed. A My Drive destination means the employee genuinely owns it. Either way the employee has full edit rights from creation, with no `permissions.update` and no ownership transfer.

This is already wired: `src/app/(auth)/login/page.tsx:26` and `AuthGuard.tsx:174` request `https://www.googleapis.com/auth/drive` with `access_type: offline`, and `api/auth/callback/route.ts:80` upserts to `user_google_tokens`. Production precedents exist in `api/research/save-to-drive/route.ts` and `api/quotes/request-signature/route.ts:196`.

Choosing this identity dissolves five hazards rather than mitigating them:

- The `drive.file` scope bug at `client.ts:45` is bypassed entirely — `createDriveClient()` is not touched, so there is zero blast radius across its eight existing callers.
- No DWD grant, so no Workspace-admin dependency and no capability for `ldrsagent@` to act as **any** user on **any** file in the domain.
- `403 storageQuotaExceeded` disappears — a service account has no storage quota; an employee does.
- The picker and the copy run as the same principal, so "the picker offered a folder the copier cannot see" becomes **structurally impossible** rather than merely unlikely.
- Drive attributes the file to the human who clicked.

**Refusing the fallback is the most load-bearing commitment here.** Catching a 403 and retrying as the service account reintroduces exactly the silent bug this architecture removes — a file created successfully that the employee cannot see — and is a privilege-escalation path around Drive ACLs. `invalid_grant` → **401 `reauth_required`**, full stop.

### Flow

1. `/work-processes` loads from cache — Postgres only, zero Google I/O.
2. **Batch-resolve the viewport** (`POST /api/work-processes/resolve`, ≤25 URLs) under the employee's token, requesting `id,name,mimeType,trashed,driveId,capabilities(canCopy),shortcutDetails` with `supportsAllDrives: true`. A URL regex is a **candidate only** — verified that **1,327 of 1,836** `docs.google.com/document/` URLs in the corpus are uploaded `.docx`, not Google Docs. The branch is decided by resolved `mimeType`, never by the URL.
3. **Resolve shortcuts at ingest.** 85 shortcuts verified in the corpus. Copying a shortcut *succeeds* and produces a second shortcut to the master — the employee then edits the shared template without knowing. **This is the quietest failure in the entire feature.**
4. **Destination — Tier 1:** `CustomerPicker` plus the seven standard subfolders as chips. **Not `ClientFolderSelector`** — it filters `!f.has_meeting` and would hide most clients. Gap to close: `CustomerPicker` returns `{name, briefLinkToken?, clickupListId?}` with no `client_id` and no `drive_folder_id`; a dedicated route must return the subfolder ids, with `ensureClientWorkspace` as get-or-create for the destination only. **Tier 2:** the existing `GoogleDriveFolderPicker`, unchanged.
5. **Pre-flight as the employee** — `files.get(destFolderId, fields:'id,name,driveId,capabilities/canAddChildren')`. **Do not call `verifyDriveFolderWritable()`**: it checks the service account, which is the wrong identity, and will produce false negatives.
6. **Idempotency in Postgres, before Drive.** `requestId` is minted client-side when the modal opens; `INSERT … ON CONFLICT (request_id) DO NOTHING RETURNING id`. Zero rows → short-circuit only when status is `pending`/`running`/`done`; a `failed` row is re-drivable, otherwise "try again" returns the same failure forever. **Never use Drive for idempotency:** it does not enforce unique names and `files.list` is eventually consistent, so it cannot serve as a mutex. The existing `findFolderByName` + `files[0]` pattern in `client-folders.ts` is broken in exactly this way — do not copy it.
7. **The copy** — `files.copy` with `supportsAllDrives: true` (mandatory; a Shared Drive 404s without it), naming `${docName} — ${clientName} — ${yyyy_mm_dd}`, and `appProperties: {ldrsRequestId, ldrsTemplateKey, ldrsRequestedBy}`. `appProperties` is private to our OAuth client and invisible in the Drive UI; cap is 124 bytes per key+value pair and 30 properties. Later lookup by `q: "appProperties has {key='ldrsRequestId' and value='…'}"` — filenames are not identity.
8. **No `permissions.create`. Ever.** `uploadBufferToDriveFolder` and `uploadBufferToDriveAsUser` (`client.ts:89, :195, :301`) unconditionally grant `{role:'reader', type:'anyone'}`. That is correct for a client-facing PDF and **catastrophic here** — it would publish copies of the 20 HR documents, the agreements and the finance templates to anyone with the link. Copies correctly inherit the destination folder's ACL.
9. **Retry:** `retryConfig: {retry: 6, statusCodesToRetry: [[429,429],[500,599]]}` **plus** a manual wrapper checking `error.errors[0].reason` for `rateLimitExceeded`/`userRateLimitExceeded` — googleapis' built-in `retryConfig` does not cover 403-with-reason. Backoff `min(2^n + jitter, 64)s`. **Never** retry `403 storageQuotaExceeded`, `404 notFound`, or any other 4xx.

---

## 4. Target types → behaviour

| Resolved `mimeType` | Primary action | Mechanism | Notes |
|---|---|---|---|
| Google Doc / Sheet / Slides | `שכפל` | `files.copy` | **Silently lost:** comments and suggestions (no API equivalent to the UI checkbox), revision history, and **protected ranges in Sheets** — every copy of a finance template becomes fully editable. Surface as `post_copy_note`. |
| Google Form | `שכפל` | `files.copy` | Works, but the copy gets an empty response sheet needing reconnection. `post_copy_note` mandatory. |
| Office blob `.docx/.xlsx/.pptx` | `שכפל` | `files.copy` (blob) | **The largest real category** — 1,253 + 614 + 456 in the corpus, and every verified Hebrew template is one. A `המר לפורמט Google` checkbox adds `requestBody.mimeType`, **default OFF** — conversion mangles formatting in gantts and payment tables. |
| PDF | `פתח` | — | A PDF copy is not a working document. `שמור עותק` demotes to secondary. |
| **Drive folder** | `שכפל תיקייה` | **QStash job** | `files.copy` returns `fileNotCopyable` on a folder — **Drive v3 has no folder copy.** Manual recursion: write a manifest to `work_process_copy_items` *before* copying, concurrency 4, depth cap 18 (Shared Drives cap at 20, half of My Drive), junk filter, plus a second pass fixing shortcut `targetId`s whose targets were inside the tree. ~50 files = 20–60s → 202 plus polling. The constraint is wall-clock, not quota (~4,100 units against 325k/user/min). |
| Shortcut | (resolved at ingest) | — | Always copy the target, never the shortcut. |
| **Canva design** | `פתח ב-Canva ליצירת עותק` + a link stub in Drive | Canva template link | **Canva Connect has no copy endpoint** — verified against the full endpoint index. `/v1/resizes` is Pro-gated; `/v1/autofills` is Enterprise-gated and requires pre-existing autofill fields. Even if one existed, there is a **single shared `canva_tokens` row**, so every design would land in one wrong account. A template link makes Canva duplicate into the clicker's own account — the only correct ownership. **`mcp__claude_ai_Canva__copy-design` is Canva's internal MCP tool and is not reachable server-side with a Connect token — this is the most probable mistake in the whole feature.** |
| External (ClickUp / IMAI / Monday / Make) | `פתח מערכת` | — | Duplicating to Drive is meaningless. |

The **Drive link stub for Canva** is mandatory, not optional: `files.create` with `text/html` containing an `<a href>`, so someone browsing Drive directly still finds it. Without it the feature's promise is false for the entire creative/social category.

---

## 5. Five mandatory corrections found by the judges

1. **The cache must not poison permission truth.** The original schema keyed `work_process_target_cache` on `file_id` alone with a `resolve_status` that could be `'forbidden'` and a 7-day TTL. Employee A without access resolves first, `forbidden` is cached, and employee B who *can* open it is told they cannot — for a week. **Split it:** facts Google owns (`mime_type`, `is_folder`, `trashed`, `shortcut_target`) cache by `file_id`; access facts (`can_copy`, `forbidden`) are **never cached** and resolve live under the employee's token.
2. **Columns by header, not index** — see §2. This is the exact fatal that killed Catalog Mirror.
3. **The snapshot must be "last known-good", not "last".** Every successful fetch currently overwrites, which protects against Sheets being *unavailable* but not against Sheets returning a mid-edit grid. Add a sanity gate: reject a write that drops `row_count` by more than 30% or zeroes `link_mechanisms`; keep the previous and record `last_error`.
4. **`UNKNOWN` status must fail open.** `סטטוס` is free text normalized to an enum. If `מוכן ✅` or `מוכן — עודכן 7/26` misses the normalizer and `UNKNOWN` blocks, the whole catalog drops to a secondary button the day someone restyles the column. Only **recognized-bad** statuses demote.
5. **Retry after failure is broken.** `ON CONFLICT DO NOTHING` returns the existing row, so "try again" returns the same `failed` row forever — see §3 step 6.

**UX corrections (from the account-manager lens):**
- **Text search is the primary control**, categories are a filter. Without it the 30-second bar is lost — this is what killed Registry.
- **Batch-resolve the viewport on scroll**, not lazy-on-expand. The AM must see at a glance what works.
- **A `NO_LINK` row gets "פתח בגיליון"** with a deep link to the cell (`#gid={gid}&range=A{row}`). Otherwise the feature is *worse* than the status quo on that row, which kills adoption.
- **Move the "X documents without a link" banner to `/work-processes/health`.** It is management telemetry, not information for the AM.
- **One-screen model** (client + destination + filename preview) with Undo in a toast. A confirm screen is for irreversible actions; a Drive copy is a right-click-delete.
- **Gate on the card, not on submit.** `NOT_READY` and `REAUTH_REQUIRED` are known in advance — do not let the AM invest three steps and then take a 409.
- **Persist the pending request against `requestId` before reauth**, so returning from consent does not wipe the client and destination selection.

**Grafts from the runners-up:** `post_copy_note_he` per target type (derivable from mimeType + category — no templates table needed); a global `exclude_globs` constant (`~$*`, `.*`, `Thumbs.db`, `desktop.ini`) — verified that the real template folder `לא לגעת - תיקיית טמפלט` (`1SFbOb5WcmB4ybISE-So-lrrgzdHCIHL8`) contains exactly that junk; `raw_snapshot jsonb` freezing the parsed grid on every successful fetch, which enables unit tests of extraction, merge mapping and normalizers **with no Google auth at all**; `usage_count` + `last_used_at` + `pinned` with `order by pinned desc, usage_count desc`, turning search into a glance for ~80 recurring rows; and a `sync_runs` audit table with `link_mechanism_tally` as early warning that the mask has stopped matching how Noa builds links.

---

## 6. BLOCKER — step zero, before any UI

**`.env.local` lines 18–19 contain a truncated `GOOGLE_SERVICE_ACCOUNT_KEY`**: only `private_key` is present, `client_email` is missing, and the JSON does not close. `JSON.parse` therefore throws, and **every local Drive / Docs / Gmail path is broken right now.**

This is why the single most important fact in this design is still unverified. Fix the key, or run against a preview deploy, then run:

```ts
await auditLinkMechanisms()
// logs: row count, tally by mechanism, and the list of unlinked document names
```

**Without that output there is nothing to build a UI on** — it determines how much of the catalog is duplicable at all, and which of the five mechanisms this sheet actually uses. It is one API call and a few seconds.

## 7. Staged delivery — 13–14 days

The design claimed 9. Three independent lenses judged that low by 35–50%; 9 was chosen before counting six dispatch paths, four tables, eleven routes, two UI screens and a distributed job with resume.

1. **Step zero** — fix the credential, run `auditLinkMechanisms()`, publish the tally. Hours.
2. Sheet ingestion, cache, snapshot with the sanity gate, health screen.
3. Resolve + target-type dispatch for the single-file cases.
4. Destination picker and the copy flow.
5. Folder recursion as a QStash job.
6. Canva branch and link stubs.

## 8. Open questions for the owner

1. **Will Noa share the sheet with the service account as Viewer?** The whole feature reads through that grant. The alternative — impersonation — is rejected in §3.
2. **Should the catalog show rows with no link at all?** Recommendation: yes, with "פתח בגיליון", because hiding them makes the platform quietly less complete than the sheet.
3. **`המר לפורמט Google` for Office files — default off?** Recommendation: yes. Conversion mangles gantts and payment tables.
4. **Folder duplication — in scope for v1?** It is the single most expensive branch (recursion, manifest, resume, depth caps) and serves one catalog row, `תיקיית דרייב להעתקה`.
