import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

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

    // Get shop items (same data as GET)
    const SHOP_ITEMS = [
      { id: 'rose-bouquet', name: 'Rose Bouquet', price_cents: 150, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 15 }, tier: 'free', emoji: '🌹' },
      { id: 'chocolate-box', name: 'Chocolate Box', price_cents: 300, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 30 }, tier: 'free', emoji: '🍫' },
      { id: 'teddy-bear', name: 'Teddy Bear', price_cents: 500, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 50 }, tier: 'free', emoji: '🧸' },
      { id: 'perfume-bottle', name: 'Designer Perfume', price_cents: 800, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 80 }, tier: 'premium', emoji: '🌸' },
      { id: 'lingerie-set', name: 'Silk Lingerie Set', price_cents: 1200, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 150 }, tier: 'premium', emoji: '💋' },
      { id: 'school-uniform', name: 'School Uniform', price_cents: 500, item_type: 'outfit', tier: 'free' },
      { id: 'maid-costume', name: 'French Maid', price_cents: 800, item_type: 'outfit', tier: 'premium' },
      { id: 'evening-gown-sapphire', name: 'Sapphire Evening Gown', price_cents: 1500, item_type: 'outfit', tier: 'premium' },
      { id: 'double-intimacy', name: 'Double Intimacy Boost', price_cents: 600, item_type: 'cap_unlock', effect_value: { effect_type: 'double_intimacy', duration_hours: 24 }, tier: 'free' },
      { id: 'unlimited-msg', name: 'Unlimited Messages', price_cents: 1000, item_type: 'cap_unlock', effect_value: { effect_type: 'unlimited_messages', duration_hours: 48 }, tier: 'premium' },
      { id: 'valentine-special', name: "Valentine's Special Box", price_cents: 2000, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 300 }, tier: 'premium', is_limited: true },
    ];

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // M8 修复：验证 girlfriend 归属当前用户（防为他人角色购买）
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

    // M7 修复：服装类商品防重购（应用层检查；DB 唯一索引由迁移脚本补全）
    if (item.item_type === 'outfit') {
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
    if (item.tier === 'premium' && profile.membership_tier === 'free') {
      // Allow purchasing with credits for premium items even on free tier
      if (item.price_cents > 0 && (profile.credits_remaining ?? 0) < item.price_cents) {
        return NextResponse.json({ error: 'Insufficient credits. Please upgrade your plan to purchase premium items.', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
      }
    }

    if ((profile.credits_remaining ?? 0) < item.price_cents) {
      return NextResponse.json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Deduct credits atomically using conditional update to prevent race conditions
    const newCredits = (profile.credits_remaining ?? 0) - item.price_cents;
    const { error: deductError, count: updatedCount } = await supabase
      .from('profiles')
      .update({ credits_remaining: newCredits })
      .eq('user_id', user.id)
      .gte('credits_remaining', item.price_cents) // Atomic check: only update if credits >= price
      .select();

    if (deductError) {
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // If no rows were updated, it means credits were insufficient (race condition)
    if (updatedCount === 0) {
      return NextResponse.json({ error: 'Insufficient credits (concurrent request)', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }

    // Apply effect
    if (item.item_type === 'intimacy_boost') {
      // Update intimacy score
      const boost = item.effect_value?.intimacy_boost || 0;
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

    if (item.item_type === 'outfit') {
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

    if (item.item_type === 'cap_unlock') {
      // Add active item
      const effectType = item.effect_value?.effect_type || 'double_intimacy';
      const durationHours = item.effect_value?.duration_hours || 24;
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
      remaining_credits: profile.credits_remaining - item.price_cents,
      effect: item.item_type,
    });

  } catch (err) {
    console.error('[Shop Purchase] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}