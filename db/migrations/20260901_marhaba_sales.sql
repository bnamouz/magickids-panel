-- db/migrations/20260901_marhaba_sales.sql
-- Marhaba Sales — schema for outbound sales agent (Nour-Sales mode).
-- Safe to run multiple times (IF NOT EXISTS everywhere).

-- ============================================================
-- Table: marhaba_leads
-- ============================================================
CREATE TABLE IF NOT EXISTS marhaba_leads (
  id BIGSERIAL PRIMARY KEY,
  google_place_id TEXT UNIQUE,
  clinic_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_name TEXT,
  city TEXT,
  address TEXT,
  rating NUMERIC(2,1),
  reviews_count INTEGER,
  fit_score INTEGER DEFAULT 5 CHECK (fit_score >= 0 AND fit_score <= 10),
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'google_places', 'nour_call', 'import')),
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new', 'queued', 'calling', 'demo_booked', 'demo_completed',
    'video_sent', 'callback_requested', 'not_interested',
    'closed_won', 'closed_lost', 'escalated'
  )),
  interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold') OR interest_level IS NULL),
  call_count INTEGER DEFAULT 0,
  call_history JSONB DEFAULT '[]'::jsonb,
  last_call_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  notes TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marhaba_leads_status ON marhaba_leads(status);
CREATE INDEX IF NOT EXISTS idx_marhaba_leads_next_action ON marhaba_leads(next_action_at) WHERE status IN ('new', 'queued');
CREATE INDEX IF NOT EXISTS idx_marhaba_leads_phone ON marhaba_leads(phone);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION marhaba_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marhaba_leads_touch ON marhaba_leads;
CREATE TRIGGER marhaba_leads_touch
  BEFORE UPDATE ON marhaba_leads
  FOR EACH ROW EXECUTE FUNCTION marhaba_touch_updated_at();

-- ============================================================
-- Table: marhaba_demos
-- ============================================================
CREATE TABLE IF NOT EXISTS marhaba_demos (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES marhaba_leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  type TEXT DEFAULT 'demo' CHECK (type IN ('demo', 'callback')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  conversation_id TEXT,
  zoom_link TEXT,
  notes TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marhaba_demos_scheduled ON marhaba_demos(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_marhaba_demos_lead ON marhaba_demos(lead_id);

-- ============================================================
-- View: marhaba_sales_dashboard
-- ============================================================
CREATE OR REPLACE VIEW marhaba_sales_dashboard AS
SELECT
  (SELECT COUNT(*) FROM marhaba_leads WHERE status = 'new') AS new_leads,
  (SELECT COUNT(*) FROM marhaba_leads WHERE status IN ('queued', 'calling')) AS in_queue,
  (SELECT COUNT(*) FROM marhaba_leads WHERE status IN ('demo_booked', 'demo_completed')) AS demos_booked,
  (SELECT COUNT(*) FROM marhaba_leads WHERE status = 'closed_won') AS customers,
  (SELECT SUM(call_count) FROM marhaba_leads WHERE last_call_at >= NOW() - INTERVAL '7 days') AS calls_this_week,
  (SELECT SUM(call_count) FROM marhaba_leads WHERE last_call_at >= NOW() - INTERVAL '30 days') AS calls_this_month,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM marhaba_leads WHERE status IN ('demo_booked', 'demo_completed', 'closed_won'))
    / NULLIF((SELECT COUNT(*) FROM marhaba_leads WHERE call_count > 0), 0),
    1
  ) AS demo_booking_rate_pct;

-- ============================================================
-- RLS: service role bypasses, but keep policies safe for future
-- ============================================================
ALTER TABLE marhaba_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marhaba_demos ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role (used by API routes) can read/write.

-- ============================================================
-- Seed data (safe to remove after real leads imported)
-- ============================================================
INSERT INTO marhaba_leads (clinic_name, phone, city, contact_name, status, fit_score, source, notes)
VALUES
  ('מרפאת שיניים דמו - בדיקה 1', '+972501234567', 'ירושלים', 'ד"ר טסט', 'new', 8, 'manual', 'שורת דמו - למחיקה אחרי בדיקה'),
  ('מרפאת שיניים דמו - בדיקה 2', '+972501234568', 'תל אביב', null, 'new', 6, 'manual', 'שורת דמו - למחיקה אחרי בדיקה'),
  ('מרפאת שיניים דמו - בדיקה 3', '+972501234569', 'חיפה', 'ד"ר לוי', 'new', 7, 'manual', 'שורת דמו - למחיקה אחרי בדיקה')
ON CONFLICT DO NOTHING;
