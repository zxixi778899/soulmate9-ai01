-- Comfy operations console: generated assets library + optional workflow rows

CREATE TABLE IF NOT EXISTS generation_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID,
  kind VARCHAR(32) NOT NULL DEFAULT 'custom', -- girlfriend | outfit | prop | custom | tryon
  storage_key TEXT NOT NULL,
  url TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  workflow_id TEXT,
  endpoint_id TEXT,
  ckpt_name TEXT,
  lora_name TEXT,
  width INTEGER,
  height INTEGER,
  steps INTEGER,
  cfg REAL,
  seed BIGINT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_assets_created_at_idx
  ON generation_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS generation_assets_kind_idx
  ON generation_assets (kind);
CREATE INDEX IF NOT EXISTS generation_assets_created_by_idx
  ON generation_assets (created_by);

COMMENT ON TABLE generation_assets IS 'Admin Comfy console generated images; storage_key for delete';
