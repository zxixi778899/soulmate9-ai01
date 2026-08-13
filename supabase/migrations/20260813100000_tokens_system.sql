-- Migration: Add tokens system for image/video generation consumption tracking
-- Date: 2026-08-13
-- Priority: P0 (transparency & monetization)

-- Add tokens balance column to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS tokens_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_purchased INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tokens_reset_at TIMESTAMPTZ;

-- Add token consumption logging table
CREATE TABLE IF NOT EXISTS generation_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  girlfriend_id UUID REFERENCES girlfriends(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  tokens_consumed INTEGER NOT NULL,
  provider VARCHAR(30) NOT NULL,
  job_id VARCHAR(100),
  image_url TEXT,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick user queries
CREATE INDEX IF NOT EXISTS idx_generation_ledger_user_id 
  ON generation_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_ledger_created_at 
  ON generation_ledger(created_at DESC);

-- Function to check and consume tokens atomically
CREATE OR REPLACE FUNCTION consume_tokens(
  p_user_id UUID,
  p_tokens INTEGER,
  p_action VARCHAR,
  p_girlfriend_id UUID DEFAULT NULL,
  p_provider VARCHAR DEFAULT NULL,
  p_job_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  new_balance INTEGER,
  error VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get current balance
  SELECT tokens_remaining INTO v_balance 
  FROM profiles 
  WHERE user_id = p_user_id;
  
  IF v_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'User not found';
    RETURN;
  END IF;
  
  -- Check if sufficient
  IF v_balance < p_tokens THEN
    RETURN QUERY SELECT FALSE, v_balance, 'Insufficient tokens';
    RETURN;
  END IF;
  
  -- Consume tokens atomically
  v_new_balance := v_balance - p_tokens;
  UPDATE profiles 
  SET tokens_remaining = v_new_balance,
      tokens_consumed = tokens_consumed + p_tokens
  WHERE user_id = p_user_id;
  
  -- Log the consumption
  INSERT INTO generation_ledger (user_id, girlfriend_id, action, tokens_consumed, provider, job_id)
  VALUES (p_user_id, p_girlfriend_id, p_action, p_tokens, p_provider, p_job_id);
  
  RETURN QUERY SELECT TRUE, v_new_balance, NULL;
END;
$$;

-- Function to grant tokens (for subscription rewards, promotions, etc.)
CREATE OR REPLACE FUNCTION grant_tokens(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason VARCHAR DEFAULT 'reward'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profiles 
  SET tokens_remaining = tokens_remaining + p_amount,
      tokens_purchased = tokens_purchased + p_amount
  WHERE user_id = p_user_id;
  
  -- Log the grant
  INSERT INTO generation_ledger (user_id, action, tokens_consumed, provider)
  VALUES (p_user_id, CONCAT('grant_', p_reason), -p_amount, 'system');
  
  RETURN TRUE;
END;
$$;

-- Monthly reset function (can be called by cron job)
CREATE OR REPLACE FUNCTION reset_monthly_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER;
  v_reset_date TIMESTAMPTZ;
BEGIN
  v_reset_date := NOW();
  
  UPDATE profiles 
  SET tokens_remaining = CASE 
    WHEN tier = 'unlimited' THEN 2000
    WHEN tier = 'pro' THEN 500
    ELSE 100
  END,
  last_tokens_reset_at = v_reset_date
  WHERE last_tokens_reset_at IS NULL 
     OR last_tokens_reset_at < v_reset_date - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON generation_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION consume_tokens TO authenticated;
