-- 0045: publish/review status for generation_jobs (companion album publishing).
-- Works generated into a companion album are private by default; the owner
-- can submit a finished image job for review (publish_status='pending'),
-- admins approve → 'approved' (public) or reject → 'none'.
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS publish_status VARCHAR(16) NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gen_jobs_publish_status_check'
  ) THEN
    ALTER TABLE generation_jobs
      ADD CONSTRAINT gen_jobs_publish_status_check
      CHECK (publish_status IN ('none', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS publish_requested_at TIMESTAMPTZ;
ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS publish_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gen_jobs_publish_status
  ON generation_jobs (publish_status, created_at DESC);

COMMIT;
