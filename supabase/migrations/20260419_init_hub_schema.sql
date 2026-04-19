-- leaders-platform: Phase 0 — initial hub schema
-- Run in Supabase SQL Editor on project fhgggqnaplshwbrzgima (DB #2 / pptmaker's).
-- This adds the tables needed to host inner-meeting + client-brief-hub flows
-- on top of pptmaker's existing schema (documents, users, admin_config, assets bucket,
-- brief_links, user_google_tokens — already present).
--
-- Safe to re-run: uses `IF NOT EXISTS` everywhere. No data is modified.

-- ---------------------------------------------------------------------------
-- 1. contacts — Leaders employees whitelist. Used for Google OAuth gating
--    and for selecting participants in inner-meeting forms.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  hebrew_first_name   TEXT NOT NULL,
  hebrew_last_name    TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (lower(email));

-- ---------------------------------------------------------------------------
-- 2. client_folders — one row per client. Threads brief ↔ inner-meeting ↔
--    quote/deck under a shared client identity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_folders_name ON client_folders (client_name);

-- ---------------------------------------------------------------------------
-- 3. forms — generic form metadata (drafts, status, share tokens).
--    inner-meeting is the first form type; more can be added via `type`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'completed', 'archived')),
  title                 TEXT,
  share_token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  active_editors_count  INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forms_type_status ON forms (type, status);
CREATE INDEX IF NOT EXISTS idx_forms_share_token ON forms (share_token);

-- ---------------------------------------------------------------------------
-- 4. inner_meeting_forms — payload of an inner-meeting form.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inner_meeting_forms (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID NOT NULL UNIQUE
                         REFERENCES forms(id) ON DELETE CASCADE,
  folder_id              UUID REFERENCES client_folders(id) ON DELETE SET NULL,
  client_name            TEXT,
  meeting_date           DATE,
  about_brand            TEXT,
  target_audiences       TEXT,
  goals                  TEXT,
  insight                TEXT,
  strategy               TEXT,
  creative               TEXT,
  creative_presentation  TEXT,
  media_strategy         TEXT,
  influencers_example    TEXT,
  additional_notes       TEXT,
  budget_distribution    TEXT,
  creative_deadline      DATE,
  internal_deadline      DATE,
  client_deadline        DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inner_meeting_folder ON inner_meeting_forms (folder_id);
CREATE INDEX IF NOT EXISTS idx_inner_meeting_deadlines
  ON inner_meeting_forms (creative_deadline, internal_deadline, client_deadline);

-- ---------------------------------------------------------------------------
-- 5. form_participants — role assignments on a form.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN (
                'participant',
                'creative_writer',
                'presenter',
                'presentation_maker',
                'account_manager',
                'media_person'
              )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, contact_id, role)
);

CREATE INDEX IF NOT EXISTS idx_form_participants_form ON form_participants (form_id);

-- ---------------------------------------------------------------------------
-- 6. form_activity_logs — audit trail (save_draft / submit).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_activity_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_email   TEXT NOT NULL,
  user_name    TEXT,
  action_type  TEXT NOT NULL CHECK (action_type IN ('save_draft', 'submit')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_form_created
  ON form_activity_logs (form_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. document_types — dashboard card definitions. Each row = one rubric
--    on the home dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  target_url    TEXT NOT NULL,
  flow_type     TEXT NOT NULL DEFAULT 'direct_form'
                CHECK (flow_type IN ('send_link', 'direct_form', 'external', 'coming_soon')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 5 rubrics. ON CONFLICT DO NOTHING so re-runs are safe.
INSERT INTO document_types (slug, name, description, icon, target_url, flow_type, sort_order) VALUES
  ('client-brief',           'בריף לקוח',           'שליחת טופס בריף ללקוח',                 'brief',        '/forms/client-brief', 'send_link',    10),
  ('inner-meeting',          'פגישת התנעה',         'מסמך התנעה פנימי אחרי קבלת הבריף',        'meeting',      '/inner-meeting',      'direct_form',  20),
  ('price-quote',            'הצעת מחיר',           'יצירת הצעת מחיר ללקוח',                  'quote',        '/price-quote',        'direct_form',  30),
  ('creative-presentation',  'מצגת קריאייטיבית',    'מצגת קריאייטיב ללקוח',                   'presentation', '/create-proposal',    'direct_form',  40),
  ('summary-presentation',   'מצגת סיכום',          'מצגת סיכום קמפיין (בבנייה)',              'summary',      '/summary',            'coming_soon',  50)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. document_links — unified history/tracking of all sent links and
--    internally-created documents. One row per created link, status goes
--    pending → opened → completed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  document_type_id   UUID NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  created_by_email   TEXT NOT NULL,
  created_by_name    TEXT,
  client_email       TEXT,
  client_name        TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'opened', 'completed', 'archived')),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at          TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_creator  ON document_links (created_by_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_type     ON document_links (document_type_id);
CREATE INDEX IF NOT EXISTS idx_links_status   ON document_links (status) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_links_pending  ON document_links (created_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 9. updated_at trigger — keeps updated_at fresh on UPDATE for tables that have it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts',
    'client_folders',
    'forms',
    'inner_meeting_forms',
    'document_links'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('trg_%s_updated_at', t)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Realtime — inner-meeting collaborative editing needs postgres_changes.
--     Enable replica identity + publication membership for the tables that
--     the client subscribes to.
-- ---------------------------------------------------------------------------
ALTER TABLE inner_meeting_forms REPLICA IDENTITY FULL;
ALTER TABLE forms               REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE inner_meeting_forms;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE forms;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
