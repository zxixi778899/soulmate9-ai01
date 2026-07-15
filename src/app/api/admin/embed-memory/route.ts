import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const EMBEDDING_WRITE_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EmbedMemoryBody = {
  id?: unknown;
  embedding?: unknown;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = await requireAdmin(req);
  if (authorization.error) return authorization.error;
  const { user, supabase } = authorization;

  const limit = await checkRateLimitAsync(`admin-embed-memory:${user.id}`, EMBEDDING_WRITE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many embedding writes. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(limit, EMBEDDING_WRITE_LIMIT) },
    );
  }

  let body: EmbedMemoryBody;
  try {
    body = (await req.json()) as EmbedMemoryBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.id !== 'string' || !UUID_PATTERN.test(body.id)) {
    return NextResponse.json({ error: 'A valid memory id is required' }, { status: 400 });
  }
  if (
    !Array.isArray(body.embedding)
    || body.embedding.length === 0
    || body.embedding.length > 4096
    || !body.embedding.every(
      (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000,
    )
  ) {
    return NextResponse.json({ error: 'Embedding must contain 1 to 4096 finite numbers' }, { status: 400 });
  }

  try {
    const embeddingLiteral = `[${body.embedding.join(',')}]`;
    const { data, error } = await supabase
      .from('memories')
      .update({ embedding: embeddingLiteral })
      .eq('id', body.id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown embedding write error';
    logger.error('admin embed-memory failed', { error: message, memoryId: body.id });
    return NextResponse.json({ error: 'Failed to update memory embedding' }, { status: 500 });
  }
}
