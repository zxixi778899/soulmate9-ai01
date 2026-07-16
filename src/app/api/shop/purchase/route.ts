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

    const { itemId } = await req.json();
    if (!itemId) {
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

    // Add to user backpack (not wardrobe)
    const { data: existing } = await supabase
      .from('user_backpack')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', item.id)
      .maybeSingle();

    let backpackItemId: string;

    if (existing) {
      // Stack quantity
      await supabase
        .from('user_backpack')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id);
      backpackItemId = existing.id;
    } else {
      const { data: inserted } = await supabase
        .from('user_backpack')
        .insert({
          user_id: user.id,
          product_id: item.id,
          quantity: 1,
          source: 'purchase',
          metadata: { rarity: item.rarity, name: item.name, category: item.category },
        })
        .select('id')
        .single();
      backpackItemId = inserted?.id ?? '';
    }

    // Apply consumable/effect items
    const meta = (item.virtual_meta ?? {}) as Record<string, unknown>;

    if (meta.effect_type || item.category === 'membership') {
      // Add active item (no girlfriend binding at purchase time)
      const effectType = (meta.effect_type as string) || 'double_intimacy';
      const durationHours = (meta.duration_hours as number) || 24;
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

      await supabase
        .from('user_active_items')
        .insert({
          user_id: user.id,
          effect_type: effectType,
          expires_at: expiresAt,
        });
    }

    return NextResponse.json({
      success: true,
      item: item.name,
      remaining_credits: profile.credits_remaining - item.price_credits,
      effect: item.category,
      backpack_item_id: backpackItemId,
    });

  } catch (err) {
    logger.error('[Shop Purchase] Error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}