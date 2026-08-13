# 🔧 数据库迁移修复说明

## ❌ 原始错误
```
Error: Failed to run sql query: ERROR: 42P01: relation "users" does not exist
```

## ✅ 修复内容

已将所有 `REFERENCES users(id)` 修改为 `REFERENCES auth.users(id)`

### 修改的文件
1. `supabase/migrations/20260813100000_tokens_system.sql`
   - 第 15 行：`generation_ledger` 表的外键引用
   
2. `supabase/migrations/20260813200000_visual_memory_recall.sql`
   - 第 9 行：`generation_memory` 表的外键引用

---

## 🚀 重新执行迁移

### Step 1: Tokens System 迁移

复制以下 SQL 到 Supabase Dashboard SQL Editor 并执行：

```sql
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
```

---

### Step 2: Visual Memory 迁移

复制以下 SQL 到 Supabase Dashboard SQL Editor 并执行：

```sql
-- Migration: Visual Memory Recall System for Image Generation
-- Enables "generate another like yesterday's" functionality
-- Date: 2026-08-13
-- Priority: P1

-- Create generation memory table with pgvector
CREATE TABLE IF NOT EXISTS generation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  girlfriend_id UUID REFERENCES girlfriends(id) ON DELETE CASCADE,
  
  -- Original prompt and negative prompt
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  
  -- Generated image metadata
  image_url TEXT NOT NULL,
  image_embedding VECTOR(768), -- CLIP embedding for semantic search
  
  -- Generation parameters
  checkpoint VARCHAR(100),
  loras JSONB,
  denoise FLOAT,
  ip_adapter_used BOOLEAN DEFAULT FALSE,
  seed BIGINT,
  
  -- User feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  user_liked BOOLEAN,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- Create vector index for semantic similarity search
CREATE INDEX IF NOT EXISTS idx_generation_memory_embedding 
  ON generation_memory 
  USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- User query index
CREATE INDEX IF NOT EXISTS idx_generation_memory_user_gf 
  ON generation_memory(user_id, girlfriend_id);

-- Timestamp index for recency-based recall
CREATE INDEX IF NOT EXISTS idx_generation_memory_created 
  ON generation_memory(created_at DESC);

-- Function to search similar images by text embedding
CREATE OR REPLACE FUNCTION search_similar_memories(
  p_user_id UUID,
  p_query_embedding VECTOR(768),
  p_girlfriend_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 5,
  p_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  id UUID,
  image_url TEXT,
  prompt TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ,
  rating INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gm.id,
    gm.image_url,
    gm.prompt,
    1 - (gm.image_embedding <=> p_query_embedding) AS similarity,
    gm.created_at,
    gm.rating
  FROM generation_memory gm
  WHERE gm.user_id = p_user_id
    AND (p_girlfriend_id IS NULL OR gm.girlfriend_id = p_girlfriend_id)
    AND (1 - (gm.image_embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY gm.image_embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Function to save generation to memory
CREATE OR REPLACE FUNCTION save_to_generation_memory(
  p_user_id UUID,
  p_girlfriend_id UUID,
  p_prompt TEXT,
  p_negative_prompt TEXT,
  p_image_url TEXT,
  p_embedding VECTOR(768),
  p_checkpoint VARCHAR,
  p_loras JSONB,
  p_denoise FLOAT,
  p_ip_adapter_used BOOLEAN,
  p_seed BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_memory_id UUID;
BEGIN
  INSERT INTO generation_memory (
    user_id, girlfriend_id, prompt, negative_prompt, 
    image_url, image_embedding, checkpoint, loras, 
    denoise, ip_adapter_used, seed
  ) VALUES (
    p_user_id, p_girlfriend_id, p_prompt, p_negative_prompt,
    p_image_url, p_embedding, p_checkpoint, p_loras,
    p_denoise, p_ip_adapter_used, p_seed
  )
  RETURNING id INTO v_memory_id;
  
  RETURN v_memory_id;
END;
$$;

-- Function to mark memory as accessed (for LRU tracking)
CREATE OR REPLACE FUNCTION mark_memory_accessed(
  p_memory_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE generation_memory
  SET last_accessed_at = NOW()
  WHERE id = p_memory_id;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT ON generation_memory TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_memories TO authenticated;
GRANT EXECUTE ON FUNCTION save_to_generation_memory TO authenticated;
GRANT EXECUTE ON FUNCTION mark_memory_accessed TO authenticated;
```

---

## ✅ 验证迁移成功

执行以下验证查询：

```sql
-- 1. 检查表是否创建成功
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('generation_memory', 'generation_ledger');
-- 预期：返回 2 行

-- 2. 检查函数是否创建成功
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'consume_tokens', 
    'grant_tokens', 
    'save_to_generation_memory', 
    'search_similar_memories'
  );
-- 预期：返回 4 行

-- 3. 检查 profiles 表的新列
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name LIKE 'tokens_%';
-- 预期：返回 3 行（tokens_remaining, tokens_purchased, tokens_consumed）

-- 4. 检查 pgvector 扩展
SELECT extname, extversion 
FROM pg_extension 
WHERE extname = 'vector';
-- 如果为空，先执行：CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 🎯 下一步

迁移成功后：

1. ✅ 刷新开发服务器（Ctrl+C 后重新 `pnpm dev`）
2. ✅ 打开预览浏览器
3. ✅ 登录并测试生成功能
4. ✅ 观察代币余额变化
5. ✅ 验证 img2img 角色一致性

---

## 🐛 其他可能的错误

### 错误 1: `relation "girlfriends" does not exist`
```sql
-- 解决：girlfriends 表应该在之前的迁移中已创建
-- 检查：
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'girlfriends';
```

### 错误 2: `type "vector" does not exist`
```sql
-- 解决：安装 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;
```

### 错误 3: `column "tier" does not exist`
```sql
-- 解决：profiles 表可能没有 tier 列
-- 检查并添加：
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free';
```

---

现在重新执行迁移应该可以成功了！🚀
