import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { syncDailyQuests, takeAchievementNotifications } from '@/lib/daily-quests';

export const runtime = 'nodejs';

/**
 * GET /api/daily-quests
 * Returns the five daily quests with live progress, auto-claims any quest
 * that just completed (granting credits), and also pops any pending
 * achievement-unlock notifications so the client can celebrate everything
 * that happened since the last sync in one round-trip.
 *
 * Achievement evaluation itself happens at the event sources (chat stream,
 * check-in, purchases, friend adds) — this endpoint only surfaces results,
 * which keeps it cheap enough to call after every chat turn.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
    }
    const { user, client } = auth;

    const [quests, achievements] = await Promise.all([
      syncDailyQuests(client, user.id),
      takeAchievementNotifications(client, user.id),
    ]);

    return NextResponse.json({ ...quests, achievements_unlocked: achievements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[daily-quests] GET error', { err: message.slice(0, 200) });
    return NextResponse.json({ error: 'Failed to load daily quests' }, { status: 500 });
  }
}

/** POST is an alias for GET so explicit "refresh / sync now" calls are possible. */
export async function POST(req: NextRequest) {
  return GET(req);
}
