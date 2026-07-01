-- supabase/migrations/20260702_canva_integration.sql
-- Phase 3 — Canva Connect: single connected service-account token row +
-- kickoff-doc columns that hold the imported deck's Canva links.
-- Idempotent: safe to re-run.

-- 1. canva_tokens — ONE row (single connected Canva service account).
--    Refresh tokens are single-use/rotating; getValidAccessToken() persists
--    the NEW refresh_token on every refresh.
CREATE TABLE IF NOT EXISTS canva_tokens (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email             TEXT,
  refresh_token             TEXT NOT NULL,
  access_token              TEXT,
  access_token_expires_at   TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Item-2 columns on the kickoff doc: link the deck + store its Canva links.
ALTER TABLE inner_meeting_forms
  ADD COLUMN IF NOT EXISTS client_presentation_meeting_date        DATE,
  ADD COLUMN IF NOT EXISTS second_meeting_date                     DATE,
  ADD COLUMN IF NOT EXISTS client_presentation_reminder_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_meeting_reminder_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_deck_document_id                 UUID,
  ADD COLUMN IF NOT EXISTS canva_design_id                         TEXT,
  ADD COLUMN IF NOT EXISTS canva_edit_url                          TEXT,
  ADD COLUMN IF NOT EXISTS canva_view_url                          TEXT,
  ADD COLUMN IF NOT EXISTS canva_link_updated_at                   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inner_meeting_linked_deck
  ON inner_meeting_forms (linked_deck_document_id)
  WHERE linked_deck_document_id IS NOT NULL;
