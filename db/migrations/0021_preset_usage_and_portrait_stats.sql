-- 0021: preset usage telemetry + preset portrait cache stats (M3/M4)
-- Idempotent: safe to re-run.

-- ── Preset usage telemetry (drives library expansion decisions) ──
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- ── Shared preset portrait cache hit-rate stats ──
CREATE TABLE IF NOT EXISTS preset_portrait_stats (
  slug TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  portrait_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';

-- ── Companion catalog categories (M4: public directory filtering) ──
-- Was defined only in Drizzle schema (schema-commerce.ts), never migrated.
CREATE TABLE IF NOT EXISTS girlfriend_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  girlfriend_id UUID NOT NULL,
  category_type VARCHAR(32) NOT NULL,   -- 'personality' | 'body_type' | 'vibe' | 'relationship'
  category_value VARCHAR(64) NOT NULL,  -- e.g. 'gentle', 'sporty', 'sweet'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS girlfriend_categories_gf_idx ON girlfriend_categories (girlfriend_id);
CREATE INDEX IF NOT EXISTS girlfriend_categories_type_idx ON girlfriend_categories (category_type);
CREATE INDEX IF NOT EXISTS girlfriend_categories_value_idx ON girlfriend_categories (category_value);
