/**
 * Cron: proactive messages from befriended companions only.
 * Runs once daily at 10:00 UTC (= 18:00 UTC+8); per-user local time check
 * ensures the 18:00-24:00 evening window. (Hobby plan allows daily crons only.)
 * Max 2 per companion per day. Stops after 3 consecutive days without user reply.
 * Content: LLM-generated contextual messages, non-repetitive.
 * Secure with CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { loggerFromRequest } from '@/lib/logger';
import {
  pickDailyTemplates,
  getCurrentHolidayKey,
  isWeekendDay,
} from '@/lib/proactive-templates';
import { resolveReplyLocale } from '@/lib/chat-locale';
import { dailyProactiveTarget, generateContextualProactiveMessage } from '@/lib/proactive-generation';

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
    // ── Only befriended companions (user_friends) can send proactive messages ──
    const { data: friendRows } = await sb
      .from('user_friends')
      .select('user_id, girlfriend_id')
      .order('created_at', { ascending: false })
      .limit(2000);

    const pairs = new Map<string, { user_id: string; girlfriend_id: string; last_at: string }>();
    for (const f of friendRows || []) {
      if (!f.user_id) continue;
      const key = `${f.user_id}:${f.girlfriend_id}`;
      if (!pairs.has(key)) {
        pairs.set(key, {
          user_id: f.user_id,
          girlfriend_id: f.girlfriend_id,
          last_at: '1970-01-01',
        });
      }
    }

    const userIds = new Set<string>();
    for (const p of pairs.values()) userIds.add(p.user_id);
    usersScanned = userIds.size;

    // ── Batch-fetch user timezone offsets (minutes, JS convention: UTC+8 = -480) ──
    const tzMap = new Map<string, number>();
    const idArr = Array.from(userIds);
    // Supabase .in() supports up to ~2000 values; chunk if needed
    for (let i = 0; i < idArr.length; i += 200) {
      const chunk = idArr.slice(i, i + 200);
      const { data: tzRows } = await sb
        .from('profiles')
        .select('user_id, timezone_offset')
        .in('user_id', chunk);
      for (const r of tzRows || []) {
        tzMap.set(r.user_id, typeof r.timezone_offset === 'number' ? r.timezone_offset : -480);
      }
    }
    // Users without a profile row default to UTC+8
    for (const id of userIds) {
      if (!tzMap.has(id)) tzMap.set(id, -480);
    }

    for (const pair of pairs.values()) {
      // ── Per-user timezone check: only send during 18:00-24:00 user local time ──
      const tzOffset = tzMap.get(pair.user_id) ?? -480; // minutes (JS convention)
      const localMs = Date.now() - tzOffset * 60_000;
      const localHour = new Date(localMs).getUTCHours();
      if (localHour < 18 || localHour >= 24) {
        skipped++;
        continue;
      }
      // User-local date key for daily cap (avoids UTC date boundary issues)
      const userDayKey = new Date(localMs).toISOString().slice(0, 10);

      // ── 3-day silence rule: stop proactive if user hasn't replied for 3 consecutive days ──
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data: lastUserMsg } = await sb
        .from('chat_messages')
        .select('created_at')
        .eq('user_id', pair.user_id)
        .eq('girlfriend_id', pair.girlfriend_id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1);
      const lastReplyAt = lastUserMsg?.[0]?.created_at;
      if (!lastReplyAt || lastReplyAt < threeDaysAgo) {
        const windowStart = lastReplyAt || '1970-01-01T00:00:00.000Z';
        let silenceSentAts: string[] = [];
        const { data: proactiveSinceReply, error: silenceLogError } = await sb
          .from('proactive_message_log')
          .select('sent_at')
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .gte('sent_at', windowStart)
          .order('sent_at', { ascending: false })
          .limit(30);
        if (!silenceLogError && proactiveSinceReply) {
          silenceSentAts = proactiveSinceReply.map((r: { sent_at: string }) => r.sent_at);
        } else {
          // Fallback: derive unanswered days from chat_messages itself
          const { data: proactiveMsgsSinceReply } = await sb
            .from('chat_messages')
            .select('created_at')
            .eq('user_id', pair.user_id)
            .eq('girlfriend_id', pair.girlfriend_id)
            .eq('is_proactive', true)
            .gte('created_at', windowStart)
            .order('created_at', { ascending: false })
            .limit(30);
          silenceSentAts = (proactiveMsgsSinceReply || []).map(
            (r: { created_at: string }) => r.created_at,
          );
        }
        const distinctDays = new Set(silenceSentAts.map((s) => s.slice(0, 10)));
        if (distinctDays.size >= 3) {
          skipped++;
          continue;
        }
      }

      // Daily cap via log, with chat_messages fallback so the cap still holds
      // even if proactive_message_log is ever missing/errored.
      let already = 0;
      {
        const { count, error: logCountError } = await sb
          .from('proactive_message_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .gte('sent_at', `${userDayKey}T00:00:00.000Z`);
        if (!logCountError && typeof count === 'number') {
          already = count;
        } else {
          const { data: proactiveToday } = await sb
            .from('chat_messages')
            .select('id')
            .eq('user_id', pair.user_id)
            .eq('girlfriend_id', pair.girlfriend_id)
            .eq('is_proactive', true)
            .gte('created_at', `${userDayKey}T00:00:00.000Z`)
            .limit(10);
          already = (proactiveToday || []).length;
        }
      }

      const target = dailyProactiveTarget([pair.user_id, pair.girlfriend_id, userDayKey].join(':'));
      if (already >= target) {
        skipped++;
        continue;
      }

      const [{ data: girlfriend }, { data: historyRows }, { data: scoreRow }, { data: recentProactive }] = await Promise.all([
        sb.from('girlfriends').select('name, personality, character_card').eq('id', pair.girlfriend_id).maybeSingle(),
        sb.from('chat_messages')
          .select('role, content')
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .order('created_at', { ascending: false })
          .limit(8),
        sb.from('intimacy_scores')
          .select('score, level')
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .maybeSingle(),
        // 3-day memory of already-sent proactive lines → never repeat them
        sb.from('chat_messages')
          .select('content')
          .eq('user_id', pair.user_id)
          .eq('girlfriend_id', pair.girlfriend_id)
          .eq('is_proactive', true)
          .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
          .limit(30),
      ]);
      const history = (historyRows || []).slice().reverse();
      // Conversation language wins; brand-new pairs without history default to English.
      const locale = resolveReplyLocale({
        message: '',
        autoDetect: true,
        contextMessages: history,
        defaultLocale: 'en',
      });
      const excludeContents = (recentProactive || []).map(
        (r: { content?: string }) => r.content || '',
      );

      // One message per cron run; random content each time
      const picks = pickDailyTemplates({
        count: 1,
        intimacyScore: Number(scoreRow?.score) || 0,
        locale,
        now,
        randomize: true,
        excludeContents,
      });

      // ── Preset soul (stamped into character_card at creation) ──
      const cardRaw = (girlfriend as { character_card?: unknown } | null)?.character_card;
      const card = cardRaw && typeof cardRaw === 'object' ? (cardRaw as Record<string, unknown>) : null;
      const soulRaw = card?.soul;
      const soul = soulRaw && typeof soulRaw === 'object' ? (soulRaw as Record<string, unknown>) : null;
      const soulPick = (key: string): string => {
        if (!soul) return '';
        const pair = soul[key];
        if (!pair || typeof pair !== 'object') return '';
        const p = pair as Record<string, unknown>;
        const value = (locale === 'zh' ? p.zh : p.en) || p.en || p.zh;
        return typeof value === 'string' ? value.trim() : '';
      };
      const soulVoice = soulPick('voice_style');
      const soulScenario = soulPick('scenario');
      const soulProactiveRaw: unknown[] =
        soul && Array.isArray(soul.proactive) ? (soul.proactive as unknown[]) : [];
      const soulProactivePool = soulProactiveRaw
        .map((p) => {
          if (!p || typeof p !== 'object') return '';
          const pair = p as Record<string, unknown>;
          const value = (locale === 'zh' ? pair.zh : pair.en) || pair.en || pair.zh;
          return typeof value === 'string' ? value.trim() : '';
        })
        .filter(Boolean);

      for (const pick of picks) {
        const freshSoulPool = soulProactivePool.filter((c) => !excludeContents.includes(c));
        const soulPool = freshSoulPool.length ? freshSoulPool : soulProactivePool;
        const fallbackContent = soulPool.length
          ? soulPool[Math.floor(Math.random() * soulPool.length)]
          : pick.content;
        const content = await generateContextualProactiveMessage({
          name: String(girlfriend?.name || 'Your companion'),
          personality: String(girlfriend?.personality || ''),
          intimacyLevel: Number(scoreRow?.level) || 1,
          locale,
          history,
          fallback: fallbackContent,
          voiceStyle: soulVoice || undefined,
          scenario: soulScenario || undefined,
        });
        const { data: msg, error } = await sb
          .from('chat_messages')
          .insert({
            user_id: pair.user_id,
            girlfriend_id: pair.girlfriend_id,
            role: 'assistant',
            content,
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
            time_slot: `daily_${userDayKey}`,
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
