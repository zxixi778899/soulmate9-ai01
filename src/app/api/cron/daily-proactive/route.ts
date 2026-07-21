/**
 * Cron: daily girlfriend re-engagement messages (fixed 2 per companion per day).
 * Secure with CRON_SECRET Bearer token.
 * Sends at most 1 per run per pair — multiple runs across the day naturally
 * stagger the two messages; content is random and never repeats within a day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { loggerFromRequest } from '@/lib/logger';
import {
  pickDailyTemplates,
  getCurrentHolidayKey,
  isWeekendDay,
} from '@/lib/proactive-templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = loggerFromRequest(req);
  const sb = getSupabaseClient();
  const dayKey = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const holiday = getCurrentHolidayKey(now);
  const weekend = isWeekendDay(now);

  let usersScanned = 0;
  let messagesSent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Active users with at least one girlfriend (recent chat activity preferred)
    const { data: recentChats } = await sb
      .from('chat_messages')
      .select('user_id, girlfriend_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1500);

    const pairs = new Map<string, { user_id: string; girlfriend_id: string; last_at: string }>();
    for (const row of recentChats || []) {
      const key = `${row.user_id}:${row.girlfriend_id}`;
      if (!pairs.has(key)) {
        pairs.set(key, {
          user_id: row.user_id,
          girlfriend_id: row.girlfriend_id,
          last_at: row.created_at,
        });
      }
    }

    // Also include girlfriends never messaged but owned (sample)
    const { data: owned } = await sb
      .from('girlfriends')
      .select('id, user_id, name')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    for (const g of owned || []) {
      if (!g.user_id) continue;
      const key = `${g.user_id}:${g.id}`;
      if (!pairs.has(key)) {
        pairs.set(key, {
          user_id: g.user_id,
          girlfriend_id: g.id,
          last_at: '1970-01-01',
        });
      }
    }

    const userIds = new Set<string>();
    for (const p of pairs.values()) userIds.add(p.user_id);
    usersScanned = userIds.size;

    for (const pair of pairs.values()) {
      // Daily cap via log
      let already = 0;
      try {
        const { count } = await sb
          .from('proactive_message_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .gte('sent_at', `${dayKey}T00:00:00.000Z`);
        already = count || 0;
      } catch {
        already = 0;
      }

      const target = 2;
      if (already >= target) {
        skipped++;
        continue;
      }

      // Don't interrupt if user messaged in last 2h
      const lastMs = new Date(pair.last_at).getTime();
      if (Date.now() - lastMs < 2 * 60 * 60 * 1000) {
        skipped++;
        continue;
      }

      // One message per cron run; random content each time
      const picks = pickDailyTemplates({
        count: 1,
        intimacyScore: 10,
        locale: 'en',
        now,
        randomize: true,
      });

      for (const pick of picks) {
        const { data: msg, error } = await sb
          .from('chat_messages')
          .insert({
            user_id: pair.user_id,
            girlfriend_id: pair.girlfriend_id,
            role: 'assistant',
            content: pick.content,
            is_proactive: true,
            metadata: {
              proactive: true,
              category: pick.category,
              source: 'cron',
              holiday: holiday || null,
              weekend,
            },
          })
          .select('id')
          .maybeSingle();

        if (error) {
          failed++;
          continue;
        }

        try {
          await sb.from('proactive_message_log').insert({
            user_id: pair.user_id,
            girlfriend_id: pair.girlfriend_id,
            message_id: msg?.id || null,
            time_slot: `daily_${dayKey}`,
          });
        } catch {
          /* ignore */
        }
        messagesSent++;
      }
    }

    log.info('cron daily-proactive done', {
      usersScanned,
      messagesSent,
      skipped,
      failed,
      holiday,
      weekend,
    });

    return NextResponse.json({
      ok: true,
      usersScanned,
      messagesSent,
      skipped,
      failed,
      day: dayKey,
      holiday,
      weekend,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error('cron daily-proactive failed', { err: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
