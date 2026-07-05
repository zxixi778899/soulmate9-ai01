/**
 * Cron:  generation_cache 03:00 UTC
 * CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest } from '@/lib/logger';
import { pruneExpiredCache } from '@/lib/generation-cache';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = loggerFromRequest(req);
  const deleted = await pruneExpiredCache();
  log.info('cron-cleanup-cache: done', { deleted });
  return NextResponse.json({ ok: true, deleted });
}
