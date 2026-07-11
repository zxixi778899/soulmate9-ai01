/**
 * Embedding + RAG memory retrieval.
 * Default: BAAI/bge-m3 via RunPod (or any OpenAI-compatible embedding endpoint).
 * Falls back to keyword search if no endpoint configured.
 */

const EMBED_URL    = process.env.EMBEDDING_API_URL || '';
const EMBED_KEY    = process.env.EMBEDDING_API_KEY || process.env.RUNPOD_API_KEY || '';
const EMBED_MODEL  = process.env.EMBEDDING_MODEL || 'bge-m3';

interface EmbedResponse {
  data: { embedding: number[] }[];
}

export async function embed(text: string): Promise<number[] | null> {
  if (!EMBED_URL) return null;
  try {
    const res = await fetch(`${EMBED_URL}/runsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EMBED_KEY}`,
      },
      body: JSON.stringify({
        input: { input: text, model: EMBED_MODEL },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data: EmbedResponse = await res.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/**
 * Format pgvector embedding literal for raw SQL.
 */
export function vectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

/**
 * Tokenize for fallback keyword search (Chinese + English split).
 */
function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9一-鿿]+/g) || [];
}

function keywordScore(query: string, content: string): number {
  const q = new Set(tokens(query));
  if (q.size === 0) return 0;
  const c = new Set(tokens(content));
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  return hit / q.size;
}

export interface MemoryHit {
  id: string;
  content: string;
  type: string;
  category: string;
  score: number;
}

/**
 * Retrieve top-k memories related to query.
 * Tries pgvector RPC first, falls back to keyword.
 */
export async function retrieveMemories(
  client: any,
  userId: string,
  girlfriendId: string,
  query: string,
  k = 5,
): Promise<MemoryHit[]> {
  // 1) pgvector path (requires search_memories RPC installed in DB)
  const embedding = await embed(query);
  if (embedding) {
    const { data, error } = await client.rpc('search_memories', {
      p_user_id: userId,
      p_girlfriend_id: girlfriendId,
      p_embedding: vectorLiteral(embedding),
      p_match_count: k,
    });
    if (!error && Array.isArray(data) && data.length) {
      return data.map((r: any) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        category: r.category,
        score: r.score ?? 0.8,
      }));
    }
  }

  // 2) Keyword fallback
  const { data, error } = await client
    .from('memories')
    .select('id, content, type, category')
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((r: any) => ({ ...r, score: keywordScore(query, r.content) }))
    .filter((r: MemoryHit) => r.score > 0)
    .sort((a: MemoryHit, b: MemoryHit) => b.score - a.score)
    .slice(0, k);
}