import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import {
  equipOutfitOnGirlfriend,
  unequipOutfitOnGirlfriend,
} from '@/lib/wardrobe-equip';
import { OUTFIT_CATALOG } from '@/lib/outfit-catalog';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const EQUIP_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/wardrobe/equip
 * Body: {
 *   girlfriend_id: string
 *   outfit_id: string
 *   wardrobe_item_id?: string
 *   regenerate?: boolean   // generate portrait wearing outfit (RunPod)
 *   action?: 'equip' | 'unequip'
 *   restore_portrait?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  const { user, client, error } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`wardrobe-equip:${user.id}`, EQUIP_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many equip requests' },
      { status: 429, headers: rateLimitHeaders(rl, EQUIP_LIMIT) },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  const action = body.action === 'unequip' ? 'unequip' : 'equip';

  if (action === 'unequip') {
    const result = await unequipOutfitOnGirlfriend({
      client,
      userId: user.id,
      girlfriendId: body.girlfriend_id,
      restoreBasePortrait: body.restore_portrait !== false,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      action: 'unequip',
      girlfriend: result.girlfriend,
    });
  }

  if (!body.outfit_id) {
    return NextResponse.json({ error: 'outfit_id is required' }, { status: 400 });
  }

  const result = await equipOutfitOnGirlfriend({
    client,
    userId: user.id,
    girlfriendId: body.girlfriend_id,
    outfitId: String(body.outfit_id),
    wardrobeItemId: body.wardrobe_item_id ? String(body.wardrobe_item_id) : undefined,
    regeneratePortrait: !!body.regenerate,
  });

  if (!result.ok) {
    const status = result.error?.includes('do not own') ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    success: true,
    action: 'equip',
    outfit: result.outfit,
    girlfriend: result.girlfriend,
    wardrobe_item: result.wardrobe_item,
    portrait_url: result.portrait_url,
    regenerated: result.regenerated,
  });
}

/**
 * GET /api/wardrobe/equip?girlfriend_id=
 * Returns catalog + equipped state for a girlfriend.
 */
export async function GET(req: NextRequest) {
  const { user, client, error } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const girlfriendId = new URL(req.url).searchParams.get('girlfriend_id');

  let equippedId: string | null = null;
  let ownedIds = new Set<string>();
  let wardrobeItems: unknown[] = [];

  if (girlfriendId) {
    const { data: gf } = await client
      .from('girlfriends')
      .select('equipped_outfit_id, equipped_outfit_name, portrait_url, name')
      .eq('id', girlfriendId)
      .eq('user_id', user.id)
      .maybeSingle();
    equippedId = (gf?.equipped_outfit_id as string) || null;

    const { data: items } = await client
      .from('wardrobe')
      .select('*')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .order('purchased_at', { ascending: false });

    wardrobeItems = items || [];
    for (const it of items || []) {
      if (it.outfit_id) ownedIds.add(String(it.outfit_id));
      if (it.is_equipped) equippedId = String(it.outfit_id);
    }
  } else {
    const { data: items } = await client
      .from('wardrobe')
      .select('outfit_id')
      .eq('user_id', user.id);
    for (const it of items || []) {
      if (it.outfit_id) ownedIds.add(String(it.outfit_id));
    }
  }

  const catalog = OUTFIT_CATALOG.map((o) => ({
    ...o,
    owned: ownedIds.has(o.id) || o.tier === 'free' || o.price_cents === 0,
    equipped: equippedId === o.id,
  }));

  return NextResponse.json({
    catalog,
    equipped_outfit_id: equippedId,
    wardrobe_items: wardrobeItems,
  });
}
