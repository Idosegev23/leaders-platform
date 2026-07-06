-- ---------------------------------------------------------------------------
-- Kickoff (inner-meeting / פגישת התנעה) ↔ Salesforce link.
--
-- The Salesforce → Hub kickoff webhook stores the SF project ref on the form
-- so the completion push-back can correlate 1:1. `forms` had no metadata
-- column; add one (mirrors leads.metadata / document_links.metadata).
--
-- Idempotent + additive — safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Dedup lookup: the kickoff webhook reuses an open draft for a given project.
CREATE INDEX IF NOT EXISTS idx_forms_metadata_salesforce_ref
  ON forms ((metadata->>'salesforce_ref'));
