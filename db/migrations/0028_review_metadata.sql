-- 0028: Review metadata for the publish-to-library flow.
--
-- Product rule: user-created companions stay private (owner-only) until the
-- owner submits them for review and an admin approves. Only then do they
-- enter the public library (is_public = true AND review_status = 'approved').
--
-- rejection_reason: admin-provided reason shown to the creator after a reject
-- approved_at:      timestamp when the companion was approved into the library

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
