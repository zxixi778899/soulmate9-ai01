-- ============================================================
-- P1-Cache: generation_cache 表
-- 用途：缓存 RunPod 生成结果（FLUX / CogVideoX），同 (prompt, params, model) 24h/7d 直接复用
-- 预计效果：GPU 成本 -60%
-- ============================================================

CREATE TABLE IF NOT EXISTS generation_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  oss_key TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(cache_key, kind)
);

CREATE INDEX IF NOT EXISTS idx_generation_cache_expires ON generation_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_generation_cache_kind_key ON generation_cache (kind, cache_key);

-- 命中计数自增 RPC（Fire-and-forget 用）
CREATE OR REPLACE FUNCTION increment_cache_hit(p_key TEXT)
RETURNS void AS $$
BEGIN
  UPDATE generation_cache SET hit_count = hit_count + 1 WHERE cache_key = p_key;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- RLS：service_role 完全访问；anon/authenticated 只能读自己的（但通常不直接读）
ALTER TABLE generation_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access on generation_cache" ON generation_cache;
CREATE POLICY "service_role full access on generation_cache" ON generation_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 注释
COMMENT ON TABLE generation_cache IS 'RunPod 生成结果缓存；命中跳过 GPU 调用';
COMMENT ON COLUMN generation_cache.cache_key IS 'SHA256 of (prompt, negative_prompt, w, h, steps, guidance, model, kind)';