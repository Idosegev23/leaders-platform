-- Presentation Shares — view-only link sharing
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS presentation_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token VARCHAR(12) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  viewer_config JSONB DEFAULT '{"mode":"slideshow","transitions":"fade","autoPlay":false,"autoPlayInterval":5000,"showProgress":true,"showNav":true,"showToc":false,"allowFullscreen":true,"showBranding":true,"showCta":false}'::jsonb,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup by token (only active shares)
CREATE INDEX IF NOT EXISTS idx_shares_token ON presentation_shares(share_token) WHERE is_active = true;
-- Find shares by document
CREATE INDEX IF NOT EXISTS idx_shares_document ON presentation_shares(document_id);

-- Analytics per viewing session
CREATE TABLE IF NOT EXISTS share_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES presentation_shares(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  slides_viewed JSONB DEFAULT '[]'::jsonb,
  total_duration_ms INTEGER DEFAULT 0,
  cta_clicked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_share ON share_analytics(share_id);

-- RLS Policies
ALTER TABLE presentation_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_analytics ENABLE ROW LEVEL SECURITY;

-- Owners can manage their shares
CREATE POLICY "Users can manage own shares" ON presentation_shares
  FOR ALL USING (auth.uid() = user_id);

-- Public read access by token (for the viewer page)
CREATE POLICY "Public read by token" ON presentation_shares
  FOR SELECT USING (is_active = true);

-- Anyone can insert analytics (public viewer)
CREATE POLICY "Public insert analytics" ON share_analytics
  FOR INSERT WITH CHECK (true);

-- Owners can read analytics for their shares
CREATE POLICY "Owners read analytics" ON share_analytics
  FOR SELECT USING (
    share_id IN (SELECT id FROM presentation_shares WHERE user_id = auth.uid())
  );
