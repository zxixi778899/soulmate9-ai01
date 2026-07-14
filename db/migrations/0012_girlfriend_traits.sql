-- 0012_girlfriend_traits.sql
-- Adds the trait, ordering, and review columns that the admin /girlfriends
-- page and public catalog depend on but which were never migrated to
-- production Supabase. Without these, saving a girlfriend from the admin
-- page fails with "missing columns: ..." and the public catalog cannot
-- filter approved entries.
--
-- Run once in Supabase SQL editor:
--   https://supabase.com/dashboard/project/<ref>/sql/new
-- All ADD statements use IF NOT EXISTS for idempotency.

-- ── Personal traits (randomize_all + public profile) ──────────────────────────
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS age INT DEFAULT 22,
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(64) DEFAULT '',
  ADD COLUMN IF NOT EXISTS hobbies TEXT DEFAULT '';

-- ── Catalog ordering & visibility flags (admin grid + public landing) ────────
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS hot_score INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- ── Public review workflow (review_status column is required by index
--    idx_girlfriends_public_access created in migration 0007) ─────────────────
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(128);

-- ── Check constraints ─────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE girlfriends
    ADD CONSTRAINT girlfriends_age_chk
    CHECK (age IS NULL OR (age >= 18 AND age <= 99));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE girlfriends
    ADD CONSTRAINT girlfriends_review_status_chk
    CHECK (review_status IN ('draft', 'pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE girlfriends
    ADD CONSTRAINT girlfriends_hot_score_chk
    CHECK (hot_score IS NULL OR (hot_score >= 0 AND hot_score <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_girlfriends_age
  ON girlfriends (age)
  WHERE age IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_girlfriends_hot
  ON girlfriends (is_hot, hot_score DESC)
  WHERE is_hot = true;

CREATE INDEX IF NOT EXISTS idx_girlfriends_featured
  ON girlfriends (is_featured, sort_order)
  WHERE is_featured = true;

CREATE INDEX IF NOT EXISTS idx_girlfriends_review_status
  ON girlfriends (review_status)
  WHERE review_status IS NOT NULL;

-- Migration 0007 created idx_girlfriends_public_access on
-- (is_public, review_status, access_status). It will start being used
-- once the two new columns exist with reasonable defaults.

CREATE UNIQUE INDEX IF NOT EXISTS idx_girlfriends_slug
  ON girlfriends (slug)
  WHERE slug IS NOT NULL;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON COLUMN girlfriends.age IS '18-99, randomized in 20-28 by admin randomize_traits';
COMMENT ON COLUMN girlfriends.occupation IS 'Free-form occupation string, e.g. 学妹 / 邻居 / 空姐';
COMMENT ON COLUMN girlfriends.hobbies IS 'Comma-separated hobby tags';
COMMENT ON COLUMN girlfriends.hot_score IS '0-100, drives public landing order when is_hot=true';
COMMENT ON COLUMN girlfriends.is_featured IS 'When true, appears on homepage featured carousel';
COMMENT ON COLUMN girlfriends.is_hot IS 'When true, appears on public landing hot grid';
COMMENT ON COLUMN girlfriends.sort_order IS 'Lower = earlier in featured/hot lists';
COMMENT ON COLUMN girlfriends.review_status IS 'draft | pending | approved | rejected — admin moderation';
COMMENT ON COLUMN girlfriends.submitted_at IS 'Timestamp when review_status flipped to pending';
COMMENT ON COLUMN girlfriends.is_public IS 'Visible on public landing after review_status=approved';
COMMENT ON COLUMN girlfriends.slug IS 'URL slug used by /girlfriend/[slug] detail page';