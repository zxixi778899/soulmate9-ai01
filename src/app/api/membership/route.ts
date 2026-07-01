import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get profile
  const { data: profile } = await client
    .from('profiles')
    .select('membership_tier, credits_remaining')
    .eq('user_id', user.id)
    .single();

  const tier = profile?.membership_tier || 'free';

  // Get today's message count
  const today = new Date().toISOString().split('T')[0];
  const { count: todayMessages } = await client
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', today);

  // Get total girlfriends count
  const { count: totalGirlfriends } = await client
    .from('girlfriends')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // Get highest intimacy score
  const { data: topIntimacy } = await client
    .from('intimacy_scores')
    .select('score')
    .eq('user_id', user.id)
    .order('score', { ascending: false })
    .limit(1)
    .single();

  const plans = {
    free: {
      name: 'Free',
      price_cents: 0,
      messages_per_day: 50,
      max_intimacy_level: 3,
      max_girlfriends: 3,
      features: ['50 messages/day', 'Intimacy up to Level 3 (Friend)', 'Up to 3 companions', 'Basic chat'],
    },
    pro: {
      name: 'Pro',
      price_cents: 1999,
      messages_per_day: 300,
      max_intimacy_level: 5,
      max_girlfriends: 10,
      features: ['300 messages/day', 'Intimacy up to Level 5 (Lover)', 'Up to 10 companions', 'Extended NSFW content', 'Voice messages'],
    },
    premium: {
      name: 'Premium',
      price_cents: 1999,
      messages_per_day: -1, // unlimited
      max_intimacy_level: 6,
      max_girlfriends: -1,
      features: ['Unlimited messages', 'All intimacy levels (Soulmate)', 'Unlimited companions', 'NSFW content', 'Voice messages', 'Priority support'],
    },
    unlimited: {
      name: 'Unlimited',
      price_cents: 3999,
      messages_per_day: -1,
      max_intimacy_level: 6,
      max_girlfriends: -1,
      features: ['Unlimited messages', 'All intimacy levels (Soulmate)', 'Unlimited companions', 'Full NSFW + image generation', 'Voice messages', 'Priority support', 'Early access features'],
    },
  };

  const currentPlan = plans[tier as keyof typeof plans] || plans.free;

  return NextResponse.json({
    tier,
    credits_remaining: profile?.credits_remaining || 0,
    ...currentPlan,
    usage: {
      messages_sent_today: todayMessages || 0,
      total_girlfriends: totalGirlfriends || 0,
      highest_intimacy: topIntimacy?.score || 0,
    },
    is_free: tier === 'free',
  });
}

export async function POST(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { plan } = body; // 'premium' | 'unlimited'

  if (!plan || !['premium', 'unlimited'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Stripe checkout URL (placeholder — set STRIPE_PUBLISHABLE_KEY + STRIPE_SECRET_KEY in env)
  const stripePriceIds: Record<string, string> = {
    premium: process.env.STRIPE_PRICE_PREMIUM || '',
    unlimited: process.env.STRIPE_PRICE_UNLIMITED || '',
  };

  if (!stripePriceIds[plan]) {
    // Stripe not configured — reject the request instead of auto-upgrading
    return NextResponse.json({ 
      error: 'Payment system not configured. Please contact support.',
    }, { status: 503 });
  }

  // Actual Stripe checkout would go here when keys are configured
  return NextResponse.json({
    success: true,
    checkout_url: `/checkout?plan=${plan}`,
  });
}

export async function PATCH(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  if (body.display_name !== undefined) {
    const { error } = await client
      .from('profiles')
      .update({ display_name: body.display_name })
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}