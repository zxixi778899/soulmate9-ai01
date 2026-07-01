import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 修复：原实现错配 Auth Supabase URL + Coze service_role key，会导致 stripe_webhook_events 表不存在错误
// 统一走 Coze Proxy 数据库（service_role），与 girlfriends/messages/intimacy 等业务表保持一致
function getAdminClient(): SupabaseClient {
  return getSupabaseClient();
}

/**
 * 事件去重：Stripe 因网络抖动会重试同一事件
 * 通过 stripe_webhook_events(event_id) 唯一索引，重复事件直接返回 200
 * 返回 true 表示首次处理；false 表示已处理过
 */
async function tryRecordEvent(
  admin: SupabaseClient,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await admin
    .from('stripe_webhook_events')
    .insert({ event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() });
  if (!error) return true;
  // 唯一约束冲突 = 已处理；其它错误（如表不存在）保守按"首次"处理
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
    return false;
  }
  // 表不存在不阻断主流程
  if (msg.includes('does not exist') || msg.includes('not found')) {
    console.warn('[stripe-webhook] stripe_webhook_events table missing, skipping dedupe');
    return true;
  }
  console.error('[stripe-webhook] dedupe insert error:', error);
  return true;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  let event;
  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 事件去重（H2 加强）：先记录 event.id，重复事件直接 200
  const supabaseAdmin = getAdminClient();
  const isFirst = await tryRecordEvent(supabaseAdmin, event.id, event.type);
  if (!isFirst) {
    console.log(`[stripe-webhook] duplicate event ${event.id} ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata?.user_id || session.client_reference_id;
    const plan = session.metadata?.plan || 'pro';

    if (!userId) {
      console.error('No user_id in Stripe session metadata');
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Map plan names to membership tiers
    const tierMap: Record<string, string> = {
      pro: 'premium',
      unlimited: 'unlimited',
    };
    const tier = tierMap[plan] || 'premium';

    // Update profile tier
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        membership_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (profileError) {
      console.error('Failed to update profile:', profileError);
    }

    // Upsert subscription record
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer,
        plan_id: plan,
        status: 'active',
        current_period_end: session.subscription_details?.current_period_end 
          ? new Date(session.subscription_details.current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

    if (subError) {
      console.error('Failed to insert subscription:', subError);
    }

    // Insert purchase history
    await supabaseAdmin
      .from('purchase_history')
      .insert({
        user_id: userId,
        item_type: 'subscription',
        stripe_payment_intent_id: session.payment_intent,
        amount_cents: session.amount_total || 0,
        status: 'completed',
        metadata: { plan, session_id: session.id },
      });

    console.log(`User ${userId} upgraded to ${tier} via Stripe. Session: ${session.id}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any;
    const userId = subscription.metadata?.user_id;

    if (userId) {
      await supabaseAdmin
        .from('profiles')
        .update({
          membership_tier: 'free',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
    }
  }

  return NextResponse.json({ received: true });
}