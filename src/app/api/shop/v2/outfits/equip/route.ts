/**
 *  v2  / 
 * POST /api/shop/v2/outfits/equip
 *
 * Body: { girlfriend_id, outfit_asset_id, action: 'equip' | 'unequip' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { tryOnOutfit } from '@/lib/outfit-tryon';
import { logger } from '@/lib/logger';

interface EquipBody {
  girlfriend_id: string;
  outfit_asset_id: string;
  action: 'equip' | 'unequip';
  regenerate?: boolean;
}

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: EquipBody;
  try {
    body = (await request.json()) as EquipBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.girlfriend_id || !body.outfit_asset_id) {
    return NextResponse.json(
      { error: 'girlfriend_id and outfit_asset_id are required' },
      { status: 400 }
    );
  }
  if (body.action !== 'equip' && body.action !== 'unequip') {
    return NextResponse.json({ error: 'action must be equip or unequip' }, { status: 400 });
  }

  const limit = await checkRateLimitAsync(`wardrobe-v2-equip:${user.id}`, {
    maxRequests: 12,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many outfit generation requests' }, { status: 429 });
  }

  // 
  const { data: gf, error: gfErr } = await client
    .from('girlfriends')
    .select('id, name')
    .eq('id', body.girlfriend_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (gfErr || !gf) {
    return NextResponse.json({ error: 'Girlfriend not found or not owned' }, { status: 404 });
  }

  //  outfituser_inventory 
  const { data: inv, error: invErr } = await client
    .from('user_inventory')
    .select('id, asset_payload')
    .eq('user_id', user.id)
    .eq('asset_type', 'outfit')
    .eq('asset_id', body.outfit_asset_id)
    .maybeSingle();

  if (invErr || !inv) {
    return NextResponse.json(
      { error: 'You do not own this outfit. Purchase it in the shop first.' },
      { status: 403 }
    );
  }

  if (body.action === 'unequip') {
    //  girlfriend  equipped = false
    await client
      .from('girlfriend_outfits')
      .update({ is_equipped: false, equipped_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('girlfriend_id', body.girlfriend_id)
      .eq('is_equipped', true);

    return NextResponse.json({ success: true, action: 'unequipped' });
  }

  // equip outfit
  // 1)  equipped
  await client
    .from('girlfriend_outfits')
    .update({ is_equipped: false })
    .eq('user_id', user.id)
    .eq('girlfriend_id', body.girlfriend_id)
    .eq('is_equipped', true);

  // 2) upsert 
  const { data: go, error: upsertErr } = await client
    .from('girlfriend_outfits')
    .upsert(
      {
        user_id: user.id,
        girlfriend_id: body.girlfriend_id,
        outfit_asset_id: body.outfit_asset_id,
        inventory_item_id: inv.id,
        is_equipped: true,
        equipped_at: new Date().toISOString(),
      },
      { onConflict: 'girlfriend_id,outfit_asset_id' }
    )
    .select()
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data: asset } = await client
    .from('outfit_assets')
    .select('name,image_url,prompt_suffix,metadata')
    .eq('id', body.outfit_asset_id)
    .maybeSingle();

  const generated: { portrait_url?: string; warning?: string } = {};
  if (body.regenerate !== false && asset) {
    const result = await tryOnOutfit({
      client,
      userId: user.id,
      girlfriendId: body.girlfriend_id,
      outfitImageUrl: asset.image_url || undefined,
      outfitText: asset.prompt_suffix || asset.name,
      strength: 0.55,
    });
    if (result.ok) generated.portrait_url = result.portrait_url;
    else {
      generated.warning = result.error || 'Outfit saved, but portrait generation failed';
      logger.warn('v2 outfit equipped without generated portrait', {
        userId: user.id,
        girlfriendId: body.girlfriend_id,
        error: generated.warning,
      });
    }
  }

  const metadata = asset?.metadata && typeof asset.metadata === 'object'
    ? asset.metadata as Record<string, unknown>
    : {};
  const videoUrl = typeof metadata.video_url === 'string' ? metadata.video_url : '';
  if (videoUrl) {
    await client
      .from('girlfriends')
      .update({ portrait_video_url: videoUrl })
      .eq('id', body.girlfriend_id)
      .eq('user_id', user.id);
  }

  return NextResponse.json({
    success: true,
    action: 'equipped',
    equipped: go,
    portrait_url: generated.portrait_url || null,
    portrait_video_url: videoUrl || null,
    warning: generated.warning,
  });
}
