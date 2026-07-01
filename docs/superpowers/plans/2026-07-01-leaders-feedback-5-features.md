# Leaders — 5 Feedback Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute phases **in order** (1→5); phases 2, 3, 4, 5 depend on modules built earlier.

**Source:** 5 feedback items from Yoav Bogin (LEADRS), 01/07/2026. Original messages preserved in the "Feedback → Phase map" table below.

**Goal:** Wire five internal workflow automations into `leaders-platform`: (1) email Roei+Noa when a kick-off brief is completed; (2) import our generated creative deck into Canva and email it a day before the client meeting; (3) auto-generate an influencer brief document from an approved creative deck; (4) batch-clone a signed client quote into per-influencer contracts; (5) email the "meeting #2" activity deck a day before that meeting.

**Architecture:** Build three shared building blocks first — a canonical **recipients module**, **manual meeting-date fields + a "day-before" extension to the existing daily cron**, and a **Canva Connect client** (OAuth service-account + `url-imports`). Then layer the five features on top. Reuse existing infra everywhere: Gmail send (`src/lib/gmail/management.ts`), the daily reminders cron (`src/app/api/cron/reminders/route.ts`), the signature flow (`signature_requests` + `/sign/{token}`), Playwright PDF (`src/lib/playwright/pdf.ts`), and the Google-Drive public-upload pattern used by the Salesforce quote flow.

**Tech Stack:** Next.js 14 App Router · TypeScript (strict) · Supabase (Postgres + Auth + Storage) · Google Gmail/Drive APIs · Canva Connect REST API · Playwright/Chromium PDF · Vercel Cron.

## Global Constraints

- **Path alias:** `@/*` → `./src/*`. UI is **Hebrew / RTL**.
- **Production base URL:** `NEXT_PUBLIC_APP_URL = https://leaders-platform.vercel.app`.
- **No automated test framework in this repo.** Per-task verification gate = `npx tsc --noEmit` passes **and** a concrete manual check (curl the endpoint / `npm run dev` + hit the route / inspect the DB row). Commit after every task. End every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Recipients (exact):** Roei Kaplan `roei@ldrsgroup.com` · Noa Sabagi `noa@ldrsgroup.com` · Sharon Levy Ofree `sharon@ldrsgroup.com` · management defaults `cto@,noa@,yoav@ldrsgroup.com`. **`eran@ldrsgroup.com` is hard-blocked from every recipient list, always.**
- **Test safety:** when `NOTIFICATIONS_TEST_MODE=true`, all event recipients collapse to a single safe address (`NOTIFICATIONS_TEST_RECIPIENT`, default `cto@`). Never email Roei/Sharon/real management during testing; never email Eran.
- **Canva = import, not template.** We import our own generated PPTX/PDF via `POST https://api.canva.com/rest/v1/url-imports`. **No Canva Enterprise required.** OAuth token endpoint `POST https://api.canva.com/rest/v1/oauth/token`; scopes `design:content:write design:meta:read design:content:read`; redirect `https://leaders-platform.vercel.app/api/canva/oauth/callback`; access token TTL 14400s; **refresh token is single-use/rotating → persist the new one in DB on every refresh (never in ENV).**
- **Meeting dates are entered manually** by the account manager. **"Day before" = exactly 1 calendar day before, computed in Israel timezone** (Asia/Jerusalem), reusing the cron's existing Israel-TZ helper. Business-day skipping is an optional later refinement, not the default.
- **New document type** `influencer_brief`; **influencer contracts reuse** the existing `signature_requests` + `/sign/{token}` flow — do not fork a new signing mechanism.

## Feedback → Phase map

| # | Yoav's message (01/07/2026) | Phase |
|---|---|---|
| 1 | "כל סיום מילואי בריף התנעה, צריך שרועי יקבל אותו למייל וגם נועה" | **Phase 1** |
| 2 | "מצגת מוכנה להצגת לקוח בקאנבה צריכה להישלח לרועי ולשרון יום לפני הפגישה. מסמך התנעה מכוון צריך לפתוח מצגת בקאנבה ולשים את הלינק במסמך התנעה." | **Phase 2** (email a day before) + **Phase 3** (Canva import + link on kickoff) |
| 3 | "יצירת בריף אוטומטי למשפיעניות על בסיס המצגת קריאייטיב שאושרה" | **Phase 4** |
| 4 | "הצעת מחיר לחתימה ללקוח, צריך לייצר שיכפול להוציא חוזה למשפיענית" | **Phase 5** |
| 5 | "לאחר חתימה על המצגת, יש פגישה מספר 2 בה מציגים ללקוח את הפעילות בתכלס. את המצגת הזאת נשלח יום לפני לרועי, נועה ושרון" | **Phase 2** (second_meeting_date, day-before email) |

## Prerequisites / manual setup (before or alongside Phase 3)

Full step-by-step for the browser operator is in **[docs/canva-connect-setup-runbook.md](../../canva-connect-setup-runbook.md)**. In short:

1. **Canva Connect integration** — register at `https://www.canva.com/developers/integrations/` with the Leaders **service** Canva account (Development mode, do **not** submit for review). Scopes `design:content:write design:meta:read design:content:read`. Redirect URL `https://leaders-platform.vercel.app/api/canva/oauth/callback`.
2. **Vercel env** (all 3 environments): `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, `CANVA_SCOPES`. Do **not** set a Canva refresh token in ENV (it rotates → stored in DB by the callback). Optional: `NOTIFICATIONS_TEST_MODE`, `NOTIFICATIONS_TEST_RECIPIENT`.
3. **Run the SQL migrations** introduced by phases 2–5 on Supabase project `fhgggqnaplshwbrzgima` (SQL editor: `https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new`), or via the Supabase MCP `apply_migration` tool.
4. **Connect the Canva service account** once, after Phase 3 deploys: visit `https://leaders-platform.vercel.app/api/canva/oauth/start` → **Allow**.

---

## Phase 1 — Notification recipients module + Item 1 (email Roei + Noa on inner-meeting completion)

### Files
- **Create** `src/lib/notifications/recipients.ts` — the canonical recipients module (`LDRS`, `NotificationEvent`, `getEventRecipients`).
- **Modify** `src/app/api/inner-meeting/complete/route.ts` — lines 79–93 (the "1. Email management" block): compute `to` from `getEventRecipients('inner_meeting_completed')` and pass it into `sendToManagement`. No other block changes.

### Interfaces (produces / consumes)
- **Produces** `src/lib/notifications/recipients.ts`:
  - `export const LDRS` (frozen record of the six Leaders addresses).
  - `export type NotificationEvent = 'inner_meeting_completed' | 'client_presentation_day_before' | 'second_meeting_day_before'`.
  - `export function getEventRecipients(event: NotificationEvent): string[]` — later phases (client-presentation reminder, second-meeting reminder) consume this same function.
- **Consumes**: `getManagementRecipients` from `src/lib/gmail/management.ts` (already exists, lines 32–42) and its existing hard-block on Eran. `sendToManagement` already accepts an optional `to?: string[]` override (line 80), so Item 1 wires the event recipients straight through with **no signature change** to the mail infra.
- **Env consumed**: `NOTIFICATIONS_TEST_MODE`, `NOTIFICATIONS_TEST_RECIPIENT` (optional; defaults to `LDRS.CTO`).

### SQL migration
None. This phase is code-only (recipients module + one route wiring change). Schema columns (`client_presentation_meeting_date`, canva columns, etc.) belong to later phases.

---

### Task 1 — Build `src/lib/notifications/recipients.ts`

**Files:** Create `src/lib/notifications/recipients.ts`

- [ ] Step 1: Create the file with the full module below. `getEventRecipients` reuses `getManagementRecipients()` (which already parses `MANAGEMENT_EMAILS`/`ADMIN_EMAILS`, validates, lowercases, dedupes, and hard-blocks Eran), unions in the per-event Leaders addresses, re-filters Eran defensively, dedupes, and applies the `NOTIFICATIONS_TEST_MODE` override last.

```ts
/**
 * Canonical recipient resolver for Leaders automated notifications.
 *
 * Single source of truth for "who gets emailed" per notification event.
 * Reuses the existing management-mail policy in src/lib/gmail/management.ts
 * (getManagementRecipients already reads MANAGEMENT_EMAILS/ADMIN_EMAILS,
 * validates addresses, lowercases, dedupes, and hard-blocks Eran Nizri).
 *
 * Hard rule: Eran (eran@ldrsgroup.com) is NEVER a recipient of any event.
 *
 * Test mode: when NOTIFICATIONS_TEST_MODE === 'true', every event resolves to
 * a single safe recipient (NOTIFICATIONS_TEST_RECIPIENT, default LDRS.CTO) so
 * live flows can be exercised without mailing real management.
 */

import { getManagementRecipients } from '@/lib/gmail/management'

export const LDRS = {
  ROEI: 'roei@ldrsgroup.com',
  NOA: 'noa@ldrsgroup.com',
  SHARON: 'sharon@ldrsgroup.com',
  CTO: 'cto@ldrsgroup.com',
  YOAV: 'yoav@ldrsgroup.com',
  ERAN: 'eran@ldrsgroup.com',
} as const

export type NotificationEvent =
  | 'inner_meeting_completed'
  | 'client_presentation_day_before'
  | 'second_meeting_day_before'

/** Normalise + dedupe + defensively strip Eran from any address list. */
function clean(addresses: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of addresses) {
    const a = (raw ?? '').toString().trim().toLowerCase()
    if (!a) continue
    if (a === LDRS.ERAN) continue // hard block, always
    if (seen.has(a)) continue
    seen.add(a)
    out.push(a)
  }
  return out
}

/**
 * Resolve the recipient list for a notification event.
 *
 *  - inner_meeting_completed        -> management recipients ∪ {ROEI}  (NOA already in management)
 *  - client_presentation_day_before -> {ROEI, SHARON}
 *  - second_meeting_day_before      -> {ROEI, NOA, SHARON}
 *
 * Eran is always filtered out. When NOTIFICATIONS_TEST_MODE === 'true' the
 * whole list is replaced with a single test recipient.
 */
export function getEventRecipients(event: NotificationEvent): string[] {
  let recipients: string[]
  switch (event) {
    case 'inner_meeting_completed':
      // Union of the existing management policy + Roei.
      recipients = clean([...getManagementRecipients(), LDRS.ROEI])
      break
    case 'client_presentation_day_before':
      recipients = clean([LDRS.ROEI, LDRS.SHARON])
      break
    case 'second_meeting_day_before':
      recipients = clean([LDRS.ROEI, LDRS.NOA, LDRS.SHARON])
      break
    default: {
      // Exhaustiveness guard — TS errors here if a new event is added.
      const _never: never = event
      throw new Error(`Unknown notification event: ${String(_never)}`)
    }
  }

  if (process.env.NOTIFICATIONS_TEST_MODE === 'true') {
    const test = (process.env.NOTIFICATIONS_TEST_RECIPIENT || LDRS.CTO)
      .toString()
      .trim()
      .toLowerCase()
    // Even the test recipient must never be Eran.
    return clean([test]).length ? clean([test]) : [LDRS.CTO]
  }

  return recipients
}
```

- [ ] Step 2: Verify — `npx tsc --noEmit` passes.
- [ ] Step 3: Manual check — run a one-off node eval to confirm each event resolves correctly and the test-mode override works:
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && \
npx tsx -e "
import { getEventRecipients } from './src/lib/notifications/recipients';
console.log('inner_meeting_completed        ', getEventRecipients('inner_meeting_completed'));
console.log('client_presentation_day_before ', getEventRecipients('client_presentation_day_before'));
console.log('second_meeting_day_before      ', getEventRecipients('second_meeting_day_before'));
process.env.NOTIFICATIONS_TEST_MODE='true';
console.log('TEST MODE (all events)         ', getEventRecipients('inner_meeting_completed'));
"
```
Expected (with no `MANAGEMENT_EMAILS` env set, so management falls back to cto/noa/yoav):
- `inner_meeting_completed` → `['cto@ldrsgroup.com','noa@ldrsgroup.com','yoav@ldrsgroup.com','roei@ldrsgroup.com']`
- `client_presentation_day_before` → `['roei@ldrsgroup.com','sharon@ldrsgroup.com']`
- `second_meeting_day_before` → `['roei@ldrsgroup.com','noa@ldrsgroup.com','sharon@ldrsgroup.com']`
- TEST MODE → `['cto@ldrsgroup.com']`
Confirm Eran never appears in any line. (If `tsx` isn't installed, substitute `npx tsx` with `node --loader tsx` or skip and rely on the route-level check in Task 2.)

- [ ] Step 4: Commit.
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && \
git add src/lib/notifications/recipients.ts && \
git commit -m "$(cat <<'EOF'
notifications: canonical getEventRecipients() module

Single source of truth for per-event recipient lists. Reuses the existing
management-mail policy (getManagementRecipients) and hard-blocks Eran on
every path. Adds NOTIFICATIONS_TEST_MODE override to a single safe recipient.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 — Item 1: wire inner-meeting completion email to `getEventRecipients('inner_meeting_completed')`

**Files:** Modify `src/app/api/inner-meeting/complete/route.ts` (the "1. Email management" block, lines 79–93)

- [ ] Step 1: In the `try` block that emails management, import the recipients helper and pass `to`. Replace the existing block (lines 79–93):

```ts
  try {
    const { sendToManagement } = await import('@/lib/gmail/management')
    const html = buildKickoffHtml(payload, user.user_metadata?.full_name ?? user.email)
    const result = await sendToManagement({
      senderEmail: user.email,
      senderName: user.user_metadata?.full_name ?? user.email,
      subject: `🚀 פגישת התנעה — ${payload.clientName}`,
      html,
    })
    mailSent = result.sent
    mailFailed = result.failed.length
    console.log(`${tag} mgmt mail: sent=${mailSent} failed=${mailFailed}`)
  } catch (e) {
    console.warn(`${tag} mgmt mail error:`, e instanceof Error ? e.message : e)
  }
```

with (adds the `getEventRecipients` import + `to` override; everything else — sender, subject, html, mailSent/mailFailed bookkeeping, catch — is unchanged):

```ts
  try {
    const { sendToManagement } = await import('@/lib/gmail/management')
    const { getEventRecipients } = await import('@/lib/notifications/recipients')
    const html = buildKickoffHtml(payload, user.user_metadata?.full_name ?? user.email)
    const to = getEventRecipients('inner_meeting_completed')
    console.log(`${tag} mgmt mail recipients:`, to.join(', '))
    const result = await sendToManagement({
      senderEmail: user.email,
      senderName: user.user_metadata?.full_name ?? user.email,
      subject: `🚀 פגישת התנעה — ${payload.clientName}`,
      html,
      to,
    })
    mailSent = result.sent
    mailFailed = result.failed.length
    console.log(`${tag} mgmt mail: sent=${mailSent} failed=${mailFailed}`)
  } catch (e) {
    console.warn(`${tag} mgmt mail error:`, e instanceof Error ? e.message : e)
  }
```

  Note: `sendToManagement` already honors a `to?: string[]` override (`const recipients = params.to?.length ? params.to : getManagementRecipients()`, line 82), so no change to `management.ts` is needed. ClickUp cascade (step 2.5), `forms.status` update, and `activity_log` insert are untouched.

- [ ] Step 2: Verify — `npx tsc --noEmit` passes.
- [ ] Step 3: Manual check — start dev and hit the route to confirm the recipient log line prints Roei alongside the management defaults and never Eran:
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npm run dev
```
Then in a second terminal (unauthenticated call returns 401, which is expected — the point is to confirm the module import + route compile and, once authenticated via the browser at `/inner-meeting`, the server log shows `mgmt mail recipients: cto@ldrsgroup.com, noa@ldrsgroup.com, yoav@ldrsgroup.com, roei@ldrsgroup.com`):
```bash
curl -s -X POST http://localhost:3000/api/inner-meeting/complete \
  -H 'Content-Type: application/json' \
  -d '{"formId":"00000000-0000-0000-0000-000000000000","payload":{"clientName":"בדיקה"}}' | head
```
Primary manual verification: complete an inner-meeting form as a logged-in employee (or set `NOTIFICATIONS_TEST_MODE=true` in `.env.local` first to route the single test send to `cto@`), then inspect the dev-server console for the `mgmt mail recipients:` line and confirm `roei@ldrsgroup.com` is present and `eran@ldrsgroup.com` is absent.

- [ ] Step 4: Commit.
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && \
git add src/app/api/inner-meeting/complete/route.ts && \
git commit -m "$(cat <<'EOF'
inner-meeting: email Roei + management on completion (item 1)

Completion mail now uses getEventRecipients('inner_meeting_completed')
(= management recipients ∪ Roei, Eran hard-blocked) via the existing
sendToManagement `to` override. ClickUp + activity-log flow unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Phase 2 — Manual meeting-date fields + "day before meeting" reminders (Items 2-email and 5)

