-- Migration: 0044_conversation_lifecycle.sql
-- Soul-driven conversation system: lifecycle state machine, cooldown, surprise rewards, user profile collection
BEGIN;

ALTER TABLE companion_profiles_ext
  ADD COLUMN IF NOT EXISTS lifecycle_phase VARCHAR(32) DEFAULT 'intro_phase',
  ADD COLUMN IF NOT EXISTS opening_message_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consecutive_silence_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tone_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS today_proactive_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_count_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cooldown_reason VARCHAR(64),
  ADD COLUMN IF NOT EXISTS surprise_reward_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS today_surprise_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_surprise_hour INT DEFAULT -1,
  ADD COLUMN IF NOT EXISTS user_profile JSONB DEFAULT '{}';

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(128),
  ADD COLUMN IF NOT EXISTS hobbies TEXT;

ALTER TABLE user_friends
  ADD COLUMN IF NOT EXISTS opening_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opening_sent_at TIMESTAMPTZ;

COMMIT;
