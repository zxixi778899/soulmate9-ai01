-- SoulMate9 — pgvector extension + RAG function
-- Run in Supabase SQL Editor

-- 1) Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Add embedding column to memories (BAAI/bge-m3 = 1024 dims)
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 3) IVFFlat index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4) RAG search function
CREATE OR REPLACE FUNCTION search_memories(
  p_user_id UUID,
  p_girlfriend_id UUID,
  p_embedding vector(1024),
  p_match_count INT DEFAULT 5,
  p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  type TEXT,
  category TEXT,
  score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.type::TEXT,
    m.category::TEXT,
    (1 - (m.embedding <=> p_embedding))::FLOAT AS score
  FROM memories m
  WHERE m.user_id = p_user_id
    AND (p_girlfriend_id IS NULL OR m.girlfriend_id = p_girlfriend_id)
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_embedding)) >= p_min_similarity
  ORDER BY m.embedding <=> p_embedding
  LIMIT GREATEST(p_match_count, 1);
END;
$$;

-- 5) Auto-embed trigger (optional — requires pg_net + external embed service;
--    leave as application-level for now to avoid pg_net dependency)
--    For now app calls lib/memory-rag.ts::embed() and writes embedding column.

-- 6) Backfill existing memories with NULL embedding = skip (no semantic)
--    Until new memories are saved through LLM extract pipeline, no rows have embeddings.
--    That's fine — RAG returns empty for them.

SELECT 'pgvector migration complete' AS status;