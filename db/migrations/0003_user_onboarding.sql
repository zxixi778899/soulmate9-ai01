-- ============================================================
-- 用户 onboarding 状态迁移（localStorage -> DB）
-- ============================================================

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id UUID PRIMARY KEY,
  current_step SMALLINT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  skipped BOOLEAN NOT NULL DEFAULT false,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_incomplete
  ON user_onboarding (user_id)
  WHERE completed = false;

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access on user_onboarding" ON user_onboarding;
CREATE POLICY "service_role full access on user_onboarding" ON user_onboarding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users read own onboarding" ON user_onboarding;
CREATE POLICY "users read own onboarding" ON user_onboarding
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own onboarding" ON user_onboarding;
CREATE POLICY "users update own onboarding" ON user_onboarding
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own onboarding" ON user_onboarding;
CREATE POLICY "users insert own onboarding" ON user_onboarding
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE user_onboarding IS 'Onboarding 进度（DB-backed，替代 localStorage）';