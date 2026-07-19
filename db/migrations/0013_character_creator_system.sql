-- 0013_character_creator_system.sql
-- Character presets, option pool, and creation card economy.
-- Run once in Supabase SQL editor.
-- All statements use IF NOT EXISTS for idempotency.

-- 1. CHARACTER PRESETS
CREATE TABLE IF NOT EXISTS character_presets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(64) NOT NULL,
  description   TEXT DEFAULT '',
  thumbnail_url TEXT,
  visual_style   VARCHAR(16) DEFAULT 'realistic',
  gender         VARCHAR(16) DEFAULT 'Female',
  ethnicity      VARCHAR(32),
  face_shape     VARCHAR(32),
  hair_style     VARCHAR(32),
  hair_color     VARCHAR(16),
  eye_color      VARCHAR(32),
  body_type      VARCHAR(32),
  fashion_style  VARCHAR(32),
  personality_tags JSONB DEFAULT '[]'::jsonb,
  voice          VARCHAR(32),
  occupation     VARCHAR(64),
  relationship   VARCHAR(32) DEFAULT 'girlfriend',
  age            INT DEFAULT 22,
  sort_order     INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_character_presets_active
  ON character_presets (is_active, sort_order)
  WHERE is_active = true;

-- 2. CREATOR OPTION POOL
CREATE TABLE IF NOT EXISTS creator_option_pool (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    VARCHAR(32) NOT NULL,
  value       VARCHAR(64) NOT NULL,
  label_en    VARCHAR(64) NOT NULL,
  label_zh    VARCHAR(64) NOT NULL,
  label_ja    VARCHAR(64) DEFAULT '',
  label_ko    VARCHAR(64) DEFAULT '',
  label_es    VARCHAR(64) DEFAULT '',
  label_fr    VARCHAR(64) DEFAULT '',
  label_de    VARCHAR(64) DEFAULT '',
  extra       JSONB DEFAULT '{}'::jsonb,
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_option_pool_category
  ON creator_option_pool (category, sort_order)
  WHERE is_active = true;

-- 3. CREATION CARDS on profiles
-- Ensure profiles table exists (normally created by Supabase Auth trigger,
-- but may be missing on fresh projects).
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE,
  username             VARCHAR(64),
  avatar_url           TEXT,
  membership_tier      VARCHAR(20) DEFAULT 'free' NOT NULL,
  role                 VARCHAR(20) DEFAULT 'user' NOT NULL,
  credits_remaining    INT DEFAULT 50 NOT NULL,
  extra_girlfriend_slots INT DEFAULT 0 NOT NULL,
  age_verified         BOOLEAN DEFAULT false NOT NULL,
  age_verified_at      TIMESTAMPTZ,
  nsfw_enabled         BOOLEAN DEFAULT true NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS creation_cards INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS creation_card_last_refill TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS free_card_claimed BOOLEAN DEFAULT false;

-- 4. SEED: Default option pool (mirrors current hardcoded values)
-- Visual styles
INSERT INTO creator_option_pool (category, value, label_en, label_zh, extra, sort_order)
VALUES
  ('visual_style', 'realistic', 'Realistic', '写实', '{"desc_en":"Photo-like skin & lighting","desc_zh":"照片级皮肤与光影"}'::jsonb, 1),
  ('visual_style', 'anime', 'Anime', '动漫', '{"desc_en":"Big eyes & clean line art","desc_zh":"大眼睛与干净线条"}'::jsonb, 2)
ON CONFLICT DO NOTHING;

-- Genders
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('gender', 'Female', 'Female', '女性', 1),
  ('gender', 'Femme', 'Femme', '柔美', 2),
  ('gender', 'Androgynous', 'Androgynous', '中性', 3)
ON CONFLICT DO NOTHING;

-- Ethnicities
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('ethnicity', 'Caucasian', 'Caucasian', '欧美', 1),
  ('ethnicity', 'Asian', 'Asian', '亚洲', 2),
  ('ethnicity', 'Latina', 'Latina', '拉丁', 3),
  ('ethnicity', 'Ebony', 'Ebony', '非裔', 4),
  ('ethnicity', 'Arab', 'Arab', '阿拉伯', 5),
  ('ethnicity', 'Indian', 'Indian', '印度', 6),
  ('ethnicity', 'Mixed', 'Mixed', '混血', 7),
  ('ethnicity', 'Slavic', 'Slavic', '斯拉夫', 8)
ON CONFLICT DO NOTHING;

-- Face shapes
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('face_shape', 'Oval', 'Oval', '鹅蛋脸', 1),
  ('face_shape', 'Heart', 'Heart', '心形脸', 2),
  ('face_shape', 'Round', 'Round', '圆脸', 3),
  ('face_shape', 'Diamond', 'Diamond', '菱形脸', 4),
  ('face_shape', 'Soft Square', 'Soft Square', '柔和方脸', 5)
ON CONFLICT DO NOTHING;

-- Body types
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('body_type', 'Petite', 'Petite', '娇小', 1),
  ('body_type', 'Slim', 'Slim', '纤细', 2),
  ('body_type', 'Athletic', 'Athletic', '运动型', 3),
  ('body_type', 'Curvy', 'Curvy', '曲线型', 4),
  ('body_type', 'Busty', 'Busty', '丰满型', 5),
  ('body_type', 'Voluptuous', 'Voluptuous', '妖娆型', 6),
  ('body_type', 'Tall', 'Tall', '高挑型', 7)
ON CONFLICT DO NOTHING;

-- Hair styles
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('hair_style', 'Straight', 'Straight', '直发', 1),
  ('hair_style', 'Wavy', 'Wavy', '波浪卷', 2),
  ('hair_style', 'Curly', 'Curly', '卷发', 3),
  ('hair_style', 'Bob', 'Bob', '波波头', 4),
  ('hair_style', 'Pixie Cut', 'Pixie Cut', '精灵短发', 5),
  ('hair_style', 'Long Flowing', 'Long Flowing', '飘逸长发', 6),
  ('hair_style', 'Ponytail', 'Ponytail', '马尾', 7),
  ('hair_style', 'Twin Tails', 'Twin Tails', '双马尾', 8),
  ('hair_style', 'Braided', 'Braided', '编发', 9)
ON CONFLICT DO NOTHING;

-- Hair colors
INSERT INTO creator_option_pool (category, value, label_en, label_zh, extra, sort_order)
VALUES
  ('hair_color', '#000000', 'Black', '黑色', '{}'::jsonb, 1),
  ('hair_color', '#4a3728', 'Dark brown', '深棕', '{}'::jsonb, 2),
  ('hair_color', '#6b3a2a', 'Brown', '棕色', '{}'::jsonb, 3),
  ('hair_color', '#d4a574', 'Blonde', '金色', '{}'::jsonb, 4),
  ('hair_color', '#f5d742', 'Gold', '黄金', '{}'::jsonb, 5),
  ('hair_color', '#e84393', 'Pink', '粉色', '{}'::jsonb, 6),
  ('hair_color', '#d946ef', 'Magenta', '洋红', '{}'::jsonb, 7),
  ('hair_color', '#8b5cf6', 'Purple', '紫色', '{}'::jsonb, 8),
  ('hair_color', '#3b82f6', 'Blue', '蓝色', '{}'::jsonb, 9),
  ('hair_color', '#ef4444', 'Red', '红色', '{}'::jsonb, 10),
  ('hair_color', '#ffffff', 'White', '白色', '{}'::jsonb, 11)
ON CONFLICT DO NOTHING;

-- Eye colors
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('eye_color', 'Brown', 'Brown', '棕色', 1),
  ('eye_color', 'Blue', 'Blue', '蓝色', 2),
  ('eye_color', 'Green', 'Green', '绿色', 3),
  ('eye_color', 'Hazel', 'Hazel', '淡褐色', 4),
  ('eye_color', 'Gray', 'Gray', '灰色', 5),
  ('eye_color', 'Amber', 'Amber', '琥珀色', 6),
  ('eye_color', 'Violet', 'Violet', '紫罗兰', 7),
  ('eye_color', 'Heterochromia', 'Heterochromia', '异色瞳', 8)
ON CONFLICT DO NOTHING;

-- Fashion styles
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('fashion_style', 'Casual', 'Casual', '休闲', 1),
  ('fashion_style', 'Elegant', 'Elegant', '优雅', 2),
  ('fashion_style', 'Gothic', 'Gothic', '哥特', 3),
  ('fashion_style', 'Sporty', 'Sporty', '运动', 4),
  ('fashion_style', 'Romantic', 'Romantic', '浪漫', 5),
  ('fashion_style', 'Edgy', 'Edgy', '前卫', 6),
  ('fashion_style', 'Bohemian', 'Bohemian', '波西米亚', 7),
  ('fashion_style', 'Cyberpunk', 'Cyberpunk', '赛博朋克', 8)
ON CONFLICT DO NOTHING;

-- Personality tags
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('personality_tag', 'Romantic', 'Romantic', '浪漫', 1),
  ('personality_tag', 'Caring', 'Caring', '体贴', 2),
  ('personality_tag', 'Shy', 'Shy', '害羞', 3),
  ('personality_tag', 'Submissive', 'Submissive', '顺从', 4),
  ('personality_tag', 'Dominant', 'Dominant', '强势', 5),
  ('personality_tag', 'Playful', 'Playful', '俏皮', 6),
  ('personality_tag', 'Tsundere', 'Tsundere', '傲娇', 7),
  ('personality_tag', 'Yandere', 'Yandere', '病娇', 8),
  ('personality_tag', 'Gentle', 'Gentle', '温柔', 9),
  ('personality_tag', 'Passionate', 'Passionate', '热情', 10),
  ('personality_tag', 'Mysterious', 'Mysterious', '神秘', 11),
  ('personality_tag', 'Energetic', 'Energetic', '活力', 12),
  ('personality_tag', 'Flirty', 'Flirty', '暧昧', 13),
  ('personality_tag', 'Innocent', 'Innocent', '天真', 14),
  ('personality_tag', 'Witty', 'Witty', '机智', 15),
  ('personality_tag', 'Loyal', 'Loyal', '忠诚', 16),
  ('personality_tag', 'Adventurous', 'Adventurous', '冒险', 17),
  ('personality_tag', 'Jealous', 'Jealous', '嫉妒', 18),
  ('personality_tag', 'Nurturing', 'Nurturing', '养育', 19),
  ('personality_tag', 'Bratty', 'Bratty', '调皮', 20),
  ('personality_tag', 'Sensual', 'Sensual', '性感', 21),
  ('personality_tag', 'Cheerful', 'Cheerful', '开朗', 22),
  ('personality_tag', 'Confident', 'Confident', '自信', 23),
  ('personality_tag', 'Mischievous', 'Mischievous', '恶作剧', 24)
ON CONFLICT DO NOTHING;

-- Voices
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('voice', 'soft', 'Soft', '柔软', 1),
  ('voice', 'sultry', 'Sultry', '磁性', 2),
  ('voice', 'cheerful', 'Cheerful', '欢快', 3),
  ('voice', 'mature', 'Mature', '成熟', 4),
  ('voice', 'shy', 'Shy', '羞涩', 5),
  ('voice', 'confident', 'Confident', '自信', 6),
  ('voice', 'playful', 'Playful', '俏皮', 7),
  ('voice', 'asmr', 'ASMR', 'ASMR', 8)
ON CONFLICT DO NOTHING;

-- Occupations
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('occupation', 'Student', 'Student', '学生', 1),
  ('occupation', 'Teacher', 'Teacher', '老师', 2),
  ('occupation', 'Nurse', 'Nurse', '护士', 3),
  ('occupation', 'Artist', 'Artist', '艺术家', 4),
  ('occupation', 'Model', 'Model', '模特', 5),
  ('occupation', 'Streamer', 'Streamer', '主播', 6),
  ('occupation', 'Gamer', 'Gamer', '游戏玩家', 7),
  ('occupation', 'Yoga Instructor', 'Yoga Instructor', '瑜伽教练', 8),
  ('occupation', 'CEO', 'CEO', 'CEO', 9),
  ('occupation', 'Bartender', 'Bartender', '调酒师', 10),
  ('occupation', 'Photographer', 'Photographer', '摄影师', 11),
  ('occupation', 'Athlete', 'Athlete', '运动员', 12)
ON CONFLICT DO NOTHING;

-- Relationships
INSERT INTO creator_option_pool (category, value, label_en, label_zh, extra, sort_order)
VALUES
  ('relationship', 'girlfriend', 'Girlfriend', '女友', '{"desc_en":"Exclusive partner","desc_zh":"专属伴侣"}'::jsonb, 1),
  ('relationship', 'wife', 'Wife', '妻子', '{"desc_en":"Deep bond","desc_zh":"深度羁绊"}'::jsonb, 2),
  ('relationship', 'stranger', 'Stranger', '陌生人', '{"desc_en":"Just met","desc_zh":"初相识"}'::jsonb, 3),
  ('relationship', 'bestie', 'Bestie', '闺蜜', '{"desc_en":"Close friend","desc_zh":"亲密好友"}'::jsonb, 4),
  ('relationship', 'coworker', 'Coworker', '同事', '{"desc_en":"Office tension","desc_zh":"办公室暧昧"}'::jsonb, 5),
  ('relationship', 'roommate', 'Roommate', '室友', '{"desc_en":"Shared home","desc_zh":"合租室友"}'::jsonb, 6),
  ('relationship', 'neighbor', 'Neighbor', '邻居', '{"desc_en":"Next door spark","desc_zh":"隔壁火花"}'::jsonb, 7),
  ('relationship', 'maid', 'Maid', '女仆', '{"desc_en":"Devoted service","desc_zh":"忠诚服务"}'::jsonb, 8),
  ('relationship', 'princess', 'Princess', '公主', '{"desc_en":"Royal fantasy","desc_zh":"皇家幻想"}'::jsonb, 9),
  ('relationship', 'rival', 'Rival', '对手', '{"desc_en":"Competitive pull","desc_zh":"竞争吸引"}'::jsonb, 10)
ON CONFLICT DO NOTHING;

-- 5. SEED: 3 default character presets
INSERT INTO character_presets (name, description, visual_style, gender, ethnicity, face_shape, hair_style, hair_color, eye_color, body_type, fashion_style, personality_tags, voice, occupation, relationship, age, sort_order)
VALUES
  (
    'Sakura',
    'A gentle and caring classmate who always sits in the front row.',
    'anime', 'Female', 'Asian', 'Oval', 'Long Flowing', '#000000', 'Brown', 'Slim', 'Casual',
    '["Gentle","Shy","Caring","Innocent"]'::jsonb,
    'soft', 'Student', 'girlfriend', 20, 1
  ),
  (
    'Luna',
    'A mysterious artist who paints under moonlight.',
    'realistic', 'Female', 'Caucasian', 'Heart', 'Wavy', '#8b5cf6', 'Violet', 'Slim', 'Bohemian',
    '["Mysterious","Romantic","Passionate","Witty"]'::jsonb,
    'sultry', 'Artist', 'girlfriend', 24, 2
  ),
  (
    'Mia',
    'A confident CEO who runs the boardroom and steals your heart.',
    'realistic', 'Female', 'Latina', 'Diamond', 'Bob', '#4a3728', 'Hazel', 'Athletic', 'Elegant',
    '["Confident","Dominant","Playful","Passionate"]'::jsonb,
    'confident', 'CEO', 'girlfriend', 28, 3
  )
ON CONFLICT DO NOTHING;

-- 6. Notify PostgREST
NOTIFY pgrst, 'reload schema';
