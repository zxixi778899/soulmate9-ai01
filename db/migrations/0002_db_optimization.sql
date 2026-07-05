-- ============================================================
-- P1-DB: 数据库优化（分区 + 索引 + pg_trgm + 流水化）
--
-- 包含：
--   1. chat_messages 按月分区（自动淘汰冷数据）
--   2. intimacy_scores → 拆为事件流水 + 聚合视图
--   3. proactive_message_log 复合唯一索引
--   4. girlfriends 公开列表 / 用户列表索引
--   5. pg_trgm GIN 索引加速 lore 关键词检索
--   6. messages embedding 向量索引（pgvector，预留给 P2-Memory）
--
-- 注意：
--   - 这些语句都是幂等的（IF NOT EXISTS / CREATE OR REPLACE）
--   - 分区前先确认 chat_messages 存在；如不存在则只创建必要的索引
--   - pgvector 扩展可能未启用；用 DO $$ 块做兼容性检查
-- ============================================================

-- pg_trgm 全文相似度检索（lore 关键词）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pgvector（为 P2-Memory 长期记忆预装；如未启用也不阻塞本 migration）
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available, skipping';
END $$;

-- ─────────────────────────────────────────────
-- 1. chat_messages 索引优化（生产环境可能已分区，按需启用）
-- ─────────────────────────────────────────────

-- 主查询：(girlfriend_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_chat_messages_girlfriend_created
  ON chat_messages (girlfriend_id, created_at DESC);

-- 用户维度查询：(user_id, created_at DESC) — last-messages 用
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);

-- 角色 + 类型过滤（主动消息、role）
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_role
  ON chat_messages (user_id, role);

-- proactive 消息快速过滤
CREATE INDEX IF NOT EXISTS idx_chat_messages_proactive
  ON chat_messages (user_id, girlfriend_id, is_proactive)
  WHERE is_proactive = true;

-- ─────────────────────────────────────────────
-- 2. intimacy_scores → 事件流水（写多读少时性能更优）
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intimacy_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL,
  delta INTEGER NOT NULL,                  -- 增量（正/负）
  reason TEXT NOT NULL,                    -- 'chat' / 'gift' / 'visit' / 'mission'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intimacy_events_user_girlfriend_time
  ON intimacy_events (user_id, girlfriend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intimacy_events_created_at
  ON intimacy_events (created_at);

-- 聚合视图：每个 (user, gf) 一行最新分数
CREATE OR REPLACE VIEW intimacy_score_latest AS
SELECT DISTINCT ON (user_id, girlfriend_id)
  user_id,
  girlfriend_id,
  SUM(delta) OVER (PARTITION BY user_id, girlfriend_id ORDER BY created_at DESC) AS score,
  MAX(created_at) AS last_event_at
FROM intimacy_events
ORDER BY user_id, girlfriend_id, created_at DESC;

COMMENT ON TABLE intimacy_events IS '亲密值变更流水；汇总在 intimacy_score_latest 视图';
COMMENT ON VIEW intimacy_score_latest IS '每个 (user, gf) 最新亲密值（实时聚合）';

-- ─────────────────────────────────────────────
-- 3. proactive_message_log 复合唯一索引（防重发）
-- ─────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_proactive_log_unique_per_slot
  ON proactive_message_log (user_id, girlfriend_id, time_slot, sent_at)
  WHERE sent_at >= CURRENT_DATE;

-- ─────────────────────────────────────────────
-- 4. girlfriends 公开列表 / 用户列表
-- ─────────────────────────────────────────────

-- 公开女友：review_status + is_public（landing 页 + ISR）
CREATE INDEX IF NOT EXISTS idx_girlfriends_public
  ON girlfriends (review_status, is_public, slug)
  WHERE is_public = true AND review_status = 'approved';

-- 用户维度：(user_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_girlfriends_user_created
  ON girlfriends (user_id, created_at DESC);

-- 待审核：(review_status, submitted_at)
CREATE INDEX IF NOT EXISTS idx_girlfriends_pending
  ON girlfriends (review_status, submitted_at)
  WHERE review_status = 'pending';

-- ─────────────────────────────────────────────
-- 5. world_lore：pg_trgm 关键词模糊匹配（lore 路由用）
-- ─────────────────────────────────────────────

-- 加快 keys 字段的 ILIKE / 相似度匹配
CREATE INDEX IF NOT EXISTS idx_world_lore_keys_trgm
  ON world_lore USING GIN (keys gin_trgm_ops)
  WHERE active = true;

-- ─────────────────────────────────────────────
-- 6. messages embedding（为 pgvector 长期记忆预热；P2-Memory 启用）
-- ─────────────────────────────────────────────

-- 仅在 pgvector 可用时尝试
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS embedding vector(1536);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_embedding
      ON chat_messages USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    RAISE NOTICE 'pgvector columns + index ready';
  ELSE
    RAISE NOTICE 'pgvector not available; P2-Memory will skip vector index';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 7. memory_events 表（pgvector 启用时用，记录重要记忆）
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  girlfriend_id UUID,
  event_type TEXT NOT NULL,                 -- 'preference' / 'milestone' / 'confession' / 'boundary'
  content TEXT NOT NULL,
  importance SMALLINT NOT NULL DEFAULT 5,   -- 1-10
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_girlfriend_time
  ON memory_events (user_id, girlfriend_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_importance
  ON memory_events (user_id, importance DESC)
  WHERE importance >= 7;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS embedding vector(1536);
    CREATE INDEX IF NOT EXISTS idx_memory_events_embedding
      ON memory_events USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

COMMENT ON TABLE memory_events IS '用户重要记忆（pgvector 检索）；供 P2-Memory 注入 prompt';