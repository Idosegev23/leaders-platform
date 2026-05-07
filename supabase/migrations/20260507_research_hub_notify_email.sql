-- Research Hub — store the email to notify when a job finishes.
-- Populated at job creation (defaults to the authed user's email).
-- The workflow's finalize step posts to RESEARCH_DONE_WEBHOOK_URL with
-- this email + the report URL when present.

alter table research_jobs add column if not exists notify_email text;

create index if not exists research_jobs_notify_email_idx
  on research_jobs (notify_email)
  where notify_email is not null;
