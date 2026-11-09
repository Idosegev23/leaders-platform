# Brieflow: runbook

## 1. Run locally

Prerequisites: Node 20, Postgres 14+ binaries (`initdb`, `pg_ctl`), Chrome (for the smoke test only).

```bash
# one-time: a throwaway local cluster on port 54329
initdb -D .local-pg -U postgres --auth=trust -E UTF8
pg_ctl -D .local-pg -o "-p 54329" -l .local-pg/log start

npm ci
cp .env.campaigns.example .env.local   # then set the local values below
```

`.env.local` for local work (no production credentials):

```
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-dev-placeholder
NEXT_PUBLIC_APP_URL=http://localhost:3000
CAMPAIGNS_MODULE_ENABLED=true
BRIEFLOW_PLATFORM_ADMINS=platform@brieflow.example
BRIEFLOW_SELF_SIGNUP=true
CAMPAIGNS_DATABASE_URL=postgres://postgres@localhost:54329/leaders_dev
CAMPAIGNS_DEV_AUTH=true
CAMPAIGNS_STORAGE=local
CAMPAIGNS_LOCAL_STORAGE_DIR=.data/campaign-media
CAMPAIGNS_LOCAL_STORAGE_SECRET=<any random string>
CAMPAIGNS_EMAIL_TRANSPORT=dev
```

```bash
CAMPAIGNS_DATABASE_URL=postgres://postgres@localhost:54329/leaders_dev npm run campaigns:db:reset   # shim + every migration
CAMPAIGNS_DATABASE_URL=postgres://postgres@localhost:54329/leaders_dev npm run campaigns:seed       # synthetic data; prints portal links
npm run dev
```

Open `/campaigns/login` and pick a seeded account (dev login exists only with `CAMPAIGNS_DEV_AUTH=true`, a
non-production build and a localhost database). The seed creates two organizations: "לידרס (הדגמה)"
(Hub-linked) and "סוכנות דמו ב׳" (to show isolation; דנה לוי is a member of both and can switch), plus
`platform@brieflow.example` as a platform admin. Fresh single-use portal links (client for all campaigns,
talent agency, agent, creators) are written to `demo-links.local.txt`.

Worker: `curl localhost:3000/api/cron/campaigns` (allowed without a secret only in development).

## 2. Tests

```bash
npm test                    # unit tests (domain rules + existing Hub tests)
npm run test:campaigns      # integration tests; drops and rebuilds DB leaders_test on localhost:54329
npm run typecheck
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE_URL=http://localhost:3000 \
  npx tsx scripts/campaigns/browser-smoke.ts   # needs a freshly seeded dev DB and a running dev server
```

The integration suite refuses non-local database hosts. Tests never contact real recipients (fake transport).

## 3. Staging (before production)

1. **Database**: use a Supabase **branch or separate project**, not production. Apply
   `supabase/migrations/20261026_campaigns_mvp.sql` in the SQL editor. It is additive and idempotent, and it
   only creates new `cm_` tables and does not alter any Hub table (it references `document_links` only). It
   takes no locks on existing tables beyond a catalog check, needs no backfill, and can be re-run.
2. **Check grants after applying**:
   ```sql
   select tablename, rowsecurity from pg_tables where tablename like 'cm\_%' and not rowsecurity;  -- expect 0 rows
   select table_name, grantee from information_schema.role_table_grants
    where table_name like 'cm\_%' and grantee in ('anon','authenticated');                       -- expect 0 rows
   ```
3. **Storage**: create a **private** bucket `campaign-media` (Public OFF). Set its file size limit ≥ the largest
   `CAMPAIGNS_MAX_*_MB` value, and set allowed MIME types to `image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf`.
