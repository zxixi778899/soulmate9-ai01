/**
 * Cron: 清理过期 generation_cache（每天 03:00 UTC）
 * 鉴权：CRON_SECRET header
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
