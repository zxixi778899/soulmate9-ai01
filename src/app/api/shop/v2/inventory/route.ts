/**
 *  v2  
 * GET /api/shop/v2/inventory
 *
 *  Supabase REST
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveImageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get('asset_type');

  // Fetch inventory items via REST
  let query = client
    .from('user_inventory')
    .select('id, product_id, asset_type, asset_id, asset_payload, quantity, acquired_at, source, metadata')
    .eq('user_id', user.id)
    .order('acquired_at', { ascending: false })
    .limit(200);

  if (assetType) query = query.eq('asset_type', assetType);

  const { data: items, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related products in a separate query
  const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
  let productsMap = new Map<string, Record<string, unknown>>();
  if (productIds.length > 0) {
    const { data: products } = await client
      .from('products')
      .select('id, name, description, category, subcategory, images, rarity, price_credits, virtual_meta')
      .in('id', productIds);
    productsMap = new Map((products || []).map((p) => [String(p.id), p as Record<string, unknown>]));
  }

  // Merge and resolve images
  const enriched = await Promise.all(
    (items || []).map(async (item) => {
      const product = productsMap.get(String(item.product_id)) || null;
      let preview_url = '';
      if (product?.images) {
        const images = (typeof product.images === 'string' ? JSON.parse(product.images as string) : product.images) as Array<{ key: string }>;
        if (Array.isArray(images) && images.length > 0) {
          preview_url = await resolveImageUrl(images[0].key);
        }
      }
      return {
        ...item,
        product: product ? { ...product, preview_url } : null,
      };
    })
  );

  const grouped: Record<string, typeof enriched> = {};
  for (const item of enriched) {
    const t = item.asset_type as string;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(item);
  }

  return NextResponse.json({ items: enriched, grouped, total: enriched.length });
}
