-- Mobile pairing table: short-lived codes for CLI-to-mobile device pairing
-- The CLI creates a pairing code (via Edge Function), embeds it in a QR URL,
-- and the mobile app redeems it via an Edge Function to get its own Supabase session.
-- Codes are reusable within their TTL (5 min) to support disconnect/re-pair flows.

CREATE TABLE mobile_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by code (used by the Edge Function on redeem)
CREATE INDEX idx_mobile_pairings_code ON mobile_pairings(code);

-- Cleanup: find expired/unredeemed pairings
CREATE INDEX idx_mobile_pairings_expires_at ON mobile_pairings(expires_at);

-- Enable Row Level Security
ALTER TABLE mobile_pairings ENABLE ROW LEVEL SECURITY;

-- NOTE: INSERT policy was dropped in 010_restrict_pairing_insert.sql.
-- Pairing codes are created exclusively via the create-mobile-pairing Edge Function.

-- Users can view their own pairing codes
CREATE POLICY mobile_pairings_select_policy ON mobile_pairings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own pairing codes (cleanup)
CREATE POLICY mobile_pairings_delete_policy ON mobile_pairings
  FOR DELETE
  USING (auth.uid() = user_id);
