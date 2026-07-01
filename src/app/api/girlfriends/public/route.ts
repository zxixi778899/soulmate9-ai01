import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';

interface GirlfriendRow {
  id: string;
  name: string;
  age: number | null;
  slug: string | null;
  tags: string[] | null;
  short_description: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  personality: string | null;
  character_card: unknown;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

  let query = getSupabaseClient()
    .from('girlfriends')
    .select(
      'id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality, character_card',
    )
    .eq('is_public', true)
    .eq('review_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tag) {
    query = query.contains('tags', [tag]);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 读取侧：将 OSS key 解析为签名 URL，data:url/外链原样返回
  const rows = (data || []) as GirlfriendRow[];
  const girlfriends = await Promise.all(
    rows.map(async (g) => {
      const raw = g.portrait_url || g.avatar_url || null;
      const image_url = await resolveImageUrl(raw);
      return { ...g, image_url };
    }),
  );

  return NextResponse.json({ girlfriends });
}
