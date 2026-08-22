import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSeatStatus, type SeatClient } from '@/lib/companion-seats';
import { getCreationCardStatus, type CardClient } from '@/lib/creation-cards';

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
        .select('membership_tier, credits_remaining, display_name, avatar_url, bio, extra_girlfriend_slots')
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
  // Legacy tier no longer sold — grandfather basic into pro.
  // 'premium' is a current paid tier (kept as-is).
  const tier = rawTier === 'basic' ? 'pro' : rawTier;
  // Quotas aligned with MEMBERSHIP_TIERS (membership redesign 2026).
  const plans = {
    free: {
      name: 'Free',
      price_cents: 0,
      messages_per_day: 20,
      max_intimacy_level: 3,
      max_girlfriends: 5,
      monthly_credits: 0,
      starter_credits: 50,
      monthly_creations: 0,
      memory_depth: 'shallow',
      context_window: 8192,
      proactive_slots: 1,
      quest_reward_multiplier: 1,
      video_gen: false,
      features: [
        '20 messages/day',
        '50 starter Credits (one-time)',
        'Chat with official companions',
        '8k context window',
        'Shallow memory (7 days)',
        'Intimacy up to Level 3',
        'Good Night proactive message',
      ],
    },
    pro: {
      name: 'Pro',
      price_cents: 999,
      messages_per_day: 100,
      max_intimacy_level: 5,
      max_girlfriends: 20,
      monthly_credits: 1000,
      starter_credits: 0,
      monthly_creations: 3,
      memory_depth: 'deep',
      context_window: 16384,
      proactive_slots: 4,
      quest_reward_multiplier: 1.5,
      video_gen: false,
      features: [
        '100 messages/day',
        '1,000 Credits / month',
        '3 companion creations / month',
        'Up to 20 companions',
        '16k context window',
        'Deep memory (90 days)',
        'All 5 intimacy levels + NSFW',
        'Image generation & voice messages',
        'Premium outfits',
        'Studio access',
        'Priority support',
      ],
    },
    premium: {
      name: 'Premium',
      price_cents: 2499,
      messages_per_day: 300,
      max_intimacy_level: 5,
      max_girlfriends: 50,
      monthly_credits: 2500,
      starter_credits: 0,
      monthly_creations: 6,
      memory_depth: 'deep',
      context_window: 24576,
      proactive_slots: 4,
      quest_reward_multiplier: 1.75,
      video_gen: true,
      features: [
        '300 messages/day',
        '2,500 Credits / month',
        '6 companion creations / month',
        'Up to 50 companions',
        '24k context window',
        'Deep memory (90 days)',
        'All 5 intimacy levels + NSFW',
        'Video generation unlocked',
        'All outfits unlocked',
        'Studio access',
        'Priority support',
      ],
    },
    unlimited: {
      name: 'Unlimited',
      price_cents: 3499,
      messages_per_day: -1,
      max_intimacy_level: 5,
      max_girlfriends: -1,
      monthly_credits: 3500,
      starter_credits: 0,
      monthly_creations: 10,
      memory_depth: 'infinite',
      context_window: 32768,
      proactive_slots: 4,
      quest_reward_multiplier: 2,
      video_gen: true,
      features: [
        'Unlimited messages (fair use)',
        '3,500 Credits / month',
        '10 companion creations / month',
        'Unlimited companions',
        '32k context window',
        'Infinite permanent memory',
        'All 5 intimacy levels + NSFW',
        'Video generation unlocked',
        'AI-personalized proactive messages',
        '2x daily quest rewards',
        'All outfits unlocked',
        'Studio access',
        'Priority support',
        'Early access to new features',
      ],
    },
  };

  const currentPlan = plans[tier as keyof typeof plans] || plans.free;
  
  // Preload seat-related values so getSeatStatus can skip duplicate queries.
  const [used, createdCount] = await Promise.all([
    totalGirlfriendsResult.count ?? 0,
    createdCompanionsResult.count ?? 0,
  ]);
  
  // Get bonus seats first from profiles read we already did
  const bonusSeats = (profile as { extra_girlfriend_slots?: number } | null)?.extra_girlfriend_slots || 0;
  const seats = await getSeatStatus(client as unknown as SeatClient, user.id, {
    tier,
    bonusSeats,
    used,
    createdCount,
  });

  // Creation-card quota (membership redesign: 0/3/6/10 per month).
  const cardStatus = await getCreationCardStatus(client as unknown as CardClient, user.id);

  return NextResponse.json({
    tier,
    credits_remaining: profile?.credits_remaining || 0,
    display_name: profile?.display_name || null,
    avatar_url: profile?.avatar_url || null,
    bio: profile?.bio || null,
    ...currentPlan,
    max_girlfriends: seats.effectiveLimit,
    seats,
    creation_quota: {
      limit: cardStatus.monthlyQuota,
      remaining: cardStatus.cards,
      used: Math.max(0, cardStatus.monthlyQuota - cardStatus.cards),
      next_refill_at: cardStatus.nextRefillAt,
    },
    video_access: Boolean(currentPlan.video_gen),
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
  const { plan } = body; // 'pro' | 'premium' | 'unlimited'

  if (!plan || !['pro', 'premium', 'unlimited'].includes(plan)) {
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