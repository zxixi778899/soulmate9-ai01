import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { loadAiModules } from '@/lib/ai-modules';
import { listUserChatModels, resolveMembershipTier } from '@/lib/chat-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/models
 * Returns the 5 user-selectable chat models with per-message credit cost,
 * descriptions, lock state for the caller's tier, and the caller's balance.
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: profile } = await client
      .from('profiles')
      .select('role, membership_tier, subscription_tier, plan, credits_remaining')
      .eq('user_id', user.id)
      .single();

    const tier = resolveMembershipTier((profile as Record<string, unknown> | null) || null);
    const aiModules = await loadAiModules();
    const tierRoute =
      aiModules.chat.tiers[
        tier === 'unlimited' ? 'unlimited' : tier === 'pro' ? 'pro' : tier === 'basic' ? 'basic' : 'free'
      ];
    const models = listUserChatModels(aiModules, tier, !!tierRoute?.allow_nsfw);

    return NextResponse.json({
      tier,
      credits_remaining: Number(profile?.credits_remaining ?? 0),
      models,
    });
  } catch (e) {
    logger.error('chat/models GET failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Failed to load chat models' }, { status: 500 });
  }
}
