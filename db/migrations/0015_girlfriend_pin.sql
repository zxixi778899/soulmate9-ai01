-- 0015: Add pin/top functionality to girlfriends
-- Allows users to pin created companions to the top of their friends list

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Index for efficient pinned-first sorting
CREATE INDEX IF NOT EXISTS idx_girlfriends_pinned
  ON girlfriends (user_id, is_pinned DESC, pinned_at DESC NULLS LAST);
