-- Research Hub — align existing tables to leaders-platform conventions.
--
-- Companion to 20260507_research_hub_schema.sql for databases that already
-- had the original Reasearhaget schema (user_id uuid + FK to auth.users +
-- RLS). The hub treats this data as team-internal and uses dev-mode users
-- that don't exist in auth.users, so we widen user_id to TEXT and turn
-- RLS off — matching every other hub table.
--
-- Idempotent: safe to re-run on a freshly created DB.

-- Step 1: drop policies first (they depend on the user_id column type)
drop policy if exists "users can read own research_jobs"               on research_jobs;
drop policy if exists "users can insert own research_jobs"             on research_jobs;
drop policy if exists "users can update own research_jobs"             on research_jobs;
drop policy if exists "users read events of own research_jobs"         on research_job_events;
drop policy if exists "users read own research_reports"                on research_reports;
drop policy if exists "anyone with token reads shared research_report" on research_reports;

-- Step 2: drop FKs to auth.users
alter table research_jobs    drop constraint if exists research_jobs_user_id_fkey;
alter table research_reports drop constraint if exists research_reports_user_id_fkey;

-- Step 3: widen user_id from uuid → text (no-op if already text)
do $$
begin
  if (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'research_jobs'
          and column_name = 'user_id') = 'uuid' then
    alter table research_jobs    alter column user_id type text using user_id::text;
  end if;
  if (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'research_reports'
          and column_name = 'user_id') = 'uuid' then
    alter table research_reports alter column user_id type text using user_id::text;
  end if;
end$$;

-- Step 4: disable RLS to match the rest of the hub
alter table research_jobs        disable row level security;
alter table research_job_events  disable row level security;
alter table research_reports     disable row level security;

-- Step 5: ensure research_jobs is in the realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'research_jobs'
  ) then
    execute 'alter publication supabase_realtime add table research_jobs';
  end if;
end$$;

-- Step 6: ensure storage bucket exists
insert into storage.buckets (id, name, public)
values ('research-reports', 'research-reports', false)
on conflict (id) do nothing;
