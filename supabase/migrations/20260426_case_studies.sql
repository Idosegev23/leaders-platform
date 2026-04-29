-- Leaders' historic campaigns. The deck planner pulls relevant ones
-- (matched by industry) and the slide HTML embeds them as proof points.
CREATE TABLE IF NOT EXISTS case_studies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name      TEXT NOT NULL,
  industry        TEXT NOT NULL,           -- normalized slug, matches lookupIndustryBenchmark
  year            INTEGER NOT NULL,
  brief_summary   TEXT NOT NULL,           -- 1-2 sentence challenge description
  approach        TEXT,                    -- what we did
  deliverables    TEXT,                    -- short summary of outputs
  results         JSONB NOT NULL DEFAULT '{}'::jsonb,
                                           -- { reach, engagement, cpe, conversions, roas, ... }
  thumbnail_url   TEXT,
  hero_image_url  TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  created_by_email TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_studies_industry ON case_studies (industry, year DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_case_studies_featured ON case_studies (is_featured) WHERE is_featured;

CREATE TRIGGER trg_case_studies_updated_at
  BEFORE UPDATE ON case_studies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed three placeholder case studies so the planner has data to work
-- with on day one. Replace with real numbers via the admin UI.
INSERT INTO case_studies (brand_name, industry, year, brief_summary, approach, deliverables, results, is_featured)
VALUES
  ('Castro Home', 'fashion', 2025,
    'השקת קולקציית הקיץ של Castro Home — אתגר: להחזיר את הקטגוריה לרלוונטיות מול H&M Home.',
    '12 משפיעני לייפסטייל בכל הטירים, 3 הפקות בבתים אייקוניים, מדיה ממומנת ממוקדת ריטרגטינג.',
    '6 reels בהפקה גבוהה · 18 סטוריז · 1 קמפיין UGC',
    '{"reach": 4800000, "engagement_rate": 3.4, "cpe": 3.9, "conversions": 1240, "campaign_value_ils": 540000}'::jsonb,
    true),
  ('Aroma', 'food', 2024,
    'השקת סדרת משקאות קיץ — אתגר: להצעיר את התדמית לקהל 18-28 בלי לאבד את הוותיקים.',
    '15 משפיעני קולינריה ולייפסטייל + הפקת 3 סרטים פרימיום בסניפים אייקוניים.',
    '4 reels הפקה · 22 סטוריז · 12 פוסטים אורגניים',
    '{"reach": 6200000, "engagement_rate": 4.1, "cpe": 4.3, "lift_in_brand_search": 38}'::jsonb,
    true),
  ('Tempo', 'beverage', 2025,
    'קמפיין אובדן משקל ל-Tempo Zero — לקהל 30+ עם רגישות לטון "מוסר".',
    '8 משפיעני ספורט ובריאות באותנטיות מובהקת + סדרת before/after עם הסכמת הצוות הרפואי שלנו.',
    '5 reels · 25 סטוריז · קמפיין מסעדן ב-TikTok',
    '{"reach": 3100000, "engagement_rate": 5.2, "cpe": 2.8, "trial_uplift_pct": 27}'::jsonb,
    false)
ON CONFLICT DO NOTHING;