### Files
- **Create** `supabase/migrations/20260701_meeting_dates_and_reminders.sql` — new dated migration adding the four meeting-date/reminder columns to `inner_meeting_forms` (plus a defensive `canva_edit_url` column so this phase's cron read type-checks even if the Canva phase lands later).
- **Modify** `src/types/inner-meeting.ts` (lines 23–46) — add `clientPresentationDate` + `secondMeetingDate` to `innerMeetingSchema`.
- **Modify** `src/lib/inner-meeting/types.ts` (lines 26–48) — add the four new columns to the `InnerMeetingForm` row interface.
- **Modify** `src/components/inner-meeting/InnerMeetingForm.tsx` — sync new fields on load (after line 99), persist them in `handleSaveDraft` (after line 140) and `handleCreateDraft` (after line 201), and render two `<input type="date">` fields (new section after line 692).
- **Modify** `src/app/api/cron/reminders/route.ts` — add an `israelYmd()` helper + `israelTomorrowYmd()` (after line 47), extend the `WebhookReminder` union (after line 167) with a `meeting_day_before` kind, add a new reminder check block #4 (after line 429, before the batch send at line 431), and render the new rows in the digest (in `buildRemindersDigestHtml`, after line 534).

### Interfaces (produces / consumes)
- **Produces** (for later phases): the columns `client_presentation_meeting_date`, `second_meeting_date`, `client_presentation_reminder_sent_at`, `second_meeting_reminder_sent_at` on `inner_meeting_forms`; the form UI that lets an account manager enter both dates manually.
- **Consumes**: `getEventRecipients(event: NotificationEvent)` and the `NotificationEvent` type from `src/lib/notifications/recipients.ts` (produced by Phase 1). Also reads `inner_meeting_forms.canva_edit_url` (produced by the Canva phase; this migration adds it `IF NOT EXISTS` so the read never fails). Uses the existing `sendToManagement` in `src/lib/gmail/management.ts` indirectly via `getEventRecipients` → passing the result as `to:` (per contract, `getEventRecipients` returns the resolved recipient list including test-mode override).

> **Ordering note:** Phase 1 (`recipients.ts`) must land before Task 3's cron edit type-checks. Task 1 (migration) and Task 2 (UI/persistence) are independent of Phase 1 and can be done first. If Phase 1 has not merged yet when you reach Task 3, do Tasks 1–2, then return for Task 3.

### SQL migration block

```sql
-- supabase/migrations/20260701_meeting_dates_and_reminders.sql
-- Phase 2 — manual meeting-date fields + "day before meeting" reminders.
-- Adds two manual meeting-date columns on the kickoff doc (inner_meeting_forms)
-- and two "reminder sent" stamps so the daily cron nags exactly once per date.
-- Idempotent: ADD COLUMN IF NOT EXISTS everywhere. No data is modified.

ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS client_presentation_meeting_date      DATE,
  ADD COLUMN IF NOT EXISTS second_meeting_date                   DATE,
  ADD COLUMN IF NOT EXISTS client_presentation_reminder_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_meeting_reminder_sent_at       TIMESTAMPTZ;

-- Defensive: the Canva phase also adds this, but the reminder cron reads it.
-- IF NOT EXISTS makes both migrations safe to run in either order.
ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS canva_edit_url TEXT;

-- Partial indexes so the daily cron's "date == tomorrow AND reminder not sent"
-- scan stays cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_inner_meeting_client_presentation_pending
  ON inner_meeting_forms (client_presentation_meeting_date)
  WHERE client_presentation_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inner_meeting_second_meeting_pending
  ON inner_meeting_forms (second_meeting_date)
  WHERE second_meeting_reminder_sent_at IS NULL;
```

---

### Task 1 — Add the migration file

**Files:** Create `supabase/migrations/20260701_meeting_dates_and_reminders.sql`

- [ ] **Step 1:** Create `supabase/migrations/20260701_meeting_dates_and_reminders.sql` with exactly the SQL migration block above.
- [ ] **Step 2 (apply):** Apply it. If the Supabase MCP is authenticated, run its `apply_migration` tool with the file contents. Otherwise paste the file into the [SQL editor](https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new) and run it.
- [ ] **Step 3 (verify — schema):** Confirm the columns exist:
  ```bash
  node -e "const {createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env.local'});const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});s.from('inner_meeting_forms').select('client_presentation_meeting_date,second_meeting_date,client_presentation_reminder_sent_at,second_meeting_reminder_sent_at,canva_edit_url').limit(1).then(r=>{if(r.error){console.error('FAIL',r.error.message);process.exit(1)}console.log('OK columns queryable')})"
  ```
  Expect `OK columns queryable` (an empty/one-row result with no "column does not exist" error).
- [ ] **Step 4 (verify — tsc):** `npx tsc --noEmit` must pass (no code changed, but confirms tree is clean).
- [ ] **Step 5 (commit):**
  ```bash
  git checkout -b phase2-meeting-date-reminders 2>/dev/null || git checkout phase2-meeting-date-reminders
  git add supabase/migrations/20260701_meeting_dates_and_reminders.sql
  git commit -m "$(cat <<'EOF'
Phase 2: migration — meeting-date + reminder-sent columns on inner_meeting_forms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 2 — Add the two date inputs to the form (schema + row type + UI + persistence)

**Files:** `src/types/inner-meeting.ts`, `src/lib/inner-meeting/types.ts`, `src/components/inner-meeting/InnerMeetingForm.tsx`

- [ ] **Step 1 — zod schema.** In `src/types/inner-meeting.ts`, add the two optional string fields to `innerMeetingSchema`. Replace the closing of the schema (currently lines 43–46):
  ```ts
    creativeDeadline: z.string().min(1, 'שדה חובה'),
    internalDeadline: z.string().min(1, 'שדה חובה'),
    clientDeadline: z.string().min(1, 'שדה חובה'),
  })
  ```
  with:
  ```ts
    creativeDeadline: z.string().min(1, 'שדה חובה'),
    internalDeadline: z.string().min(1, 'שדה חובה'),
    clientDeadline: z.string().min(1, 'שדה חובה'),
    // Manual meeting dates entered by the account manager (optional — a
    // kickoff can be filed before these are scheduled). Format: yyyy-mm-dd.
    clientPresentationDate: z.string().optional(),
    secondMeetingDate: z.string().optional(),
  })
  ```

- [ ] **Step 2 — row interface.** In `src/lib/inner-meeting/types.ts`, add the four DB columns to `InnerMeetingForm`. Replace (currently lines 43–47):
  ```ts
    creative_deadline: string | null
    internal_deadline: string | null
    client_deadline: string | null
    created_at: string
    updated_at: string
  ```
  with:
  ```ts
    creative_deadline: string | null
    internal_deadline: string | null
    client_deadline: string | null
    client_presentation_meeting_date: string | null
    second_meeting_date: string | null
    client_presentation_reminder_sent_at: string | null
    second_meeting_reminder_sent_at: string | null
    created_at: string
    updated_at: string
  ```

- [ ] **Step 3 — sync on load.** In `src/components/inner-meeting/InnerMeetingForm.tsx`, in the initial-sync `useEffect`, add the two `setValue` lines right after the `clientDeadline` sync (currently line 99). Replace:
  ```ts
        setValue('clientDeadline', innerForm.client_deadline || '')
        
        prevInnerFormRef.current = innerForm
  ```
  with:
  ```ts
        setValue('clientDeadline', innerForm.client_deadline || '')
        setValue('clientPresentationDate', innerForm.client_presentation_meeting_date || '')
        setValue('secondMeetingDate', innerForm.second_meeting_date || '')
        
        prevInnerFormRef.current = innerForm
  ```

- [ ] **Step 4 — persist in handleSaveDraft.** In the same file, extend the `dataToSave` object inside `handleSaveDraft` (the block ending at line 140–141). Replace the first occurrence of:
  ```ts
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
      }

      // Import updateFormData here
  ```
  with:
  ```ts
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
        client_presentation_meeting_date: watchedFields.clientPresentationDate || null,
        second_meeting_date: watchedFields.secondMeetingDate || null,
      }

      // Import updateFormData here
  ```

- [ ] **Step 5 — persist in handleCreateDraft.** In the same file, extend the `dataToSave` object inside `handleCreateDraft` (the block ending at line 201–202). Replace the second occurrence of:
  ```ts
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
      }

      // Save the form data
  ```
  with:
  ```ts
        creative_deadline: watchedFields.creativeDeadline || null,
        internal_deadline: watchedFields.internalDeadline || null,
        client_deadline: watchedFields.clientDeadline || null,
        client_presentation_meeting_date: watchedFields.clientPresentationDate || null,
        second_meeting_date: watchedFields.secondMeetingDate || null,
      }

      // Save the form data
  ```

- [ ] **Step 6 — render the inputs.** In the same file, insert a new "פגישות עם הלקוח" section immediately after the closing `</div>` of the דדליינים section and before the Submit Buttons block. Replace (currently lines 691–695):
  ```tsx
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col md:flex-row justify-center gap-4 pt-6">
  ```
  with:
  ```tsx
            </div>
          </div>

          {/* פגישות עם הלקוח (תאריכים ידניים לתזכורות יום לפני) */}
          <div className="mb-8">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">
              פגישות עם הלקוח
            </h2>

            <div className="mb-6">
              <label htmlFor="clientPresentationDate" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                תאריך פגישת הצגה ללקוח
                <span className="text-xs text-gray-500 font-normal mr-2">(תישלח תזכורת יום לפני)</span>
              </label>
              <input
                id="clientPresentationDate"
                type="date"
                {...register('clientPresentationDate')}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="secondMeetingDate" className="block text-sm md:text-base font-semibold text-gray-700 mb-2">
                תאריך פגישה שנייה
                <span className="text-xs text-gray-500 font-normal mr-2">(תישלח תזכורת יום לפני)</span>
              </label>
              <input
                id="secondMeetingDate"
                type="date"
                {...register('secondMeetingDate')}
                className="w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col md:flex-row justify-center gap-4 pt-6">
  ```

- [ ] **Step 7 (verify — tsc):** `npx tsc --noEmit` must pass. (Confirms `clientPresentationDate`/`secondMeetingDate` are known to the form type and `client_presentation_meeting_date` etc. are accepted by `updateFormData`'s `Partial<InnerMeetingForm>` param.)
- [ ] **Step 8 (verify — manual):** `npm run dev`, open `http://localhost:3000/inner-meeting`, scroll to the new "פגישות עם הלקוח" section, set both dates, click "שמור להמשך" (name the draft), then confirm persistence:
  ```bash
  node -e "const {createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env.local'});const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});s.from('inner_meeting_forms').select('client_presentation_meeting_date,second_meeting_date').order('updated_at',{ascending:false}).limit(1).then(r=>console.log(r.error?r.error.message:r.data))"
  ```
  Expect the two dates you just entered to be printed.
- [ ] **Step 9 (commit):**
  ```bash
  git add src/types/inner-meeting.ts src/lib/inner-meeting/types.ts src/components/inner-meeting/InnerMeetingForm.tsx
  git commit -m "$(cat <<'EOF'
Phase 2: inner-meeting form — manual client-presentation + second-meeting date inputs

Two optional yyyy-mm-dd date fields entered by the account manager, synced on
load and persisted via updateFormData into the new inner_meeting_forms columns.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Task 3 — Extend the cron with "day before meeting" reminders

> Consumes `getEventRecipients` / `NotificationEvent` from `src/lib/notifications/recipients.ts` (Phase 1). Do not start until that file exists.

**Files:** `src/app/api/cron/reminders/route.ts`

- [ ] **Step 1 — imports + Israel-TZ "tomorrow" helper.** At the top of the file, add the notifications import next to the existing imports (after line 7), and add the Israel-TZ helpers right after `hoursUntil` (after line 47). Replace (lines 4–7):
  ```ts
  import {
    countBusinessDaysBetween,
    isOlderThanNBusinessDays,
  } from '@/lib/businessDays'
  ```
  with:
  ```ts
  import {
    countBusinessDaysBetween,
    isOlderThanNBusinessDays,
  } from '@/lib/businessDays'
  import {
    getEventRecipients,
    type NotificationEvent,
  } from '@/lib/notifications/recipients'
  ```
  Then replace (lines 44–47):
  ```ts
  function hoursUntil(isoDate: string): number {
    const deadline = new Date(`${isoDate}T23:59:59`)
    return (deadline.getTime() - Date.now()) / 3_600_000
  }
  ```
  with:
  ```ts
  function hoursUntil(isoDate: string): number {
    const deadline = new Date(`${isoDate}T23:59:59`)
    return (deadline.getTime() - Date.now()) / 3_600_000
  }

  /**
   * Today's calendar date in Israel (Asia/Jerusalem), as `yyyy-mm-dd`.
   * The cron fires at 08:00 UTC = 10:00/11:00 Israel, so "today in Israel"
   * is unambiguous. Uses the same Asia/Jerusalem convention as the brief
   * views (src/app/briefs/[token]/page.tsx).
   */
  function israelYmd(date: Date = new Date()): string {
    // en-CA gives ISO-style yyyy-mm-dd.
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  }

  /**
   * "Tomorrow" = 1 calendar day after today-in-Israel, as `yyyy-mm-dd`.
   * NOTE: calendar-day by default (business-day variant intentionally not
   * used here — client meetings are scheduled on any weekday).
   */
  function israelTomorrowYmd(): string {
    const now = new Date()
    // Anchor to Israel-local midnight, then add 24h, then re-read in Israel TZ.
    const israelToday = israelYmd(now)
    const tomorrow = new Date(`${israelToday}T12:00:00+02:00`)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return israelYmd(tomorrow)
  }
  ```

- [ ] **Step 2 — extend the `WebhookReminder` union.** In the same file, add a third variant to the union (after line 167). Replace:
  ```ts
    | {
        kind: 'upcoming_deadline'
        form_id: string
        share_token: string
        client_name: string | null
        deadline_type: 'creative' | 'internal' | 'client'
        deadline_date: string
        hours_until: number
        last_editor_email: string | null
      }
  ```
  with:
  ```ts
    | {
        kind: 'upcoming_deadline'
        form_id: string
        share_token: string
        client_name: string | null
        deadline_type: 'creative' | 'internal' | 'client'
        deadline_date: string
        hours_until: number
        last_editor_email: string | null
      }
    | {
        kind: 'meeting_day_before'
        form_id: string
        share_token: string
        client_name: string | null
        meeting_type: 'client_presentation' | 'second_meeting'
        meeting_date: string
        canva_edit_url: string | null
        recipients: string[]
      }
  ```

- [ ] **Step 3 — add check block #4.** In the same file, insert a new reminder block right after block #3 closes and before the batch-send comment (after line 429, before line 431 `// Native batch for #2 + #3`). Insert:
  ```ts

    // 4. Client meetings happening TOMORROW (Israel TZ) → dedicated emails.
    //    Two independent meeting dates on the kickoff doc, each with its own
    //    "reminder sent" stamp so we notify exactly once. Recipients come from
    //    getEventRecipients() (Phase-1 policy: includes ROEI/SHARON/NOA and the
    //    NOTIFICATIONS_TEST_MODE override). We stamp *_reminder_sent_at and mail
    //    each meeting separately so the two don't share a fate.
    const meetingReminderResults: Array<{
      inner_form_id: string
      form_id: string
      meeting_type: 'client_presentation' | 'second_meeting'
      meeting_date: string
      delivery: 'sent' | 'failed'
      recipients: number
      error?: string
    }> = []
    {
      const tomorrow = israelTomorrowYmd()
      const { sendToManagement } = await import('@/lib/gmail/management')

      // Each config = one meeting kind: its date column, its "sent" stamp,
      // and the notification event that resolves recipients.
      const meetingConfigs: Array<{
        dateCol: 'client_presentation_meeting_date' | 'second_meeting_date'
        sentCol: 'client_presentation_reminder_sent_at' | 'second_meeting_reminder_sent_at'
        type: 'client_presentation' | 'second_meeting'
        event: NotificationEvent
        heTitle: string
      }> = [
        {
          dateCol: 'client_presentation_meeting_date',
          sentCol: 'client_presentation_reminder_sent_at',
          type: 'client_presentation',
          event: 'client_presentation_day_before',
          heTitle: 'פגישת הצגה ללקוח',
        },
        {
          dateCol: 'second_meeting_date',
          sentCol: 'second_meeting_reminder_sent_at',
          type: 'second_meeting',
          event: 'second_meeting_day_before',
          heTitle: 'פגישה שנייה',
        },
      ]

      for (const cfg of meetingConfigs) {
        const { data: rows } = await supabase
          .from('inner_meeting_forms')
          .select(
            `id, form_id, client_name, ${cfg.dateCol}, ${cfg.sentCol}, canva_edit_url, forms(share_token)`,
          )
          .eq(cfg.dateCol, tomorrow)
          .is(cfg.sentCol, null)

        for (const row of (rows ?? []) as Array<Record<string, unknown> & {
          id: string
          form_id: string
          client_name: string | null
          canva_edit_url: string | null
          forms: { share_token: string } | { share_token: string }[] | null
        }>) {
          const formMeta = Array.isArray(row.forms) ? row.forms[0] : row.forms
          const shareToken = formMeta?.share_token ?? ''
          const meetingDate = (row[cfg.dateCol] as string | null) ?? tomorrow
          const canvaEditUrl = (row.canva_edit_url as string | null) ?? null
          const recipients = getEventRecipients(cfg.event)

          webhookReminders.push({
            kind: 'meeting_day_before',
            form_id: row.form_id,
            share_token: shareToken,
            client_name: row.client_name,
            meeting_type: cfg.type,
            meeting_date: meetingDate,
            canva_edit_url: canvaEditUrl,
            recipients,
          })

          if (recipients.length === 0) {
            meetingReminderResults.push({
              inner_form_id: row.id,
              form_id: row.form_id,
              meeting_type: cfg.type,
              meeting_date: meetingDate,
              delivery: 'failed',
              recipients: 0,
              error: 'no_recipients',
            })
            continue
          }

          const subject = `תזכורת: ${cfg.heTitle} מחר${
            row.client_name ? ` — ${row.client_name}` : ''
          } · Leaders`
          const html = buildMeetingReminderHtml({
            heTitle: cfg.heTitle,
            clientName: row.client_name,
            meetingDate,
            canvaEditUrl,
            formLink: `${appBaseUrl()}/inner-meeting?form=${shareToken}`,
          })

          try {
            const result = await sendToManagement({ subject, html, to: recipients })
            if (result.sent > 0) {
              await supabase
                .from('inner_meeting_forms')
                .update({ [cfg.sentCol]: new Date().toISOString() })
                .eq('id', row.id)
            }
            meetingReminderResults.push({
              inner_form_id: row.id,
              form_id: row.form_id,
              meeting_type: cfg.type,
              meeting_date: meetingDate,
              delivery: result.sent > 0 ? 'sent' : 'failed',
              recipients: recipients.length,
              ...(result.sent === 0 ? { error: 'send_failed' } : {}),
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error(`[reminders] meeting mail failed for ${row.id}:`, msg)
            meetingReminderResults.push({
              inner_form_id: row.id,
              form_id: row.form_id,
              meeting_type: cfg.type,
              meeting_date: meetingDate,
              delivery: 'failed',
              recipients: recipients.length,
              error: msg,
            })
          }
        }
      }
    }
  ```
  Note: `meeting_day_before` items are pushed into `webhookReminders` **only for the digest listing** (so they show up in the mgmt digest table). They do **not** rely on the digest's `sendToManagement` batch for delivery — each meeting is emailed to its own `getEventRecipients` list right here, then stamped. The digest at line 431 still fires for `stale_inner_meeting_draft` + `upcoming_deadline` as before, and now also lists the meeting reminders.

