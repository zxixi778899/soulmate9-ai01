-- ============================================================
-- SoulMate AI v2 — 虚拟商城 MVP 数据库迁移
-- 适用 PostgreSQL 14+ / Supabase
-- 建议：Supabase 后台 SQL Editor 直接执行
-- 日期：2026-06-30
-- ============================================================

-- 1) 商品主表（先建好，未来实体商城也能用同一张表）
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('virtual', 'physical')),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL,         -- 'outfit' | 'voice_pack' | 'effect' | 'background' | 'action_template' | 'consumable'
  subcategory text,
  price_cents int NOT NULL DEFAULT 0,
  price_credits int NOT NULL DEFAULT 0,        -- 虚拟商城用 credits 计价
  compare_at_price_cents int,
  images jsonb DEFAULT '[]'::jsonb,            -- [{key, alt, order}]
  tags text[] DEFAULT '{}',

  -- 虚拟商品专属
  virtual_meta jsonb DEFAULT '{}'::jsonb,       -- {rarity, asset_id, kind, effect_type, duration_sec, ...}
  rarity text DEFAULT 'common',                 -- 'common' | 'rare' | 'epic' | 'legendary'
  stock_type text DEFAULT 'unlimited',          -- 'unlimited' | 'limited' | 'inventory'
  stock_remaining int,

  -- 实体商城（暂留空）
  physical_meta jsonb,
  inventory_count int DEFAULT 0,

  -- 合规
  is_adult_only boolean DEFAULT true,
  age_verification_required boolean DEFAULT true,
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

  -- 营销
  is_featured boolean DEFAULT false,
  is_new boolean DEFAULT false,
  display_order int DEFAULT 0,
  sales_count int DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_type_status ON products(type, status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, display_order) WHERE is_featured = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_rarity ON products(rarity, sales_count DESC) WHERE status = 'active';

-- 2) 用户虚拟资产（购买记录 + 库存）
CREATE TABLE IF NOT EXISTS user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  asset_type text NOT NULL,                     -- 'outfit' | 'voice' | 'effect' | 'background' | 'action' | 'consumable'
  asset_id text,                                -- 资源 ID（如 outfit_assets.id 字符串）
  asset_payload jsonb DEFAULT '{}'::jsonb,      -- 道具负载（如 LoRA 路径、prompt 等）
  quantity int NOT NULL DEFAULT 1,              -- 数量（消耗品 > 1，永久道具 = 1）
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'purchase',               -- 'purchase' | 'gift' | 'reward' | 'admin_grant' | 'signup_bonus'
  source_ref text,                              -- 来源引用（订单 ID / 活动 ID）
  metadata jsonb DEFAULT '{}'::jsonb,
  -- 唯一约束：同一资产只能持有一次（非消耗品），用 partial unique
  CONSTRAINT user_inventory_unique_asset UNIQUE (user_id, asset_type, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_type ON user_inventory(user_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_user_inventory_product ON user_inventory(product_id);

-- 3) 订单表（虚拟商城订单，简化为单商品）
CREATE TABLE IF NOT EXISTS shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,            -- 'SM-2026-XXXXXXXX'
  user_id uuid NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1,

  price_credits int NOT NULL,                   -- 支付积分
  price_cents int NOT NULL DEFAULT 0,           -- 实际现金价（备份用）

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'fulfilling', 'completed', 'failed', 'refunded', 'cancelled')),

  -- 支付
  payment_method text,                          -- 'credits' | 'stripe' | 'crypto' | 'coingate'
  payment_intent_id text,                       -- Stripe PaymentIntent.id
  paid_at timestamptz,

  -- 履约
  fulfilled_at timestamptz,
  inventory_item_id uuid REFERENCES user_inventory(id) ON DELETE SET NULL,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status) WHERE status IN ('pending', 'paid', 'fulfilling');
CREATE INDEX IF NOT EXISTS idx_shop_orders_payment_intent ON shop_orders(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- 4) 用户积分余额（与 profiles.credits_remaining 双写防丢）
CREATE TABLE IF NOT EXISTS user_credits_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  delta int NOT NULL,                            -- +50 / -30
  reason text NOT NULL,                          -- 'signup_bonus' | 'daily_checkin' | 'purchase' | 'refund' | 'admin_grant'
  ref_id text,                                   -- 关联 ID（订单号、checkin 日期）
  balance_after int,                             -- 变动后余额
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_ledger_user ON user_credits_ledger(user_id, created_at DESC);

