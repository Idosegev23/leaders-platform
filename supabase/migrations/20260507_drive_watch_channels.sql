-- Drive push-notification channel state.
--
-- Google Drive supports webhook notifications via channels that expire
-- every ~7 days. We register one channel for the LEADERS shared drive,
-- store its id + resource_id + expiration, and renew via cron before
-- expiry. The webhook handler validates incoming notifications by
-- matching the channel id + token to a row here.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS drive_watch_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Drive's identifiers for the channel + the resource it watches.
  channel_id      TEXT NOT NULL UNIQUE,           -- the UUID we sent to Drive
  resource_id     TEXT NOT NULL,                  -- Drive's id for the watched changes feed
  drive_id        TEXT NOT NULL,                  -- the Shared Drive id (so we can scope on changes.list)
  -- Shared secret echoed back in every notification's x-goog-channel-token header.
  token           TEXT NOT NULL,
  -- Drive's start_page_token for changes.list — advanced after every fetch
  -- so we don't re-process already-seen changes.
  page_token      TEXT NOT NULL,
  -- When Drive will stop sending — must renew before this.
  expires_at      TIMESTAMPTZ NOT NULL,
  -- Bookkeeping for the renew cron.
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ,
  notification_count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS drive_watch_channels_active_expires_idx
  ON drive_watch_channels (active, expires_at);
