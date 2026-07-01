import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * POST /api/stripe/cancel
 *
 * 取消当前用户的 Stripe 订阅。默认 cancel_at_period_end=true（保持到期前权益）。
 * Body: { immediate?: boolean }  —— true 表示立刻取消（不退款），默认 false
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { immediate?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const immediate = body.immediate === true;

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, stripe_customer_id, membership_tier')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    let subscription;
    if (immediate) {
      subscription = await stripe.subscriptions.cancel(profile.stripe_subscription_id as string);
    } else {
      subscription = await stripe.subscriptions.update(profile.stripe_subscription_id as string, {
        cancel_at_period_end: true,
      });
    }

    // 仅更新 cancel 标记，真正降级走 webhook customer.subscription.deleted
    await supabase
      .from('profiles')
      .update({
        subscription_cancel_at_period_end: !immediate,
        // immediate 模式下直接同步降级（webhook 也会再次同步，幂等）
        ...(immediate ? { membership_tier: 'free' } : {}),
      })
      .eq('user_id', user.id);

    // Stripe v2025 类型变更：current_period_end 在 subscription.items.data[0] 上
    const subAny = subscription as unknown as {
      cancel_at?: number | null;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const currentPeriodEnd = subAny.items?.data?.[0]?.current_period_end ?? null;

    return NextResponse.json({
      success: true,
      mode: immediate ? 'immediate' : 'at_period_end',
      cancel_at: subAny.cancel_at ?? null,
      current_period_end: currentPeriodEnd,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe/cancel] error', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
