CREATE TABLE mobile_auth_claim_rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mobile_auth_claim_rate_limits_window_started_at
  ON mobile_auth_claim_rate_limits(window_started_at);

ALTER TABLE mobile_auth_claim_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY mobile_auth_claim_rate_limits_no_access
  ON mobile_auth_claim_rate_limits
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER update_mobile_auth_claim_rate_limits_updated_at
  BEFORE UPDATE ON mobile_auth_claim_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
