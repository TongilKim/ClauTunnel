-- Remove direct INSERT access to mobile_pairings.
-- Pairing codes are now created exclusively via the create-mobile-pairing
-- Edge Function (which uses the service role to bypass RLS), enforcing
-- that only the CLI — not a paired mobile session — can mint new codes.

DROP POLICY mobile_pairings_insert_policy ON mobile_pairings;
