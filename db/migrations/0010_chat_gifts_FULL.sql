-- ============================================================
-- SoulMate 礼物系统 — 完整建表（一次跑完）
-- Supabase Dashboard → SQL Editor → New query → 粘贴 → Run
-- ============================================================

-- A) 通用配置表（AI 模块 / 礼物 fallback 都会用）
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- B) 直播礼物表
CREATE TABLE IF NOT EXISTS chat_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  emoji VARCHAR(32) NOT NULL DEFAULT '🎁',
  icon_url TEXT,
  cost_tokens INT NOT NULL DEFAULT 1,
  intimacy_boost INT NOT NULL DEFAULT 1,
  effect_type VARCHAR(32) NOT NULL DEFAULT 'float_emoji',
  effect_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  effect_asset_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE chat_gifts ALTER COLUMN emoji TYPE VARCHAR(32);
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS chat_gifts_active_sort_idx
  ON chat_gifts (is_active, sort_order ASC);

-- C) 默认 10 个礼物
INSERT INTO chat_gifts (
  code, name, description, emoji, cost_tokens, intimacy_boost,
  effect_type, effect_config, sort_order, is_active
) VALUES
  ('rose', 'Rose', 'Classic romance', '🌹', 1, 3, 'rose_petals',
   '{"duration_ms":2200,"intensity":0.7,"colors":["#ff2e88","#ff6ba6","#f43f5e"]}'::jsonb, 10, true),
  ('lollipop', 'Lollipop', 'Playful sweet', '🍭', 2, 4, 'sparkle',
   '{"duration_ms":2000,"intensity":0.55,"colors":["#f472b6","#a78bfa"]}'::jsonb, 20, true),
  ('chocolate', 'Chocolate', 'Warm & thoughtful', '🍫', 3, 5, 'float_emoji',
   '{"duration_ms":2000,"intensity":0.5}'::jsonb, 30, true),
  ('perfume', 'Perfume', 'Luxury scent', '🧴', 6, 8, 'sparkle',
   '{"duration_ms":2400,"intensity":0.65,"colors":["#e9d5ff","#fbcfe8"]}'::jsonb, 40, true),
  ('necklace', 'Necklace', 'Elegant gift', '📿', 10, 10, 'gold_shower',
   '{"duration_ms":2600,"intensity":0.7,"colors":["#fbbf24","#f59e0b"]}'::jsonb, 50, true),
  ('teddy', 'Teddy', 'Hug-worthy', '🧸', 12, 12, 'heart_rain',
   '{"duration_ms":2600,"intensity":0.75,"colors":["#ff6ba6","#ff2e88"]}'::jsonb, 60, true),
  ('ring', 'Promise Ring', 'Deep commitment', '💍', 18, 15, 'sparkle',
   '{"duration_ms":2800,"intensity":0.85,"colors":["#fde68a","#fff"]}'::jsonb, 70, true),
  ('crown', 'Crown', 'Live-room showstopper', '👑', 30, 25, 'crown',
   '{"duration_ms":3000,"intensity":0.9,"colors":["#fbbf24","#f59e0b","#fff7ed"]}'::jsonb, 80, true),
  ('rocket', 'Rocket', 'Full combo effect', '🚀', 50, 40, 'rocket',
   '{"duration_ms":3200,"intensity":1,"colors":["#38bdf8","#a78bfa","#ff2e88"]}'::jsonb, 90, true),
  ('castle', 'Castle', 'Ultimate live combo', '🏰', 80, 60, 'castle',
   '{"duration_ms":3600,"intensity":1,"colors":["#c026d3","#ff2e88","#fbbf24"]}'::jsonb, 100, true)
ON CONFLICT (code) DO NOTHING;

-- D) 主动消息日志
CREATE TABLE IF NOT EXISTS proactive_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL,
  message_id UUID,
  time_slot VARCHAR(64) NOT NULL,
  replied BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proactive_log_user_gf_slot_idx
  ON proactive_message_log (user_id, girlfriend_id, time_slot);

CREATE INDEX IF NOT EXISTS proactive_log_sent_at_idx
  ON proactive_message_log (sent_at);

-- E) Storage 允许 SVGA（桶名默认 portraits；不对就改 WHERE id）
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/png','image/jpeg','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/x-m4v',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a','audio/mp3',
    'application/octet-stream','application/zip','application/x-zip-compressed',
    'application/x-svga','application/svga'
  ],
  file_size_limit = 52428800
WHERE id = 'portraits';

-- 若上面影响 0 行，可放开全部 MIME：
-- UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'portraits';

-- F) 校验
SELECT 'site_settings' AS tbl, COUNT(*)::text AS n FROM site_settings
UNION ALL
SELECT 'chat_gifts', COUNT(*)::text FROM chat_gifts
ORDER BY 1;
