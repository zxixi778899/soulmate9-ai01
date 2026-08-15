-- ============================================================================
-- Migration: 0039_generation_jobs
-- Description: Unified generation job queue (gen-hub) for image/video/
--              portrait/try-on pipelines. Single source of truth for status,
--              cost, refund and provider attempts across all entries.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- Note: no FK constraints on purpose — the Coze proxy DB applies migrations
--       manually and ownership is enforced at the API layer.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Idempotency: clients pass a key; same key + user returns the same job
    -- instead of double-charging. Partial unique index keeps NULL keys free.
    idempotency_key VARCHAR(128),

    user_id UUID NOT NULL,
    girlfriend_id UUID,

    -- image | video | portrait | tryon | chat_image
    kind VARCHAR(32) NOT NULL,

    -- pending | queued | running | uploading | completed | failed | cancelled
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'running', 'uploading',
                          'completed', 'failed', 'cancelled')),

    -- Client-visible progress stage: queued | generating | uploading | done
    stage VARCHAR(16) NOT NULL DEFAULT 'queued',

    provider VARCHAR(32),                 -- runpod | fal | together | runpod_dc2 ...
    provider_job_id VARCHAR(128),         -- RunPod job id for resume/polling

    params JSONB DEFAULT '{}'::jsonb,     -- request parameters (prompt-free audit safe copy)
    nsfw_level INT NOT NULL DEFAULT 0
        CONSTRAINT ck_gen_job_nsfw_level CHECK (nsfw_level >= 0 AND nsfw_level <= 5),

    cost_tokens INT NOT NULL DEFAULT 0,   -- credits charged for this job
    refunded BOOLEAN NOT NULL DEFAULT FALSE,

    error TEXT,
    result JSONB,                         -- { url, seed, latency_ms, provider, fallback_used }
    attempts JSONB DEFAULT '[]'::jsonb,   -- provider attempt trail from image-router

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Idempotent partial unique index on (user_id, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_jobs_idempotency
    ON generation_jobs (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gen_jobs_user_created
    ON generation_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gen_jobs_provider_job
    ON generation_jobs (provider_job_id)
    WHERE provider_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gen_jobs_status_created
    ON generation_jobs (status, created_at DESC);

COMMIT;