-- 5) 服装资产表（虚拟商城核心：换装）
CREATE TABLE IF NOT EXISTS outfit_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL,                       -- 'lingerie' | 'dress' | 'cosplay' | 'fantasy' | 'casual' | 'uniform'
  tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'premium', 'unlimited')),
  description text,

  -- 视觉资源
  preview_image_key text,                        -- 缩略图 OSS key
  lora_file_key text,                            -- 训练好的 LoRA 文件 key（如 'lora/silk_red_dress_v1.safetensors'）
  lora_trigger_word text,                        -- 触发词，如 'silk_red_dress'
  lora_strength_default numeric DEFAULT 0.85,

  -- 提示词模板
  base_prompt text,                              -- 基础 prompt 片段
  negative_prompt text,

  -- 标签
  tags text[] DEFAULT '{}',
  rarity text DEFAULT 'common',

  -- 营销
  is_featured boolean DEFAULT false,
  display_order int DEFAULT 0,
  sales_count int DEFAULT 0,

  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outfit_assets_status ON outfit_assets(status);
CREATE INDEX IF NOT EXISTS idx_outfit_assets_category ON outfit_assets(category) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_outfit_assets_featured ON outfit_assets(is_featured, display_order) WHERE is_featured = true AND status = 'active';

-- 6) 角色当前装备（user_inventory 中选中的 outfit 关联到 girlfriend）
CREATE TABLE IF NOT EXISTS girlfriend_outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  girlfriend_id uuid NOT NULL,
  outfit_asset_id uuid REFERENCES outfit_assets(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES user_inventory(id) ON DELETE SET NULL,
  is_equipped boolean NOT NULL DEFAULT false,
  equipped_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_girlfriend_outfits_girlfriend ON girlfriend_outfits(girlfriend_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_girlfriend_outfit_equipped
  ON girlfriend_outfits(girlfriend_id) WHERE is_equipped = true;

-- ============================================================
-- profiles 表扩展（如果还没有这些列）
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS credits_remaining int DEFAULT 50,
  ADD COLUMN IF NOT EXISTS newbie_expires_at timestamptz;

-- ============================================================
-- 初始数据：内置 8 套默认服装（用于冷启动）
-- ============================================================
INSERT INTO products (type, sku, name, description, category, subcategory, price_credits, rarity, virtual_meta, images, is_featured, display_order)
VALUES
  ('virtual', 'OUTFIT-LINGERIE-001', 'Silk Lingerie Set', 'Elegant silk lingerie for intimate moments', 'outfit', 'lingerie', 100, 'common', '{"asset_id": "outfit_silk_lingerie_001", "kind": "outfit"}'::jsonb, '[]'::jsonb, true, 1),
  ('virtual', 'OUTFIT-CASUAL-001', 'Casual Sweater Dress', 'Cozy everyday look', 'outfit', 'casual', 80, 'common', '{"asset_id": "outfit_casual_001", "kind": "outfit"}'::jsonb, '[]'::jsonb, false, 2),
  ('virtual', 'OUTFIT-EVENING-001', 'Red Evening Gown', 'Stunning red gown for special occasions', 'outfit', 'dress', 200, 'rare', '{"asset_id": "outfit_red_gown_001", "kind": "outfit"}'::jsonb, '[]'::jsonb, true, 3),
  ('virtual', 'OUTFIT-COSPLAY-001', 'Bunny Suit', 'Playful cosplay outfit', 'outfit', 'cosplay', 250, 'rare', '{"asset_id": "outfit_bunny_001", "kind": "outfit"}'::jsonb, '[]'::jsonb, true, 4),
  ('virtual', 'OUTFIT-FANTASY-001', 'Royal Corset', 'Fantasy medieval royal outfit', 'outfit', 'fantasy', 300, 'epic', '{"asset_id": "outfit_royal_corset_001", "kind": "outfit"}'::jsonb, '[]'::jsonb, true, 5),
  ('virtual', 'EFFECT-001', 'Rose Petals Effect', 'Falling rose petals ambience', 'effect', 'visual', 150, 'rare', '{"asset_id": "effect_rose_petals_001", "kind": "effect", "duration_sec": 300}'::jsonb, '[]'::jsonb, false, 6),
  ('virtual', 'VOICE-001', 'Whisper Voice Pack', 'Soft whisper voice replies', 'voice_pack', 'tts', 200, 'rare', '{"asset_id": "voice_whisper_001", "kind": "voice"}'::jsonb, '[]'::jsonb, false, 7),
  ('virtual', 'CONSUMABLE-001', 'Hint Token ×5', 'Reveal 5 romantic suggestions', 'consumable', 'hint', 50, 'common', '{"asset_id": "consumable_hint_001", "kind": "consumable", "uses": 5}'::jsonb, '[]'::jsonb, false, 8)
ON CONFLICT (sku) DO NOTHING;

-- 对应的 outfit_assets（虚拟 meta asset_id 映射）
INSERT INTO outfit_assets (product_id, name, category, tier, lora_trigger_word, base_prompt, status)
SELECT
  id,
  name,
  category,
  'free' as tier,
  REPLACE(LOWER(SPLIT_PART(name, ' ', 1)), ',', '') as trigger_word,
  name as base_prompt,
  'active'
FROM products
WHERE type = 'virtual' AND category = 'outfit'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['products', 'shop_orders', 'outfit_assets']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- RLS 策略（行级安全）
-- ============================================================

-- 启用 RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE girlfriend_outfits ENABLE ROW LEVEL SECURITY;

-- products：公开可读 active 状态
DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (status = 'active');

-- outfit_assets：公开可读 active 状态
DROP POLICY IF EXISTS outfit_assets_public_read ON outfit_assets;
CREATE POLICY outfit_assets_public_read ON outfit_assets
  FOR SELECT USING (status = 'active');

-- user_inventory：用户只能访问自己的
DROP POLICY IF EXISTS user_inventory_owner ON user_inventory;
CREATE POLICY user_inventory_owner ON user_inventory
  FOR ALL USING (auth.uid() = user_id);

-- shop_orders：用户只能访问自己的
DROP POLICY IF EXISTS shop_orders_owner ON shop_orders;
CREATE POLICY shop_orders_owner ON shop_orders
  FOR ALL USING (auth.uid() = user_id);

-- user_credits_ledger：用户只能读自己的
DROP POLICY IF EXISTS user_credits_ledger_owner ON user_credits_ledger;
CREATE POLICY user_credits_ledger_owner ON user_credits_ledger
  FOR SELECT USING (auth.uid() = user_id);

-- girlfriend_outfits：用户只能访问自己的
DROP POLICY IF EXISTS girlfriend_outfits_owner ON girlfriend_outfits;
CREATE POLICY girlfriend_outfits_owner ON girlfriend_outfits
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- RPC：原子加积分（防超扣）
-- ============================================================
CREATE OR REPLACE FUNCTION grant_credits(uid uuid, amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance int;
BEGIN
  UPDATE profiles
  SET credits_remaining = COALESCE(credits_remaining, 0) + amount,
      updated_at = now()
  WHERE user_id = uid
  RETURNING credits_remaining INTO new_balance;

  IF new_balance IS NULL THEN
    -- 用户 profile 不存在，创建
    INSERT INTO profiles (user_id, credits_remaining)
    VALUES (uid, GREATEST(amount, 0))
    RETURNING credits_remaining INTO new_balance;
  END IF;

  INSERT INTO user_credits_ledger (user_id, delta, reason, balance_after)
  VALUES (uid, amount, 'admin_grant', new_balance);

  RETURN new_balance;
END;
$$;

-- RPC：原子扣积分（防并发超扣）
CREATE OR REPLACE FUNCTION deduct_credits(uid uuid, amount int, reason text, ref_id text DEFAULT NULL)
RETURNS TABLE(success boolean, new_balance int, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance int;
  new_balance int;
BEGIN
  SELECT credits_remaining INTO current_balance
  FROM profiles
  WHERE user_id = uid
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Profile not found'::text;
    RETURN;
  END IF;

  IF current_balance < amount THEN
    RETURN QUERY SELECT false, current_balance, 'Insufficient credits'::text;
    RETURN;
  END IF;

  new_balance := current_balance - amount;
  UPDATE profiles
  SET credits_remaining = new_balance, updated_at = now()
  WHERE user_id = uid;

  INSERT INTO user_credits_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (uid, -amount, reason, ref_id, new_balance);

  RETURN QUERY SELECT true, new_balance, NULL::text;
END;
$$;

-- RPC：合并消耗品库存（累加 quantity）
CREATE OR REPLACE FUNCTION merge_inventory(
  p_user_id uuid,
  p_product_id uuid,
  p_asset_type text,
  p_asset_id text,
  p_quantity int,
  p_source text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS user_inventory
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result user_inventory;
BEGIN
  INSERT INTO user_inventory (user_id, product_id, asset_type, asset_id, quantity, source, source_ref, metadata)
  VALUES (p_user_id, p_product_id, p_asset_type, p_asset_id, p_quantity, p_source, p_source_ref, p_metadata)
  ON CONFLICT (user_id, asset_type, asset_id)
  DO UPDATE SET
    quantity = user_inventory.quantity + p_quantity,
    source_ref = COALESCE(EXCLUDED.source_ref, user_inventory.source_ref),
    metadata = user_inventory.metadata || EXCLUDED.metadata
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 完成
-- ============================================================
COMMENT ON TABLE products IS '商品主表（虚拟 + 实体，统一表）';
COMMENT ON TABLE user_inventory IS '用户虚拟资产（购买后履约）';
COMMENT ON TABLE shop_orders IS '虚拟商城订单';
COMMENT ON TABLE user_credits_ledger IS '积分变动流水（审计追踪）';
COMMENT ON TABLE outfit_assets IS '服装资产（换装用）';
COMMENT ON TABLE girlfriend_outfits IS '角色当前装备';
