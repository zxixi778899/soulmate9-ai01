-- Migration: Backpack + Wardrobe + Chat Media system
-- Run this in Supabase SQL Editor

-- 1. User Backpack: purchased items not yet gifted
CREATE TABLE IF NOT EXISTS user_backpack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'purchase',
  metadata jsonb DEFAULT '{}',
  acquired_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backpack_user ON user_backpack(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_backpack_user_product ON user_backpack(user_id, product_id);

-- 2. Girlfriend Wardrobe: items gifted to specific girlfriends
CREATE TABLE IF NOT EXISTS girlfriend_wardrobe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  girlfriend_id uuid NOT NULL,
  product_id uuid NOT NULL,
  is_equipped boolean NOT NULL DEFAULT false,
  equipped_at timestamptz,
  metadata jsonb DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gf_wardrobe_user ON girlfriend_wardrobe(user_id);
CREATE INDEX IF NOT EXISTS idx_gf_wardrobe_gf ON girlfriend_wardrobe(girlfriend_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gf_wardrobe_unique ON girlfriend_wardrobe(user_id, girlfriend_id, product_id);

-- 3. Chat Media: images/videos generated per conversation
CREATE TABLE IF NOT EXISTS chat_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  girlfriend_id uuid NOT NULL,
  message_id uuid,
  media_type text NOT NULL DEFAULT 'image',
  url text NOT NULL,
  thumbnail_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_media_user_gf ON chat_media(user_id, girlfriend_id);
CREATE INDEX IF NOT EXISTS idx_chat_media_gf_created ON chat_media(girlfriend_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_media_msg ON chat_media(message_id);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
