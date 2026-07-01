/**
 * 虚拟商城 v2 — 商品列表
 * GET /api/shop/v2/products
 *
 * 查询参数：
 * - category: 'outfit' | 'voice_pack' | 'effect' | 'background' | 'action_template' | 'consumable'
 * - rarity: 'common' | 'rare' | 'epic' | 'legendary'
 * - featured: 'true' | 'false'
 * - search: 关键词（名称模糊）
 * - page, limit: 分页
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { parsePagination } from '@/lib/pagination';

export const revalidate = 120; // 2 分钟 ISR

export async function GET(req: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const rarity = searchParams.get('rarity');
  const featured = searchParams.get('featured');
  const search = searchParams.get('search');
  const { page, limit, from, to } = parsePagination(req, {
    maxLimit: 60,
    defaultLimit: 24,
  });

  let query = supabase
    .from('products')
    .select(
      'id, sku, name, description, category, subcategory, price_credits, price_cents, compare_at_price_cents, images, tags, virtual_meta, rarity, is_featured, is_new, sales_count, created_at',
      { count: 'exact' }
    )
    .eq('type', 'virtual')
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('sales_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (rarity) query = query.eq('rarity', rarity);
  if (featured === 'true') query = query.eq('is_featured', true);
  if (search) query = query.ilike('name', `%${search.slice(0, 50)}%`);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 解析图片为签名 URL
  const products = await Promise.all(
    (data || []).map(async (p) => {
      const images = (p.images as Array<{ key: string; alt?: string }>) || [];
      const image_urls = await Promise.all(
        images.map(async (img) => ({
          ...img,
          url: await resolveImageUrl(img.key),
        }))
      );
      const preview_url = image_urls[0]?.url || '';
      return {
        ...p,
        image_urls,
        preview_url,
        // 客户端用得上
        is_on_sale: p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents,
      };
    })
  );

  return NextResponse.json(
    {
      products,
      page,
      limit,
      total: count ?? 0,
      has_more: (count ?? 0) > to + 1,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    }
  );
}
