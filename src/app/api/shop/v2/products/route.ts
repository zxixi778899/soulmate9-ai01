/**
 * 虚拟商城 v2 — 商品列表
 * GET /api/shop/v2/products
 *
 * 改用 pg 库直连 Postgres（绕开 PostgREST cache）。
 * 需要 Vercel env: COZE_SUPABASE_DB_URL
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryPgMany } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { parsePagination } from '@/lib/pagination';

export const revalidate = 120; // 2 分钟 ISR

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
  tags: string[];
  virtual_meta: Record<string, unknown>;
  rarity: string;
  is_featured: boolean;
  is_new: boolean;
  sales_count: number;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const rarity = searchParams.get('rarity');
  const featured = searchParams.get('featured');
  const search = searchParams.get('search');
  const { page, limit, from, to } = parsePagination(req, {
    maxLimit: 60,
    defaultLimit: 24,
  });

  // Build WHERE clause dynamically
  const conditions: string[] = ["type = 'virtual'", "status = 'active'"];
  const params: unknown[] = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (rarity) {
    params.push(rarity);
    conditions.push(`rarity = $${params.length}`);
  }
  if (featured === 'true') {
    conditions.push('is_featured = true');
  }
  if (search) {
    params.push(`%${search.slice(0, 50)}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  // Count + page rows
  const countSql = `SELECT COUNT(*)::int AS total FROM products ${where}`;
  const countRes = await queryPgMany<{ total: number }>(countSql, params);
  const total = countRes[0]?.total ?? 0;

  params.push(limit);
  params.push(from);
  const rowsSql = `
    SELECT id, sku, name, description, category, subcategory,
           price_credits, price_cents, compare_at_price_cents,
           images, tags, virtual_meta, rarity, is_featured, is_new,
           sales_count, created_at
    FROM products
    ${where}
    ORDER BY is_featured DESC, display_order ASC, sales_count DESC, created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const rows = await queryPgMany<ProductRow>(rowsSql, params);

  // 解析图片为签名 URL
  const products = await Promise.all(
    rows.map(async (p) => {
      const rawImages = typeof p.images === 'string' ? JSON.parse(p.images) : p.images || [];
      const image_urls = await Promise.all(
        rawImages.map(async (img) => ({
          ...img,
          url: await resolveImageUrl(img.key),
        }))
      );
      const preview_url = image_urls[0]?.url || '';
      return {
        ...p,
        image_urls,
        preview_url,
        is_on_sale: !!(p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents),
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
