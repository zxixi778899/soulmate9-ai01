import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { invalidateGirlfriends } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/backpack/gift
 * Gift an item from the user's backpack to a girlfriend's wardrobe.
 */
export async function POST(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 30 gifts per minute
  const rl = await checkRateLimitAsync(`gift:${user.id}`, {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.product_id || !body?.girlfriend_id) {
    return NextResponse.json(
      { error: 'product_id and girlfriend_id are required' },
      { status: 400 },
    );
  }

  const productId: string = body.product_id;
  const girlfriendId: string = body.girlfriend_id;
  const quantity: number = typeof body.quantity === 'number' && body.quantity > 0
    ? body.quantity
    : 1;

  try {
    // 1. Validate user owns the girlfriend
    const { data: girlfriend, error: gfError } = await client
      .from('girlfriends')
      .select('id')
      .eq('id', girlfriendId)
      .eq('user_id', user.id)
      .single();

    if (gfError || !girlfriend) {
      return NextResponse.json(
        { error: 'Girlfriend not found or not owned by you' },
        { status: 404 },
      );
    }

    // 2. Validate backpack has the item with sufficient quantity
    const { data: backpackItem, error: bpError } = await client
      .from('user_backpack')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .gte('quantity', quantity)
      .single();

    if (bpError || !backpackItem) {
      return NextResponse.json(
        { error: 'Item not found in backpack or insufficient quantity' },
        { status: 404 },
      );
    }

    // 3. Deduct quantity from user_backpack (atomic check via gte above)
    const newQuantity = backpackItem.quantity - quantity;
    if (newQuantity < 0) {
      return NextResponse.json(
        { error: 'Insufficient quantity' },
        { status: 400 },
      );
    }

    if (newQuantity === 0) {
      // Delete the row when quantity reaches 0
      const { error: delError } = await client
        .from('user_backpack')
        .delete()
        .eq('id', backpackItem.id)
        .eq('user_id', user.id);

      if (delError) {
        logger.error('[backpack/gift] failed to delete empty backpack row', {
          err: delError.message,
          backpackId: backpackItem.id,
        });
      }
    } else {
      // Decrement quantity
      const { error: updError } = await client
        .from('user_backpack')
        .update({ quantity: newQuantity })
        .eq('id', backpackItem.id)
        .eq('user_id', user.id);

      if (updError) {
        logger.error('[backpack/gift] failed to update backpack quantity', {
          err: updError.message,
          backpackId: backpackItem.id,
        });
        return NextResponse.json(
          { error: 'Failed to update backpack' },
          { status: 500 },
        );
      }
    }

    // 4. Insert into girlfriend_wardrobe (upsert on conflict)
    const { data: wardrobeItem, error: wardrobeError } = await client
      .from('girlfriend_wardrobe')
      .upsert(
        {
          girlfriend_id: girlfriendId,
          user_id: user.id,
          product_id: productId,
          received_at: new Date().toISOString(),
          metadata: { source: 'backpack_gift', gifted_at: new Date().toISOString() },
        },
        {
          onConflict: 'girlfriend_id,product_id',
        },
      )
      .select('id')
      .single();

    if (wardrobeError) {
      logger.error('[backpack/gift] failed to insert wardrobe item', {
        err: wardrobeError.message,
        girlfriendId,
        productId,
      });
      return NextResponse.json(
        { error: 'Failed to add item to wardrobe' },
        { status: 500 },
      );
    }

    // 5. Invalidate caches after successful gift
    invalidateGirlfriends();

    logger.info('[backpack/gift] success', {
      userId: user.id,
      girlfriendId,
      productId,
      quantity,
      remaining: newQuantity,
    });

    return NextResponse.json({
      success: true,
      wardrobe_item_id: wardrobeItem?.id,
      remaining_quantity: newQuantity,
    });
  } catch (e) {
    logger.error('[backpack/gift] POST failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
