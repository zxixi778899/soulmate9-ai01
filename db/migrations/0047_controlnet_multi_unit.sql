-- ============================================
-- ControlNet Multi-Unit System Database Schema
-- Migration File: 0047_controlnet_multi_unit.sql
-- Description: Add ControlNet asset storage to presets & dedicated assets table
-- Date: 2026-08-28
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Phase 1: Add columns to gen_presets table
-- ============================================

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS openpose_json TEXT NULL COMMENT 'OpenPose skeleton JSON file URL';

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS body_depth_url TEXT NULL COMMENT 'Body depth map PNG URL (for pose/outfit)';

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS canny_edge_url TEXT NULL COMMENT 'Canny edge map PNG URL (for outfit/scene)';

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS bg_mask_url TEXT NULL COMMENT 'Background segmentation mask PNG URL';

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS ip_adapter_face TEXT NULL COMMENT 'IP-Adapter face reference image URL';

ALTER TABLE gen_presets 
ADD COLUMN IF NOT EXISTS person_mask_url TEXT NULL COMMENT 'Person segmentation mask PNG URL (for try-on)';

-- Add comments to new columns for documentation
COMMENT ON COLUMN gen_presets.openpose_json IS 'Pre-processed OpenPose skeleton in standard format (18 keypoints)';
COMMENT ON COLUMN gen_presets.body_depth_url IS 'MiDaS depth estimation map (grayscale PNG, 0=far, 255=near)';
COMMENT ON COLUMN gen_presets.canny_edge_url IS 'Canny edge detection output with adaptive thresholds';
COMMENT ON COLUMN gen_presets.bg_mask_url IS 'Background segmentation mask for scene isolation (ISO-VAE trained)';
COMMENT ON COLUMN gen_presets.ip_adapter_face IS 'Extracted face crop (512x512) for IP-Adapter facial recognition';
COMMENT ON COLUMN gen_presets.person_mask_url IS 'Human segmentation mask prioritizing clothing region for try-on';

-- Add index for faster querying by ControlNet resource availability
CREATE INDEX IF NOT EXISTS idx_gen_presets_has_controlnet_resources 
ON gen_presets (
  CASE 
    WHEN openpose_json IS NOT NULL 
      OR body_depth_url IS NOT NULL 
      OR canny_edge_url IS NOT NULL 
      OR ip_adapter_face IS NOT NULL 
    THEN true 
    ELSE false 
  END
);

-- ============================================
-- Phase 2: Create dedicated controlnet_assets table
-- ============================================

CREATE TABLE IF NOT EXISTS controlnet_assets (
  -- Primary key (UUID auto-generated)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Foreign key reference to preset (nullable for manually uploaded assets)
  preset_id UUID REFERENCES gen_presets(id) ON DELETE CASCADE,
  
  -- Asset metadata
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'openpose',        -- OpenPose skeleton JSON
    'body_depth',      -- Body depth map
    'canny_edge',      -- Canny edge detection
    'bg_segmentation', -- Background mask
    'person_segmentation', -- Person/clothing mask
    'ip_adapter_face'  -- Face crop for identity lock
  )),
  
  storage_key TEXT NOT NULL,         -- Supabase Storage path/key
  storage_bucket TEXT DEFAULT 'assets',  -- Storage bucket name
  file_size_bytes BIGINT,            -- Compressed file size
  
  -- Processing metadata
  processor_version TEXT DEFAULT 'v1.0',   -- Version of preprocessing pipeline used
  source_image_url TEXT,                   -- Original preset image URL (for audit)
  
  -- Quality metrics (optional)
  skeleton_keypoint_count INTEGER,         -- For openpose: number of detected keypoints
  depth_map_min FLOAT,                     -- Depth range statistics
  depth_map_max FLOAT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate uploads
  UNIQUE(preset_id, asset_type, storage_key)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_controlnet_assets_preset 
ON controlnet_assets(preset_id);

CREATE INDEX IF NOT EXISTS idx_controlnet_assets_type 
ON controlnet_assets(asset_type);

CREATE INDEX IF NOT EXISTS idx_controlnet_assets_created 
ON controlnet_assets(created_at DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE controlnet_assets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can READ all public assets
CREATE POLICY "Allow public read access to ControlNet assets"
  ON controlnet_assets FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admins can INSERT/UPDATE (assumes isAdmin() helper function exists)
CREATE POLICY "Admin-only write access to ControlNet assets"
  ON controlnet_assets FOR ALL
  TO authenticated
  USING (is_admin(user_id))
  WITH CHECK (is_admin(user_id));

-- ============================================
-- Phase 3: Migrate existing preset data
-- ============================================

-- Optional: Log current state before migration
INSERT INTO __migrations_log__ (migration_file, description, run_at)
VALUES ('0047_controlnet_multi_unit.sql', 'Add ControlNet multi-unit asset support', NOW());

-- ============================================
-- Phase 4: Helper functions & triggers
-- ============================================

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_controlnet_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_controlnet_assets_updated_at ON controlnet_assets;
CREATE TRIGGER trigger_update_controlnet_assets_updated_at
  BEFORE UPDATE ON controlnet_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_controlnet_assets_updated_at();

-- ============================================
-- Notes for deployment:
-- ============================================
-- 1. This migration adds ~6 new TEXT columns to gen_presets (~6 bytes each when NULL)
-- 2. Creates new controlnet_assets table (~500KB per 10k assets)
-- 3. Requires Supabase Storage bucket 'assets' with subfolder structure:
--    /controlnet/{preset_id}/{asset_type}.{ext}
-- 4. Estimated execution time: < 1 minute for database with 1000+ presets
-- 5. Rollback: Drop constraints and tables in reverse order

-- ============================================
-- Testing queries:
-- ============================================

-- Check how many presets have at least one ControlNet asset
/*
SELECT 
  COUNT(*) FILTER (WHERE openpose_json IS NOT NULL) as presets_with_pose,
  COUNT(*) FILTER (WHERE canny_edge_url IS NOT NULL) as presets_with_canny,
  COUNT(*) FILTER (WHERE body_depth_url IS NOT NULL) as presets_with_depth,
  COUNT(*) FILTER (WHERE ip_adapter_face IS NOT NULL) as presets_with_identity
FROM gen_presets;
*/

-- Get full asset list for a specific preset
/*
SELECT 
  p.slug,
  p.category,
  c.asset_type,
  c.storage_key,
  c.file_size_bytes,
  c.created_at
FROM gen_presets p
LEFT JOIN controlnet_assets c ON p.id = c.preset_id
WHERE p.slug = 'dance_v1'
ORDER BY c.asset_type;
*/
