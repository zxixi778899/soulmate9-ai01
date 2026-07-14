import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { DEFAULT_CHAT_GIFTS } from '@/lib/gifts/catalog';
import { listGifts } from '@/lib/gifts/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gifts — public active live-room gifts for chat UI.
 * Uses chat_gifts table or site_settings fallback.
 */
export async function GET() {
  try {
    const sb = getSupabaseClient();
    const result = await listGifts(sb, { includeInactive: false });
    const gifts = result.gifts.filter((g) => g.is_active);
    return NextResponse.json({
      gifts: gifts.length ? gifts : DEFAULT_CHAT_GIFTS.filter((g) => g.is_active),
      source: gifts.length ? result.source : 'defaults',
      total: gifts.length || DEFAULT_CHAT_GIFTS.length,
    });
  } catch (e) {
    logger.warn('[gifts] error', { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({
      gifts: DEFAULT_CHAT_GIFTS.filter((g) => g.is_active),
      source: 'defaults',
    });
  }
}