- [ ] **Step 4 — surface results + a dedicated HTML builder.** In the same file, add `meeting_reminders` to the JSON response and add the `buildMeetingReminderHtml` function. First, replace the return block's closing (lines 463–472):
  ```ts
      digest_mail: {
        status: mailDelivery,
        count: webhookReminders.length,
        by_kind: webhookReminders.reduce<Record<string, number>>((acc, r) => {
          acc[r.kind] = (acc[r.kind] ?? 0) + 1
          return acc
        }, {}),
        reminders: webhookReminders,
      },
    })
  }
  ```
  with:
  ```ts
      digest_mail: {
        status: mailDelivery,
        count: webhookReminders.length,
        by_kind: webhookReminders.reduce<Record<string, number>>((acc, r) => {
          acc[r.kind] = (acc[r.kind] ?? 0) + 1
          return acc
        }, {}),
        reminders: webhookReminders,
      },
      meeting_reminders: {
        total: meetingReminderResults.length,
        sent: meetingReminderResults.filter((r) => r.delivery === 'sent').length,
        failed: meetingReminderResults.filter((r) => r.delivery === 'failed').length,
        details: meetingReminderResults,
      },
    })
  }

  /* ────────────────────────────────────────────────────────────────────
   * Meeting "day before" reminder — Hebrew HTML. Includes the Canva edit
   * link when the deck has been imported (item 2 of the shared contract).
   * ──────────────────────────────────────────────────────────────────── */
  function buildMeetingReminderHtml(params: {
    heTitle: string
    clientName: string | null
    meetingDate: string
    canvaEditUrl: string | null
    formLink: string
  }): string {
    const { heTitle, clientName, meetingDate, canvaEditUrl, formLink } = params
    const prettyDate = (() => {
      try {
        return new Date(`${meetingDate}T12:00:00+02:00`).toLocaleDateString('he-IL', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Asia/Jerusalem',
        })
      } catch {
        return meetingDate
      }
    })()

    const canvaBlock = canvaEditUrl
      ? `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 16px">
  <a href="${esc(canvaEditUrl)}" target="_blank" style="display:inline-block;background-color:#8b3dff;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 40px;border-radius:8px;">פתח מצגת ב-Canva</a>
  </td></tr></table>`
      : `<p style="font-size:13px;color:#888;text-align:center;margin:0 0 16px;">אין קישור Canva למצגת עדיין.</p>`

    return `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:'Heebo',Arial,sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;">
      <p style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin:0 0 12px;">Leaders × OS · תזכורת פגישה</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">מחר: ${esc(heTitle)}${
        clientName ? ` — ${esc(clientName)}` : ''
      }</h1>
      <p style="font-size:15px;color:#444;margin:0 0 24px;">התאריך: <strong>${esc(prettyDate)}</strong></p>
      ${canvaBlock}
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 8px">
        <a href="${esc(formLink)}" target="_blank" style="display:inline-block;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 40px;border-radius:8px;">פתח מסמך התנעה</a>
      </td></tr></table>
      <hr style="border:none;border-top:1px solid #e8e5dc;margin:24px 0;">
      <p style="font-size:11px;color:#888;margin:0;">נוצר ב-${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} · Leaders × OS</p>
    </div></body></html>`
  }
  ```

- [ ] **Step 5 — list meeting reminders in the digest table.** In `buildRemindersDigestHtml`, add a section that lists the `meeting_day_before` items. Replace (lines 525–534):
  ```ts
        ${upcoming.length === 0 ? '' : `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 12px;color:#1a1a2e;">דדליינים ב-48 השעות הקרובות (${upcoming.length})</h2>
        <table style="width:100%;border-collapse:collapse;background:#fafaf7;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead><tr style="background:#f5f3ef;">
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">לקוח</th>
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">סוג דדליין</th>
            <th style="padding:8px 12px;font-size:11px;text-align:left;font-weight:700;color:#666;letter-spacing:.05em;">בעוד</th>
          </tr></thead>
          <tbody>${upcomingRows}</tbody>
        </table>`}
  ```
  with:
  ```ts
        ${upcoming.length === 0 ? '' : `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 12px;color:#1a1a2e;">דדליינים ב-48 השעות הקרובות (${upcoming.length})</h2>
        <table style="width:100%;border-collapse:collapse;background:#fafaf7;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead><tr style="background:#f5f3ef;">
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">לקוח</th>
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">סוג דדליין</th>
            <th style="padding:8px 12px;font-size:11px;text-align:left;font-weight:700;color:#666;letter-spacing:.05em;">בעוד</th>
          </tr></thead>
          <tbody>${upcomingRows}</tbody>
        </table>`}

        ${meetings.length === 0 ? '' : `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 12px;color:#1a1a2e;">פגישות מחר (${meetings.length})</h2>
        <table style="width:100%;border-collapse:collapse;background:#fafaf7;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          <thead><tr style="background:#f5f3ef;">
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">לקוח</th>
            <th style="padding:8px 12px;font-size:11px;text-align:right;font-weight:700;color:#666;letter-spacing:.05em;">סוג פגישה</th>
            <th style="padding:8px 12px;font-size:11px;text-align:left;font-weight:700;color:#666;letter-spacing:.05em;">Canva</th>
          </tr></thead>
          <tbody>${meetingRows}</tbody>
        </table>`}
  ```
  Then, in the same function, add the `meetings` filter + `meetingRows` builder next to the existing `stale`/`upcoming` ones. Replace (lines 485–487):
  ```ts
    const upcoming = reminders.filter((r) => r.kind === 'upcoming_deadline') as Array<
      Extract<AnyReminder, { kind: 'upcoming_deadline' }>
    >
  ```
  with:
  ```ts
    const upcoming = reminders.filter((r) => r.kind === 'upcoming_deadline') as Array<
      Extract<AnyReminder, { kind: 'upcoming_deadline' }>
    >
    const meetings = reminders.filter((r) => r.kind === 'meeting_day_before') as Array<
      Extract<AnyReminder, { kind: 'meeting_day_before' }>
    >
    const meetingRows = meetings
      .map(
        (r) => `<tr>
          <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #eee;">${esc(r.client_name || '—')}</td>
          <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #eee;">${esc(
            r.meeting_type === 'client_presentation' ? 'הצגה ללקוח' : 'פגישה שנייה',
          )}</td>
          <td style="padding:8px 12px;font-size:13px;text-align:left;border-bottom:1px solid #eee;">${
            r.canva_edit_url ? `<a href="${esc(r.canva_edit_url)}" style="color:#8b3dff;">פתח</a>` : '—'
          }</td>
        </tr>`,
      )
      .join('')
  ```