4. **Env (Vercel, Preview/staging)**: see `.env.campaigns.example`. Required:
   `CAMPAIGNS_MODULE_ENABLED=true`, `CAMPAIGNS_DATABASE_URL` (pooler, transaction mode, port 6543),
   `CAMPAIGNS_STORAGE=supabase`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
   Email: `CAMPAIGNS_EMAIL_TRANSPORT=gmail`, `CAMPAIGNS_EMAIL_FROM=<mailbox the service account may impersonate>`, and on staging
   **`CAMPAIGNS_EMAIL_REDIRECT_TO=<test inbox>`** so nothing reaches real people.
   Organizations: `BRIEFLOW_PLATFORM_ADMINS=<your email>`, `CAMPAIGNS_HUB_LOGIN=true`, `BRIEFLOW_SELF_SIGNUP` off.
5. **Bootstrap the first organization**: sign in at `/campaigns/login` with a platform-admin email (email link,
   or via the Hub bridge once an account exists), open `/campaigns/platform`, create "Leaders" with Hub
   integration on and its first admin. That admin invites the team from `/campaigns/settings`
   (`manager` / `staff`). Invitations arrive by email (redirected to the test inbox on staging).
   To add another agency, create another organization the same way; its users never see Leaders data.
6. **Smoke test on staging** (by hand):
   - open a campaign from a brief, add 2 creators, create a shortlist, approve internally, send to client;
   - create a client invitation, open it in a private window, approve one creator;
   - invite the creator, accept in the portal, upload an image, submit;
   - approve internally, approve as client, report publication, verify with a screenshot, enter metrics;
   - download the CSV and open it in Excel (Hebrew must display correctly);
   - call the cron with the secret: `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/cron/campaigns`;
     check the Activity tab: messages should be `sent` (redirected to the test inbox) with provider ids;
   - revoke the client invitation and confirm the portal session ends;
   - create a second organization, sign in as its admin, and confirm a Leaders campaign URL answers "not found".

## 4. Production (only with explicit approval)

1. Approval to apply the migration to project `fhgggqnaplshwbrzgima` and to enable the module.
2. Apply the migration (step 3.1) and verify the grants (3.2). Create the private bucket (3.3).
3. Set production env (3.4) **without** `CAMPAIGNS_EMAIL_REDIRECT_TO` and **without** `CAMPAIGNS_DEV_AUTH`.
   `CRON_SECRET` is mandatory (the worker refuses without it). Note: setting `CRON_SECRET` also gates the three existing cron routes, which is the desired fix for their currently public state.
4. Deploy. `vercel.json` adds the `*/5 * * * *` cron for `/api/cron/campaigns`.
5. Bootstrap the Leaders organization and invite the pilot team (step 3.5). Keep `CAMPAIGNS_MODULE_ENABLED=true` only after the smoke test passes.

## 5. Monitoring

- Each campaign's **Activity** tab lists outgoing messages and background jobs with status, attempts, errors, and
  retry/dismiss actions. Its **Overview** shows a banner when anything failed.
- The cron response and log line (`[cron/campaigns]`) include `dead_jobs` and `failed_messages` counts.
- SQL:
  ```sql
  select kind, status, count(*) from cm_jobs group by 1,2;
  select status, count(*) from cm_notifications group by 1;
  select * from cm_jobs where status in ('dead','running') order by updated_at desc limit 20;
  select * from cm_notifications where status in ('dead','uncertain') order by updated_at desc limit 20;
  ```

## 6. Optional providers and behaviour without them

| Provider | Without it |
|---|---|
| Gmail (service account) | `CAMPAIGNS_EMAIL_TRANSPORT=dev`: messages recorded as "לא נשלחה — סביבת פיתוח"; in-app tasks still work; managers share invite links by hand |
| Supabase Storage | `local` adapter (development only; refuses in production) |
| Salesforce / Besti / IMAI | manual reference fields only |
| WhatsApp | not used |

## 7. Rollback

- **Turn off**: set `CAMPAIGNS_MODULE_ENABLED=false` and redeploy. All module pages and APIs return 404, the cron
  becomes a no-op, the rest of the Hub is unaffected, and **all data stays**.
- **Code rollback**: redeploy the previous Vercel deployment. The `cm_` tables are only read by this module,
  so older code ignores them.
- **Do not drop the tables** to roll back. New data (decisions, audit, files) would be lost. If removal is ever
  required, export first and get explicit approval.
- Storage objects in `campaign-media` remain private when the module is off.
