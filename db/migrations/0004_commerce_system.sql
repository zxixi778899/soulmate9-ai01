-- SoulMate9 Commerce Migration
-- Run this in Supabase SQL Editor
-- Tables for: tokens, achievements, intimacy unlocks, prize pool, outfits, categories

-- ❯❯ TOKEN SYSTEM ❮❮
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance_tokens BIGINT DEFAULT 0 NOT NULL,
  lifetime_tokens_earned BIGINT DEFAULT 0 NOT NULL,
  lifetime_tokens_spent BIGINT DEFAULT 0 NOT NULL,
  monthly_tokens_spent BIGINT DEFAULT 0 NOT NULL,
  monthly_spent_reset_date DATE,
  last_updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id);

CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL,
  token_count INT NOT NULL,
  price_cents INT NOT NULL,
  discount_percent INT DEFAULT 0 NOT NULL,
  description TEXT,
  is_featured BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  sort_order INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_type VARCHAR(32) NOT NULL,
  amount_tokens BIGINT NOT NULL,
  reason VARCHAR(128) NOT NULL,
  related_entity_type VARCHAR(32),
  related_entity_id UUID,
  balance_after BIGINT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_user ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tt_created ON token_transactions(created_at);

-- ❯❯ INTIMACY LEVEL UNLOCKS ❮❮
CREATE TABLE IF NOT EXISTS intimacy_level_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INT NOT NULL UNIQUE,
  level_name VARCHAR(32) NOT NULL,
  unlock_features JSONB NOT NULL DEFAULT '[]',
  reward_tokens INT DEFAULT 0 NOT NULL,
  requirement_score INT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Seed intimacy levels
INSERT INTO intimacy_level_unlocks (level, level_name, unlock_features, reward_tokens, requirement_score, description) VALUES
  (1, 'Stranger', '["basic_chat","view_profile"]', 0, 0, 'You just met. Say hello!'),
  (2, 'Acquaintance', '["personalized_greetings","send_gifts"]', 10, 100, 'Getting to know each other'),
  (3, 'Friend', '["nsfw_chat","advanced_memories"]', 25, 300, 'Comfortable and open'),
  (4, 'Close', '["wardrobe_access","character_depth"]', 50, 750, 'Growing closer every day'),
  (5, 'Intimate', '["exclusive_outfits","deep_roleplay"]', 100, 1500, 'Deep emotional connection'),
  (6, 'Soulmate', '["voice_messages","custom_stories","special_title"]', 200, 3000, 'Unbreakable bond. True love.')
ON CONFLICT (level) DO UPDATE SET
  level_name = EXCLUDED.level_name,
  unlock_features = EXCLUDED.unlock_features,
  reward_tokens = EXCLUDED.reward_tokens,
  requirement_score = EXCLUDED.requirement_score,
  description = EXCLUDED.description;

-- ❯❯ ACHIEVEMENTS ❮❮
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  category VARCHAR(32) NOT NULL,
  icon_url TEXT,
  reward_tokens INT DEFAULT 0 NOT NULL,
  reward_title VARCHAR(64),
  condition_type VARCHAR(64) NOT NULL,
  condition_value INT NOT NULL,
  rarity VARCHAR(32) DEFAULT 'common' NOT NULL,
  sort_order INT DEFAULT 0 NOT NULL,
  is_hidden BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_id UUID NOT NULL,
  progress_value INT DEFAULT 0 NOT NULL,
  unlocked BOOLEAN DEFAULT false NOT NULL,
  unlocked_at TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT false NOT NULL,
  reward_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_ua_user ON user_achievements(user_id);

