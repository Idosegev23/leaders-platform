-- Research Hub — ultra tier support
-- Adds the optional "decision_to_help" field where the analyst can declare
-- the single decision the research should help make. The planner, critic
-- and exec-brief all use this to keep the report aligned to action.
-- depth column itself is plain text; no enum to alter.
-- Idempotent: safe to re-run.

alter table research_jobs
  add column if not exists decision_to_help text;
