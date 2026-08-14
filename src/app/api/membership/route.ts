import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSeatStatus } from '@/lib/companion-seats';

export async function GET(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];

  // Parallelize independent reads — was 4 sequential round-trips.
  const [profileResult, todayMessagesResult, totalGirlfriendsResult, publicFriendsResult, createdCompanionsResult, topIntimacyResult, subscriptionResult] =
    await Promise.all([
      client
        .from('profiles')
        .select('membership_tier, credits_remaining, display_name, avatar_url, bio')
        .eq('user_id', user.id)
        .single(),
      client
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', today),
      client
        .from('user_friends')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id),
      client
        .from('user_friends')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source', 'public'),
      client
        .from('user_friends')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source', 'created'),
      client
        .from('intimacy_scores')
        .select('score')
        .eq('user_id', user.id)
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('subscriptions')
        .select('current_period_end, status, billing_interval, plan_id')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const profile = profileResult.data;
  const todayMessages = todayMessagesResult.count;
  const totalGirlfriends = totalGirlfriendsResult.count;
  const publicFriends = publicFriendsResult.count;
  const createdCompanions = createdCompanionsResult.count;
  const topIntimacy = topIntimacyResult.data;
  const subscription = subscriptionResult.data;
  const rawTier = profile?.membership_tier || 'free';
  // Legacy tiers no longer sold — grandfather basic/premium into pro.
  const tier = rawTier === 'basic' || rawTier === 'premium' ? 'pro' : rawTier;

  // Quotas aligned with MEMBERSHIP_TIERS (competitor-aligned).
  const plans = {
    free: {
      name: 'Free',
      price_cents: 0,
      messages_per_day: 40,
      image_gen_per_day: 3,
      tts_per_day: 3,
      max_intimacy_level: 5,
      max_girlfriends: 5,
      features: [
        '40 messages/day',
        '3 AI images/day',
        '3 voice messages/day',
        'All 5 intimacy levels; adult mode unlocks at Level 3',
        'Up to 5 companions',
        'Basic chat',
      ],
    },
    pro: {
      name: 'Pro',
      price_cents: 1999,
      messages_per_day: 300,
      image_gen_per_day: 10,
      tts_per_day: 40,
      max_intimacy_level: 5,
      max_girlfriends: 20,
      features: [
        '300 messages/day',
        'All 5 intimacy levels',
        'Up to 20 companions',
        'NSFW content',
        '10 AI images/day',
        '40 voice messages/day',
        'Priority support',
      ],
    },
    unlimited: {
      name: 'Unlimited',
      price_cents: 2999,
      messages_per_day: -1,
      image_gen_per_day: 50,
      tts_per_day: 200,
      max_intimacy_level: 5,
      max_girlfriends: -1,
      features: [
        'Unlimited messages',
        'All 5 intimacy levels',
        'Unlimited companions',
        'Full NSFW + image generation',
        '50 AI images/day',
        '200 voice messages/day',
        'Priority support',
        'Early access features',
      ],
    },
  };

  const currentPlan = plans[tier as keyof typeof plans] || plans.free;
  const seats = await getSeatStatus(client, user.id);

  return NextResponse.json({
    tier,
    credits_remaining: profile?.credits_remaining || 0,
    display_name: profile?.display_name || null,
    avatar_url: profile?.avatar_url || null,
    bio: profile?.bio || null,
    ...currentPlan,
    max_girlfriends: seats.effectiveLimit,
    seats,
    subscription_end: subscription?.current_period_end || null,
    subscription_status: subscription?.status || null,
    billing_interval: subscription?.billing_interval || null,
    usage: {
      messages_sent_today: todayMessages || 0,
      total_girlfriends: totalGirlfriends || 0,
      public_friends: publicFriends || 0,
      created_companions: createdCompanions || 0,
      highest_intimacy: topIntimacy?.score || 0,
    },
    is_free: tier === 'free',
  });
}

export async function POST(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { plan } = body; // 'pro' | 'unlimited'

  if (!plan || !['pro', 'unlimited'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // SECURITY: this endpoint must NEVER grant a membership tier directly.
  // Upgrades only happen via a verified Stripe payment — see
  // /api/stripe/checkout (creates the session) and /api/stripe/webhook
  // (grants the tier on checkout.session.completed). Do not add logic here
  // that flips membership_tier without a payment provider confirming the
  // charge; a prior version of this endpoint returned `{success: true}`
  // when Stripe was unconfigured, letting users upgrade for free.
  return NextResponse.json({
    error: 'Direct membership upgrades are not supported. Please use the checkout flow.',
  }, { status: 403 });
}

export async function PATCH(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.display_name !== undefined) patch.display_name = body.display_name;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;

  if (Object.keys(patch).length > 0) {
    const { error } = await client
      .from('profiles')
      .update(patch)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}