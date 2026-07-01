import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * GET /api/wardrobe
 * Returns the user's purchased outfits, grouped or flat, with girlfriend names
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
    .select('*, outfit:outfit_id(*)')
    .eq('user_id', user.id);

  if (girlfriendId) {
    query = query.eq('girlfriend_id', girlfriendId);
  }

  const { data: items, error } = await query.order('purchased_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: items || [] });
}

/**
 * PATCH /api/wardrobe
 * Gift or toggle equip/unequip an outfit for a girlfriend.
 * Once gifted (equipped to a girlfriend for the first time), the outfit is PERMANENTLY
 * bound to that girlfriend and cannot be transferred to another.
 */
export async function PATCH(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, girlfriend_id, is_equipped } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Fetch current wardrobe item
  const { data: item, error: fetchError } = await client
    .from('wardrobe')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // --- LOGIC: One-time gift model ---
  if (item.gifted) {
    // Item is already gifted to a specific girlfriend
    // Only allow: toggle equip/unequip for that same girlfriend
    if (girlfriend_id && girlfriend_id !== item.girlfriend_id) {
      return NextResponse.json(
        { error: 'This outfit has already been gifted to another companion and cannot be transferred.' },
        { status: 403 }
      );
    }

    // Toggle equip/unequip on the same girlfriend
    const { data, error: updateError } = await client
      .from('wardrobe')
      .update({ is_equipped: !!is_equipped })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  }

  // Item is NOT yet gifted — gifting it for the first time
  if (is_equipped) {
    if (!girlfriend_id) {
      return NextResponse.json({ error: 'girlfriend_id is required when gifting' }, { status: 400 });
    }

    // Unequip any other gifted outfit for the same girlfriend (limit = 1 equipped outfit per girl)
    await client
      .from('wardrobe')
      .update({ is_equipped: false })
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriend_id)
      .eq('is_equipped', true);

    // Gift this outfit permanently, then equip
    const { data, error: giftError } = await client
      .from('wardrobe')
      .update({
        girlfriend_id,
        gifted: true,
        is_equipped: true,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (giftError) {
      return NextResponse.json({ error: giftError.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  }

  // Not gifted + not equipping = no-op
  return NextResponse.json({ item });
}