- [ ] **Step 6 (verify — tsc):** `npx tsc --noEmit` must pass. This confirms `getEventRecipients`/`NotificationEvent` resolve, the `meeting_day_before` variant is exhaustively handled in the digest, and the Supabase select typing is accepted.
- [ ] **Step 7 (verify — manual, no send):** Seed a test row whose `client_presentation_meeting_date` == tomorrow-in-Israel, run the cron with test mode on so only the CTO could ever receive mail, and inspect the JSON (`meeting_reminders` + the stamped `*_reminder_sent_at`):
  ```bash
  # Compute tomorrow (Israel) and stamp it onto the most-recent inner_meeting_form, clearing its sent flag.
  node -e "
  const {createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env.local'});
  const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const t=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'})+'T12:00:00+02:00');t.setDate(t.getDate()+1);
  const ymd=t.toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
  (async()=>{const {data}=await s.from('inner_meeting_forms').select('id').order('updated_at',{ascending:false}).limit(1);
   if(!data||!data[0]){console.log('no rows — create a draft first');return;}
   const {error}=await s.from('inner_meeting_forms').update({client_presentation_meeting_date:ymd,client_presentation_reminder_sent_at:null}).eq('id',data[0].id);
   console.log(error?error.message:('seeded row '+data[0].id+' -> '+ymd));})();
  "
  # Start dev server in another shell: npm run dev
  # Then hit the cron with test mode so no real recipient is used:
  NOTIFICATIONS_TEST_MODE=true NOTIFICATIONS_TEST_RECIPIENT=cto@ldrsgroup.com \
    curl -s http://localhost:3000/api/cron/reminders | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify(j.meeting_reminders,null,2))})"
  ```
  Expect `meeting_reminders.total >= 1` with `delivery: "sent"` (test mode routes the mail to CTO only), and a follow-up query showing `client_presentation_reminder_sent_at` is now stamped (so a second run yields `total: 0`):
  ```bash
  node -e "const {createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env.local'});const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});s.from('inner_meeting_forms').select('id,client_presentation_reminder_sent_at').not('client_presentation_reminder_sent_at','is',null).order('updated_at',{ascending:false}).limit(1).then(r=>console.log(r.error?r.error.message:r.data))"
  ```
  (If `NOTIFICATIONS_TEST_MODE` env is not yet wired because Phase 1 hasn't added it to `getEventRecipients`, the block still stamps and returns JSON; confirm the recipients array in the JSON contains only allowed addresses — never `eran@ldrsgroup.com`.)
- [ ] **Step 8 (commit):**
  ```bash
  git add src/app/api/cron/reminders/route.ts
  git commit -m "$(cat <<'EOF'
Phase 2: cron — "day before" reminders for client-presentation + second meetings

New check #4: finds inner_meeting_forms whose client_presentation_meeting_date /
second_meeting_date == tomorrow (Israel TZ) with the reminder not yet sent, emails
getEventRecipients() for the matching event (including canva_edit_url when present),
then stamps *_reminder_sent_at so each meeting is notified exactly once.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

### Notes / decisions grounded in the real code
- The cron had **no** Israel-TZ helper (block #3 used UTC `toISOString().slice(0,10)`); this phase introduces `israelYmd()` / `israelTomorrowYmd()` using the repo's established `timeZone: 'Asia/Jerusalem'` convention (`src/app/briefs/[token]/page.tsx`, `OutcomeActions.tsx`). The cron fires at `0 8 * * *` UTC (per `vercel.json`) = 10:00/11:00 Israel, so "today/tomorrow in Israel" is unambiguous.
- **Calendar-day** default per spec; business-day variant noted in code comments but intentionally not applied (client meetings can be any weekday).
- Meeting emails are sent **per-meeting** via `sendToManagement({ to: getEventRecipients(event) })` and stamped only when `result.sent > 0`, so a transient Gmail failure leaves `*_reminder_sent_at` null and the next daily run retries. The two dates have **independent** sent-stamps.
- `getEventRecipients` (Phase 1) already applies the `NOTIFICATIONS_TEST_MODE` override and the ERAN hard-block, so this phase does not re-implement recipient policy — it passes the resolved list straight into `sendToManagement`'s `to:` override, which additionally re-filters ERAN via `getManagementRecipients`'s blocklist when `to` is used only through `sendGmailEmail` (defence in depth).
- `canva_edit_url` is read defensively; the migration adds it `IF NOT EXISTS` so this phase compiles/runs regardless of whether the Canva phase has merged. When null, the email shows "אין קישור Canva למצגת עדיין".

## Phase 3 — Canva Connect integration + Item 2 (import our generated deck into Canva, store edit link on the kickoff doc)

### Files

**Create:**
- `supabase/migrations/20260702_canva_integration.sql` — `canva_tokens` table + `canva_*` columns + `linked_deck_document_id` on `inner_meeting_forms`.
- `src/lib/canva/oauth.ts` — PKCE authorize URL, token exchange, valid-access-token with single-use refresh rotation.
- `src/lib/canva/client.ts` — `importDesignFromUrl` + `waitForUrlImport` (poll).
- `src/app/api/canva/oauth/start/route.ts` — GET: generate PKCE + state, stash in httpOnly cookie, 302 to authorize URL.
- `src/app/api/canva/oauth/callback/route.ts` — GET: verify state cookie, exchange code, upsert `canva_tokens`, 302 to `/dashboard?canva=connected`.
- `src/app/api/canva/import/route.ts` — POST: deck `documentId` → export PDF → public Drive upload → import to Canva → write `canva_*` onto the linked `inner_meeting_forms` row.
- `src/components/canva/CanvaDeckButton.tsx` — client button "פתח/צור מצגת ב-Canva".

**Modify:**
- `src/app/preview/[id]/page.tsx` (lines 5–9 add import; lines 155–169 header actions — add `<CanvaDeckButton>` next to "הורד PDF") — mount the button on the deck preview.

### Interfaces (produces / consumes)

- **Produces (canonical shared names):** `src/lib/canva/oauth.ts` → `getAuthorizeUrl(state, codeChallenge)`, `exchangeCodeForToken(code, codeVerifier)`, `getValidAccessToken()`, type `CanvaTokenResponse`. `src/lib/canva/client.ts` → `importDesignFromUrl({title,url,mimeType?})`, `waitForUrlImport(jobId)`. DB table `canva_tokens`; columns on `inner_meeting_forms`: `linked_deck_document_id`, `canva_design_id`, `canva_edit_url`, `canva_view_url`, `canva_link_updated_at`.
- **Consumes (existing):** `src/lib/playwright/pdf.ts` (`generateReactPdf`, `generateMultiPagePdf`, `presentationToHtmlSlides` via `@/lib/presentation/ast-to-html`) for deck→PDF; `src/lib/google-drive/client.ts` `uploadBufferToDriveFolder` + `DRIVE_ANCHORS.BRIEFS_SENT` from `src/lib/google-drive/client-folders.ts` for the PUBLIC Drive URL; `src/lib/supabase/server.ts` `createServiceClient` and `@supabase/supabase-js` service client; `src/lib/auth/dev-mode.ts` (`isDevMode`, `DEV_AUTH_USER`).
- **Downstream (Phase 4/5 consume this phase):** the deck-approval flow reads `inner_meeting_forms.linked_deck_document_id` + `canva_edit_url`. The linkage row is written here when import runs; other phases must set `linked_deck_document_id` too (item 2 columns are the contract).

### SQL migration

```sql
-- supabase/migrations/20260702_canva_integration.sql
-- Phase 3 — Canva Connect: single connected service-account token row +
-- kickoff-doc columns that hold the imported deck's Canva links.
-- Idempotent: safe to re-run.

-- 1. canva_tokens — ONE row (single connected Canva service account).
--    Refresh tokens are single-use/rotating; getValidAccessToken() persists
--    the NEW refresh_token on every refresh.
CREATE TABLE IF NOT EXISTS canva_tokens (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email             TEXT,
  refresh_token             TEXT NOT NULL,
  access_token              TEXT,
  access_token_expires_at   TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Item-2 columns on the kickoff doc: link the deck + store its Canva links.
ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS client_presentation_meeting_date        DATE,
  ADD COLUMN IF NOT EXISTS second_meeting_date                     DATE,
  ADD COLUMN IF NOT EXISTS client_presentation_reminder_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_meeting_reminder_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_deck_document_id                 UUID,
  ADD COLUMN IF NOT EXISTS canva_design_id                         TEXT,
  ADD COLUMN IF NOT EXISTS canva_edit_url                          TEXT,
  ADD COLUMN IF NOT EXISTS canva_view_url                          TEXT,
  ADD COLUMN IF NOT EXISTS canva_link_updated_at                   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inner_meeting_linked_deck
  ON inner_meeting_forms (linked_deck_document_id)
  WHERE linked_deck_document_id IS NOT NULL;
```

> Note: this migration also creates the meeting-date + reminder columns from the shared contract (item 2). If Phase 1/2 already added a subset, `ADD COLUMN IF NOT EXISTS` makes this a no-op for those. This phase only *reads/writes* the `canva_*` + `linked_deck_document_id` columns; the meeting-date columns are declared here so downstream phases have them.

---

### Task 1 — Migration for `canva_tokens` + kickoff-doc columns

**Files:** Create `supabase/migrations/20260702_canva_integration.sql`.

- [ ] Step 1: Create the file with the exact SQL from the "SQL migration" block above.
- [ ] Step 2 (verify — SQL is syntactically applicable): idempotency dry-check locally without a DB, and confirm the file is well-formed:
```bash
grep -c "IF NOT EXISTS" /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform/supabase/migrations/20260702_canva_integration.sql
# expect >= 11 (1 table + 9 columns + 1 index)
```
- [ ] Step 3 (verify — apply): if the Supabase MCP is authenticated, run the file via `apply_migration`; otherwise the user pastes it into the SQL editor at `https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new`. Confirm with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'inner_meeting_forms'
  AND column_name IN ('linked_deck_document_id','canva_design_id','canva_edit_url','canva_view_url','canva_link_updated_at');
-- expect 5 rows
SELECT to_regclass('public.canva_tokens'); -- expect 'canva_tokens'
```
- [ ] Step 4 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git checkout -b phase3-canva 2>/dev/null || git checkout phase3-canva
git add supabase/migrations/20260702_canva_integration.sql && git commit -m "Phase 3: canva_tokens table + canva_* columns on inner_meeting_forms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 — `src/lib/canva/oauth.ts` (PKCE + token + single-use refresh rotation)

**Files:** Create `src/lib/canva/oauth.ts`.

- [ ] Step 1: Write the file. Real fetch code for authorize URL + token endpoint; PKCE helpers via `node:crypto`; `getValidAccessToken()` reads the single `canva_tokens` row, refreshes when expired, and **persists the rotated refresh_token**.
```ts
// src/lib/canva/oauth.ts
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

/**
 * Canva Connect OAuth (single connected service account).
 *
 * Endpoints (verbatim from the Canva Connect API):
 *   authorize : GET  https://www.canva.com/api/oauth/authorize
 *   token     : POST https://api.canva.com/rest/v1/oauth/token
 *               (Authorization: Basic base64(client_id:client_secret),
 *                Content-Type: application/x-www-form-urlencoded)
 *
 * Access token TTL is 14400s. The refresh token is single-use / rotating —
 * every refresh returns a NEW refresh_token that we MUST persist, or the next
 * refresh 400s. getValidAccessToken() handles that rotation.
 */

const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize'
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
const DEFAULT_SCOPES = 'design:content:write design:meta:read design:content:read'
// Refresh a bit early so an in-flight import never races the 14400s expiry.
const EXPIRY_SKEW_MS = 60_000

export interface CanvaTokenResponse {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number // seconds — 14400
  scope?: string
}

function clientId(): string {
  const v = process.env.CANVA_CLIENT_ID
  if (!v) throw new Error('CANVA_CLIENT_ID is not set')
  return v
}
function clientSecret(): string {
  const v = process.env.CANVA_CLIENT_SECRET
  if (!v) throw new Error('CANVA_CLIENT_SECRET is not set')
  return v
}
function redirectUri(): string {
  return (
    process.env.CANVA_REDIRECT_URI ||
    'https://leaders-platform.vercel.app/api/canva/oauth/callback'
  )
}
function scopes(): string {
  return process.env.CANVA_SCOPES || DEFAULT_SCOPES
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/* ---------------- PKCE helpers (S256) ---------------- */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** code_verifier = base64url(randomBytes(96)) per the shared contract. */
export function generateCodeVerifier(): string {
  return b64url(crypto.randomBytes(96))
}

/** code_challenge = base64url(sha256(verifier)). */
export function generateCodeChallenge(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest())
}

export function generateState(): string {
  return b64url(crypto.randomBytes(24))
}

/* ---------------- Authorize ---------------- */

export function getAuthorizeUrl(state: string, codeChallenge: string): string {
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId())
  u.searchParams.set('redirect_uri', redirectUri())
  u.searchParams.set('scope', scopes())
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

/* ---------------- Token endpoint ---------------- */

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')
}

async function postToken(params: Record<string, string>): Promise<CanvaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Canva token ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as CanvaTokenResponse
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<CanvaTokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(),
  })
}

/**
 * Persist a token response as the single canva_tokens row. We keep exactly
 * one row (single connected service account) — upsert onto the newest id or
 * insert the first row.
 */
export async function persistTokens(
  tokens: CanvaTokenResponse,
  accountEmail?: string | null,
): Promise<void> {
  const sb = service()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const { data: existing } = await sb
    .from('canva_tokens')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const row = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    ...(accountEmail !== undefined ? { account_email: accountEmail } : {}),
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await sb.from('canva_tokens').update(row).eq('id', existing.id)
    if (error) throw new Error(`persistTokens update failed: ${error.message}`)
  } else {
    const { error } = await sb.from('canva_tokens').insert(row)
    if (error) throw new Error(`persistTokens insert failed: ${error.message}`)
  }
}

/**
 * Return a currently-valid access token, refreshing (and rotating the
 * single-use refresh_token) if the stored one is expired/near-expiry.
 */
export async function getValidAccessToken(): Promise<string> {
  const sb = service()
  const { data: rowData, error } = await sb
    .from('canva_tokens')
    .select('id, refresh_token, access_token, access_token_expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`canva_tokens read failed: ${error.message}`)
  if (!rowData) {
    throw new Error('Canva is not connected — visit /api/canva/oauth/start first')
  }

  const notExpired =
    rowData.access_token &&
    rowData.access_token_expires_at &&
    new Date(rowData.access_token_expires_at).getTime() - EXPIRY_SKEW_MS > Date.now()
  if (notExpired) return rowData.access_token as string

  // Refresh. Canva rotates the refresh_token — persist the NEW one.
  const refreshed = await postToken({
    grant_type: 'refresh_token',
    refresh_token: rowData.refresh_token as string,
  })
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: upErr } = await sb
    .from('canva_tokens')
    .update({
      refresh_token: refreshed.refresh_token,
      access_token: refreshed.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowData.id)
  if (upErr) throw new Error(`canva_tokens rotate failed: ${upErr.message}`)
  return refreshed.access_token
}
```
- [ ] Step 2 (verify): `cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npx tsc --noEmit`
- [ ] Step 3 (verify — authorize URL shape, no network): 
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && CANVA_CLIENT_ID=abc CANVA_REDIRECT_URI=https://x/cb npx tsx -e "import('./src/lib/canva/oauth.ts').then(m=>{const v=m.generateCodeVerifier();const c=m.generateCodeChallenge(v);console.log(m.getAuthorizeUrl('st', c))})"
# expect a URL on www.canva.com/api/oauth/authorize with code_challenge_method=S256 and scope=design:content:write...
```
- [ ] Step 4 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git add src/lib/canva/oauth.ts && git commit -m "Phase 3: Canva OAuth (PKCE S256, single-use refresh rotation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 — `src/lib/canva/client.ts` (url-import + poll)

**Files:** Create `src/lib/canva/client.ts`.

- [ ] Step 1: Write the file. `importDesignFromUrl` POSTs to url-imports; `waitForUrlImport` polls the job until success and returns `{designId, editUrl, viewUrl}`. Note the 30-day `edit_url` expiry; we keep `canva_design_id` so a fresh edit URL can be re-issued later.
```ts
// src/lib/canva/client.ts
import { getValidAccessToken } from './oauth'

/**
 * Canva url-import: pull our already-generated deck (a PUBLIC Drive PDF/PPTX
 * URL) into a new Canva design.
 *
 * Endpoints (verbatim):
 *   POST https://api.canva.com/rest/v1/url-imports   { title, url, mime_type? }
 *   GET  https://api.canva.com/rest/v1/url-imports/{jobId}
 *
 * NOTE: Canva edit_url (deep-link into the editor) expires ~30 days after it
 * is minted. We persist canva_design_id alongside it so a new edit link can be
 * re-issued from the design id when the old one lapses.
 */

const BASE = 'https://api.canva.com/rest/v1'
const POLL_INTERVAL_MS = 2500
const MAX_POLLS = 40 // ~100s ceiling

export interface UrlImportJobResult {
  designId: string
  editUrl: string
  viewUrl: string
}

interface UrlImportJobResponse {
  job: {
    id: string
    status: 'in_progress' | 'success' | 'failed'
    result?: {
      designs?: Array<{
        id: string
        urls?: { edit_url?: string; view_url?: string }
      }>
    }
    error?: { code?: string; message?: string }
  }
}

export async function importDesignFromUrl(args: {
  title: string
  url: string
  mimeType?: string
}): Promise<{ jobId: string }> {
  const accessToken = await getValidAccessToken()
  const body: Record<string, string> = { title: args.title, url: args.url }
  if (args.mimeType) body.mime_type = args.mimeType

  const res = await fetch(`${BASE}/url-imports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Canva url-import create ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = JSON.parse(text) as UrlImportJobResponse
  const jobId = data.job?.id
  if (!jobId) throw new Error(`Canva url-import: no job id in response: ${text.slice(0, 200)}`)
  return { jobId }
}

export async function waitForUrlImport(jobId: string): Promise<UrlImportJobResult> {
  const accessToken = await getValidAccessToken()
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(`${BASE}/url-imports/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Canva url-import poll ${res.status}: ${text.slice(0, 400)}`)
    }
    const data = JSON.parse(text) as UrlImportJobResponse
    const status = data.job?.status
    if (status === 'success') {
      const design = data.job.result?.designs?.[0]
      if (!design?.id) {
        throw new Error(`Canva url-import succeeded but no design returned: ${text.slice(0, 200)}`)
      }
      return {
        designId: design.id,
        editUrl: design.urls?.edit_url ?? `https://www.canva.com/design/${design.id}/edit`,
        viewUrl: design.urls?.view_url ?? `https://www.canva.com/design/${design.id}/view`,
      }
    }
    if (status === 'failed') {
      throw new Error(`Canva url-import failed: ${data.job.error?.message ?? 'unknown error'}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`Canva url-import timed out after ${MAX_POLLS} polls (job ${jobId})`)
}
```
- [ ] Step 2 (verify): `cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npx tsc --noEmit`
- [ ] Step 3 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git add src/lib/canva/client.ts && git commit -m "Phase 3: Canva url-import client (create job + poll to design)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 — OAuth start + callback routes

**Files:** Create `src/app/api/canva/oauth/start/route.ts` and `src/app/api/canva/oauth/callback/route.ts`.

- [ ] Step 1: Write `start` — generate `code_verifier`, `code_challenge`, `state`; stash verifier+state in one httpOnly cookie; 302 to authorize URL.
```ts
// src/app/api/canva/oauth/start/route.ts
import { NextResponse } from 'next/server'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/canva/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cookie holds "<state>.<verifier>" — httpOnly, short-lived, cleared on callback.
const COOKIE = 'canva_pkce'

export async function GET() {
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const state = generateState()

  const res = NextResponse.redirect(getAuthorizeUrl(state, challenge))
  res.cookies.set(COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min to complete the handshake
  })
  return res
}
```
- [ ] Step 2: Write `callback` — verify `state` against the cookie, `exchangeCodeForToken`, `persistTokens`, clear cookie, 302 to `/dashboard?canva=connected`. On error 302 to `/dashboard?canva=error`.
```ts
// src/app/api/canva/oauth/callback/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeForToken, persistTokens } from '@/lib/canva/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COOKIE = 'canva_pkce'

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

export async function GET(request: Request) {
  const base = appBaseUrl()
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const stash = cookieStore.get(COOKIE)?.value

  const fail = (reason: string) => {
    console.warn('[canva-callback]', reason)
    const res = NextResponse.redirect(`${base}/dashboard?canva=error`)
    res.cookies.delete(COOKIE)
    return res
  }

  if (!code || !state) return fail('missing code/state')
  if (!stash) return fail('missing pkce cookie')

  const sep = stash.indexOf('.')
  const cookieState = sep === -1 ? '' : stash.slice(0, sep)
  const verifier = sep === -1 ? '' : stash.slice(sep + 1)
  if (!cookieState || !verifier || cookieState !== state) {
    return fail('state mismatch')
  }

  try {
    const tokens = await exchangeCodeForToken(code, verifier)
    await persistTokens(tokens)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }

  const res = NextResponse.redirect(`${base}/dashboard?canva=connected`)
  res.cookies.delete(COOKIE)
  return res
}
```
- [ ] Step 3 (verify): `cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npx tsc --noEmit`
- [ ] Step 4 (verify — routes registered, cookie set, redirect to Canva): with `npm run dev` running and `CANVA_CLIENT_ID` set in `.env.local`,
```bash
curl -sS -i "http://localhost:3000/api/canva/oauth/start" | grep -iE "^location:|^set-cookie:"
# expect Location: https://www.canva.com/api/oauth/authorize?... and Set-Cookie: canva_pkce=...; HttpOnly
```
- [ ] Step 5 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git add src/app/api/canva/oauth/start/route.ts src/app/api/canva/oauth/callback/route.ts && git commit -m "Phase 3: Canva OAuth start + callback routes (PKCE cookie, token upsert)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 — Import action endpoint `POST /api/canva/import`

**Files:** Create `src/app/api/canva/import/route.ts`.

Flow: auth (dev-mode aware, same pattern as `/api/pdf`) → fetch deck `documents` row → build deck HTML slides exactly like `/api/pdf` (prefer cached `pdf_url` if present, else render) → produce PDF → upload PUBLIC to Drive (`uploadBufferToDriveFolder` shares anyone-reader → `webContentLink`/`webViewLink`) → `importDesignFromUrl` → `waitForUrlImport` → resolve the linked `inner_meeting_forms` row (by `linked_deck_document_id`, else by matching `client_folder` on the deck's folder) and write `canva_design_id/edit_url/view_url/canva_link_updated_at`. Returns the edit URL.

- [ ] Step 1: Write the route.
```ts
// src/app/api/canva/import/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateScreenshotPdf, generateMultiPagePdf } from '@/lib/playwright/pdf'
import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'
import type { Presentation } from '@/types/presentation'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { importDesignFromUrl, waitForUrlImport } from '@/lib/canva/client'
import { isDevMode } from '@/lib/auth/dev-mode'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * POST /api/canva/import  { documentId }
 *
 * Import our generated deck into Canva and stash the edit link on the linked
 * kickoff (inner_meeting_forms) row. Reuses the same deck→PDF path as /api/pdf
 * then uploads that PDF to Drive with PUBLIC read so Canva's url-import can pull
 * it. edit_url expires ~30 days out; canva_design_id is kept for re-issuing.
 */
export async function POST(request: Request) {
  // Auth — allow dev-mode bypass, else require a logged-in Leaders user.
  if (!isDevMode) {
    const supabase = await createSsrClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let documentId: string
  try {
    const body = await request.json()
    documentId = (body?.documentId || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  const sb = service()
  const { data: document, error: docErr } = await sb
    .from('documents')
    .select('id, title, type, data, pdf_url')
    .eq('id', documentId)
    .single()
  if (docErr || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const documentData = (document.data ?? {}) as Record<string, unknown>
  const brandName = (documentData.brandName as string) || document.title || 'Presentation'

  // 1. Produce the deck PDF (mirror /api/pdf slide selection).
  let pdfBuffer: Buffer
  try {
    const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; title?: string } | undefined
    const astPres = documentData._presentation as Presentation | undefined
    const cachedSlides = documentData._cachedSlides as string[] | undefined

    if (htmlPres?.htmlSlides?.length) {
      pdfBuffer = await generateScreenshotPdf(htmlPres.htmlSlides, {
        format: '16:9', title: htmlPres.title || brandName, brandName,
      })
    } else if (astPres?.slides?.length) {
      const pages = presentationToHtmlSlides(astPres, true)
      pdfBuffer = await generateMultiPagePdf(pages, {
        format: '16:9', title: astPres.title || brandName, brandName,
      })
    } else if (cachedSlides?.length) {
      pdfBuffer = await generateMultiPagePdf(cachedSlides, {
        format: '16:9', title: brandName, brandName,
      })
    } else {
      return NextResponse.json(
        { error: 'Deck has no rendered slides yet — generate the PDF first, then import to Canva.' },
        { status: 409 },
      )
    }
  } catch (e) {
    console.error('[canva-import] PDF generation failed:', e)
    return NextResponse.json({ error: `PDF generation failed: ${e instanceof Error ? e.message : e}` }, { status: 500 })
  }

  // 2. Upload PUBLIC to Drive (anyone-reader) → public downloadable URL.
  let publicUrl: string
  try {
    const uploaded = await uploadBufferToDriveFolder({
      folderId: DRIVE_ANCHORS.BRIEFS_SENT,
      fileName: `${brandName} (Canva import).pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    })
    // Canva's url-import needs a direct-download URL. webContentLink is the
    // "download" link; fall back to the uc?export=download form if empty.
    publicUrl = uploaded.downloadLink || `https://drive.google.com/uc?export=download&id=${uploaded.id}`
  } catch (e) {
    console.error('[canva-import] Drive upload failed:', e)
    return NextResponse.json({ error: `Drive upload failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  // 3. Import into Canva + poll for the finished design.
  let result: { designId: string; editUrl: string; viewUrl: string }
  try {
    const { jobId } = await importDesignFromUrl({
      title: brandName,
      url: publicUrl,
      mimeType: 'application/pdf',
    })
    result = await waitForUrlImport(jobId)
  } catch (e) {
    console.error('[canva-import] Canva import failed:', e)
    return NextResponse.json({ error: `Canva import failed: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  // 4. Write the Canva links onto the linked kickoff doc (item 2).
  //    Prefer an explicit linked_deck_document_id; else no-op the write but
  //    still return the links so the deck UI can show them.
  const nowIso = new Date().toISOString()
  let kickoffUpdated = false
  try {
    const { data: linked } = await sb
      .from('inner_meeting_forms')
      .select('id')
      .eq('linked_deck_document_id', documentId)
      .maybeSingle()
    if (linked?.id) {
      await sb
        .from('inner_meeting_forms')
        .update({
          canva_design_id: result.designId,
          canva_edit_url: result.editUrl,
          canva_view_url: result.viewUrl,
          canva_link_updated_at: nowIso,
        })
        .eq('id', linked.id)
      kickoffUpdated = true
    }
  } catch (e) {
    console.warn('[canva-import] kickoff update failed (non-fatal):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    design_id: result.designId,
    edit_url: result.editUrl,
    view_url: result.viewUrl,
    kickoff_updated: kickoffUpdated,
  })
}
```
- [ ] Step 2 (verify): `cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npx tsc --noEmit`
- [ ] Step 3 (verify — behavior, no Canva creds needed for the guard paths): with `npm run dev` and `NEXT_PUBLIC_DEV_MODE=true`,
```bash
# 404 for a bad doc id:
curl -sS -X POST http://localhost:3000/api/canva/import -H 'Content-Type: application/json' -d '{"documentId":"00000000-0000-0000-0000-000000000000"}'
# expect {"error":"Document not found"}
# 409 for a deck with no rendered slides, or (with a real deck id + Canva connected) an edit_url in the JSON.
```
- [ ] Step 4 (verify — DB row after a real import): after importing a deck whose id is in `inner_meeting_forms.linked_deck_document_id`, confirm:
```sql
SELECT canva_design_id, canva_edit_url, canva_link_updated_at
FROM inner_meeting_forms WHERE linked_deck_document_id = '<deckId>';
-- expect the three columns populated
```
- [ ] Step 5 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git add src/app/api/canva/import/route.ts && git commit -m "Phase 3: /api/canva/import — deck PDF -> public Drive -> Canva design, link on kickoff

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 — Deck-UI button "פתח/צור מצגת ב-Canva"

**Files:** Create `src/components/canva/CanvaDeckButton.tsx`; Modify `src/app/preview/[id]/page.tsx` (import at lines 5–9; render in the header actions at lines 155–169).

- [ ] Step 1: Write the button component. First click imports (calls `/api/canva/import`) and shows the returned edit link; subsequent renders open the stored edit URL if provided.
```tsx
// src/components/canva/CanvaDeckButton.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * "פתח/צור מצגת ב-Canva" — imports the generated deck into Canva via
 * /api/canva/import, then reveals the returned edit link. Note: Canva edit
 * links expire ~30 days out; re-clicking re-imports and refreshes the link.
 */
export function CanvaDeckButton({
  documentId,
  initialEditUrl,
}: {
  documentId: string
  initialEditUrl?: string | null
}) {
  const [editUrl, setEditUrl] = useState<string | null>(initialEditUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runImport = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/canva/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || !json?.edit_url) {
        throw new Error(json?.error || 'ייבוא ל-Canva נכשל')
      }
      setEditUrl(json.edit_url as string)
      window.open(json.edit_url as string, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בייבוא ל-Canva')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {editUrl ? (
        <div className="flex items-center gap-2">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">🎨 פתח ב-Canva</Button>
          </a>
          <Button variant="ghost" size="sm" onClick={runImport} disabled={busy}>
            {busy ? '...מרענן' : 'רענן קישור'}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={runImport} disabled={busy}>
          {busy ? '...מייבא ל-Canva' : '🎨 צור מצגת ב-Canva'}
        </Button>
      )}
      {error && <span className="text-xs text-red-600 max-w-[240px] text-left">{error}</span>}
    </div>
  )
}
```
- [ ] Step 2: Import the component in `src/app/preview/[id]/page.tsx`. After line 9 (`import type { Document } from '@/types/database'`), add:
```tsx
import { CanvaDeckButton } from '@/components/canva/CanvaDeckButton'
```
- [ ] Step 3: Render the button in the header actions. Replace the single `<Button ... downloadPdf ...>` block (current lines 155–169) so the download button and the Canva button sit side-by-side. The Canva button only shows for decks (`!isQuote`):
```tsx
          <div className="flex items-center gap-3">
            {!isQuote && <CanvaDeckButton documentId={document.id} />}
            <Button
              variant="primary"
              onClick={downloadPdf}
              disabled={isGenerating}
              className="bg-gradient-to-l from-blue-600 to-purple-600"
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  מייצר PDF...
                </>
              ) : (
                <>📥 הורד PDF</>
              )}
            </Button>
          </div>
