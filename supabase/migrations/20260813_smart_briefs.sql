-- ---------------------------------------------------------------------------
-- Smart Brief Engine — filled briefs storage.
-- Templates live in code (src/lib/smart-brief/templates); this table only
-- stores instances. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS smart_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug     TEXT NOT NULL,
  title             TEXT,
  client_name       TEXT,
  client_folder_id  UUID REFERENCES client_folders(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent')),
  fields            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- context the AI draft was generated from (free text, sources used)
  ai_meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  share_token       UUID UNIQUE DEFAULT gen_random_uuid(),
  created_by_email  TEXT,
  created_by_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_briefs_template ON smart_briefs (template_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_briefs_token    ON smart_briefs (share_token);
CREATE INDEX IF NOT EXISTS idx_smart_briefs_client   ON smart_briefs (client_folder_id);
