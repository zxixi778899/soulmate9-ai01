-- Migration: Cache monitoring procedures
-- Purpose: Add cache hit/miss tracking and analytics

CREATE TABLE IF NOT EXISTS cache_metrics_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  cache_key TEXT NOT NULL,
  scene TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('hit', 'miss')),
  lookup_time_ms INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_cache_metrics_user ON cache_metrics_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_scene ON cache_metrics_log(scene);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_event ON cache_metrics_log(event_type);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_created ON cache_metrics_log(created_at);

-- Function to track cache hits
CREATE OR REPLACE FUNCTION track_cache_hit(
  p_user_id UUID,
  p_cache_key TEXT,
  p_scene TEXT,
  p_lookup_time_ms INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_hit_count INTEGER;
BEGIN
  UPDATE generation_cache 
  SET hit_count = hit_count + 1,
      last_hit_at = NOW()
  WHERE cache_key = p_cache_key 
    AND kind = 'image'
    AND expires_at > NOW() AT TIME ZONE 'UTC';
  
  INSERT INTO cache_metrics_log (user_id, cache_key, scene, event_type, lookup_time_ms)
  VALUES (p_user_id, p_cache_key, p_scene, 'hit', p_lookup_time_ms);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track cache misses
CREATE OR REPLACE FUNCTION track_cache_miss(
  p_user_id UUID,
  p_cache_key TEXT,
  p_scene TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cache_metrics_log (user_id, cache_key, scene, event_type, lookup_time_ms)
  VALUES (p_user_id, p_cache_key, p_scene, 'miss', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE cache_metrics_log IS 'Detailed log of all cache hits and misses for analytics';
COMMENT ON FUNCTION track_cache_hit IS 'Records a cache hit event with timing data';
COMMENT ON FUNCTION track_cache_miss IS 'Records a cache miss event for analysis';
