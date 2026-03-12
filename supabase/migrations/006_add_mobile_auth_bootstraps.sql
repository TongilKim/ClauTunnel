-- One-time bootstrap codes for securely handing off mobile auth from CLI startup
CREATE TABLE mobile_auth_bootstraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mobile_auth_bootstraps_user_id ON mobile_auth_bootstraps(user_id);
CREATE INDEX idx_mobile_auth_bootstraps_expires_at ON mobile_auth_bootstraps(expires_at);

ALTER TABLE mobile_auth_bootstraps ENABLE ROW LEVEL SECURITY;
