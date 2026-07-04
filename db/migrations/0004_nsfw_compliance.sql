-- ============================================================
-- Migration 0004: NSFW content compliance fields
-- 目的：标记 / 追踪 / 保护用户 NSFW 内容
-- 日期：2026-07-03
-- ============================================================

-- ──── chat_messages 加 NSFW 等级字段 ────
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS content_nsfw_level TEXT NOT NULL DEFAULT 'sfw'
    CHECK (content_nsfw_level IN ('sfw', 'mild', 'moderate', 'explicit'));

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS content_nsfw_flagged BOOLEAN NOT NULL DEFAULT false;

-- 用于 admin 审查 + 用户删除精准定位
CREATE INDEX IF NOT EXISTS idx_chat_messages_nsfw_flagged
  ON chat_messages (content_nsfw_flagged, created_at DESC)
  WHERE content_nsfw_flagged = true;

-- ──── content_audit_log：违规内容审计日志 ────
CREATE TABLE IF NOT EXISTS content_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  content_type TEXT NOT NULL,  -- 'chat_message' | 'image_upload' | 'girlfriend_description'
  content_id TEXT,
  matched_pattern TEXT,
  nsfw_level TEXT,
  action TEXT NOT NULL,  -- 'blocked' | 'flagged' | 'allowed'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_audit_log_user
  ON content_audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_audit_log_action_time
  ON content_audit_log (action, created_at DESC)
  WHERE action = 'blocked';

-- ──── user_deletion_requests：用户数据删除请求追踪 ────
-- 合规需要：用户有权随时删除所有 NSFW 内容，记录请求 + 完成状态
CREATE TABLE IF NOT EXISTS user_deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'in_progress' | 'completed' | 'failed'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  scope TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'nsfw_only'
  affected_rows JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_user
  ON user_deletion_requests (user_id, requested_at DESC);

-- ──── RLS ────
ALTER TABLE content_audit_log ENABLE ROW LEVEL SECURITY;

-- 用户只能读自己的 audit log
CREATE POLICY "Users read own audit log"
  ON content_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- service_role 完整访问（已在 supabase 服务端）
CREATE POLICY "Service role full access audit"
  ON content_audit_log FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE user_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own deletion requests"
  ON user_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create deletion requests"
  ON user_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access deletion"
  ON user_deletion_requests FOR ALL
  USING (auth.role() = 'service_role');

-- ──── 注释 ────
COMMENT ON COLUMN chat_messages.content_nsfw_level IS
  '内容合规等级：sfw=安全, mild=轻度, moderate=中等NSFW, explicit=显式NSFW。仅用于审计/删除，不阻断业务。';

COMMENT ON TABLE content_audit_log IS
  '违规内容审计日志。被 HARD_BLOCK_PATTERNS 命中的内容写入此处，admin 可查询。';

COMMENT ON TABLE user_deletion_requests IS
  'GDPR/CCPA 合规：用户数据删除请求追踪。completed 后所有 NSFW 内容物理删除。';