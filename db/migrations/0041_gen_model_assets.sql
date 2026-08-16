-- ============================================================================
-- Migration: 0041_gen_model_assets
-- Description: Model asset inventory for the multi-model generation matrix
--              (SDXL production endpoint + FLUX premium endpoint). Tracks
--              checkpoints / LoRAs / ControlNet models / upscalers /
--              embeddings with install & verification status so routing can
--              gate requests on real readiness instead of env flags alone.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- Note: no FK constraints on purpose — the Coze proxy DB applies migrations
--       manually and ownership is enforced at the API layer.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS gen_model_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- checkpoint | lora | controlnet | upscaler | embedding | ipadapter | detector
    asset_type VARCHAR(16) NOT NULL
        CHECK (asset_type IN ('checkpoint', 'lora', 'controlnet', 'upscaler',
                              'embedding', 'ipadapter', 'detector')),

    -- flux | sdxl | illustrious | pony | any
    model_family VARCHAR(16) NOT NULL DEFAULT 'any'
        CHECK (model_family IN ('flux', 'sdxl', 'illustrious', 'pony', 'any')),

    -- Exact filename on the worker volume (e.g. RealVisXL_V5.0.safetensors)
    name VARCHAR(190) NOT NULL,

    -- Which endpoint scope the asset belongs to (env-key style, free-form):
    -- runpod-sdxl-pro | runpod-flux | runpod-video | any
    endpoint_scope VARCHAR(64) NOT NULL DEFAULT 'any',

    -- Optional Civitai model/version URL used by download scripts.
    civitai_source TEXT,

    -- Scenario tags for routing plans: female|male|transgender|anime|style|
    -- nsfw|sfw|control|face|upscale|identity ...
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,

    installed BOOLEAN NOT NULL DEFAULT FALSE,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    nsfw BOOLEAN NOT NULL DEFAULT FALSE,

    notes TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (asset_type, name).
CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_model_asset_name
    ON gen_model_assets (asset_type, name);

CREATE INDEX IF NOT EXISTS idx_gen_model_asset_lookup
    ON gen_model_assets (model_family, asset_type)
    WHERE is_active;

COMMIT;
