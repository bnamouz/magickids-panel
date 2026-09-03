-- Marhaba sales call log: full transcript, metadata, outcome per call
-- Complements marhaba_leads (1 lead → many calls)

CREATE TABLE IF NOT EXISTS marhaba_calls (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES marhaba_leads(id) ON DELETE CASCADE,
  conversation_id TEXT UNIQUE NOT NULL,
  call_sid TEXT,
  agent_id TEXT,
  phone_number_id TEXT,
  direction TEXT DEFAULT 'outbound',

  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_secs INTEGER,

  -- Outcome
  status TEXT,
  termination_reason TEXT,
  call_successful TEXT,

  -- Content
  transcript JSONB DEFAULT '[]'::jsonb,
  transcript_summary TEXT,
  first_message TEXT,

  -- Tool calls made during the call
  tool_calls JSONB DEFAULT '[]'::jsonb,

  -- Cost / usage
  llm_charge NUMERIC(10, 4),

  -- Raw webhook payload (for debugging)
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marhaba_calls_lead_id ON marhaba_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_marhaba_calls_started_at ON marhaba_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_marhaba_calls_status ON marhaba_calls(status);

-- RLS: same policy as marhaba_leads (service_role can do anything, no anon access)
ALTER TABLE marhaba_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
  ON marhaba_calls
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_marhaba_calls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marhaba_calls_updated_at_trigger
  BEFORE UPDATE ON marhaba_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_marhaba_calls_updated_at();

COMMENT ON TABLE marhaba_calls IS 'Per-call log for Marhaba outbound sales. One lead → many calls.';
