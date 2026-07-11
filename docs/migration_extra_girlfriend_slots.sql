-- Permanent companion seat packs (bonus slots beyond plan base).
-- Run on data Supabase (Coze proxy schema) before selling seats in production.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS extra_girlfriend_slots integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.extra_girlfriend_slots IS
  'Permanent bonus girlfriend seats purchased via Stripe (stacks with membership base).';
