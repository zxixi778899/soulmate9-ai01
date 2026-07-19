import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getCreationCardStatus } from '@/lib/creation-cards';

/**
 * GET /api/creator/cards
 * Returns the user's creation card status (balance, quota, tier).
 * Requires auth.
 */
export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await getCreationCardStatus(client, user.id);
    return NextResponse.json(status);
  } catch (err) {
    console.error('[creator/cards] error', String(err));
    return NextResponse.json(
      { error: 'Failed to fetch card status' },
      { status: 500 },
    );
  }
}
