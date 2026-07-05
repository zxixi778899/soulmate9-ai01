import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { queryPg } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

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

export const dynamic = 'force-dynamic';

/**
 * 缓存数据查询 60s：公开女友列表签名 URL 30 天有效，
 * 60s 缓存对用户体验无感。按 (tag, limit) 分别缓存。
 */
const fetchPublicGirlfriends = unstable_cache(
  async (tag: string | null, limit: number) => {
    const params: unknown[] = [];
    let where = `is_public = true AND review_status = 'approved'`;
    if (tag) {
      params.push(`{${tag}}`);
      where += ` AND $${params.length} = ANY(tags)`;
    }

    const sql = `
      SELECT id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality, character_card
        FROM girlfriends
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;

    const { rows } = await queryPg<GirlfriendRow>(sql, params);
    return await Promise.all(
      (rows || []).map(async (g) => {
        const raw = g.portrait_url || g.avatar_url || null;
        const image_url = await resolveImageUrl(raw);
        return { ...g, image_url };
      }),
    );
  },
  ['girlfriends-public'],
  { revalidate: 60, tags: ['girlfriends-public'] },
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    const girlfriends = await fetchPublicGirlfriends(tag, limit);
    return NextResponse.json({ girlfriends });
  } catch (e: any) {
    logger.error('girlfriends/public error:', { data: e?.message });
    return NextResponse.json(
      { error: e?.message || 'Unknown error', hint: '如果 COZE_SUPABASE_DB_URL 未配，请先在 Vercel env 添加 Supabase Transaction pooler URL' },
      { status: 500 },
    );
  }
}