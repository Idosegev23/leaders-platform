-- supabase/migrations/20260701_meeting_dates_and_reminders.sql
-- Phase 2 — manual meeting-date fields + "day before meeting" reminders.
-- Adds two manual meeting-date columns on the kickoff doc (inner_meeting_forms)
-- and two "reminder sent" stamps so the daily cron nags exactly once per date.
-- Idempotent: ADD COLUMN IF NOT EXISTS everywhere. No data is modified.

ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS client_presentation_meeting_date      DATE,
  ADD COLUMN IF NOT EXISTS second_meeting_date                   DATE,
  ADD COLUMN IF NOT EXISTS client_presentation_reminder_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_meeting_reminder_sent_at       TIMESTAMPTZ;

-- Defensive: the Canva phase also adds this, but the reminder cron reads it.
-- IF NOT EXISTS makes both migrations safe to run in either order.
ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS canva_edit_url TEXT;

-- Partial indexes so the daily cron's "date == tomorrow AND reminder not sent"
-- scan stays cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_inner_meeting_client_presentation_pending
  ON inner_meeting_forms (client_presentation_meeting_date)
  WHERE client_presentation_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inner_meeting_second_meeting_pending
  ON inner_meeting_forms (second_meeting_date)
  WHERE second_meeting_reminder_sent_at IS NULL;
