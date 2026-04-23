-- leaders-platform: leads intake from Make.com
-- Minimal schema covering the four required fields (name, phone, email, website),
-- plus lifecycle columns so the hub can show who's handling what.

CREATE TABLE IF NOT EXISTS leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  website             TEXT,

  source              TEXT,
  status              TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'rejected')),

  assigned_to_email   TEXT,
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at        TIMESTAMPTZ,
  converted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_created      ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads (status) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_leads_assigned     ON leads (assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_leads_email        ON leads (lower(email)) WHERE email IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;

ALTER TABLE leads REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE leads;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
