import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getCreationCardStatus } from '@/lib/creation-cards';
import { logger } from '@/lib/logger';

/**
 * GET /api/creator/cards
 * Returns the user's creation card status (balance, quota, tier).
 * Requires auth.
 */
export async function GET(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await getCreationCardStatus(client as any, user.id);
    return NextResponse.json(status);
  } catch (err) {
    logger.error('[creator/cards] error', { err: String(err) });
    return NextResponse.json(
      { error: 'Failed to fetch card status' },
      { status: 500 },
    );
  }
}
