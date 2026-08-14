-- ============================================================================
-- Migration: 0037_companion_personality_system
-- Description: Add personality, desire, openness, fetish fields to girlfriends
--              and enhance relationship dynamics
-- Time: 1h
-- ============================================================================

BEGIN;

-- 1. Add personality traits column to girlfriends table
ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS personality_traits JSONB DEFAULT '["friendly", "curious"]';

-- 2. Add sexual tendency field (原始欲望水平)
ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS sexual_tendency VARCHAR CHECK (sexual_tendency IN ('low', 'mid', 'high'));

-- 3. Add openness field (对 NSFW 内容的开放度)
ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS openness VARCHAR CHECK (openness IN ('conservative', 'moderate', 'open', 'experimental'));

-- 4. Add fetish index (变态指数 0-100)
ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS fetish_index INT DEFAULT 0 
  CONSTRAINT check_fetish_range CHECK (fetish_index >= 0 AND fetish_index <= 100);

-- 5. Add relationship style (说话风格)
ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS relationship_style VARCHAR 
  DEFAULT 'direct' CHECK (relationship_style IN ('direct', 'passive', 'playful', 'maternal', 'tsundere', 'yandere'));

-- 6. Create dynamic companion profile extension table (L3 人格档案)
CREATE TABLE IF NOT EXISTS companion_profiles_ext (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    girlfriend_id UUID REFERENCES girlfriends ON DELETE CASCADE NOT NULL,
    
    -- L3: Static User Profile (长期记忆)
    user_profile JSONB DEFAULT '{}'::jsonb,  -- {"职业": "程序员", "作息": "夜猫子", "雷点": ["讨厌被叫宝宝"]}
    emotional_baseline TEXT,                   -- "偏好语气：直接略带调侃"
    inside_jokes TEXT[],                       -- ["修电脑梗", "第一次约会下大雨"]
    arguments_count INT DEFAULT 0,             -- 吵架次数统计
    
    -- Dynamic Emotional State (实时情感波动)
    current_mood VARCHAR DEFAULT 'neutral' 
      CHECK (current_mood IN ('neutral', 'happy', 'sad', 'jealous', 'flirty', 'nostalgic', 'angry', 'thinking')),
    desire_level INT DEFAULT 50 
      CONSTRAINT check_desire_range CHECK (desire_level >= 0 AND desire_level <= 100),
    mood_updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Stage Progress Tracking (关系小节进度)
    stage_intro_progress INT DEFAULT 0,        -- ①相识阶段进度 (0-100)
    stage_flutter_progress INT DEFAULT 0,      -- ②暧昧阶段进度
    stage_bloom_progress INT DEFAULT 0,        -- ③热恋阶段进度
    stage_devotion_progress INT DEFAULT 0,     -- ④依恋阶段进度
    stage_soulmate_progress INT DEFAULT 0,     -- ⑤灵魂羁绊进度
    
    -- Last Interaction Tracking (最近互动)
    last_daily_greeting_sent TIMESTAMPTZ,      -- 最后早安发送时间
    last_goodnight_message_sent TIMESTAMPTZ,   -- 最后晚安发送时间
    last_missing_you_trigger TIMESTAMPTZ,      -- 最后想念触发时间
    
    -- Indexes for performance
    UNIQUE(user_id, girlfriend_id),
    INDEX idx_companion_profiles_usergirlfriend (user_id, girlfriend_id),
    INDEX idx_companion_profiles_mood (current_mood),
    INDEX idx_companion_profiles_updated (mood_updated_at DESC)
);

-- 7. Trigger function for automatic mood decay (每日情绪衰减)
CREATE OR REPLACE FUNCTION decaying_desire_and_mood()
RETURNS TRIGGER AS $$
DECLARE
    hours_since_last_interaction REAL;
    decay_factor REAL;
BEGIN
    -- 计算距离上次交互的小时数
    hours_since_last_interaction := EXTRACT(EPOCH FROM (now() - NEW.mood_updated_at)) / 3600;
    
    -- 每日自然衰减 10 点欲望值，每小时约 0.4 点
    decay_factor := hours_since_last_interaction * 0.4;
    
    -- 更新欲望值（带边界检查）
    NEW.desire_level := GREATEST(0, LEAST(100, NEW.desire_level - decay_factor));
    NEW.mood_updated_at := now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for desire decay on update
DROP TRIGGER IF EXISTS tr_desire_decay ON companion_profiles_ext;
CREATE TRIGGER tr_desire_decay
BEFORE UPDATE OF desire_level, mood_updated_at ON companion_profiles_ext
FOR EACH ROW
WHEN (OLD.desire_level IS NOT NULL)
EXECUTE FUNCTION decaying_desire_and_mood();

-- 9. Indexes for greeting tracking
CREATE INDEX IF NOT EXISTS idx_greetings_usergirlfriend ON companion_profiles_ext(user_id, girlfriend_id, last_daily_greeting_sent);
CREATE INDEX IF NOT EXISTS idx_goodnights_usergirlfriend ON companion_profiles_ext(user_id, girlfriend_id, last_goodnight_message_sent);

COMMIT;
