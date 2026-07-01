/**
 * 虚拟商城 v2 — 用户资产清单
 * GET /api/shop/v2/inventory
 *
 * 查询参数：
 * - asset_type: 'outfit' | 'voice' | 'effect' | 'background' | 'action' | 'consumable'
 * - girlfriend_id: 筛选某角色可用资产
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveImageUrl } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get('asset_type');

  let query = client
    .from('user_inventory')
    .select(
      'id, product_id, asset_type, asset_id, asset_payload, quantity, acquired_at, source, metadata, products(id, name, description, category, subcategory, images, rarity, price_credits, virtual_meta)'
    )
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false });

  if (assetType) query = query.eq('asset_type', assetType);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 解析产品图
  const items = await Promise.all(
    (data || []).map(async (item) => {
      const product = (item as any).products;
      let preview_url = '';
      if (product?.images && Array.isArray(product.images) && product.images.length > 0) {
        preview_url = await resolveImageUrl(product.images[0]?.key);
      }
      return {
        ...item,
        product: product
          ? {
              ...product,
              preview_url,
            }
          : null,
      };
    })
  );

  // 按资产类型分组
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const t = (item as any).asset_type as string;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(item);
  }

  return NextResponse.json({
    items,
    grouped,
    total: items.length,
  });
}
