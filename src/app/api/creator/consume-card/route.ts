import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { consumeCreationCard } from '@/lib/creation-cards';
import { logger } from '@/lib/logger';

/**
 * POST /api/creator/consume-card
 * Consumes one creation card from the user's balance.
 * Returns { ok, remaining } on success, or an error if no cards available.
 */
export async function POST(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await consumeCreationCard(client as any, user.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'No creation cards remaining', code: 'NO_CARDS', remaining: result.remaining },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, remaining: result.remaining });
  } catch (err) {
    logger.error('[creator/consume-card] error', { err: String(err) });
    return NextResponse.json({ error: 'Failed to consume card' }, { status: 500 });
  }
}