```
- [ ] Step 4 (verify): `cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && npx tsc --noEmit`
- [ ] Step 5 (verify — UI renders): with `npm run dev`, open `http://localhost:3000/preview/<deckDocumentId>` (a `type='deck'` document) and confirm the "🎨 צור מצגת ב-Canva" button appears next to "📥 הורד PDF". Clicking it (with Canva connected + a rendered deck) opens the Canva editor in a new tab and shows the edit link.
- [ ] Step 6 (commit):
```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/leaders-platform && git add src/components/canva/CanvaDeckButton.tsx "src/app/preview/[id]/page.tsx" && git commit -m "Phase 3: deck preview 'create in Canva' button wired to /api/canva/import

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Env vars to set (Vercel + `.env.local`)

Not a code task, but required for the phase to function (record in the PR/handoff, do not `echo` into `vercel env add` — use `printf %s`):
- `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`
- `CANVA_REDIRECT_URI=https://leaders-platform.vercel.app/api/canva/oauth/callback`
- `CANVA_SCOPES=design:content:write design:meta:read design:content:read`

One-time connect: visit `/api/canva/oauth/start` while logged in as the service account; on success you land on `/dashboard?canva=connected` and the single `canva_tokens` row is populated. After that `getValidAccessToken()` auto-refreshes and rotates the single-use refresh token on every expiry.

## Phase 4 — Approve action on the creative deck + auto-generate influencer brief DOCUMENT (Item 3)

This phase adds an explicit **approve** action on a `type='deck'` document. On approve it (a) stamps `approved_at`/`approved_by`, and (b) synchronously generates a Hebrew RTL **influencer brief** PDF from the approved deck's `data._stepData`, uploads it to Drive (public read), and persists a new `documents` row with `type='influencer_brief'` and `parent_document_id = deck.id`, exposing its `drive_file_url`/`pdf_url` as a download/send link.

**Assumption (per task brief):** the trigger is an explicit `POST /api/documents/[id]/approve`. If a client-signature-on-deck flow later exists, swap the caller — the generator (`generateInfluencerBrief`) and the DB shape stay identical.

### Grounded facts (from reading the real files)
- Persisted deck data shape: `data.brandName`, `data._extractedData` (`ExtractedBriefData` — brand/budget/audience), and `data._stepData` (shape = `RawProposalResponse['stepData']`, `src/lib/gemini/proposal-agent.ts:384-395`). Influencers are at `data._stepData.influencers.influencers[]`, each `{ name, username, categories[], followers, engagementRate, bio?, profileUrl, profilePicUrl }` (normalized at `proposal-agent.ts:872-885`). Creative at `data._stepData.creative` (`activityTitle`, `activityConcept`, `activityDescription`, `activityApproach[]`, `activityDifferentiator`), deliverables at `data._stepData.deliverables.deliverables[]`, strategy at `data._stepData.strategy`, key messages via `data._stepData.key_insight` + `strategy.strategyPillars`.
- `documents` table has no `approved_at`/`approved_by`/`parent_document_id` today (`src/types/database.ts:100-143`; grep confirmed neither `parent_document_id` nor `influencer_brief` exist anywhere). `DocumentType = 'quote' | 'deck'` (`database.ts:10`).
- PDF: `generateMultiPagePdf(htmlPages: string[], { format:'A4', title, brandName })` (`src/lib/playwright/pdf.ts:182`).
- Drive: `uploadBufferToDriveFolder({ folderId, fileName, mimeType, buffer })` returns `{ id, viewLink, downloadLink }` with anyone-reader permission (`src/lib/google-drive/client.ts:166-204`); `DRIVE_ANCHORS.BRIEFS_SENT` (`src/lib/google-drive/client-folders.ts:29`).
- Auth: `getAuthenticatedUser()` → `{ id, email } | null`, dev-mode aware (`src/lib/auth/api-auth.ts:10`).
- ID: `generateId()` = `crypto.randomUUID()` (`src/lib/utils.ts:39`).
- Service-role Supabase client pattern: `createServiceClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false }})` (`src/app/api/webhooks/salesforce/quote/route.ts:22-28`). We use the service client in the generator so the insert of the influencer_brief row isn't blocked by RLS / dev-mode null user.

### Files
- **Create** `supabase/migrations/20260420_deck_approval_influencer_brief.sql` — adds `approved_at`, `approved_by`, `parent_document_id` to `documents`.
- **Modify** `src/types/database.ts` — extend `DocumentType` union to include `'influencer_brief'` (line 10); add `approved_at` / `approved_by` / `parent_document_id` to the `documents` Row/Insert/Update (lines 100-143).
- **Create** `src/lib/influencer-brief/types.ts` — narrow types for reading `_stepData`.
- **Create** `src/lib/influencer-brief/template.ts` — `renderInfluencerBriefHtml(input)` → Hebrew RTL A4 HTML string.
- **Create** `src/lib/influencer-brief/generate.ts` — `generateInfluencerBrief(deckDocId)` → `{ documentId, pdfUrl }`.
- **Create** `src/app/api/documents/[id]/approve/route.ts` — `POST` approve endpoint.
- **Modify** `src/app/api/documents/[id]/route.ts` — surface `approved_at` / `parent_document_id` and the linked influencer brief on GET so the UI can render a download link (lines 34-59).

### Interfaces (produces / consumes)
- **Produces** (canonical, consumed by Phase 6 — influencer contracts, and by any deck UI):
  - `src/lib/influencer-brief/generate.ts` → `export async function generateInfluencerBrief(deckDocId: string): Promise<{ documentId: string; pdfUrl: string }>`.
  - `POST /api/documents/[id]/approve` → `{ ok: true, approved_at, influencerBrief: { documentId, pdfUrl } }`.
  - DB: `documents.type='influencer_brief'`, `parent_document_id = <deck id>`, `drive_file_url` / `pdf_url` = public brief PDF link.
  - `DocumentType` now includes `'influencer_brief'`.
- **Consumes**: `data._stepData` (proposal-agent shape) + `data._extractedData` / `data.brandName` from the approved deck row; `generateMultiPagePdf` (playwright); `uploadBufferToDriveFolder` + `DRIVE_ANCHORS.BRIEFS_SENT` (Drive); `getAuthenticatedUser` (auth).

### SQL migration (idempotent)
```sql
-- supabase/migrations/20260420_deck_approval_influencer_brief.sql
-- Phase 4: deck approval + influencer-brief document lineage.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS parent_document_id UUID;

-- Lineage: influencer_brief rows point at their parent deck.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_parent_document_id_fkey'
      AND table_name = 'documents'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_parent_document_id_fkey
      FOREIGN KEY (parent_document_id)
      REFERENCES public.documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_parent_document_id_idx
  ON public.documents (parent_document_id);
```

> Note: `documents.type` is a plain `text` column in this DB (pptmaker stores `'quote'`/`'deck'` as text, not a PG enum — see `documents` Insert casting `type as 'quote' | 'deck'` in `src/app/api/documents/route.ts:55`), so no enum ALTER is needed to store `'influencer_brief'`. If a CHECK constraint on `type` exists in your project, drop/rebroaden it in the SQL editor; the seed migration didn't add one.

---

### Task 1 — Migration + type union

**Files:** `supabase/migrations/20260420_deck_approval_influencer_brief.sql` (Create), `src/types/database.ts` (Modify lines 10, 100-143).

- [ ] Step 1: Create `supabase/migrations/20260420_deck_approval_influencer_brief.sql` with the exact SQL from the migration block above.
- [ ] Step 2: In `src/types/database.ts`, widen the `DocumentType` union (line 10):
```ts
export type DocumentType = 'quote' | 'deck' | 'influencer_brief'
```
- [ ] Step 3: In `src/types/database.ts`, add the three columns to the `documents` **Row** (after line 113, before `created_at`):
```ts
          drive_file_url: string | null
          approved_at: string | null
          approved_by: string | null
          parent_document_id: string | null
          created_at: string
```
(replace the existing `drive_file_url: string | null` + `created_at: string` pair in Row, lines 111-112).
- [ ] Step 4: Add the same three optional columns to **Insert** (after `drive_file_url?`) and **Update** (after `drive_file_url?`):
```ts
          approved_at?: string | null
          approved_by?: string | null
          parent_document_id?: string | null
```
- [ ] Step 5: Apply the migration. If the Supabase MCP is authenticated, run its `apply_migration` tool with the file contents; otherwise paste the SQL into the [SQL editor](https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new).
- [ ] Step 6 (verify): `npx tsc --noEmit` passes. Manual check — after applying, run in the SQL editor:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='documents'
  AND column_name IN ('approved_at','approved_by','parent_document_id');
```
Expect 3 rows.
- [ ] Step 7 (commit):
```bash
git checkout -b phase4-influencer-brief
git add supabase/migrations/20260420_deck_approval_influencer_brief.sql src/types/database.ts
git commit -m "$(cat <<'EOF'
Phase 4: migration for deck approval + influencer_brief lineage; widen DocumentType

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 — Influencer-brief read types

**Files:** `src/lib/influencer-brief/types.ts` (Create).

- [ ] Step 1: Create `src/lib/influencer-brief/types.ts`. These mirror the persisted `data._stepData` shape (`proposal-agent.ts:384-395`) but are all-optional so a partially-filled deck still renders:
```ts
// Narrow read-types for the influencer brief generator.
// Source of truth: the deck's persisted `data._stepData` (proposal-agent shape).

export interface DeckInfluencer {
  name: string
  username?: string
  categories?: string[]
  followers?: number
  engagementRate?: number
  bio?: string
  profileUrl?: string
  profilePicUrl?: string
}

export interface DeckStepData {
  brief?: { brandName?: string; brandBrief?: string; brandObjective?: string }
  strategy?: {
    strategyHeadline?: string
    strategyDescription?: string
    strategyPillars?: { title: string; description: string }[]
  }
  creative?: {
    activityTitle?: string
    activityConcept?: string
    activityDescription?: string
    activityApproach?: { title: string; description: string }[]
    activityDifferentiator?: string
  }
  deliverables?: {
    deliverables?: { type: string; quantity?: number; description?: string; purpose?: string }[]
    deliverablesSummary?: string
  }
  key_insight?: { keyInsight?: string; insightSource?: string; insightData?: string }
  influencers?: {
    influencers?: DeckInfluencer[]
    influencerStrategy?: string
    influencerCriteria?: string[]
  }
}

export interface DeckDocData {
  brandName?: string
  _extractedData?: {
    brand?: { name?: string; officialName?: string; industry?: string; background?: string }
    budget?: { amount?: number | null; currency?: string }
  }
  _stepData?: DeckStepData | null
}

export interface InfluencerBriefInput {
  brandName: string
  brandTagline?: string
  data: DeckDocData
}
```
- [ ] Step 2 (verify): `npx tsc --noEmit` passes (types only, no runtime).
- [ ] Step 3 (commit):
```bash
git add src/lib/influencer-brief/types.ts
git commit -m "$(cat <<'EOF'
Phase 4: influencer-brief read types (mirror deck _stepData)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 — Hebrew RTL brief HTML template

**Files:** `src/lib/influencer-brief/template.ts` (Create).

- [ ] Step 1: Create `src/lib/influencer-brief/template.ts`. Returns a single A4 HTML page (the generator wraps it in an array for `generateMultiPagePdf`). Uses the same brand palette as the app (`#212529` ink, `#f2cc0d` accent). Every dynamic string is HTML-escaped.
```ts
import type { InfluencerBriefInput, DeckStepData, DeckInfluencer } from './types'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

function fmtNum(n?: number): string {
  if (!n || n <= 0) return '—'
  return n.toLocaleString('he-IL')
}

function section(title: string, bodyHtml: string): string {
  if (!bodyHtml.trim()) return ''
  return `
    <section class="sec">
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    </section>`
}

function list(items: (string | undefined)[]): string {
  const clean = items.filter((x): x is string => !!x && x.trim().length > 0)
  if (!clean.length) return ''
  return `<ul>${clean.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
}

function influencerCard(inf: DeckInfluencer): string {
  const meta = [
    inf.username ? esc(inf.username) : '',
    (inf.categories && inf.categories.length) ? esc(inf.categories.join(' · ')) : '',
    inf.followers ? `${fmtNum(inf.followers)} עוקבים` : '',
    inf.engagementRate ? `ER ${inf.engagementRate}%` : '',
  ].filter(Boolean).join(' • ')
  return `
    <div class="inf">
      <div class="inf-name">${esc(inf.name || 'משפיען')}</div>
      ${meta ? `<div class="inf-meta">${meta}</div>` : ''}
      ${inf.bio ? `<div class="inf-bio">${esc(inf.bio)}</div>` : ''}
    </div>`
}

