-- Research Hub — add brand_url column to research_jobs
-- Lets the user point the agent at a specific brand site so the
-- brand_deep_dive / brand_ideas angles can drill into real data
-- (catalog, prices, About, public mentions) instead of guessing.
-- Idempotent: safe to re-run.

alter table research_jobs
  add column if not exists brand_url text;
