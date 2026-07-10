-- Girlfriend catalog: rarity, access state, base stats, unlock tracking

-- access_status:
--   open   — 开放，所有人可直接聊天
--   locked — 锁定，前端可看资料/信息，图片模糊+锁，购买或抽取后解锁
--   closed — 关闭，对普通用户不可见

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS rarity VARCHAR(8) DEFAULT 'R',
  ADD COLUMN IF NOT EXISTS access_status VARCHAR(16) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS unlock_price_tokens INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_intimacy INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS base_desire INT DEFAULT 20,
  ADD COLUMN IF NOT EXISTS base_development INT DEFAULT 15,
  ADD COLUMN IF NOT EXISTS base_kink INT DEFAULT 10;

-- Clamp helpers via check (best-effort; skip if constraint exists)
DO $$ BEGIN
  ALTER TABLE girlfriends
    ADD CONSTRAINT girlfriends_rarity_chk
    CHECK (rarity IN ('N', 'R', 'SR', 'SSR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE girlfriends
    ADD CONSTRAINT girlfriends_access_status_chk
    CHECK (access_status IN ('open', 'locked', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_girlfriends_access_status
  ON girlfriends (access_status)
  WHERE access_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_girlfriends_rarity
  ON girlfriends (rarity);

CREATE INDEX IF NOT EXISTS idx_girlfriends_public_access
  ON girlfriends (is_public, review_status, access_status)
  WHERE is_public = true AND review_status = 'approved' AND access_status <> 'closed';

-- Per-user unlock records (purchase / gacha)
CREATE TABLE IF NOT EXISTS user_girlfriend_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL REFERENCES girlfriends(id) ON DELETE CASCADE,
  unlock_method VARCHAR(32) NOT NULL DEFAULT 'purchase', -- purchase | gacha | gift | admin
  tokens_spent INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, girlfriend_id)
);

CREATE INDEX IF NOT EXISTS idx_user_gf_unlocks_user
  ON user_girlfriend_unlocks (user_id, created_at DESC);

COMMENT ON COLUMN girlfriends.access_status IS 'open | locked | closed';
COMMENT ON COLUMN girlfriends.rarity IS 'N | R | SR | SSR';
COMMENT ON COLUMN girlfriends.unlock_price_tokens IS 'Token cost to unlock when access_status=locked';
COMMENT ON COLUMN girlfriends.base_desire IS 'Catalog base desire 0-100';
COMMENT ON COLUMN girlfriends.base_development IS 'Catalog base development 0-100';
COMMENT ON COLUMN girlfriends.base_kink IS 'Catalog base kink 0-100';
COMMENT ON COLUMN girlfriends.base_intimacy IS 'Starting intimacy hint 0-100';
