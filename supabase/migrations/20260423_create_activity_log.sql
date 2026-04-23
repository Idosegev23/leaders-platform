-- Generic activity log: every "something happened" from any source
-- writes one row. Dashboard feed + ticker read from here.
CREATE TABLE IF NOT EXISTS activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,
  source_ref    TEXT,
  action_type   TEXT NOT NULL,
  summary       TEXT,
  entity_type   TEXT,
  entity_id     UUID,
  actor_email   TEXT,
  actor_name    TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created    ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity     ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_source_ref ON activity_log (source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_source     ON activity_log (source, created_at DESC);

ALTER TABLE activity_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
