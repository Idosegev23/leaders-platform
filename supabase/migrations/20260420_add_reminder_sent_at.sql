-- Track when a reminder email was sent for each pending brief link
-- so the cron doesn't re-spam the creator day after day.
ALTER TABLE document_links
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_links_reminder_pending
  ON document_links (created_at)
  WHERE status = 'pending' AND reminder_sent_at IS NULL;
