-- Add the three activity tables to supabase_realtime so the dashboard
-- Live Hub Feed can subscribe to postgres_changes.
ALTER TABLE document_links      REPLICA IDENTITY FULL;
ALTER TABLE documents           REPLICA IDENTITY FULL;
ALTER TABLE form_activity_logs  REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE document_links;      EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE documents;           EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE form_activity_logs;  EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
