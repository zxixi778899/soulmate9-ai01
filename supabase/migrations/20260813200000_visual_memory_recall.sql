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
