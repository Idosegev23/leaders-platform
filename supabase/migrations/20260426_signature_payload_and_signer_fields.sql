-- Snapshot of the source document data (e.g. PriceQuoteData) so the
-- sign endpoint can regenerate the PDF with the signature filled into
-- the template fields instead of stamping at the bottom margin.
-- Plus the missing signer-side fields the price-quote PDF asks for.
ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signer_id_number TEXT,
  ADD COLUMN IF NOT EXISTS signer_company   TEXT,
  ADD COLUMN IF NOT EXISTS signer_company_hp TEXT;
