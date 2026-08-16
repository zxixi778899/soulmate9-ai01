-- ============================================================================
-- Migration: 0042_preset_matrix_pack
-- Description: Extend gen_preset_catalog for the multi-model matrix + 
--              capabilities workflow. Adds gender/style_family/pose_reference
--              and workflow_flags (face_fix, upscale, identity) so presets
--              drive model selection + enhancement passes.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- Notes: Coze proxy DB applies migrations manually; no FK constraints.
-- ============================================================================

BEGIN;

-- Add new columns to gen_preset_catalog (idempotent via IF NOT EXISTS).
ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS gender VARCHAR(16) DEFAULT 'female'
    CHECK (gender IN ('female', 'male', 'trans', 'all'));

ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS style_family VARCHAR(16) DEFAULT 'realistic'
    CHECK (style_family IN ('realistic', 'anime', '3d'));

ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS pose_reference TEXT;
-- URL or storage key for ControlNet pose image thumbnail / reference.

ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS workflow_flags JSONB DEFAULT '{}'::jsonb;
-- { "face_fix": true, "upscale": 2, "identity_image": true } default choices from preset.

-- Update indexes if they don't exist (defensive).
CREATE INDEX IF NOT EXISTS idx_gen_preset_matrix_lookup
    ON gen_preset_catalog (category, gender, style_family, nsfw_level, sort_order)
    WHERE is_active;

COMMIT;
