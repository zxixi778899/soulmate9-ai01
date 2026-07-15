/**
 * GET /api/shop — Legacy shop items endpoint
 * Now queries the products table instead of hardcoded data.
 * Prefer /api/shop/v2/products for new code.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const tier = searchParams.get('tier');

  try {
    const supabase = getSupabaseClient();

    let query = supabase
      .from('products')
      .select('id, name, description, category, price_credits, price_cents, rarity, virtual_meta, is_featured, status')
      .eq('status', 'active')
      .eq('type', 'virtual')
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(60);

    if (category) {
      // Map legacy category names to DB categories
      const categoryMap: Record<string, string> = {
        gifts: 'prop',
        outfits: 'outfit',
        boosts: 'membership',
        limited: 'outfit',
      };
      query = query.eq('category', categoryMap[category] || category);
    }

    const { data: products, error } = await query;
    if (error) {
      logger.warn('[shop] products query failed', { err: error.message });
      return NextResponse.json({ items: [], total: 0 });
    }

    // Map DB products to legacy ShopItem shape for backward compatibility
    const items = (products || []).map((p) => {
      const meta = (p.virtual_meta || {}) as Record<string, unknown>;
      const rarity = p.rarity || 'common';
      const isPremium = rarity === 'epic' || rarity === 'legendary';

      return {
        id: p.id,
        name: p.name,
        description: p.description || '',
        price_cents: Number(p.price_credits || p.price_cents || 0),
        item_type: p.category === 'outfit' ? 'outfit' : p.category === 'prop' ? 'intimacy_boost' : 'cap_unlock',
        effect_value: meta,
        category: p.category,
        tier: isPremium ? 'premium' : 'free',
        is_limited: p.is_featured || false,
        emoji: p.category === 'outfit' ? '👗' : p.category === 'prop' ? '🎁' : '⚡',
        intimacy_boost: Number(meta.intimacy_boost || 0),
      };
    });

    // Apply tier filter if specified
    const filtered = tier ? items.filter((i) => i.tier === tier) : items;

    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (e) {
    logger.error('[shop] GET failed', { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ items: [], total: 0 });
  }
}
