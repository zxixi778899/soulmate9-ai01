-- ============================================
-- ControlNet Multi-Unit System Database Schema (v3)
-- Compatible with Supabase SQL Editor
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create admin check function directly (no DO block)
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = user_uuid AND p.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add columns to character_presets table
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS openpose_json TEXT NULL;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS body_depth_url TEXT NULL;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS canny_edge_url TEXT NULL;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS bg_mask_url TEXT NULL;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS ip_adapter_face TEXT NULL;
ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS person_mask_url TEXT NULL;

-- Create controlnet_assets table
CREATE TABLE IF NOT EXISTS controlnet_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_id UUID REFERENCES character_presets(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'openpose', 'body_depth', 'canny_edge', 
    'bg_segmentation', 'person_segmentation', 'ip_adapter_face'
  )),
  storage_key TEXT NOT NULL,
  storage_bucket TEXT DEFAULT 'assets',
  file_size_bytes BIGINT,
  processor_version TEXT DEFAULT 'v1.0',
  source_image_url TEXT,
  skeleton_keypoint_count INTEGER,
  depth_map_min FLOAT,
  depth_map_max FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(preset_id, asset_type, storage_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_controlnet_assets_preset ON controlnet_assets(preset_id);
CREATE INDEX IF NOT EXISTS idx_controlnet_assets_type ON controlnet_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_controlnet_assets_created ON controlnet_assets(created_at DESC);

-- Enable Row Level Security
ALTER TABLE controlnet_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read access to ControlNet assets"
  ON controlnet_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin-only write access to ControlNet assets"
  ON controlnet_assets FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Auto-update trigger function
CREATE OR REPLACE FUNCTION update_controlnet_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_update_controlnet_assets_updated_at ON controlnet_assets;
CREATE TRIGGER trigger_update_controlnet_assets_updated_at
  BEFORE UPDATE ON controlnet_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_controlnet_assets_updated_at();
