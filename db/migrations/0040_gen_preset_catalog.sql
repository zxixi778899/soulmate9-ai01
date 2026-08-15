-- ============================================================================
-- Migration: 0040_gen_preset_catalog
-- Description: Unified generation preset catalog (scenes / poses / outfits /
--              styles / moods). Converges the 7 legacy preset files into one
--              admin-maintained table with preview thumbnails and NSFW
--              levels. Legacy files remain as runtime fallbacks.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- Note: no FK constraints on purpose — the Coze proxy DB applies migrations
--       manually and ownership is enforced at the API layer.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS gen_preset_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- scene | pose | outfit | style | mood
    category VARCHAR(16) NOT NULL
        CHECK (category IN ('scene', 'pose', 'outfit', 'style', 'mood')),

    slug VARCHAR(64) NOT NULL,
    label_en VARCHAR(120) NOT NULL DEFAULT '',
    label_zh VARCHAR(120) NOT NULL DEFAULT '',
    -- Remaining 5 languages resolve via i18n key: presets.{category}.{slug}

    preview_url TEXT,                     -- presets/thumbs/{slug}.webp
    prompt_fragment TEXT NOT NULL DEFAULT '',
    negative_fragment TEXT NOT NULL DEFAULT '',
    lora_hints JSONB DEFAULT '[]'::jsonb, -- [{ name, strength_model, strength_clip }]

    nsfw_level INT NOT NULL DEFAULT 0
        CONSTRAINT ck_gen_preset_nsfw_level CHECK (nsfw_level >= 0 AND nsfw_level <= 5),

    -- free | premium
    tier VARCHAR(16) NOT NULL DEFAULT 'free'
        CHECK (tier IN ('free', 'premium')),

    model_family VARCHAR(32),             -- flux | sdxl | wan22 | svd ... (NULL = any)
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One slug per category (allows same slug across categories).
CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_preset_slug
    ON gen_preset_catalog (category, slug);

CREATE INDEX IF NOT EXISTS idx_gen_preset_active
    ON gen_preset_catalog (category, sort_order)
    WHERE is_active;

COMMIT;
