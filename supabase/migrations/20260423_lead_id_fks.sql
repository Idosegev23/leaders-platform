-- Connect downstream artifacts back to the lead that seeded them.
-- Nullable + ON DELETE SET NULL: legacy rows are unaffected.

ALTER TABLE document_links ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE forms ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_document_links_lead_id ON document_links (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forms_lead_id          ON forms          (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_lead_id      ON documents      (lead_id) WHERE lead_id IS NOT NULL;
