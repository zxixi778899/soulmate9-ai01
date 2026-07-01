import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/lore?girlfriend_id=xxx&message=xxx
 * 
 * Used by the chat system to find lore entries matching keywords in the user's message
 * Returns lore entries whose keys contain any word from the message
 */
export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const girlfriend_id = searchParams.get('girlfriend_id');
  const message = searchParams.get('message') || '';

  if (!girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Extract keywords from message (words longer than 2 chars)
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length === 0) {
    return NextResponse.json({ lore: [] });
  }

  // Fetch all active lore for this girlfriend
  const { data: allLore, error } = await client
    .from('world_lore')
    .select('*')
    .eq('girlfriend_id', girlfriend_id)
    .eq('active', true)
    .eq('user_id', user.id)
    .order('insertion_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Match keywords from message against lore keys
  const matchedLore = (allLore || []).filter(entry => {
    const loreKeys = entry.keys.map((k: string) => k.toLowerCase());
    return words.some((word: string) =>
      loreKeys.some((key: string) => key.includes(word) || word.includes(key))
    );
  });

  return NextResponse.json({ lore: matchedLore });
}