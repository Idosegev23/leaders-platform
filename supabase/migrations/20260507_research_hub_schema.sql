-- Research Hub — Deep Research Agent
-- Tables for the long-running QStash workflow that drives /research-hub.
-- Conventions match the rest of the hub schema: no RLS (internal data),
-- service-role server access, idempotent migration.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── research_jobs ───────────────────────────────────────────────────
-- One row per research request. Status transitions:
-- queued → planning → researching → synthesizing → rendering → done
-- (any step may transition to failed/cancelled instead.)
create table if not exists research_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                       -- 'dev-user-id' in dev, auth.uid()::text in prod
  topic text not null,
  brief text,
  angles text[] not null default '{}',
  depth text not null default 'standard',      -- 'express' | 'standard' | 'maximum'
  language text not null default 'he',
  status text not null default 'queued',
  workflow_run_id text,
  plan jsonb,
  findings jsonb,
  report_md text,
  report_sections jsonb,
  pdf_path text,
  cost_cents int default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists research_jobs_user_created_idx
  on research_jobs (user_id, created_at desc);
create index if not exists research_jobs_status_idx
  on research_jobs (status);

-- ─── research_job_events (live progress feed) ────────────────────────
create table if not exists research_job_events (
  id bigserial primary key,
  job_id uuid references research_jobs (id) on delete cascade not null,
  step text not null,
  status text not null,                        -- 'started' | 'progress' | 'done' | 'error'
  message text,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists research_job_events_job_idx
  on research_job_events (job_id, id);

-- Realtime broadcast on the events table — drives the live progress UI
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'research_job_events'
  ) then
    execute 'alter publication supabase_realtime add table research_job_events';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'research_jobs'
  ) then
    execute 'alter publication supabase_realtime add table research_jobs';
  end if;
end$$;

-- ─── research_reports (final exported report) ────────────────────────
create table if not exists research_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references research_jobs (id) on delete cascade not null,
  user_id text not null,
  title text not null,
  topic text not null,
  sections jsonb not null,
  sources jsonb not null default '[]',
  pdf_path text,
  shared_token text unique,
  created_at timestamptz not null default now()
);

create index if not exists research_reports_user_created_idx
  on research_reports (user_id, created_at desc);
create index if not exists research_reports_job_idx
  on research_reports (job_id);

-- ─── Storage bucket for PDFs (best-effort — created by upload code too) ──
insert into storage.buckets (id, name, public)
values ('research-reports', 'research-reports', false)
on conflict (id) do nothing;
