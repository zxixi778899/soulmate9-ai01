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
import { dailyProactiveTarget, generateContextualProactiveMessage } from '@/lib/proactive-generation';
import { MEMBERSHIP_TIERS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * POST /api/proactive/check
 * For each of the user's girlfriends, send exactly 2 daily re-engagement
 * messages with random content; the 2nd lands 2–6h after the 1st so they
 * feel like natural check-ins, never back-to-back spam.
 *
 * Body: { girlfriend_id?: string, locale?: string, force?: boolean }
 * - girlfriend_id: only check one chat (current room)
 * - force: ignore daily caps (dev only; still rate-capped lightly)
 */
export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
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
    // Only send proactive messages to friends (user_friends)
    let friendQuery = client.from('user_friends').select('girlfriend_id').eq('user_id', user.id);
    if (onlyId) friendQuery = friendQuery.eq('girlfriend_id', onlyId);
    const { data: friendRows, error: friendError } = await friendQuery.limit(40);
    if (friendError) {
      return NextResponse.json({ error: friendError.message }, { status: 500 });
    }
    if (!friendRows?.length) {
      return NextResponse.json({ messages: [], sent: 0 });
    }
    const friendGfIds = friendRows.map((r: { girlfriend_id: string }) => r.girlfriend_id);
    const { data: girlfriends, error: gfError } = await client
      .from('girlfriends')
      .select('id, name, personality, tags, character_card')
      .in('id', friendGfIds);
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

    // NOTE: reply locale is resolved per companion below — it must follow the
    // language of each conversation, not the page UI locale.

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const holiday = getCurrentHolidayKey(now);
    const weekend = isWeekendDay(now);
    const slot = timeSlotOfDay(now);

    // ── Tier-based proactive slot gating ──
    // Free users only receive night (good night) messages.
    // Pro/Unlimited users receive messages in all 4 time slots.
    const { data: tierProfile } = await client
      .from('profiles')
      .select('membership_tier')
      .eq('user_id', user.id)
      .maybeSingle();
    const rawTier = String(tierProfile?.membership_tier || 'free');
    const normTier = (rawTier === 'basic' || rawTier === 'premium') ? 'pro' : rawTier;
    const allowedSlots = MEMBERSHIP_TIERS[normTier as keyof typeof MEMBERSHIP_TIERS]?.proactive_slots ?? 1;
    // proactive_slots=1 → night only; 4 → all slots
    const nightOnly = allowedSlots <= 1;
    if (nightOnly && slot !== 'night') {
      return NextResponse.json({
        messages: [],
        sent: 0,
        day: dayKey,
        slot,
        skip_reason: 'free_tier_night_only',
      });
    }

    const newMessages: Array<{
      girlfriend_id: string;
      content: string;
      girlfriend_name: string;
      category?: string;
    }> = [];

    for (const gf of girlfriends) {
      // ── 3-day silence rule: stop proactive if user hasn't replied for 3 consecutive days ──
      if (!force) {
        const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const { data: lastUserReply } = await client
          .from('chat_messages')
          .select('created_at')
          .eq('user_id', user.id)
          .eq('girlfriend_id', gf.id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1);
        const lastReplyAt = lastUserReply?.[0]?.created_at;
        // If user never replied OR last reply was more than 3 days ago
        if (!lastReplyAt || lastReplyAt < threeDaysAgo) {
          const windowStart = (lastReplyAt || '1970-01-01T00:00:00.000Z');
          let silenceSentAts: string[] = [];
          const { data: proactiveSinceReply, error: silenceLogError } = await client
            .from('proactive_message_log')
            .select('sent_at')
            .eq('user_id', user.id)
            .eq('girlfriend_id', gf.id)
            .gte('sent_at', windowStart)
            .order('sent_at', { ascending: false })
            .limit(30);
          if (!silenceLogError && proactiveSinceReply) {
            silenceSentAts = proactiveSinceReply.map((r: { sent_at: string }) => r.sent_at);
          } else {
            // Fallback: derive unanswered days from chat_messages itself
            const { data: proactiveMsgsSinceReply } = await client
              .from('chat_messages')
              .select('created_at')
              .eq('user_id', user.id)
              .eq('girlfriend_id', gf.id)
              .eq('is_proactive', true)
              .gte('created_at', windowStart)
              .order('created_at', { ascending: false })
              .limit(30);
            silenceSentAts = (proactiveMsgsSinceReply || []).map(
              (r: { created_at: string }) => r.created_at,
            );
          }
          const distinctDays = new Set(silenceSentAts.map((s) => s.slice(0, 10)));
          if (distinctDays.size >= 3) continue; // 3+ days of unanswered proactive → stop
        }
      }

      // How many proactive msgs already today for this pair + when the last went out.
      // Primary: proactive_message_log. Robust fallback: chat_messages(is_proactive),
      // so the daily cap holds even if the log table is ever missing/errored.
      let already = 0;
      let lastSentAt: string | null = null;
      {
        const { count, error: logCountError } = await client
          .from('proactive_message_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('girlfriend_id', gf.id)
          .gte('sent_at', `${dayKey}T00:00:00.000Z`);
        if (!logCountError && typeof count === 'number') {
          already = count;
          const { data: lastRow } = await client
            .from('proactive_message_log')
            .select('sent_at')
            .eq('user_id', user.id)
            .eq('girlfriend_id', gf.id)
            .gte('sent_at', `${dayKey}T00:00:00.000Z`)
            .order('sent_at', { ascending: false })
            .limit(1);
          lastSentAt = lastRow?.[0]?.sent_at || null;
        } else {
          const { data: proactiveToday } = await client
            .from('chat_messages')
            .select('created_at')
            .eq('user_id', user.id)
            .eq('girlfriend_id', gf.id)
            .eq('is_proactive', true)
            .gte('created_at', `${dayKey}T00:00:00.000Z`)
            .order('created_at', { ascending: false })
            .limit(10);
          already = (proactiveToday || []).length;
          lastSentAt = proactiveToday?.[0]?.created_at || null;
        }
      }

      // Stable random target: one or two messages per companion/day.
      const target = force ? 1 : dailyProactiveTarget([user.id, gf.id, dayKey].join(':'));
      if (!force && already >= target) continue;

      // Stagger: the 2nd message lands 2–6h after the 1st (stable per pair+day,
      // varies day to day) so they never arrive back-to-back.
      if (!force && already > 0 && lastSentAt) {
        const gapHours = 2 + (dailyHash(`${user.id}:${gf.id}:${dayKey}`) % 5); // 2..6h
        const elapsedH = (Date.now() - new Date(lastSentAt).getTime()) / 3600000;
        if (elapsedH < gapHours) continue;
      }

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

      // ── Conversation language: recent history decides, UI locale is fallback ──
      const { data: historyRows } = await client
        .from('chat_messages')
        .select('role, content')
        .eq('user_id', user.id)
        .eq('girlfriend_id', gf.id)
        .order('created_at', { ascending: false })
        .limit(8);
      const historyChronological = (historyRows || []).slice().reverse();
      const locale = resolveReplyLocale({
        message: '',
        uiLocale: body.locale || null,
        defaultLocale: 'en',
        autoDetect: true,
        contextMessages: historyChronological,
      });

      // ── Preset soul (stamped into character_card at creation) ──
      const cardRaw = (gf as { character_card?: unknown }).character_card;
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

      // Never repeat content already sent in the last 3 days
      let excludeContents: string[] = [];
      try {
        const threeDaysAgoIso = new Date(Date.now() - 3 * 86_400_000).toISOString();
        const { data: sentRecent } = await client
          .from('chat_messages')
          .select('content')
          .eq('user_id', user.id)
          .eq('girlfriend_id', gf.id)
          .eq('is_proactive', true)
          .gte('created_at', threeDaysAgoIso)
          .limit(30);
        excludeContents = (sentRecent || []).map(
          (r: { content?: string }) => r.content || '',
        );
      } catch {
        excludeContents = [];
      }

      // One message per check, true-random template pick
      const picks = pickDailyTemplates({
        count: 1,
        intimacyScore,
        locale,
        now,
        randomize: true,
        excludeContents,
      });

      for (const pick of picks) {
        // Soul fallback: the character's own outreach lines beat generic templates
        const freshSoulPool = soulProactivePool.filter((c) => !excludeContents.includes(c));
        const soulPool = freshSoulPool.length ? freshSoulPool : soulProactivePool;
        const fallbackContent = soulPool.length
          ? soulPool[Math.floor(Math.random() * soulPool.length)]
          : pick.content;
        const content = await generateContextualProactiveMessage({
          name: gf.name,
          personality: String(gf.personality || ''),
          intimacyLevel: Number(scoreRow?.level) || 1,
          locale,
          history: historyChronological,
          fallback: fallbackContent,
          voiceStyle: soulVoice || undefined,
          scenario: soulScenario || undefined,
        });
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

/** Stable per-seed hash → used to vary the 2nd-message gap (2–6h) day to day. */
function dailyHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
