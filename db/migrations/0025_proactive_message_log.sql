-- 0025: proactive_message_log — 主动消息限频日志表
-- 该表在 0010 中定义但从未真正建出（迁移未执行），导致 /api/proactive/check
-- 的每日限额查询静默失败、限流失效 → 主动消息刷屏。此处补建。

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

-- 仅服务端 service_role 读写（RLS 开启且不给 policy，与 girlfriends 一致）
ALTER TABLE proactive_message_log ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
