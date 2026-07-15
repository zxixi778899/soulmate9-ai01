import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import {
  getCurrentHolidayKey,
  isWeekendDay,
  pickDailyTemplates,
  timeSlotOfDay,
} from '@/lib/proactive-templates';
import { resolveReplyLocale } from '@/lib/chat-locale';

export const dynamic = 'force-dynamic';

/**
 * POST /api/proactive/check
 * For each of the user's girlfriends, send 1–3 daily re-engagement
 * messages (emotional check-ins, weekend/holiday greetings).
 *
 * Body: { girlfriend_id?: string, locale?: string, force?: boolean }
 * - girlfriend_id: only check one chat (current room)
 * - force: ignore daily caps (dev only; still rate-capped lightly)
 */
export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    girlfriend_id?: string;
    locale?: string;
    force?: boolean;
  };
  const onlyId = String(body.girlfriend_id || '').trim();
  const force = body.force === true && process.env.NODE_ENV !== 'production';

  try {
    let gfQuery = client.from('girlfriends').select('id, name, personality, tags').eq('user_id', user.id);
    if (onlyId) gfQuery = gfQuery.eq('id', onlyId);
    const { data: girlfriends, error: gfError } = await gfQuery.limit(40);
    if (gfError) {
      return NextResponse.json({ error: gfError.message }, { status: 500 });
    }
    if (!girlfriends?.length) {
      return NextResponse.json({ messages: [], sent: 0 });
    }

    const { data: scores } = await client
      .from('intimacy_scores')
      .select('girlfriend_id, score, level')
      .eq('user_id', user.id);

    const locale = resolveReplyLocale({
      message: '',
      uiLocale: body.locale || null,
      defaultLocale: 'en',
      autoDetect: false,
    });

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const holiday = getCurrentHolidayKey(now);
    const weekend = isWeekendDay(now);
    const slot = timeSlotOfDay(now);

    const newMessages: Array<{
      girlfriend_id: string;
      content: string;
      girlfriend_name: string;
      category?: string;
    }> = [];

    for (const gf of girlfriends) {
      // How many proactive msgs already today for this pair
      let already = 0;
      try {
        const { count } = await client
          .from('proactive_message_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('girlfriend_id', gf.id)
          .gte('sent_at', `${dayKey}T00:00:00.000Z`);
        already = count || 0;
      } catch {
        // log table may be missing — still allow send, track in-memory only
        already = 0;
      }

      // Target 1–3 per day (stable per user+gf+day)
      const target = force ? 1 : dailyTargetCount(`${user.id}:${gf.id}:${dayKey}`);
      if (!force && already >= target) continue;

      // Skip if user chatted very recently (< 90 min) — avoid spam while active
      if (!force) {
        const { data: lastUser } = await client
          .from('chat_messages')
          .select('created_at')
          .eq('user_id', user.id)
          .eq('girlfriend_id', gf.id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1);
        if (lastUser?.[0]?.created_at) {
          const mins =
            (Date.now() - new Date(lastUser[0].created_at).getTime()) / 60000;
          if (mins < 90) continue;
        }
      }

      const scoreRow = (scores || []).find(
        (s: { girlfriend_id: string }) => s.girlfriend_id === gf.id,
      ) as { score?: number; level?: number } | undefined;
      const intimacyScore = Number(scoreRow?.score) || 0;

      const need = force ? 1 : Math.max(0, target - already);
      if (need <= 0) continue;

      const picks = pickDailyTemplates({
        count: need,
        intimacyScore,
        locale,
        now,
        seed: `${user.id}:${gf.id}:${dayKey}:${already}`,
      });

      for (const pick of picks) {
        // Prefer holiday/weekend flavors when applicable
        const content = pick.content;
        if (holiday && (pick.category === 'miss_you' || pick.category === 'busy')) {
          // keep emotional base
        }
        // Personalize lightly with name in EN
        if (locale !== 'zh' && gf.name && !content.includes(gf.name)) {
          // leave as-is — templates already couple-native
        }

        const { data: message, error: insErr } = await client
          .from('chat_messages')
          .insert({
            user_id: user.id,
            girlfriend_id: gf.id,
            role: 'assistant',
            content,
            is_proactive: true,
            metadata: {
              proactive: true,
              category: pick.category,
              slot,
              holiday: holiday || null,
              weekend,
            },
          })
          .select('id')
          .maybeSingle();

        if (insErr) {
          logger.warn('[proactive] insert message failed', { err: insErr.message });
          continue;
        }

        try {
          await client.from('proactive_message_log').insert({
            user_id: user.id,
            girlfriend_id: gf.id,
            message_id: message?.id || null,
            time_slot: `daily_${dayKey}`,
          });
        } catch {
          /* optional table */
        }

        newMessages.push({
          girlfriend_id: gf.id,
          content,
          girlfriend_name: gf.name,
          category: pick.category,
        });
      }
    }

    return NextResponse.json({
      messages: newMessages,
      sent: newMessages.length,
      day: dayKey,
      holiday: holiday || null,
      weekend,
      slot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('[proactive/check] failed', { err: msg });
    return NextResponse.json({ error: msg, messages: [] }, { status: 500 });
  }
}

/** 1–3 messages/day, stable for seed */
function dailyTargetCount(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % 3); // 1, 2, or 3
}
