import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const BATCH_DELETE_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 }; // 30/h/user

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getAuthUser(req);
    if (!user || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimitAsync(`gf-batch-delete:${user.id}`, BATCH_DELETE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many batch delete requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, BATCH_DELETE_LIMIT) },
      );
    }

    const body = await req.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    //  50 
    if (ids.length > 50) {
      return NextResponse.json({ error: 'Cannot delete more than 50 at a time' }, { status: 400 });
    }

    const { error } = await client
      .from('girlfriends')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) {
      logger.error('girlfriends/batch-delete error', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.info('girlfriends/batch-delete', { userId: user.id, count: ids.length });
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    logger.error('girlfriends/batch-delete error', { error });
    return NextResponse.json({ error: 'Failed to delete girlfriends' }, { status: 500 });
  }
}
