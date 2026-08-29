-- Create public_assets table for resource management
CREATE TABLE IF NOT EXISTS public_assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Thumbnail URLs (JSON format)
  thumbnail_urls JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE public_assets ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_public_assets_category ON public_assets(category);
CREATE INDEX IF NOT EXISTS idx_public_assets_uploaded_by ON public_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_public_assets_uploaded_at ON public_assets(uploaded_at DESC);

-- Policies
-- Public read access (for authenticated users to browse assets)
CREATE POLICY "Public assets are viewable by all authenticated users"
  ON public_assets FOR SELECT
  TO authenticated
  USING (true);

-- Users can upload their own assets
CREATE POLICY "Users can insert their own assets"
  ON public_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

-- Users can delete their own assets
CREATE POLICY "Users can delete their own assets"
  ON public_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

-- Admins can manage all assets (via service role or admin role)
CREATE POLICY "Admins can manage all assets"
  ON public_assets
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public_assets IS '公共资产管理 - 存储用户上传的图片、模型等资源';
COMMENT ON COLUMN public_assets.category IS '资源分类：general, outfit, pose, scene, character 等';
COMMENT ON COLUMN public_assets.tags IS '标签数组，用于搜索和过滤';
