-- Remove direct INSERT access to mobile_pairings.
-- Pairing codes are now created via the create-mobile-pairing Edge Function
-- (which uses the service role to bypass RLS). This prevents direct client-side
-- inserts but does not enforce caller identity — any valid user JWT can invoke
-- the function. In practice, only the CLI calls it during `clautunnel start`.

DROP POLICY mobile_pairings_insert_policy ON mobile_pairings;
