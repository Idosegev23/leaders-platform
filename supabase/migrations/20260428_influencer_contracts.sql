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

-- Prevent duplicate influencer contracts for the same (signed quote, influencer)
-- when two account managers generate concurrently (app-level dedup is TOCTOU).
-- The losing INSERT hits this unique index and the endpoint records it as skipped.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_requests_parent_influencer
  ON signature_requests (parent_signature_request_id, ((payload->'influencer')->>'handle'))
  WHERE payload->>'source' = 'influencer-contract';
