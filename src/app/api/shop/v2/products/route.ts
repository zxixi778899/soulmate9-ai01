/**
 *  v2  
 * GET /api/shop/v2/products
 *
 *  Supabase REST (bypass PostgREST cache with force-dynamic)
 *  Vercel env: COZE_SUPABASE_URL + COZE_SUPABASE_SERVICE_ROLE_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { parsePagination } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price_credits: number;
  price_cents: number;
  compare_at_price_cents: number | null;
  images: Array<{ key: string; alt?: string }> | string;
  tags: string[] | null;
  virtual_meta: Record<string, unknown>;
  rarity: string;
  is_featured: boolean;
  is_new: boolean;
  sales_count: number;
  display_order: number;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const rarity = searchParams.get('rarity');
  const featured = searchParams.get('featured');
  const search = searchParams.get('search');
  const { page, limit } = parsePagination(req, {
    maxLimit: 60,
    defaultLimit: 24,
  });
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const sb = getSupabaseClient();

  // Build query with filters
  let query = sb
    .from('products')
    .select('*', { count: 'exact' })
    .eq('type', 'virtual')
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (rarity) query = query.eq('rarity', rarity);
  if (featured === 'true') query = query.eq('is_featured', true);
  if (search) query = query.ilike('name', `%${search.slice(0, 50)}%`);

  const { data: rows, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const products = await Promise.all(
    (rows || []).map(async (p) => {
      const row = p as unknown as ProductRow;
      const rawImages = (typeof row.images === 'string' ? JSON.parse(row.images) : row.images || []) as Array<{ key: string; alt?: string }>;
      const image_urls = await Promise.all(
        rawImages.map(async (img: { key: string; alt?: string }) => ({
          ...img,
          url: await resolveImageUrl(img.key),
        }))
      );
      const preview_url = image_urls[0]?.url || '';
      return {
        ...row,
        image_urls,
        preview_url,
        is_on_sale: !!(row.compare_at_price_cents && row.compare_at_price_cents > row.price_cents),
      };
    })
  );

  return NextResponse.json(
    {
      products,
      page,
      limit,
      total,
      has_more: to + 1 < total,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
      },
    }
  );
}
