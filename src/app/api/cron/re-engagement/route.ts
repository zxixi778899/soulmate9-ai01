/**
 * Cron: 主动召回（流失用户）
 * - 流失 > 7 天：发邮件（仅订阅用户）/ Web Push
 * - 流失 > 14 天：发更强烈的召回邮件 + 限时优惠
 * 调用方：Vercel Cron / 外部 cron（每天 14:00 UTC）
 * 鉴权：CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest } from '@/lib/logger';
import { sendReEngagementEmail } from '@/lib/email';
import { sendPushNotification, isPushActive } from '@/lib/web-push';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = loggerFromRequest(req);
  const supabase = getSupabaseClient();
  const pushEnabled = isPushActive();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://soulmate9.com';

  let emailsSent = 0;
  let pushesSent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // 7 日 / 14 日流失用户：找 chat_messages 最近一条超过阈值
    // 简化：直接拉所有有过消息的 user，按 max(created_at) 分组
    const { data: users } = await supabase
      .from('chat_messages')
      .select('user_id, girlfriend_id, content, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 0 });
    }

    // 按 user_id 聚合最近消息
    const userMap = new Map<string, { last_msg: string; last_at: string; girlfriend_id: string }>();
    for (const m of users) {
      if (!userMap.has(m.user_id)) {
        userMap.set(m.user_id, {
          last_msg: m.content || '',
          last_at: m.created_at,
          girlfriend_id: m.girlfriend_id,
        });
      }
    }

    const now = Date.now();
    const DAY7 = 7 * 24 * 60 * 60 * 1000;
    const DAY14 = 14 * 24 * 60 * 60 * 1000;

    for (const [userId, info] of userMap.entries()) {
      const lastAt = new Date(info.last_at).getTime();
      const daysSince = (now - lastAt) / DAY7;

      // 去重：同一用户 7 天内只召回一次
      const dedupeKey = `recall_7d_${userId}`;
      const { data: existing } = await supabase
        .from('user_meta')
        .select('value')
        .eq('user_id', userId)
        .eq('key', dedupeKey)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }

      // 仅在 7-14 天或 14 天以上区间召回
      if (daysSince < 1) continue;
      const isAggressive = daysSince >= 2;

      // 拿到女友名 + 邮箱
      const [{ data: gf }, { data: profile }, { data: subs }] = await Promise.all([
        supabase.from('girlfriends').select('name').eq('id', info.girlfriend_id).single(),
        supabase.from('profiles').select('email').eq('user_id', userId).single(),
        supabase.from('subscriptions').select('plan_id, status').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      ]);

      if (!profile?.email) {
        skipped++;
        continue;
      }

      const girlfriendName = gf?.name || 'Your companion';
      const lastMessagePreview = (info.last_msg || '').slice(0, 120);
      const ctaUrl = `${appUrl}/chat/${info.girlfriend_id}`;

      // 1) 邮件（仅订阅用户）
      if (subs && profile.email) {
        const result = await sendReEngagementEmail({
          to: profile.email,
          userId,
          girlfriendName,
          lastMessagePreview,
          ctaUrl,
        });
        if (result.ok) emailsSent++;
        else failed++;
      }

      // 2) Web Push（所有流失用户）
      if (pushEnabled) {
        const { data: pushSubs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', userId);

        for (const ps of pushSubs || []) {
          const result = await sendPushNotification(
            {
              endpoint: ps.endpoint,
              keys: { p256dh: ps.p256dh, auth: ps.auth },
            },
            {
              title: isAggressive ? `${girlfriendName} really misses you 💕` : `${girlfriendName} is waiting`,
              body: isAggressive
                ? `Come back for a limited-time bonus. Pick up where you left off.`
                : `Continue your conversation. ${lastMessagePreview ? `Last: "${lastMessagePreview.slice(0, 60)}..."` : ''}`,
              url: ctaUrl,
              tag: `recall-${userId}`,
            },
          );
          if (result.ok) pushesSent++;
        }
      }

      // 标记已召回
      await supabase.from('user_meta').upsert({
        user_id: userId,
        key: dedupeKey,
        value: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
    }

    log.info('cron-recall: done', { emailsSent, pushesSent, skipped, failed });
    return NextResponse.json({ ok: true, emailsSent, pushesSent, skipped, failed });
  } catch (e) {
    log.error('cron-recall: failed', { err: String(e) });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
