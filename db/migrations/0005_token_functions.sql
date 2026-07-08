-- SoulMate9 Token Management Functions
-- Run in Supabase SQL Editor

-- ❯❯ Add tokens to user (upsert balance) ❮❮
CREATE OR REPLACE FUNCTION add_user_tokens(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  INSERT INTO user_tokens (user_id, balance_tokens, lifetime_tokens_earned, last_updated_at)
  VALUES (p_user_id, p_amount, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE SET
    balance_tokens = user_tokens.balance_tokens + p_amount,
    lifetime_tokens_earned = user_tokens.lifetime_tokens_earned + p_amount,
    last_updated_at = now()
  RETURNING balance_tokens INTO v_balance;

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- ❯❯ Spend tokens (deduct with balance check) ❮❮
CREATE OR REPLACE FUNCTION spend_user_tokens(p_user_id UUID, p_amount BIGINT, p_reason VARCHAR)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT balance_tokens INTO v_balance FROM user_tokens WHERE user_id = p_user_id;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient tokens. Balance: %, Required: %', COALESCE(v_balance, 0), p_amount;
  END IF;

  UPDATE user_tokens SET
    balance_tokens = balance_tokens - p_amount,
    lifetime_tokens_spent = lifetime_tokens_spent + p_amount,
    monthly_tokens_spent = monthly_tokens_spent + p_amount,
    last_updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_tokens INTO v_balance;

  -- Record transaction
  INSERT INTO token_transactions (user_id, transaction_type, amount_tokens, reason, balance_after)
  VALUES (p_user_id, 'spend', p_amount, p_reason, v_balance);

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- ❯❯ Get user token stats ❮❯
CREATE OR REPLACE FUNCTION get_user_token_stats(p_user_id UUID)
RETURNS TABLE(
  balance BIGINT,
  lifetime_earned BIGINT,
  lifetime_spent BIGINT,
  monthly_spent BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ut.balance_tokens,
    ut.lifetime_tokens_earned,
    ut.lifetime_tokens_spent,
    ut.monthly_tokens_spent
  FROM user_tokens ut
  WHERE ut.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ❯❯ Check and update intimacy level unlocks ❮❯
CREATE OR REPLACE FUNCTION check_intimacy_unlock(p_user_id UUID, p_girlfriend_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_level INT;
  v_unlocks JSONB;
BEGIN
  SELECT level INTO v_level FROM intimacy_scores
  WHERE user_id = p_user_id AND girlfriend_id = p_girlfriend_id;

  IF v_level IS NULL THEN v_level := 1; END IF;

  SELECT json_agg(json_build_object(
    'level', level,
    'name', level_name,
    'features', unlock_features,
    'reward_tokens', reward_tokens
  )) INTO v_unlocks
  FROM intimacy_level_unlocks
  WHERE level <= v_level
  ORDER BY level;

  RETURN json_build_object(
    'current_level', v_level,
    'unlocks', COALESCE(v_unlocks, '[]'::JSONB)
  );
END;
$$ LANGUAGE plpgsql;

SELECT 'Functions created successfully!' AS result;