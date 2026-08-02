-- ============================================================
-- 好友列表系统 - user_friends 关联表
-- 取代旧的"克隆公共伴侣"模式，改为引用式好友关系
-- 删除好友不影响公共伴侣状态
-- ============================================================

CREATE TABLE IF NOT EXISTS user_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL,
  -- 'public' = 从公共目录添加, 'created' = 用户创建自动加入
  source VARCHAR(16) NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_friends_user_gf_key UNIQUE (user_id, girlfriend_id)
);

CREATE INDEX IF NOT EXISTS user_friends_user_id_idx
  ON user_friends (user_id);
CREATE INDEX IF NOT EXISTS user_friends_girlfriend_id_idx
  ON user_friends (girlfriend_id);

-- RLS: 仅 service_role 可访问（与其他表一致）
ALTER TABLE user_friends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_friends FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_friends TO service_role;

-- 迁移现有数据：已拥有的伴侣自动成为好友
INSERT INTO user_friends (user_id, girlfriend_id, source)
SELECT user_id, id, 'created'
FROM girlfriends
WHERE user_id IS NOT NULL
  AND review_status != 'removed'
ON CONFLICT (user_id, girlfriend_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
