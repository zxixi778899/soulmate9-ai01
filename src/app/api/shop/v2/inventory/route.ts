/**
 * 虚拟商城 v2 — 用户资产清单
 * GET /api/shop/v2/inventory
 *
 * 改用 pg 库直连。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { queryPgMany } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get('asset_type');

  const conditions: string[] = ['i.user_id = $1'];
  const params: unknown[] = [user.id];

  if (assetType) {
    params.push(assetType);
    conditions.push(`i.asset_type = $${params.length}`);
  }
  const where = 'WHERE ' + conditions.join(' AND ');

  const sql = `
    SELECT
      i.id, i.product_id, i.asset_type, i.asset_id, i.asset_payload,
      i.quantity, i.acquired_at, i.source, i.metadata,
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'category', p.category,
        'subcategory', p.subcategory,
        'images', p.images,
        'rarity', p.rarity,
        'price_credits', p.price_credits,
        'virtual_meta', p.virtual_meta
      ) AS products
    FROM user_inventory i
    LEFT JOIN products p ON p.id = i.product_id
    ${where}
    ORDER BY i.acquired_at DESC
    LIMIT 200
  `;
  const rows = await queryPgMany(sql, params);

  const items = await Promise.all(
    rows.map(async (item: any) => {
      const product = item.products;
      let preview_url = '';
      if (product?.images) {
        const images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
        if (Array.isArray(images) && images.length > 0) {
          preview_url = await resolveImageUrl(images[0]?.key);
        }
      }
      return {
        ...item,
        product: product ? { ...product, preview_url } : null,
      };
    })
  );

  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const t = (item as any).asset_type as string;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(item);
  }

  return NextResponse.json({ items, grouped, total: items.length });
}
