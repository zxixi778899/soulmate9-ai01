import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = auth.user;
    const supabase = auth.client!;

    const { itemId, girlfriendId } = await req.json();
    if (!itemId || !girlfriendId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Look up product from database
    const { data: item, error: itemError } = await supabase
      .from('products')
      .select('id, name, description, category, price_credits, price_cents, rarity, virtual_meta, status')
      .eq('id', itemId)
      .eq('status', 'active')
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // M8  girlfriend 
    const { data: girlfriendOwn, error: gfErr } = await supabase
      .from('girlfriends')
      .select('id, user_id')
      .eq('id', girlfriendId)
      .single();

    if (gfErr || !girlfriendOwn) {
      return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
    }
    if (girlfriendOwn.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: girlfriend does not belong to you' }, { status: 403 });
    }

    // M7 DB  — check wardrobe duplicate for outfit purchases
    if (item.category === 'outfit') {
      const { data: existing } = await supabase
        .from('wardrobe')
        .select('id')
        .eq('user_id', user.id)
        .eq('girlfriend_id', girlfriendId)
        .eq('outfit_id', item.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: 'You already own this outfit for this character', code: 'DUPLICATE_PURCHASE' },
          { status: 409 },
        );
      }
    }

    // Check user credits and deduct atomically using RPC or conditional update
    // First, verify the user has enough credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits_remaining, membership_tier')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Premium items check - must have premium membership or credits
    const isPremiumItem = item.rarity === 'epic' || item.rarity === 'legendary';
    if (isPremiumItem && profile.membership_tier === 'free') {
      // Allow purchasing with credits for premium items even on free tier
      if (item.price_credits > 0 && (profile.credits_remaining ?? 0) < item.price_credits) {
        return NextResponse.json({ error: 'Insufficient credits. Please upgrade your plan to purchase premium items.', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
      }
    }

    if ((profile.credits_remaining ?? 0) < item.price_credits) {
      return NextResponse.json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Deduct credits atomically using conditional update to prevent race conditions
    const newCredits = (profile.credits_remaining ?? 0) - item.price_credits;
    const { error: deductError, count: updatedCount } = await supabase
      .from('profiles')
      .update({ credits_remaining: newCredits })
      .eq('user_id', user.id)
      .gte('credits_remaining', item.price_credits) // Atomic check: only update if credits >= price
      .select();

    if (deductError) {
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // If no rows were updated, it means credits were insufficient (race condition)
    if (updatedCount === 0) {
      return NextResponse.json({ error: 'Insufficient credits (concurrent request)', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Apply effect based on product category
    const meta = (item.virtual_meta ?? {}) as Record<string, unknown>;

    if (item.category === 'prop' && typeof meta.intimacy_boost === 'number') {
      // Update intimacy score
      const boost = (meta.intimacy_boost as number) || 0;
      const { data: existingIntimacy } = await supabase
        .from('intimacy_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('girlfriend_id', girlfriendId)
        .single();

      if (existingIntimacy) {
        await supabase
          .from('intimacy_scores')
          .update({ score: Math.min((existingIntimacy.score || 0) + boost, 100) })
          .eq('user_id', user.id)
          .eq('girlfriend_id', girlfriendId);
      } else {
        await supabase
          .from('intimacy_scores')
          .insert({ user_id: user.id, girlfriend_id: girlfriendId, score: boost, level: 1 });
      }
    }

    if (item.category === 'outfit') {
      // Add outfit to wardrobe
      const outfitId = item.id;
      await supabase
        .from('wardrobe')
        .insert({
          user_id: user.id,
          girlfriend_id: girlfriendId,
          outfit_id: outfitId,
          is_equipped: false,
        });
    }

    if (meta.effect_type || item.category === 'membership') {
      // Add active item
      const effectType = (meta.effect_type as string) || 'double_intimacy';
      const durationHours = (meta.duration_hours as number) || 24;
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

      await supabase
        .from('user_active_items')
        .insert({
          user_id: user.id,
          girlfriend_id: girlfriendId,
          effect_type: effectType,
          expires_at: expiresAt,
        });
    }

    return NextResponse.json({
      success: true,
      item: item.name,
      remaining_credits: profile.credits_remaining - item.price_credits,
      effect: item.category,
    });

  } catch (err) {
    logger.error('[Shop Purchase] Error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}