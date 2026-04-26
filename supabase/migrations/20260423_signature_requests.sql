CREATE TABLE IF NOT EXISTS signature_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  document_id        UUID REFERENCES documents(id) ON DELETE SET NULL,
  lead_id            UUID REFERENCES leads(id)     ON DELETE SET NULL,
  title              TEXT NOT NULL,
  pdf_data           BYTEA,
  pdf_drive_file_id  TEXT,
  pdf_drive_folder_id TEXT NOT NULL,
  pdf_drive_view_link TEXT,
  signed_pdf_drive_file_id  TEXT,
  signed_pdf_drive_view_link TEXT,
  signature_image    TEXT,
  signature_typed_name TEXT,
  signer_name        TEXT,
  signer_email       TEXT,
  signer_role        TEXT,
  signer_notes       TEXT,
  signed_at          TIMESTAMPTZ,
  recipient_email    TEXT NOT NULL,
  recipient_name     TEXT,
  cc_emails          TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_by_email   TEXT NOT NULL,
  created_by_name    TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'opened', 'signed', 'expired', 'cancelled')),
  opened_at          TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_requests_token       ON signature_requests (token);
CREATE INDEX IF NOT EXISTS idx_signature_requests_status      ON signature_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signature_requests_creator     ON signature_requests (created_by_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signature_requests_lead        ON signature_requests (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE signature_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE signature_requests;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE TRIGGER trg_signature_requests_updated_at
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