export function renderInfluencerBriefHtml(input: InfluencerBriefInput): string {
  const sd: DeckStepData = input.data._stepData || {}
  const creative = sd.creative || {}
  const strategy = sd.strategy || {}
  const deliverables = sd.deliverables?.deliverables || []
  const influencers = sd.influencers?.influencers || []
  const insight = sd.key_insight?.keyInsight
  const objective = sd.brief?.brandObjective

  const keyMessages = [
    strategy.strategyHeadline,
    ...(strategy.strategyPillars || []).map(p => `${p.title} — ${p.description}`),
  ]

  const deliverablesHtml = deliverables.length
    ? `<table class="deliv"><thead><tr><th>סוג תוצר</th><th>כמות</th><th>מטרה</th></tr></thead><tbody>${
        deliverables.map(d => `<tr>
          <td>${esc(d.type)}</td>
          <td class="num">${d.quantity ? esc(d.quantity) : '—'}</td>
          <td>${esc(d.purpose || d.description || '')}</td>
        </tr>`).join('')
      }</tbody></table>${
        sd.deliverables?.deliverablesSummary
          ? `<p class="note">${esc(sd.deliverables.deliverablesSummary)}</p>` : ''
      }`
    : ''

  const influencersHtml = influencers.length
    ? influencers.map(influencerCard).join('')
    : '<p class="note">לא הוגדרו משפיענים בשלב זה.</p>'

  const generatedOn = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Heebo', 'Arial', sans-serif;
    color: #212529; background: #ffffff;
    width: 794px; padding: 56px 60px 72px;
    line-height: 1.6; direction: rtl;
  }
  .head { border-bottom: 3px solid #f2cc0d; padding-bottom: 20px; margin-bottom: 28px; }
  .kicker { font-size: 13px; letter-spacing: 2px; color: #6b7281; font-weight: 700; text-transform: uppercase; }
  h1 { font-size: 32px; font-weight: 800; margin-top: 6px; }
  .sub { color: #6b7281; font-size: 15px; margin-top: 6px; }
  .sec { margin-bottom: 26px; page-break-inside: avoid; }
  .sec h2 {
    font-size: 19px; font-weight: 800; color: #212529;
    padding-inline-start: 12px; border-inline-start: 4px solid #f2cc0d;
    margin-bottom: 12px;
  }
  .sec p { font-size: 15px; color: #343a40; }
  ul { list-style: none; padding: 0; }
  li { font-size: 15px; color: #343a40; padding-inline-start: 20px; position: relative; margin-bottom: 6px; }
  li::before { content: '●'; color: #f2cc0d; position: absolute; inset-inline-start: 0; font-size: 10px; top: 6px; }
  .insight { background: #fcf9e6; border: 1px solid #f2cc0d; border-radius: 12px; padding: 18px 22px; font-size: 16px; font-weight: 600; }
  table.deliv { width: 100%; border-collapse: collapse; font-size: 14px; }
  table.deliv th { background: #212529; color: #fff; text-align: right; padding: 9px 12px; font-weight: 700; }
  table.deliv td { border-bottom: 1px solid #e9ecef; padding: 9px 12px; vertical-align: top; }
  table.deliv td.num { text-align: center; font-weight: 700; }
  .note { color: #6b7281; font-size: 13px; margin-top: 8px; font-style: italic; }
  .inf { border: 1px solid #e9ecef; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; page-break-inside: avoid; }
  .inf-name { font-weight: 800; font-size: 16px; }
  .inf-meta { color: #6b7281; font-size: 13px; margin-top: 2px; }
  .inf-bio { font-size: 14px; color: #343a40; margin-top: 6px; }
  .foot { margin-top: 40px; border-top: 1px solid #e9ecef; padding-top: 14px; color: #adb5bd; font-size: 12px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="head">
    <div class="kicker">בריף למשפיענים · Leaders</div>
    <h1>${esc(input.brandName)}</h1>
    ${creative.activityTitle ? `<div class="sub">${esc(creative.activityTitle)}</div>` : ''}
    ${input.brandTagline ? `<div class="sub">${esc(input.brandTagline)}</div>` : ''}
  </div>

  ${section('מטרת הקמפיין', objective ? `<p>${esc(objective)}</p>` : '')}
  ${section('התובנה המרכזית', insight ? `<div class="insight">${esc(insight)}</div>` : '')}
  ${section('הקונספט הקריאייטיבי', [
    creative.activityConcept ? `<p>${esc(creative.activityConcept)}</p>` : '',
    creative.activityDescription ? `<p style="margin-top:8px">${esc(creative.activityDescription)}</p>` : '',
    list((creative.activityApproach || []).map(a => `${a.title} — ${a.description}`)),
    creative.activityDifferentiator ? `<p class="note">Talk value: ${esc(creative.activityDifferentiator)}</p>` : '',
  ].join(''))}
  ${section('מסרי מפתח', list(keyMessages))}
  ${section('התוצרים הנדרשים', deliverablesHtml)}
  ${section('נבחרת המשפיענים', influencersHtml)}
  ${sd.influencers?.influencerCriteria?.length
      ? section('קריטריונים לליהוק', list(sd.influencers.influencerCriteria)) : ''}

  <div class="foot">
    <span>Leaders · מסמך פנימי</span>
    <span>נוצר ${esc(generatedOn)}</span>
  </div>
</body>
</html>`
}
```
- [ ] Step 2 (verify): `npx tsc --noEmit` passes. Manual smoke — render to a file in the scratchpad without a browser:
```bash
npx tsx -e "import('./src/lib/influencer-brief/template.ts').then(m=>{require('fs').writeFileSync('/private/tmp/claude-501/-Users-idosegev-Downloads-TriRoars-Leaders-leaders-platform/774adff8-c3cd-48b6-a655-e602c6432884/scratchpad/brief.html', m.renderInfluencerBriefHtml({brandName:'מותג בדיקה',data:{_stepData:{creative:{activityTitle:'הבוקר של עצמי',activityConcept:'קונספט'},influencers:{influencers:[{name:'נועה',username:'@noa',followers:75000,engagementRate:4.2,categories:['לייף'],bio:'סרטון בוקר'}]},deliverables:{deliverables:[{type:'רילז',quantity:2,purpose:'חשיפה'}]}}}}));console.log('ok')})"
```
Expect `ok`; open `brief.html` in a browser — RTL Hebrew brief renders with brand header, influencer card, deliverables table.
- [ ] Step 3 (commit):
```bash
git add src/lib/influencer-brief/template.ts
git commit -m "$(cat <<'EOF'
Phase 4: Hebrew RTL influencer-brief HTML template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 — `generateInfluencerBrief(deckDocId)`

**Files:** `src/lib/influencer-brief/generate.ts` (Create).

- [ ] Step 1: Create `src/lib/influencer-brief/generate.ts`. Uses the **service-role** Supabase client (matches `salesforce/quote/route.ts:22-28`) so the insert works under RLS / dev-mode null user; reuses `generateMultiPagePdf` + `uploadBufferToDriveFolder` + `DRIVE_ANCHORS.BRIEFS_SENT`.
```ts
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { generateId } from '@/lib/utils'
import { renderInfluencerBriefHtml } from './template'
import type { DeckDocData } from './types'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Generate the influencer brief DOCUMENT from an approved creative deck.
 * Reads the deck's persisted `data._stepData`, renders a Hebrew RTL brief,
 * converts to PDF, uploads to Drive (public read), and inserts a
 * `documents` row (type='influencer_brief', parent_document_id = deck id).
 *
 * Idempotent-ish: if an influencer_brief already exists for this deck it is
 * returned instead of generating a duplicate.
 */
export async function generateInfluencerBrief(
  deckDocId: string,
): Promise<{ documentId: string; pdfUrl: string }> {
  const sb = service()

  // Reuse an existing brief for this deck if present.
  const { data: existing } = await sb
    .from('documents')
    .select('id, drive_file_url, pdf_url')
    .eq('parent_document_id', deckDocId)
    .eq('type', 'influencer_brief')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return {
      documentId: existing.id,
      pdfUrl: existing.drive_file_url || existing.pdf_url || '',
    }
  }

  // Load the approved deck.
  const { data: deck, error: deckErr } = await sb
    .from('documents')
    .select('id, type, title, data')
    .eq('id', deckDocId)
    .single()
  if (deckErr || !deck) {
    throw new Error(`Deck not found: ${deckErr?.message || deckDocId}`)
  }
  if (deck.type !== 'deck') {
    throw new Error(`Document ${deckDocId} is not a deck (type=${deck.type})`)
  }

  const data = (deck.data || {}) as DeckDocData
  const brandName =
    data._extractedData?.brand?.name || data.brandName || deck.title || 'המותג'

  const html = renderInfluencerBriefHtml({
    brandName,
    brandTagline: data._extractedData?.brand?.industry,
    data,
  })

  const title = `בריף למשפיענים — ${brandName}`

  // HTML -> PDF (A4). generateMultiPagePdf takes an array of pages.
  const pdfBuffer = await generateMultiPagePdf([html], {
    format: 'A4',
    title,
    brandName,
  })

  // Upload to Drive with public read (anyone-with-link).
  const uploaded = await uploadBufferToDriveFolder({
    folderId: DRIVE_ANCHORS.BRIEFS_SENT,
    fileName: `${title}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  })

  const documentId = generateId()
  const { error: insErr } = await sb.from('documents').insert({
    id: documentId,
    user_id: null,
    type: 'influencer_brief',
    title,
    status: 'generated',
    data: { brandName, source_deck_id: deckDocId },
    parent_document_id: deckDocId,
    drive_file_id: uploaded.id,
    drive_file_url: uploaded.viewLink,
    pdf_url: uploaded.viewLink,
  })
  if (insErr) {
    throw new Error(`Failed to insert influencer_brief document: ${insErr.message}`)
  }

  return { documentId, pdfUrl: uploaded.viewLink }
}
```
> `user_id: null` matches how dev-mode decks are inserted (`documents/route.ts:54`) and how the salesforce webhook inserts rows without a session user. If your DB has a `NOT NULL` on `documents.user_id`, set it nullable in the same migration (the seed schema left it as-is; pptmaker already inserts nulls in dev mode, so it is already nullable).
- [ ] Step 2 (verify): `npx tsc --noEmit` passes. Runtime check deferred to Task 5 (needs a real deck row + Drive creds).
- [ ] Step 3 (commit):
```bash
git add src/lib/influencer-brief/generate.ts
git commit -m "$(cat <<'EOF'
Phase 4: generateInfluencerBrief — deck _stepData -> PDF -> Drive -> documents row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 — `POST /api/documents/[id]/approve`

**Files:** `src/app/api/documents/[id]/approve/route.ts` (Create).

- [ ] Step 1: Create `src/app/api/documents/[id]/approve/route.ts`. Auth'd employee → stamps `approved_at`/`approved_by` on the deck (service client), then calls `generateInfluencerBrief`. `maxDuration=60` (PDF render + Drive upload). If brief generation fails, the approval still persists and the error is returned as a warning (non-blocking).
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { generateInfluencerBrief } from '@/lib/influencer-brief/generate'

export const runtime = 'nodejs'
export const maxDuration = 60

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Approve a creative deck. Employee-only.
 * 1. Stamps approved_at / approved_by on the deck.
 * 2. Generates the influencer brief DOCUMENT (item 3) from the deck's _stepData.
 *
 * The trigger is explicit approval. If a client-signature-on-deck flow is
 * added later, call generateInfluencerBrief from there instead.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = service()

  const { data: deck, error: getErr } = await sb
    .from('documents')
    .select('id, type, approved_at')
    .eq('id', id)
    .single()
  if (getErr || !deck) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  if (deck.type !== 'deck') {
    return NextResponse.json({ error: 'Only decks can be approved' }, { status: 400 })
  }

  const approvedAt = deck.approved_at || new Date().toISOString()
  if (!deck.approved_at) {
    const { error: updErr } = await sb
      .from('documents')
      .update({
        approved_at: approvedAt,
        approved_by: user.email || user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({ error: `Approve failed: ${updErr.message}` }, { status: 500 })
    }
  }

  // Generate the influencer brief document (non-blocking on approval).
  let influencerBrief: { documentId: string; pdfUrl: string } | null = null
  let briefError: string | null = null
  try {
    influencerBrief = await generateInfluencerBrief(id)
  } catch (e) {
    briefError = e instanceof Error ? e.message : String(e)
    console.error('[approve] influencer-brief generation failed:', briefError)
  }

  return NextResponse.json({
    ok: true,
    approved_at: approvedAt,
    influencerBrief,
    briefError,
  })
}
```
- [ ] Step 2 (verify): `npx tsc --noEmit` passes.
- [ ] Step 3 (manual check): with the migration applied and `SUPABASE_SERVICE_ROLE_KEY` + `GOOGLE_SERVICE_ACCOUNT_KEY` present in `.env.local`, `npm run dev`, then approve a real deck id (get one via `curl -s localhost:3000/api/documents | jq -r '.documents[] | select(.type=="deck") | .id' | head -1`):
```bash
DECK=$(curl -s localhost:3000/api/documents | jq -r '.documents[] | select(.type=="deck") | .id' | head -1)
curl -s -X POST "localhost:3000/api/documents/$DECK/approve" | jq
```
Expect `{ ok: true, approved_at: "...", influencerBrief: { documentId, pdfUrl } }` with a `drive.google.com/...` `pdfUrl`. Open the PDF — it's the Hebrew RTL brief. Re-run the same curl → same `documentId` (idempotent reuse). Verify DB:
```sql
SELECT id, type, parent_document_id, drive_file_url
FROM documents WHERE type='influencer_brief' ORDER BY created_at DESC LIMIT 1;
```
- [ ] Step 4 (commit):
```bash
git add "src/app/api/documents/[id]/approve/route.ts"
git commit -m "$(cat <<'EOF'
Phase 4: POST /api/documents/[id]/approve — stamp approval + gen influencer brief

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6 — Surface the download/send link on GET

**Files:** `src/app/api/documents/[id]/route.ts` (Modify GET, lines 34-59).

- [ ] Step 1: In the GET handler of `src/app/api/documents/[id]/route.ts`, after the document is fetched and ownership verified (after line 56, before the final `return NextResponse.json({ document })` at line 59), attach the linked influencer brief so the deck UI can render a download link:
```ts
    // Attach the linked influencer brief (if this deck has been approved).
    let influencerBrief: { id: string; title: string; pdfUrl: string; createdAt: string } | null = null
    if (document.type === 'deck') {
      const { data: briefRow } = await supabase
        .from('documents')
        .select('id, title, drive_file_url, pdf_url, created_at')
        .eq('parent_document_id', id)
        .eq('type', 'influencer_brief')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (briefRow) {
        influencerBrief = {
          id: briefRow.id,
          title: briefRow.title,
          pdfUrl: briefRow.drive_file_url || briefRow.pdf_url || '',
          createdAt: briefRow.created_at,
        }
      }
    }

    console.log(`[${requestId}] ⏱️ TOTAL: ${Date.now() - startTime}ms`)
    return NextResponse.json({ document, influencerBrief })
```
(replace the existing lines 58-59: the `console.log` + `return NextResponse.json({ document })`).
- [ ] Step 2 (verify): `npx tsc --noEmit` passes. Manual check — after approving a deck in Task 5, GET returns the link:
```bash
curl -s "localhost:3000/api/documents/$DECK" | jq '.influencerBrief'
```
Expect `{ id, title, pdfUrl, createdAt }` with a Drive URL. For a deck that was never approved, `influencerBrief` is `null`.
- [ ] Step 3 (commit):
```bash
git add "src/app/api/documents/[id]/route.ts"
git commit -m "$(cat <<'EOF'
Phase 4: surface linked influencer brief on GET /api/documents/[id]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Phase 4 done when:** the migration is applied; `npx tsc --noEmit` is clean; `POST /api/documents/[id]/approve` on a real deck returns `influencerBrief.pdfUrl` (a public Drive PDF of the Hebrew RTL brief); a re-approve is idempotent; and `GET /api/documents/[id]` exposes that link for the deck UI to render a download/send button. Interface `generateInfluencerBrief(deckDocId) → { documentId, pdfUrl }` and the `documents.type='influencer_brief'` + `parent_document_id` lineage are now available for later phases.

## Phase 5 — Batch influencer contracts cloned from the signed client quote (Item 4)

Batch-generate one signable influencer-engagement contract per influencer listed in the deck linked to a **signed** client quote. Reuses the exact `signature_requests` + `/sign/{token}` infra (each contract is its own row with its own token), the existing Playwright PDF pipeline, the public-Drive upload pattern from the Salesforce quote route, and the existing signature-request email. No new signing flow is forked.

### Files

**Create**
- `src/lib/templates/influencer-contract-template.ts` — Hebrew influencer engagement terms + signature block; produces HTML pages for `generateMultiPagePdf`.
- `src/lib/influencer-contract/generate.ts` — `buildInfluencerContractData()` + `generateInfluencerContractPdf()` (thin wrappers around template + PDF).
- `src/lib/influencer-contract/deck.ts` — `resolveDeckInfluencers(deckDocId)` — reads `documents.data._stepData.influencers.influencers`.
- `src/app/api/quotes/[id]/influencer-contracts/route.ts` — `POST` (create batch) + `GET` (list existing) endpoint.
- `src/app/quotes/[id]/influencer-contracts/page.tsx` — authed server page: signed-quote view + trigger.
- `src/app/quotes/[id]/influencer-contracts/InfluencerContractsClient.tsx` — client UI: "צור חוזי משפיעניות" button + list of influencers with per-influencer `/sign/{token}` link.

**Modify**
- `supabase/migrations/20260428_influencer_contracts.sql` — new (see SQL block).
- `src/types/database.ts` (line 10 `export type DocumentType = 'quote' | 'deck'`) — extend the union used for the new signature-request `payload.source` string constant only (no schema change needed; `payload` is JSONB). Documented as configurable.

### Interfaces (produces / consumes)

- **Consumes**: `signature_requests` table + `/sign/{token}` GET/sign endpoints (unchanged); `generatePriceQuotePages` sibling `generateMultiPagePdf` (`src/lib/playwright/pdf.ts`); `uploadBufferToDriveFolder` (public anyone-reader) + `DRIVE_ANCHORS.BRIEFS_SENT`; `sendGmailViaServiceAccount` (`src/lib/gmail.ts`); `buildSignatureRequestEmail` (`src/lib/signatures/email.ts`); `documents.data._stepData.influencers.influencers` (`InfluencerProfile[]` from `src/types/wizard.ts`).
- **Produces**: for each influencer, a `signature_requests` row with `payload.source='influencer-contract'`, `payload.deck_document_id`, `payload.parent_signature_request_id`, `payload.influencer` snapshot; a public-Drive contract PDF; a `/sign/{token}` link. Returns `{ ok, created: [{ influencer_name, token, sign_url, drive_link }], skipped: [...] }`.
- **Contract with Phase 6 (item 6 in the shared contract)**: this phase *is* item 6. The endpoint path is verbatim `POST /api/quotes/[id]/influencer-contracts`; `[id]` is the **client quote's `signature_requests.id`**. Gate = that row's `status === 'signed'`.
- **Deck resolution**: the linked deck id is taken (in priority order) from (1) request body `deck_document_id`, (2) the signed quote's `payload.deck_document_id`, (3) `inner_meeting_forms.linked_deck_document_id` when the quote payload carries `inner_meeting_form_id` (Phase 2's column). Falls back to a clear 400 if none resolve.

### SQL migration (idempotent)

```sql
-- supabase/migrations/20260428_influencer_contracts.sql
-- Batch influencer-contract support. signature_requests.payload (JSONB, added in
-- 20260426) already stores per-contract snapshots, so no new signature columns.
-- We add a nullable back-reference column for fast "which contracts belong to
-- this signed quote?" queries + an index on the payload source.

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS parent_signature_request_id UUID
    REFERENCES signature_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deck_document_id UUID
    REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_parent
  ON signature_requests (parent_signature_request_id)
  WHERE parent_signature_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_source
  ON signature_requests ((payload->>'source'));
```

> `parent_signature_request_id` lets the list endpoint find every contract cloned from a given signed quote in one query; `deck_document_id` records provenance. Both are nullable and `ON DELETE SET NULL` — safe to re-run.

---

### Task 1 — DB migration for contract back-references

**Files**: `supabase/migrations/20260428_influencer_contracts.sql`

- [ ] Step 1: Create the file with the exact SQL migration block above.
- [ ] Step 2: Apply it. If Supabase MCP is authenticated, run the file's contents via `apply_migration`; otherwise the user runs it in [the SQL editor](https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new).
- [ ] Step 3 (verify): confirm the columns exist:
  ```bash
  # If MCP authed, execute_sql:
  #   SELECT column_name FROM information_schema.columns
  #   WHERE table_name='signature_requests'
  #     AND column_name IN ('parent_signature_request_id','deck_document_id');
  # Expect 2 rows.
  echo "verify columns present via SQL editor / MCP execute_sql"
  ```
- [ ] Step 4 (commit):
  ```bash
  git checkout -b phase5-influencer-contracts
  git add supabase/migrations/20260428_influencer_contracts.sql
  git commit -m "Phase 5: migration — signature_requests parent/deck back-refs for influencer contracts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2 — Influencer-contract template (Hebrew terms + signature block)

**Files**: `src/lib/templates/influencer-contract-template.ts`

The signature block MUST mirror the exact field names the sign endpoint fills (`signer_name`, `id_number`, `signer_role`, `company_name`, `company_hp`, `image_data_url`, `typed_name`) so the *same* `/sign/{token}/sign` regeneration path works. We reuse `PriceQuoteSignature` verbatim as the signature shape.

- [ ] Step 1: Create the file. All legal/commercial fields are flagged `// CONFIGURABLE` and driven by `InfluencerContractData` so terms can be edited without touching layout.
  ```ts
  // src/lib/templates/influencer-contract-template.ts
  import type { PriceQuoteSignature } from '@/types/price-quote'

  const LOGO_PATH = '/new_logo.svg'

  /** All commercial/legal terms are data-driven so they're CONFIGURABLE per contract. */
  export interface InfluencerContractData {
    /** Header */
    clientName: string          // brand the influencer is engaged for
    campaignName: string
    date: string                // dd/mm/yyyy — issue date
    /** Influencer identity */
    influencerName: string
    influencerHandle: string    // @username
    influencerFollowers?: string // e.g. "120K"
    /** Commercial terms — CONFIGURABLE */
    deliverables: string[]      // e.g. ["2 סטוריז", "ריל 1"]
    engagementFee: string       // e.g. "5,000 ₪ + מע\"מ"
    paymentTerms: string        // CONFIGURABLE — e.g. "שוטף +30 מיום אישור התכנים"
    contentApprovalNote: string // CONFIGURABLE
    exclusivityNote: string     // CONFIGURABLE
    usageRightsNote: string     // CONFIGURABLE
    /** Boilerplate legal clauses — CONFIGURABLE list */
    legalClauses: string[]
    /** Signature (filled on the signed regeneration pass) */
    signature?: PriceQuoteSignature | null
  }

  /** CONFIGURABLE defaults — override any of these per contract at call time. */
  export const INFLUENCER_CONTRACT_DEFAULTS = {
    paymentTerms:
      'התמורה תשולם בכפוף לאישור התכנים ולעמידה בלוחות הזמנים, בתנאי שוטף +30 מיום קבלת חשבונית.',
    contentApprovalNote:
      'כל תוכן יועבר לאישור מוקדם של Leaders והמותג טרם פרסומו. Leaders רשאית לבקש תיקונים סבירים.',
    exclusivityNote:
      'המשפיען/ית מתחייב/ת שלא לקדם מותג מתחרה ישיר בקטגוריה למשך 14 יום ממועד הפרסום האחרון בקמפיין.',
    usageRightsNote:
      'המותג ו-Leaders רשאים לעשות שימוש חוזר בתכני הקמפיין בערוצי המדיה שלהם למשך 12 חודשים.',
    legalClauses: [
      'ההתקשרות הינה בין המשפיען/ית לבין Leaders, ואינה יוצרת יחסי עובד–מעביד.',
      'המשפיען/ית אחראי/ת לתשלום כל מס החל עליו/ה בגין התמורה.',
      'סימון תוכן ממומן ייעשה בהתאם לדין (לרבות חוק הגנת הצרכן והנחיות הרשות).',
      'הפרה יסודית של ההסכם מזכה את Leaders בביטול ההתקשרות וקיזוז התמורה.',
      'על הסכם זה יחולו דיני מדינת ישראל; סמכות שיפוט ייחודית לבתי המשפט במחוז תל אביב.',
    ],
  } as const

  function esc(s: string): string {
    return s
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;')
  }

  function baseStyles(logoUrl: string): string {
    return `
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A4; margin: 0; }
      body {
        font-family: 'Heebo','Assistant',Arial,sans-serif;
        direction: rtl; color:#1a1a2e; background:#fff;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .page {
        width: 210mm; min-height: 297mm; padding: 22mm 20mm;
        position: relative; page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }
      .brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
      .brand img { height: 34px; }
      .kicker { font-size:11px; letter-spacing:.32em; text-transform:uppercase; color:#c9a227; font-weight:700; }
      h1 { font-size:26px; color:#1a1a2e; margin:8px 0 2px; }
      .subhead { font-size:13px; color:rgba(26,26,46,.6); margin-bottom:20px; }
      .accent { width:52px; height:3px; background:#e94560; margin:6px 0 22px; }
      .parties { background:#f7f7fb; border:1px solid #ececf4; border-radius:10px; padding:16px 18px; margin-bottom:20px; font-size:13px; line-height:1.9; }
      .parties b { color:#1a1a2e; }
      h2 { font-size:15px; color:#1a1a2e; margin:22px 0 8px; border-inline-start:3px solid #e94560; padding-inline-start:10px; }
      ul { padding-inline-start:20px; }
      li { font-size:12.5px; line-height:1.9; color:rgba(26,26,46,.85); margin-bottom:2px; }
      p.term { font-size:12.5px; line-height:1.9; color:rgba(26,26,46,.85); margin-bottom:6px; }
      .fee { display:inline-block; background:#1a1a2e; color:#fff; font-weight:700; border-radius:999px; padding:6px 18px; font-size:14px; }
      .signature-fields { font-size:13px; line-height:2.6; margin-top:8px; }
      .signature-line { display:inline-block; border-bottom:1px solid #1a1a2e; min-width:120px; margin:0 6px; text-align:center; }
      .signature-line.filled { border-bottom:1px solid #1a1a2e; font-weight:600; }
      .signature-image { height:56px; vertical-align:middle; margin:0 6px; }
      .signature-typed { font-family:'Heebo',cursive; font-size:22px; margin:0 6px; }
      .foot { position:absolute; bottom:12mm; inset-inline:20mm; font-size:10px; color:rgba(26,26,46,.45); border-top:1px solid #ececf4; padding-top:8px; }
      .logo-src { display:none; }
    `.replace('.logo-src', `.logo-src[data-src="${logoUrl}"]`)
  }

  /** Identical shape to price-quote's signature block so the sign endpoint fills the same fields. */
  function signatureBlockHtml(sig?: PriceQuoteSignature | null): string {
    const filled = (v?: string | null, w?: string) =>
      v
        ? `<span class="signature-line filled"${w ? ` style="min-width:${w};"` : ''}>${esc(v)}</span>`
        : `<span class="signature-line"${w ? ` style="min-width:${w};"` : ''}></span>`
    const sigImg = sig?.image_data_url
      ? `<img class="signature-image" src="${sig.image_data_url}" alt="signature" />`
      : sig?.typed_name
        ? `<span class="signature-typed">${esc(sig.typed_name)}</span>`
        : `<span class="signature-line" style="min-width:180px;"></span>`
    return `
      <div class="signature-fields">
        תאריך: ${filled(sig?.date)}
        שם מלא: ${filled(sig?.signer_name)}
        ת.ז: ${filled(sig?.id_number)}
        תפקיד: ${filled(sig?.signer_role)}
        <br>
        חתימה: ${sigImg}
        <br>
        שם עסק/חברה: ${filled(sig?.company_name, '180px')}
        ח.פ/ע.מ: ${filled(sig?.company_hp)}
      </div>`
  }

  export function generateInfluencerContractPages(
    data: InfluencerContractData,
    logoBaseUrl: string,
  ): string[] {
    const logoUrl = `${logoBaseUrl}${LOGO_PATH}`
    const clauses = data.legalClauses.length ? data.legalClauses : [...INFLUENCER_CONTRACT_DEFAULTS.legalClauses]
    const page = `
      <!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
      <style>${baseStyles(logoUrl)}</style></head>
      <body>
        <div class="page">
          <div class="brand">
            <span class="kicker">Leaders · הסכם משפיען/ית</span>
            <img src="${logoUrl}" alt="Leaders" />
          </div>
          <h1>${esc(data.campaignName || 'הסכם התקשרות משפיען/ית')}</h1>
          <div class="subhead">${esc(data.clientName)} · ${esc(data.date)}</div>
          <div class="accent"></div>

          <div class="parties">
            <div><b>המזמין:</b> Leaders בשם המותג ${esc(data.clientName)}</div>
            <div><b>המשפיען/ית:</b> ${esc(data.influencerName)} (${esc(data.influencerHandle)})${
              data.influencerFollowers ? ` · ${esc(data.influencerFollowers)} עוקבים` : ''
            }</div>
          </div>

          <h2>1. תוצרי הקמפיין (Deliverables)</h2>
          <ul>${(data.deliverables.length ? data.deliverables : ['—']).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>

          <h2>2. תמורה ותנאי תשלום</h2>
          <p class="term"><span class="fee">${esc(data.engagementFee)}</span></p>
          <p class="term">${esc(data.paymentTerms)}</p>

          <h2>3. אישור תכנים</h2>
          <p class="term">${esc(data.contentApprovalNote)}</p>

          <h2>4. בלעדיות</h2>
          <p class="term">${esc(data.exclusivityNote)}</p>

          <h2>5. זכויות שימוש</h2>
          <p class="term">${esc(data.usageRightsNote)}</p>

          <h2>6. תנאים כלליים</h2>
          <ul>${clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

          <h2>7. חתימת המשפיען/ית</h2>
          ${signatureBlockHtml(data.signature)}

          <div class="foot">מסמך זה נוצר במערכת Leaders. קישור החתימה פרטי — אין להעבירו לצד ג׳.</div>
        </div>
      </body></html>`
    return [page]
  }
  ```
- [ ] Step 2 (verify): `npx tsc --noEmit` passes.
- [ ] Step 3 (commit):
  ```bash
  git add src/lib/templates/influencer-contract-template.ts
  git commit -m "Phase 5: Hebrew influencer-contract PDF template (configurable terms + reused signature block)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3 — Deck influencer resolver + contract-data/PDF builders

**Files**: `src/lib/influencer-contract/deck.ts`, `src/lib/influencer-contract/generate.ts`

- [ ] Step 1: Create `deck.ts` — reads the deck document and returns its influencer list (typed).
  ```ts
  // src/lib/influencer-contract/deck.ts
  import type { SupabaseClient } from '@supabase/supabase-js'
  import type { InfluencerProfile } from '@/types/wizard'

  export interface ResolvedDeck {
    id: string
    title: string
    clientName: string
    campaignName: string
    influencers: InfluencerProfile[]
  }

  /**
   * Read documents.data._stepData.influencers.influencers for the given deck.
   * Returns null if the doc doesn't exist. Empty influencer list is allowed
   * (caller decides how to handle it).
   */
  export async function resolveDeckInfluencers(
    service: SupabaseClient,
    deckDocId: string,
  ): Promise<ResolvedDeck | null> {
    const { data: doc, error } = await service
      .from('documents')
      .select('id, title, data')
      .eq('id', deckDocId)
      .maybeSingle()
    if (error || !doc) return null

    const data = (doc.data ?? {}) as {
      _stepData?: {
        influencers?: { influencers?: InfluencerProfile[] }
        brief?: { brandName?: string; campaignName?: string }
      }
    }
    const influencers = data._stepData?.influencers?.influencers ?? []
    return {
      id: doc.id as string,
      title: (doc.title as string) ?? 'Deck',
      clientName: data._stepData?.brief?.brandName ?? (doc.title as string) ?? '',
      campaignName: data._stepData?.brief?.campaignName ?? (doc.title as string) ?? '',
      influencers,
    }
  }

  export function formatFollowers(n?: number): string | undefined {
    if (!n || n <= 0) return undefined
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`
    return String(n)
  }
  ```
  > `brief.brandName` / `brief.campaignName` are read defensively — if the deck's `BriefStepData` uses different keys they fall back to the deck title. Adjust the two field names here if the deck brief shape differs; this is the only coupling point.
- [ ] Step 2: Create `generate.ts` — maps a resolved influencer + deck into `InfluencerContractData` and renders a PDF buffer.
  ```ts
  // src/lib/influencer-contract/generate.ts
  import type { InfluencerProfile } from '@/types/wizard'
  import {
    generateInfluencerContractPages,
    INFLUENCER_CONTRACT_DEFAULTS,
    type InfluencerContractData,
  } from '@/lib/templates/influencer-contract-template'
  import { generateMultiPagePdf } from '@/lib/playwright/pdf'
  import { formatFollowers, type ResolvedDeck } from './deck'

  /** CONFIGURABLE per-batch commercial overrides passed from the endpoint. */
  export interface ContractOverrides {
    engagementFee?: string
    paymentTerms?: string
    contentApprovalNote?: string
    exclusivityNote?: string
    usageRightsNote?: string
    deliverables?: string[]
    legalClauses?: string[]
  }

  export function buildInfluencerContractData(
    deck: ResolvedDeck,
    inf: InfluencerProfile,
    overrides: ContractOverrides = {},
  ): InfluencerContractData {
    const dateStr = new Date().toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    return {
      clientName: deck.clientName,
      campaignName: deck.campaignName,
      date: dateStr,
      influencerName: inf.name || inf.username || 'משפיען/ית',
      influencerHandle: inf.username?.startsWith('@') ? inf.username : `@${inf.username ?? ''}`,
      influencerFollowers: formatFollowers(inf.followers),
      deliverables: overrides.deliverables ?? [],           // CONFIGURABLE
      engagementFee: overrides.engagementFee ?? 'יסוכם בנפרד', // CONFIGURABLE
      paymentTerms: overrides.paymentTerms ?? INFLUENCER_CONTRACT_DEFAULTS.paymentTerms,
      contentApprovalNote: overrides.contentApprovalNote ?? INFLUENCER_CONTRACT_DEFAULTS.contentApprovalNote,
      exclusivityNote: overrides.exclusivityNote ?? INFLUENCER_CONTRACT_DEFAULTS.exclusivityNote,
      usageRightsNote: overrides.usageRightsNote ?? INFLUENCER_CONTRACT_DEFAULTS.usageRightsNote,
      legalClauses: overrides.legalClauses ?? [...INFLUENCER_CONTRACT_DEFAULTS.legalClauses],
      signature: null,
    }
  }

  export async function generateInfluencerContractPdf(
    data: InfluencerContractData,
    logoBaseUrl: string,
    title: string,
  ): Promise<Buffer> {
    const pages = generateInfluencerContractPages(data, logoBaseUrl)
    return generateMultiPagePdf(pages, { format: 'A4', title, brandName: data.clientName })
  }
  ```
- [ ] Step 3 (verify): `npx tsc --noEmit` passes.
- [ ] Step 4 (commit):
  ```bash
  git add src/lib/influencer-contract/deck.ts src/lib/influencer-contract/generate.ts
  git commit -m "Phase 5: deck influencer resolver + contract-data/PDF builders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4 — Endpoint `POST/GET /api/quotes/[id]/influencer-contracts`

**Files**: `src/app/api/quotes/[id]/influencer-contracts/route.ts`

Gate: the client quote (`signature_requests.id = [id]`) must be `status === 'signed'`. Then resolve the deck, and for **each** influencer create a `signature_requests` row (own token) with a public-Drive contract PDF, exactly mirroring the Salesforce-quote creation pattern. `GET` lists already-created contracts.

- [ ] Step 1: Create the route.
  ```ts
  // src/app/api/quotes/[id]/influencer-contracts/route.ts
  import { NextResponse } from 'next/server'
  import { createClient as createServiceClient } from '@supabase/supabase-js'
  import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
  import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
  import { resolveDeckInfluencers } from '@/lib/influencer-contract/deck'
  import {
    buildInfluencerContractData,
    generateInfluencerContractPdf,
    type ContractOverrides,
  } from '@/lib/influencer-contract/generate'

  export const dynamic = 'force-dynamic'
  export const runtime = 'nodejs'
  export const maxDuration = 300

  function service() {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }

  function appBaseUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_APP_URL
    if (explicit) return explicit.replace(/\/$/, '')
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'https://leaders-platform.vercel.app'
  }

  /**
   * POST /api/quotes/{id}/influencer-contracts
   * id = the signed client quote's signature_requests.id.
   *
   * Body (all optional):
   *   { deck_document_id?, overrides?: ContractOverrides,
   *     deliverables_by_handle?: Record<string,string[]>,
   *     fee_by_handle?: Record<string,string> }
   *
   * For each influencer in the linked deck, creates a signature_requests row
   * (own token) with the contract PDF uploaded public to Drive + a /sign/{token} link.
   */
  export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id } = await params
    const sb = service()

    // 1. Load + gate the client quote.
    const { data: quote, error: qErr } = await sb
      .from('signature_requests')
      .select('id, title, status, recipient_name, created_by_email, created_by_name, payload')
      .eq('id', id)
      .maybeSingle()
    if (qErr || !quote) {
      return NextResponse.json({ ok: false, error: 'הצעת המחיר לא נמצאה' }, { status: 404 })
    }
    if (quote.status !== 'signed') {
      return NextResponse.json(
        { ok: false, error: 'ניתן ליצור חוזי משפיעניות רק לאחר חתימת הלקוח על הצעת המחיר' },
        { status: 409 },
      )
    }

    // 2. Resolve the deck id (body -> quote payload).
    const body = (await request.json().catch(() => ({}))) as {
      deck_document_id?: string
      overrides?: ContractOverrides
      deliverables_by_handle?: Record<string, string[]>
      fee_by_handle?: Record<string, string>
    }
    const quotePayload = (quote.payload ?? {}) as { deck_document_id?: string }
    const deckDocId = (body.deck_document_id || quotePayload.deck_document_id || '').trim()
    if (!deckDocId) {
      return NextResponse.json(
        { ok: false, error: 'חסר מזהה מצגת (deck_document_id) לשליפת רשימת המשפיעניות' },
        { status: 400 },
      )
    }

    const deck = await resolveDeckInfluencers(sb, deckDocId)
    if (!deck) {
      return NextResponse.json({ ok: false, error: 'המצגת המקושרת לא נמצאה' }, { status: 404 })
    }
    if (deck.influencers.length === 0) {
      return NextResponse.json({ ok: false, error: 'אין משפיעניות ברשימת המצגת' }, { status: 422 })
    }

    // 3. Skip influencers that already have a contract cloned from THIS quote.
    const { data: existing } = await sb
      .from('signature_requests')
      .select('payload')
      .eq('parent_signature_request_id', id)
    const existingHandles = new Set(
      (existing ?? [])
        .map((r) => (r.payload as { influencer?: { handle?: string } } | null)?.influencer?.handle)
        .filter(Boolean) as string[],
    )

    const base = appBaseUrl()
    const created: Array<{ influencer_name: string; handle: string; token: string; sign_url: string; drive_link: string }> = []
    const skipped: Array<{ influencer_name: string; handle: string; reason: string }> = []

    for (const inf of deck.influencers) {
      const handle = inf.username?.startsWith('@') ? inf.username : `@${inf.username ?? ''}`
      if (existingHandles.has(handle)) {
        skipped.push({ influencer_name: inf.name || handle, handle, reason: 'חוזה כבר קיים' })
        continue
      }

      const overrides: ContractOverrides = {
        ...body.overrides,
        deliverables: body.deliverables_by_handle?.[handle] ?? body.overrides?.deliverables,
        engagementFee: body.fee_by_handle?.[handle] ?? body.overrides?.engagementFee,
      }
      const contractData = buildInfluencerContractData(deck, inf, overrides)
      const title = `הסכם משפיען/ית — ${inf.name || handle} × ${deck.clientName}`

      // Render PDF.
      let pdf: Buffer
      try {
        pdf = await generateInfluencerContractPdf(contractData, base, title)
      } catch (e) {
        skipped.push({ influencer_name: inf.name || handle, handle, reason: `PDF נכשל: ${e instanceof Error ? e.message : e}` })
        continue
      }

      // Upload to Drive (public anyone-reader, same anchor as quotes).
      let uploaded: { id: string; viewLink: string }
      try {
        const res = await uploadBufferToDriveFolder({
          folderId: DRIVE_ANCHORS.BRIEFS_SENT,
          fileName: `${title} (טיוטה).pdf`,
          mimeType: 'application/pdf',
          buffer: pdf,
        })
        uploaded = { id: res.id, viewLink: res.viewLink }
      } catch (e) {
        skipped.push({ influencer_name: inf.name || handle, handle, reason: `Drive נכשל: ${e instanceof Error ? e.message : e}` })
        continue
      }

      // Create the signature_requests row (own token). payload snapshots the
      // contract data so /sign/{token}/sign regenerates the signed PDF from the
      // template — we register it under source 'influencer-contract'.
      const { data: sigReq, error: insErr } = await sb
        .from('signature_requests')
        .insert({
          title,
          recipient_email: '',              // filled by the account manager before send (see UI)
          recipient_name: inf.name || handle,
          pdf_drive_file_id: uploaded.id,
          pdf_drive_folder_id: DRIVE_ANCHORS.BRIEFS_SENT,
          pdf_drive_view_link: uploaded.viewLink,
          created_by_email: quote.created_by_email,
          created_by_name: quote.created_by_name ?? 'Leaders',
          cc_emails: [],
          status: 'pending',
          parent_signature_request_id: id,
          deck_document_id: deck.id,
          payload: {
            source: 'influencer-contract',
            deck_document_id: deck.id,
            parent_signature_request_id: id,
            influencer: { name: inf.name, handle, followers: inf.followers ?? null },
            // NOTE: sign endpoint regenerates from quote_data for source
            // 'price-quote'/'salesforce-quote'. For influencer contracts the
            // stamp-fallback path in the sign endpoint applies (see Task 4b).
            contract_data: contractData,
          },
        })
        .select('id, token')
        .single()

      if (insErr || !sigReq) {
        skipped.push({ influencer_name: inf.name || handle, handle, reason: insErr?.message ?? 'insert נכשל' })
        continue
      }

      created.push({
        influencer_name: inf.name || handle,
        handle,
        token: sigReq.token as string,
        sign_url: `${base}/sign/${sigReq.token}`,
        drive_link: uploaded.viewLink,
      })
    }

    return NextResponse.json({ ok: true, quote_id: id, deck_id: deck.id, created, skipped })
  }

  /** GET — list contracts already cloned from this signed quote. */
  export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id } = await params
    const sb = service()
    const { data, error } = await sb
      .from('signature_requests')
      .select('id, token, title, recipient_name, recipient_email, status, signed_at, pdf_drive_view_link, signed_pdf_drive_view_link, payload')
      .eq('parent_signature_request_id', id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const base = appBaseUrl()
    return NextResponse.json({
      ok: true,
      contracts: (data ?? []).map((r) => ({
        id: r.id,
        token: r.token,
        title: r.title,
        recipient_name: r.recipient_name,
        recipient_email: r.recipient_email,
        status: r.status,
        signed_at: r.signed_at,
        sign_url: `${base}/sign/${r.token}`,
        drive_link: r.pdf_drive_view_link,
        signed_link: r.signed_pdf_drive_view_link,
        handle: (r.payload as { influencer?: { handle?: string } } | null)?.influencer?.handle ?? null,
      })),
    })
  }
  ```
- [ ] Step 2 (verify): `npx tsc --noEmit` passes.
- [ ] Step 3 (verify — reachability, no signed quote needed):
  ```bash
  npm run dev >/tmp/ph5dev.log 2>&1 &  # or run_in_background
  # GET on a random id must return ok:true with an empty contracts list (route resolves)
  curl -s "http://localhost:3000/api/quotes/00000000-0000-0000-0000-000000000000/influencer-contracts" | head -c 300
  # POST without a signed quote must 404/409 (gate works):
  curl -s -X POST "http://localhost:3000/api/quotes/00000000-0000-0000-0000-000000000000/influencer-contracts" \
    -H 'content-type: application/json' -d '{}' | head -c 300
  ```
- [ ] Step 4 (commit):
  ```bash
  git add "src/app/api/quotes/[id]/influencer-contracts/route.ts"
  git commit -m "Phase 5: POST/GET /api/quotes/[id]/influencer-contracts — batch clone contracts from signed quote

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4b — Make the sign endpoint regenerate signed PDFs for `influencer-contract`

**Files**: `src/app/api/signatures/[token]/sign/route.ts` (lines 100–174, the `quoteData`/fallback branch)

Currently the sign endpoint regenerates from the template only when `payload.quote_data` exists (`source` = price-quote/salesforce-quote). For influencer contracts the payload stores `contract_data`, not `quote_data`. Without this, signing an influencer contract falls to the **stamp-at-margin** fallback (which still works — it downloads the original Drive PDF and stamps the signature). That is acceptable and requires **no change**. This task adds the *cleaner* regeneration path so the signature fills the template fields.

- [ ] Step 1: In `src/app/api/signatures/[token]/sign/route.ts`, extend the payload read at line 107. Replace:
  ```ts
  const quoteData = (req.payload as { source?: string; quote_data?: PriceQuoteData } | null)?.quote_data
  ```
  with:
  ```ts
  const sigPayload = req.payload as {
    source?: string
    quote_data?: PriceQuoteData
    contract_data?: import('@/lib/templates/influencer-contract-template').InfluencerContractData
  } | null
  const quoteData = sigPayload?.quote_data
  const contractData = sigPayload?.contract_data
  ```
- [ ] Step 2: In the same file, add an `else if (contractData)` branch that regenerates the influencer-contract PDF with the signature block filled. Insert it **immediately after** the closing `}` of the `if (quoteData) { … }` block (currently ends at line 144), before the existing `} else {` fallback. Change the fallback keyword from `} else {` to `} else if (contractData) {` … then keep the original `} else {` stamp fallback. Concretely, replace the fallback header `} else {` (line 145) with:
  ```ts
  } else if (contractData) {
    try {
      const { generateInfluencerContractPages } = await import('@/lib/templates/influencer-contract-template')
      const signatureBlock = {
        date: dateStr,
        signer_name: body.signer_name,
        id_number: richBody.signer_id_number ?? null,
        signer_role: body.signer_role ?? null,
        company_name: richBody.signer_company ?? null,
        company_hp: richBody.signer_company_hp ?? null,
        image_data_url: body.signature_image ?? null,
        typed_name: body.signature_image ? null : (body.typed_name ?? null),
      }
      const pages = generateInfluencerContractPages(
        { ...contractData, signature: signatureBlock },
        process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://leaders-platform.vercel.app'),
      )
      const buffer = await generateMultiPagePdf(pages, {
        format: 'A4',
        title: `${req.title} (חתום)`,
        brandName: req.title,
      })
      signedPdfBytes = new Uint8Array(buffer)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `יצירת חוזה חתום נכשלה: ${msg}` }, { status: 500 })
    }
  } else {
  ```
  (The trailing `} else {` re-opens the original stamp fallback block, unchanged.)
- [ ] Step 3 (verify): `npx tsc --noEmit` passes. Confirm the three branches are balanced:
  ```bash
  grep -n "if (quoteData)\|} else if (contractData) {\|} else {" "src/app/api/signatures/[token]/sign/route.ts"
  ```
- [ ] Step 4 (commit):
  ```bash
  git add "src/app/api/signatures/[token]/sign/route.ts"
  git commit -m "Phase 5: sign endpoint regenerates influencer-contract PDF from contract_data on sign

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 5 — UI trigger + list on the signed-quote view

**Files**: `src/app/quotes/[id]/influencer-contracts/page.tsx`, `src/app/quotes/[id]/influencer-contracts/InfluencerContractsClient.tsx`

Authenticated page (protected by middleware since it lives under a non-`/forms` path) that shows the signed quote + a "צור חוזי משפיעניות" button and lists each influencer with its `/sign/{token}` link. Each contract row lets the account manager set a recipient email and send (reuses the existing signature-request email endpoint pattern — see Step 3 note).

- [ ] Step 1: Create the server page (loads the signed quote for gating/display).
  ```tsx
  // src/app/quotes/[id]/influencer-contracts/page.tsx
  import { notFound } from 'next/navigation'
  import { createClient } from '@supabase/supabase-js'
  import InfluencerContractsClient from './InfluencerContractsClient'

  export const dynamic = 'force-dynamic'

  export default async function InfluencerContractsPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: quote } = await supabase
      .from('signature_requests')
      .select('id, title, status, recipient_name, signed_at, payload')
      .eq('id', id)
      .maybeSingle()
    if (!quote) notFound()

    const deckId =
      (quote.payload as { deck_document_id?: string } | null)?.deck_document_id ?? null

    return (
      <InfluencerContractsClient
        quoteId={quote.id as string}
        quoteTitle={quote.title as string}
        quoteStatus={quote.status as string}
        clientName={(quote.recipient_name as string) ?? ''}
        deckId={deckId}
      />
    )
  }
  ```
- [ ] Step 2: Create the client component.
  ```tsx
  // src/app/quotes/[id]/influencer-contracts/InfluencerContractsClient.tsx
  'use client'

  import { useEffect, useState } from 'react'

  type Contract = {
    id: string
    token: string
    title: string
    recipient_name: string | null
    recipient_email: string | null
    status: string
    signed_at: string | null
    sign_url: string
    drive_link: string | null
    signed_link: string | null
    handle: string | null
  }

  export default function InfluencerContractsClient({
    quoteId,
    quoteTitle,
    quoteStatus,
    clientName,
    deckId,
  }: {
    quoteId: string
    quoteTitle: string
    quoteStatus: string
    clientName: string
    deckId: string | null
  }) {
    const [contracts, setContracts] = useState<Contract[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [deckInput, setDeckInput] = useState(deckId ?? '')

    async function load() {
      const res = await fetch(`/api/quotes/${quoteId}/influencer-contracts`)
      const json = await res.json()
      if (json.ok) setContracts(json.contracts)
    }
    useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function generate() {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`/api/quotes/${quoteId}/influencer-contracts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(deckInput ? { deck_document_id: deckInput } : {}),
        })
        const json = await res.json()
        if (!json.ok) { setError(json.error ?? 'נכשל'); return }
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה')
      } finally {
        setLoading(false)
      }
    }

    const signedQuote = quoteStatus === 'signed'

    return (
      <div dir="rtl" className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <div className="text-xs tracking-widest uppercase text-[#c9a227] font-semibold">
            Leaders · חוזי משפיעניות
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] mt-1">{quoteTitle}</h1>
          <p className="text-sm text-[#1a1a2e]/60 mt-1">
            {clientName ? `לקוח: ${clientName} · ` : ''}
            סטטוס הצעת מחיר:{' '}
            <span className={signedQuote ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
              {signedQuote ? 'נחתמה' : 'טרם נחתמה'}
            </span>
          </p>
        </div>

        {!signedQuote && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-4 mb-5">
            ניתן ליצור חוזי משפיעניות רק לאחר שהלקוח חתם על הצעת המחיר.
          </div>
        )}

        {signedQuote && (
          <div className="rounded-xl border border-[#ececf4] bg-white p-5 mb-6">
            {!deckId && (
              <label className="block mb-3 text-sm">
                <span className="text-[#1a1a2e]/70">מזהה מצגת (deck) עם רשימת המשפיעניות:</span>
                <input
                  value={deckInput}
                  onChange={(e) => setDeckInput(e.target.value)}
                  placeholder="documents.id של המצגת"
                  className="mt-1 w-full rounded-md border border-[#d9d9e3] px-3 py-2 text-sm"
                />
              </label>
            )}
            <button
              onClick={generate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] text-white text-sm font-semibold px-6 py-3 disabled:opacity-50"
            >
              {loading ? 'מייצר…' : 'צור חוזי משפיעניות'}
            </button>
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>
        )}

        {contracts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#1a1a2e]/70">
              חוזים ({contracts.length})
            </h2>
            {contracts.map((c) => (
              <div key={c.id} className="rounded-lg border border-[#ececf4] bg-white p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[#1a1a2e] truncate">
                    {c.recipient_name ?? c.handle ?? c.title}
                  </div>
                  <div className="text-xs text-[#1a1a2e]/55 mt-0.5">
                    סטטוס: {statusHe(c.status)}
                    {c.signed_at ? ` · נחתם ${new Date(c.signed_at).toLocaleDateString('he-IL')}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={c.sign_url} target="_blank" rel="noreferrer"
                     className="text-xs font-semibold text-[#e94560] underline">
                    קישור חתימה ←
                  </a>
                  {c.drive_link && (
                    <a href={c.drive_link} target="_blank" rel="noreferrer"
                       className="text-xs text-[#1a1a2e]/60 underline">PDF</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function statusHe(s: string): string {
    switch (s) {
      case 'pending': return 'ממתין'
      case 'opened': return 'נצפה'
      case 'signed': return 'נחתם'
      case 'expired': return 'פג תוקף'
      case 'cancelled': return 'בוטל'
      default: return s
    }
  }
  ```
  > The per-contract **send-email** action reuses the existing signature-request email verbatim. If the account manager needs to email a specific influencer, they open the `sign_url` and share it, OR a follow-up wires a small `PATCH` to set `recipient_email` + call `sendGmailViaServiceAccount` with `buildSignatureRequestEmail`. Left as a documented extension so this task stays bite-sized; the sign link is already fully functional.
- [ ] Step 3 (verify): `npx tsc --noEmit` passes, then:
  ```bash
  npm run dev >/tmp/ph5dev.log 2>&1 &   # or run_in_background
  # Page renders (dev-mode bypasses auth): expect 200 + the Hebrew heading.
  curl -s "http://localhost:3000/quotes/00000000-0000-0000-0000-000000000000/influencer-contracts" -o /dev/null -w "%{http_code}\n"
  ```
  Manually: open a **real signed** quote's id at `/quotes/{sigReqId}/influencer-contracts`, click "צור חוזי משפיעניות", confirm each influencer appears with a working `/sign/{token}` link, and open one link to confirm the contract PDF renders in the signature page.
- [ ] Step 4 (commit):
  ```bash
  git add "src/app/quotes/[id]/influencer-contracts/page.tsx" "src/app/quotes/[id]/influencer-contracts/InfluencerContractsClient.tsx"
  git commit -m "Phase 5: signed-quote UI — 'צור חוזי משפיעניות' trigger + per-influencer sign links

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Notes / flags

- **Legal/terms are configurable**: every commercial + legal clause is a field on `InfluencerContractData` with defaults in `INFLUENCER_CONTRACT_DEFAULTS` (Task 2) — Leaders' legal team should review the default Hebrew wording before real use. The endpoint accepts `overrides`, `deliverables_by_handle`, and `fee_by_handle` (Task 4) so per-influencer commercial terms can be injected without code changes.
- **No forked signing flow**: contracts are ordinary `signature_requests` rows with their own `token`; they flow through the **same** `/sign/{token}` GET (opens/expires) and `/sign/{token}/sign` POST (signs, uploads signed PDF, emails). Task 4b only adds a cleaner regeneration branch; the pre-existing stamp fallback already covers this source.
- **Deck-brief field coupling** is isolated to `resolveDeckInfluencers` in `src/lib/influencer-contract/deck.ts` (the `brief.brandName` / `brief.campaignName` reads) — the single place to adjust if the deck's `BriefStepData` shape differs.
- **Gate is enforced server-side** in the POST route (`status !== 'signed'` → 409); the UI additionally hides the trigger. `[id]` is always the **client quote's** `signature_requests.id`.
- **`recipient_email` is intentionally blank** on created contract rows — the account manager fills/sends per influencer (documented extension in Task 5). The `/sign/{token}` link is functional immediately regardless.

---

## Open assumptions — confirm before/at execution

These were flagged during design. Defaults are baked in; each is cheap to swap if wrong.

1. **Deck ↔ kickoff linkage** — a deck (`documents`) is linked to a kick-off (`inner_meeting_forms`) via the new `linked_deck_document_id` column, set manually (or by the create-proposal flow). Item 2's Canva link is written onto the linked kickoff row. *If you already associate deck↔kickoff by client folder / project id, point Phase 3 at that key instead.*
2. **What "approved / signed the presentation" means (items 3–5)** — modeled as an **explicit approve action** on the deck (`POST /api/documents/[id]/approve`, sets `approved_at/approved_by`). *If the client actually **signs** the creative deck (like a quote), swap the trigger to that signature event and reuse the signature infra — Phase 4/5 are written to make that a small change.*
3. **"Day before" = 1 calendar day, Israel TZ** — not business-day aware. *Ask for the business-day variant (skip Fri/Sat/holidays via `src/lib/businessDays.ts`) if the meeting-minus-1 can land on a weekend.*
4. **Test safety** — Roei and Sharon are real people. Run all end-to-end tests with `NOTIFICATIONS_TEST_MODE=true` (routes to `cto@` / `NOTIFICATIONS_TEST_RECIPIENT`). Approved live test recipients are limited to CTO, Noa Sabagi, and Yoav; never Eran.

## Testing & safety notes

- There is no unit-test harness; rely on `npx tsc --noEmit` + the manual checks in each task, and a full `npm run build` before merging each phase.
- Phase 3 (Canva) cannot be fully verified until the service account is connected (runbook step 6). Until then, `getValidAccessToken()` will throw "no Canva token" — that's expected; gate the import UI accordingly.
- The Canva `edit_url`/`view_url` expire after 30 days; `canva_design_id` is persisted so a link can be re-issued via `GET /designs/{id}` later if needed.

## Execution handoff

**Plan saved to `docs/superpowers/plans/2026-07-01-leaders-feedback-5-features.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (`superpowers:subagent-driven-development`).
2. **Inline Execution** — execute tasks in one session with checkpoints (`superpowers:executing-plans`).

Recommended order: **Phase 1 → 2 → 3 → 4 → 5**. Phase 1 is a quick win with no schema change; Phase 3 is the largest (external OAuth + Drive + Canva) and depends on the Canva runbook setup being done in parallel.
