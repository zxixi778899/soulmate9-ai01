import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * POST /api/admin/embed-memory
 * Body: { id: string, embedding: number[] }
 * Writes the embedding to the memories row. Service-role protected.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id || !Array.isArray(body?.embedding)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_COZE_SUPABASE_URL;
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Service-role client bypasses RLS
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const embeddingLiteral = '[' + body.embedding.join(',') + ']';
  const { error } = await admin
    .from('memories')
    .update({ embedding: embeddingLiteral })
    .eq('id', body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}