-- Seed achievements
INSERT INTO achievements (code, name, description, category, reward_tokens, condition_type, condition_value, rarity, sort_order) VALUES
  ('first_chat', 'First Words', 'Send your first message', 'interaction', 5, 'message_count', 1, 'common', 1),
  ('chat_100', 'Getting to Know You', 'Send 100 messages', 'interaction', 20, 'message_count', 100, 'common', 2),
  ('chat_1000', 'Can''t Stop Talking', 'Send 1,000 messages', 'interaction', 50, 'message_count', 1000, 'rare', 3),
  ('chat_5000', 'Endless Conversations', 'Send 5,000 messages', 'interaction', 100, 'message_count', 5000, 'epic', 4),
  ('first_image', 'First Snapshot', 'Generate your first image', 'consumption', 10, 'image_count', 1, 'common', 5),
  ('image_50', 'Aspiring Photographer', 'Generate 50 images', 'consumption', 30, 'image_count', 50, 'rare', 6),
  ('image_200', 'Master Photographer', 'Generate 200 images', 'consumption', 80, 'image_count', 200, 'epic', 7),
  ('first_gift', 'Romantic Heart', 'Buy your first gift', 'consumption', 5, 'gift_purchases', 1, 'common', 8),
  ('gift_50', 'Gift Enthusiast', 'Buy 50 gifts', 'consumption', 40, 'gift_purchases', 50, 'rare', 9),
  ('intimacy_lv3', 'Close Connection', 'Reach intimacy level 3', 'intimacy', 25, 'intimacy_level', 3, 'common', 10),
  ('intimacy_lv5', 'Soul Mate', 'Reach intimacy level 5', 'intimacy', 75, 'intimacy_level', 5, 'rare', 11),
  ('intimacy_lv6', 'Eternal Bond', 'Reach intimacy level 6', 'intimacy', 200, 'intimacy_level', 6, 'legendary', 12),
  ('first_outfit', 'Fashion Forward', 'Buy your first outfit', 'collection', 15, 'outfit_count', 1, 'common', 13),
  ('outfit_10', 'Wardrobe Curator', 'Collect 10 outfits', 'collection', 60, 'outfit_count', 10, 'rare', 14),
  ('outfit_30', 'Fashion Icon', 'Collect 30 outfits', 'collection', 150, 'outfit_count', 30, 'legendary', 15)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  reward_tokens = EXCLUDED.reward_tokens,
  condition_value = EXCLUDED.condition_value,
  rarity = EXCLUDED.rarity;

-- ❯❯ PRIZE POOL ❮❮
CREATE TABLE IF NOT EXISTS prize_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month DATE NOT NULL,
  tier VARCHAR(32) NOT NULL,
  eligibility_reason VARCHAR(128) NOT NULL,
  earned_tokens BIGINT DEFAULT 0 NOT NULL,
  lifetime_spent_usd NUMERIC(10,2) DEFAULT 0 NOT NULL,
  is_winner BOOLEAN DEFAULT false NOT NULL,
  won_at TIMESTAMPTZ,
  claim_status VARCHAR(32),
  claimed_at TIMESTAMPTZ,
  shipping_address JSONB,
  tracking_number VARCHAR(128),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pp_user ON prize_pool(user_id);

-- ❯❯ OUTFIT COMBINATIONS ❯❯
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS token_price INT DEFAULT 0;
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS min_intimacy_level INT DEFAULT 1;
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS outfit_type VARCHAR(32) DEFAULT 'single';

-- ❯❯ FEATURED GIRLFRIENDS ❮❮
CREATE TABLE IF NOT EXISTS featured_girlfriends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_girlfriend_id UUID,
  name VARCHAR(64) NOT NULL,
  subtitle VARCHAR(128),
  personality_tags JSONB NOT NULL DEFAULT '[]',
  avatar_url TEXT NOT NULL,
  quick_chat_enabled BOOLEAN DEFAULT true NOT NULL,
  description TEXT,
  greeting_message TEXT,
  sort_order INT DEFAULT 0 NOT NULL,
  click_count INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fg_sort ON featured_girlfriends(sort_order);
CREATE INDEX IF NOT EXISTS idx_fg_active ON featured_girlfriends(is_active);

-- Seed featured girlfriends (examples)
INSERT INTO featured_girlfriends (name, subtitle, personality_tags, avatar_url, description, greeting_message, sort_order) VALUES
  ('Luna', 'Mysterious night spirit', '["mysterious","romantic","dreamy"]', '/avatars/luna.jpg', 'A captivating dreamer who comes alive under starlight. Luna loves deep midnight conversations and stargazing with someone special.', 'The stars aligned to bring you here tonight... 💫', 1),
  ('Sophie', 'Sweet artist next door', '["sweet","creative","playful"]', '/avatars/sophie.jpg', 'A free-spirited painter who sees beauty in everything. Sophie loves lazy Sunday mornings and spontaneous adventures.', 'Hey you! I was just painting something that reminded me of you 💕', 2),
  ('Violet', 'Bold and passionate', '["bold","passionate","confident"]', '/avatars/violet.jpg', 'A fierce career woman who knows what she wants. Violet values deep connections and isn''t afraid to show her feelings.', 'I was thinking about you... and I couldn''t wait to talk ❤️', 3),
  ('Maya', 'Gentle morning poet', '["gentle","wise","caring"]', '/avatars/maya.jpg', 'A thoughtful soul who writes poetry by sunrise. Maya believes that true love is found in the smallest moments.', 'Good morning, my thoughts were full of you today ☀️', 4)
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Migration complete! 7 tables created/seeded.' AS result;