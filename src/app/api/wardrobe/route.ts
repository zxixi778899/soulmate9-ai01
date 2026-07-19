import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getOutfitById, resolveOutfitMeta, OUTFIT_CATALOG } from '@/lib/outfit-catalog';
import {
  equipOutfitOnGirlfriend,
  unequipOutfitOnGirlfriend,
} from '@/lib/wardrobe-equip';
import { invalidateShop } from '@/lib/revalidate';

/**
 * GET /api/wardrobe
 * Returns wardrobe items + catalog fallbacks. Optional ?girlfriend_id=
 */
export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const girlfriendId = searchParams.get('girlfriend_id');

  let query = client
    .from('wardrobe')
    .select('*')
    .eq('user_id', user.id);

  if (girlfriendId) {
    query = query.eq('girlfriend_id', girlfriendId);
  }

  const { data: rows, error } = await query.order('purchased_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with catalog meta + girlfriend names
  const gfIds = [...new Set((rows || []).map((r) => r.girlfriend_id).filter(Boolean))];
  const gfMap: Record<string, { id: string; name: string; portrait_url?: string | null }> = {};
  if (gfIds.length) {
    const { data: gfs } = await client
      .from('girlfriends')
      .select('id, name, portrait_url, avatar_url, equipped_outfit_id')
      .eq('user_id', user.id)
      .in('id', gfIds);
    for (const g of gfs || []) {
      gfMap[g.id] = {
        id: g.id,
        name: g.name,
        portrait_url: g.portrait_url || g.avatar_url,
      };
    }
  }

  const items = (rows || []).map((row) => {
    const outfitMeta = resolveOutfitMeta(String(row.outfit_id), null);
    const gifted = row.gifted === true || !!row.girlfriend_id;
    return {
      ...row,
      gifted,
      outfit: outfitMeta
        ? {
            id: outfitMeta.id,
            name: outfitMeta.name,
            description: outfitMeta.description,
            tier: outfitMeta.tier,
            category: outfitMeta.category,
            price_cents: outfitMeta.price_cents,
            intimacy_boost: outfitMeta.intimacy_boost,
            preview_url: outfitMeta.preview_url,
            wear_prompt: outfitMeta.wear_prompt,
            emoji: outfitMeta.emoji,
          }
        : {
            id: row.outfit_id,
            name: String(row.outfit_id),
            description: '',
            tier: 'free',
            category: 'everyday',
            price_cents: 0,
            intimacy_boost: 0,
            preview_url: null,
          },
      girlfriend: row.girlfriend_id ? gfMap[row.girlfriend_id] : undefined,
    };
  });

  return NextResponse.json({
    items,
    catalog: OUTFIT_CATALOG,
  });
}

/**
 * PATCH /api/wardrobe
 * Gift / equip / unequip (legacy UI)
 * Prefer POST /api/wardrobe/equip for full "wear on body" flow.
 */
export async function PATCH(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data: item, error: fetchError } = await client
    .from('wardrobe')
    .select('*')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const girlfriendId = body.girlfriend_id || item.girlfriend_id;
  if (!girlfriendId) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Unequip
  if (body.is_equipped === false) {
    const result = await unequipOutfitOnGirlfriend({
      client,
      userId: user.id,
      girlfriendId,
      restoreBasePortrait: true,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    invalidateShop();
    return NextResponse.json({ item: result.wardrobe_item || item, girlfriend: result.girlfriend });
  }

  // Equip / gift
  const result = await equipOutfitOnGirlfriend({
    client,
    userId: user.id,
    girlfriendId,
    outfitId: String(item.outfit_id),
    wardrobeItemId: item.id,
    regeneratePortrait: !!body.regenerate,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  invalidateShop();

  return NextResponse.json({
    item: result.wardrobe_item,
    girlfriend: result.girlfriend,
    regenerated: result.regenerated,
    portrait_url: result.portrait_url,
  });
}
