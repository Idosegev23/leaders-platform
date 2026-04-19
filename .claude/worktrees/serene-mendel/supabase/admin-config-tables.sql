-- Admin Configuration Tables
-- Run this in Supabase SQL Editor

-- Main config table
CREATE TABLE IF NOT EXISTS admin_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  value_type TEXT NOT NULL DEFAULT 'text',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, key)
);

CREATE INDEX IF NOT EXISTS idx_admin_config_category ON admin_config(category);
CREATE INDEX IF NOT EXISTS idx_admin_config_key ON admin_config(category, key);

-- History table for rollback
CREATE TABLE IF NOT EXISTS admin_config_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES admin_config(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_history_config ON admin_config_history(config_id);
CREATE INDEX IF NOT EXISTS idx_config_history_time ON admin_config_history(changed_at DESC);

-- RLS Policies
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config_history ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admin read config" ON admin_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Admin-only write
CREATE POLICY "Admin write config" ON admin_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admin update config" ON admin_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admin delete config" ON admin_config FOR DELETE
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- History read-only for admins
CREATE POLICY "Admin read history" ON admin_config_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admin insert history" ON admin_config_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Service role bypass (for server-side config reads)
CREATE POLICY "Service role read config" ON admin_config FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role read history" ON admin_config_history FOR SELECT
  USING (auth.role() = 'service_role');
