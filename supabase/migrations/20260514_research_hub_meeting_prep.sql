-- Research Hub — meeting-prep mode
-- Adds a `mode` discriminator on research_jobs so the BD team can run a
-- meeting-readiness research over a brand (name + optional domain) instead
-- of the generic topic-based market research. The downstream prompts and
-- report structure adapt when mode = 'meeting_prep'.
--
-- Idempotent: safe to re-run.

alter table research_jobs
  add column if not exists mode text not null default 'general',
  add column if not exists brand_name text;

-- Index for filtering recent jobs by mode (e.g. BD team listing only meeting-prep runs)
create index if not exists idx_research_jobs_mode
  on research_jobs (mode, created_at desc);
