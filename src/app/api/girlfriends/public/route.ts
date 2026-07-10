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
  rarity?: string | null;
  access_status?: string | null;
  unlock_price_tokens?: number | null;
  base_intimacy?: number | null;
  base_desire?: number | null;
  base_development?: number | null;
  base_kink?: number | null;
}

export const dynamic = 'force-dynamic';

/**
 *  60s URL 30 
 * 60s  (tag, limit) 
 */
const fetchPublicGirlfriends = unstable_cache(
  async (tag: string | null, limit: number) => {
    const params: unknown[] = [];
    // closed companions are hidden from public catalog; locked still listed (blurred on FE)
    let where = `is_public = true AND review_status = 'approved' AND COALESCE(access_status, 'open') <> 'closed'`;
    if (tag) {
      params.push(`{${tag}}`);
      where += ` AND $${params.length} = ANY(tags)`;
    }

    const sql = `
      SELECT id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality, character_card,
             rarity, access_status, unlock_price_tokens,
             base_intimacy, base_desire, base_development, base_kink
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
      { error: e?.message || 'Unknown error', hint: ' COZE_SUPABASE_DB_URL  Vercel env  Supabase Transaction pooler URL' },
      { status: 500 },
    );
  }
}